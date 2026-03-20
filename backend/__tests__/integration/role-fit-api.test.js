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
    single: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null })),
    maybeSingle: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null })),
    limit: jest.fn(() => builder)
  };
  return builder;
}

const assertRecruiterCanAccessReferencePackMock = jest.fn();
const computeRoleFitScoreMock = jest.fn();

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

jest.unstable_mockModule('../../services/roleFit.service.js', () => ({
  computeRoleFitScore: computeRoleFitScoreMock
}));

let app;

describe('Role fit API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires explicit reference access for recruiters', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/role-fit/candidate-1')
      .query({
        roleDefinition: JSON.stringify({ requiredSkills: ['analytics'], seniorityLevel: 'mid' })
      })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(computeRoleFitScoreMock).not.toHaveBeenCalled();
  });

  it('returns role-fit payload for an authorized recruiter', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computeRoleFitScoreMock.mockResolvedValue({
      candidateId: 'candidate-1',
      roleFitScore: 0.781,
      band: 'strong',
      components: {
        skillMatch: 0.82,
        experienceAlignment: 0.77,
        evidenceStrength: 0.74,
        careerConsistency: 0.71
      },
      explanation: ['Strong overlap with required role skills.'],
      caveats: ['Reference quality is uneven across submissions.']
    });

    const response = await request(app)
      .get('/api/role-fit/candidate-1')
      .query({
        roleDefinition: JSON.stringify({ requiredSkills: ['analytics'], preferredSkills: ['operations'], seniorityLevel: 'senior' })
      })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.roleFitScore).toBe(0.781);
    expect(response.body.components.skillMatch).toBe(0.82);
    expect(computeRoleFitScoreMock).toHaveBeenCalledWith('candidate-1', expect.objectContaining({ seniorityLevel: 'senior' }));
  });

  it('returns a bounded validation error for invalid roleDefinition input', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });

    const response = await request(app)
      .get('/api/role-fit/candidate-1')
      .query({
        roleDefinition: '{invalid-json'
      })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: 'INVALID_ROLE_DEFINITION'
    });
    expect(computeRoleFitScoreMock).not.toHaveBeenCalled();
  });
});
