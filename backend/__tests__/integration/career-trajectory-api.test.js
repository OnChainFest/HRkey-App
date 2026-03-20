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

const assertRecruiterCanAccessReferencePackMock = jest.fn();
const computeCareerTrajectoryMock = jest.fn();

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

jest.unstable_mockModule('../../services/careerTrajectory.service.js', () => ({
  computeCareerTrajectory: computeCareerTrajectoryMock
}));

let app;

describe('Career trajectory API', () => {
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
      .get('/api/career-trajectory/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(computeCareerTrajectoryMock).not.toHaveBeenCalled();
  });

  it('returns the structured trajectory payload for authorized access', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computeCareerTrajectoryMock.mockResolvedValue({
      candidateId: 'candidate-1',
      signals: {
        promotionVelocity: { score: 0.74, band: 'strong', explanation: ['Observed two upward title changes.'], caveats: [] },
        roleComplexityProgression: { score: 0.69, band: 'moderate', explanation: ['Titles suggest broader scope over time.'], caveats: ['Some titles were normalized heuristically.'] },
        leadershipDevelopment: { score: 0.51, band: 'moderate', explanation: ['Leadership-oriented titles appear later in the history.'], caveats: [] }
      },
      summary: 'Moderate evidence is available for roleComplexityProgression, leadershipDevelopment.',
      caveats: ['Some titles were normalized heuristically.']
    });

    const response = await request(app)
      .get('/api/career-trajectory/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.signals.promotionVelocity.score).toBe(0.74);
    expect(computeCareerTrajectoryMock).toHaveBeenCalledWith('candidate-1');
  });
});
