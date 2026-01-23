import { matchMarketSchemaFields } from '@/lib/sdl/field-matcher';
import type { MarketSchema, SDLStatement } from '@/lib/sdl/types';

describe('matchMarketSchemaFields proof handling', () => {
  const schema: MarketSchema = {
    id: 'market:mm1:v1',
    title: 'MM1',
    grantee: 'market:mm1',
    purpose: 'demo',
    fields: [
      {
        key: 'age_over',
        label: 'Age over 21',
        type: 'boolean',
        statement_type: 'PROOF',
        proof: { type: 'age_over', min_age: 21 }
      }
    ]
  };

  const buildProofStatement = (minAge: number, validTo?: string): SDLStatement => ({
    id: 'sdl:stmt:proof',
    subject: 'user-1',
    key: 'proof:age_over',
    type: 'PROOF',
    sensitivity: 'low',
    value_ref: { type: 'proof', key_ref: 'self' },
    proof: {
      type: 'age_over',
      params: { min_age: minAge },
      issuer: 'self',
      issued_at: new Date().toISOString()
    },
    valid_to: validTo ?? null
  });

  it('reuses proofs that satisfy minimum age', async () => {
    const vault = {
      getLatest: async () => buildProofStatement(25)
    };

    const results = await matchMarketSchemaFields(schema, vault);

    expect(results[0].decision).toBe('REUSE_OK');
  });

  it('requires new proof when expired or insufficient', async () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const vault = {
      getLatest: async () => buildProofStatement(18, expired)
    };

    const results = await matchMarketSchemaFields(schema, vault);

    expect(results[0].decision).toBe('PROOF_REQUIRED');
  });
});
