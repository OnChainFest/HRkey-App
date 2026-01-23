import { resolveFieldKey } from './registry';
import type { FieldMatchResult, MarketSchema, SDLFieldProof, SDLStatement } from './types';

export type VaultIndex = {
  getLatest: (key: string) => Promise<SDLStatement | null>;
};

const isExpired = (statement: SDLStatement | null) => {
  if (!statement?.valid_to) return false;
  return new Date(statement.valid_to).getTime() <= Date.now();
};

const proofKeyFor = (proof: SDLFieldProof) => `proof:${proof.type}`;

const proofSatisfies = (statement: SDLStatement | null, proof: SDLFieldProof) => {
  if (!statement || statement.type !== 'PROOF' || !statement.proof) return false;
  if (statement.proof.type !== proof.type) return false;
  const requiredMin = proof.min_age ?? (proof.params?.min_age as number | undefined);
  if (proof.type === 'age_over' && typeof requiredMin === 'number') {
    const issuedMin = Number(statement.proof.params?.min_age ?? 0);
    if (!Number.isFinite(issuedMin)) return false;
    return issuedMin >= requiredMin && !isExpired(statement);
  }
  return !isExpired(statement);
};

export async function matchMarketSchemaFields(
  schema: MarketSchema,
  vaultIndex: VaultIndex
): Promise<FieldMatchResult[]> {
  const results = await Promise.all(
    schema.fields.map(async field => {
      if (field.proof) {
        const statement = await vaultIndex.getLatest(proofKeyFor(field.proof));
        if (proofSatisfies(statement, field.proof)) {
          return { field, decision: 'REUSE_OK', statement } satisfies FieldMatchResult;
        }
        return { field, decision: 'PROOF_REQUIRED', statement } satisfies FieldMatchResult;
      }

      const canonicalKey = resolveFieldKey(field.key);
      if (!canonicalKey) {
        return {
          field,
          decision: 'UNMAPPED',
          statement: null,
          reason: 'No registry mapping'
        } satisfies FieldMatchResult;
      }

      const statement = await vaultIndex.getLatest(canonicalKey);
      if (!statement) {
        return { field, decision: 'NEW_REQUIRED', statement: null } satisfies FieldMatchResult;
      }
      if (isExpired(statement)) {
        return { field, decision: 'REUSE_NEEDS_UPDATE', statement } satisfies FieldMatchResult;
      }
      return { field, decision: 'REUSE_OK', statement } satisfies FieldMatchResult;
    })
  );

  return results;
}
