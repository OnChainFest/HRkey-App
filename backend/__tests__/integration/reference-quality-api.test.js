import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const mockSupabaseClient = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn(),
    admin: { getUserById: jest.fn() }
  }
};

function createBuilder({ singleQueue = [], orderResponse = { data: [], error: null } } = {}) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(async () => orderResponse),
    single: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null }))
  };
  return builder;
}

const assertRecruiterCanAccessReferencePackMock = jest.fn();
const computeReferenceQualityMock = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/referenceAccess.service.js', () => ({
  grantReferenceAccess: jest.fn(),
  revokeReferenceAccess: jest.fn(),
  listReferenceAccessGrants: jest.fn(),
  getReferenceAccessStatus: jest.fn(),
  createReferenceCapabilityGrant: jest.fn(),
  revokeReferenceCapabilityGrant: jest.fn(),
  listReferenceCapabilityGrants: jest.fn(),
  listReferenceAccessHistory: jest.fn(),
  assertRecruiterCanAccessReferencePack: assertRecruiterCanAccessReferencePackMock
}));

jest.unstable_mockModule('../../services/referenceQuality.service.js', () => ({
  computeReferenceQuality: computeReferenceQualityMock
}));

let app;

describe('Reference quality API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies recruiters without explicit reference access', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return createBuilder({
          singleQueue: [{ data: { id: 'ref-1', owner_id: 'candidate-1' }, error: null }]
        });
      }
      return createBuilder();
    });

    const response = await request(app)
      .get('/api/reference-quality/ref-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(computeReferenceQualityMock).not.toHaveBeenCalled();
  });

  it('returns a bounded quality payload for an authorized recruiter', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computeReferenceQualityMock.mockResolvedValue({
      referenceId: 'ref-1',
      qualityScore: 0.731,
      band: 'strong',
      dimensions: {
        specificity: 0.8,
        examples: 0.7,
        clarity: 0.75,
        constructiveTone: 0.65
      },
      explanation: ['Includes at least one concrete example or situation cue.'],
      caveats: ['Limited number of concrete examples reduces strength.']
    });
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return createBuilder({
          singleQueue: [{ data: { id: 'ref-1', owner_id: 'candidate-1' }, error: null }]
        });
      }
      return createBuilder();
    });

    const response = await request(app)
      .get('/api/reference-quality/ref-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.referenceId).toBe('ref-1');
    expect(response.body.qualityScore).toBe(0.731);
    expect(response.body.band).toBe('strong');
    expect(response.body.dimensions.examples).toBe(0.7);
    expect(computeReferenceQualityMock).toHaveBeenCalledWith('ref-1');
  });
});
