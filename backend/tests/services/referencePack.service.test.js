import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockSupabaseClient = {
  from: jest.fn()
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const { buildCanonicalReferencePack } = await import('../../services/referencePack.service.js');
const { canonicalHash } = await import('../../utils/canonicalHash.js');

function createQueryBuilder(response) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    or: jest.fn(() => builder),
    single: jest.fn(() => builder),
    then: (resolve) => Promise.resolve(response).then(resolve),
    catch: (reject) => Promise.resolve(response).catch(reject)
  };
  return builder;
}

describe('Reference Pack Service', () => {
  beforeEach(() => {
    mockSupabaseClient.from.mockReset();
  });

  test('builds a deterministic, sorted reference pack without PII', async () => {
    const candidateId = '11111111-1111-4111-8111-111111111111';
    const referenceRows = [
      {
        id: 'ref-2',
        owner_id: candidateId,
        referrer_name: '  Alex Referrer  ',
        referrer_email: 'alex@example.com',
        referrer_company: '  Example Co  ',
        relationship: ' manager ',
        summary: '  Great   work  ',
        overall_rating: 4.2,
        kpi_ratings: { quality: 5, teamwork: 4 },
        status: 'approved',
        approved_at: '2024-01-02T00:00:00Z',
        created_at: '2024-01-02T00:00:00Z',
        role_id: 'role-1'
      },
      {
        id: 'ref-1',
        owner_id: candidateId,
        referrer_name: 'Jordan Ref',
        referrer_email: 'jordan@example.com',
        referrer_company: 'Beta Corp',
        relationship: ' peer',
        summary: 'Excellent',
        overall_rating: 5,
        kpi_ratings: { quality: 3 },
        status: 'approved',
        approved_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        role_id: 'role-1'
      },
      {
        id: 'ref-3',
        owner_id: candidateId,
        referrer_name: 'Pending Ref',
        referrer_email: 'pending@example.com',
        referrer_company: 'Pending Inc',
        relationship: 'peer',
        summary: 'Pending',
        overall_rating: 2,
        kpi_ratings: { quality: 2 },
        status: 'pending',
        approved_at: '2024-01-03T00:00:00Z',
        created_at: '2024-01-03T00:00:00Z',
        role_id: 'role-2'
      }
    ];

    const kpiObservationRows = [
      {
        id: 'obs-2',
        kpi_id: 'kpi-2',
        kpi_name: 'quality',
        rating_value: 3,
        outcome_value: 10,
        observed_at: '2024-02-02T00:00:00Z',
        observation_period: '  Q1 2024 ',
        source: 'reference',
        reference_id: 'ref-2',
        verified: true
      },
      {
        id: 'obs-1',
        kpi_id: 'kpi-1',
        kpi_name: 'teamwork',
        rating_value: 4,
        outcome_value: 5,
        observed_at: '2024-02-01T00:00:00Z',
        observation_period: 'Q1 2024',
        source: 'manual',
        reference_id: 'ref-1',
        verified: false
      }
    ];

    const referenceBuilder = createQueryBuilder({ data: referenceRows, error: null });
    const observationBuilder = createQueryBuilder({ data: kpiObservationRows, error: null });

    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return referenceBuilder;
      }
      if (table === 'kpi_observations') {
        return observationBuilder;
      }
      return createQueryBuilder({ data: [], error: null });
    });

    const firstPack = await buildCanonicalReferencePack(candidateId);
    const secondPack = await buildCanonicalReferencePack(candidateId);
    const { canonicalJson, hash } = canonicalHash(firstPack);
    const { canonicalJson: secondJson, hash: secondHash } = canonicalHash(secondPack);

    expect(firstPack.schema).toBe('hrkey.reference_pack.v1');
    expect(firstPack.references.map((ref) => ref.reference_id)).toEqual(['ref-1', 'ref-2']);
    expect(firstPack.kpi_observations.map((obs) => obs.kpi_id)).toEqual(['kpi-1', 'kpi-2']);
    expect(firstPack.kpi_coverage.map((kpi) => kpi.kpi_id)).toEqual(['quality', 'teamwork']);
    expect(firstPack.summary.reference_count).toBe(2);
    expect(hash).toBe(secondHash);
    expect(canonicalJson).toBe(secondJson);
    expect(firstPack.generated_at).toBeUndefined();
    expect(canonicalJson).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  test('sorts references by approved_at then reference_id', async () => {
    const candidateId = '22222222-2222-4222-8222-222222222222';
    const referenceRows = [
      {
        id: 'ref-2',
        owner_id: candidateId,
        referrer_email: 'alpha@example.com',
        referrer_company: 'Alpha Co',
        relationship: 'manager',
        summary: 'Solid',
        overall_rating: 4,
        kpi_ratings: { quality: 4 },
        status: 'approved',
        approved_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        role_id: 'role-2'
      },
      {
        id: 'ref-1',
        owner_id: candidateId,
        referrer_email: 'beta@example.com',
        referrer_company: 'Beta Co',
        relationship: 'manager',
        summary: 'Great',
        overall_rating: 5,
        kpi_ratings: { quality: 5 },
        status: 'approved',
        approved_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        role_id: 'role-2'
      }
    ];

    const referenceBuilder = createQueryBuilder({ data: referenceRows, error: null });
    const observationBuilder = createQueryBuilder({ data: [], error: null });

    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return referenceBuilder;
      }
      if (table === 'kpi_observations') {
        return observationBuilder;
      }
      return createQueryBuilder({ data: [], error: null });
    });

    const pack = await buildCanonicalReferencePack(candidateId);
    expect(pack.references.map((ref) => ref.reference_id)).toEqual(['ref-1', 'ref-2']);
  });
});
