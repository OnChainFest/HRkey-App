import { canonicalHash } from './canonicalHash.js';

/**
 * Canonical Reference Pack builder (Issue #156)
 * - Builds the pack with fixed schema
 * - Canonicalizes via deep key sorting (canonicalHash)
 * - Computes SHA256 over canonical JSON
 */
export function buildReferencePack(reference) {
  const reference_pack = {
    candidate_id: reference.owner_id ?? null,
    referee_email: reference.referrer_email ?? null,
    role_id: reference.role_id ?? null,
    answers: reference.detailed_feedback ?? null,
    created_at: reference.created_at ?? null
  };

  const { hash: reference_hash } = canonicalHash(reference_pack);
  return { reference_pack, reference_hash };
}
