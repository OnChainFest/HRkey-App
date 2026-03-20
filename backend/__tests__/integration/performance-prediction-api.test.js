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
const computePerformancePredictionMock = jest.fn();

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

jest.unstable_mockModule('../../services/performancePrediction.service.js', () => ({
  computePerformancePrediction: computePerformancePredictionMock,
  normalizePerformanceRoleDefinition: (input) => ({
    requiredSkills: Array.isArray(input?.requiredSkills) ? [...new Set(input.requiredSkills.map((value) => String(value || '').trim()).filter(Boolean))] : [],
    preferredSkills: Array.isArray(input?.preferredSkills) ? [...new Set(input.preferredSkills.map((value) => String(value || '').trim()).filter(Boolean))] : [],
    keywords: Array.isArray(input?.keywords) ? [...new Set(input.keywords.map((value) => String(value || '').trim()).filter(Boolean))] : [],
    seniorityLevel: typeof input?.seniorityLevel === 'string' ? input.seniorityLevel.trim() : null,
    weightOverrides: null
  })
}));

let app;

describe('Performance prediction API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies unauthorized recruiters', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({ roleDefinition: JSON.stringify({ requiredSkills: ['analytics'], seniorityLevel: 'mid' }) })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(computePerformancePredictionMock).not.toHaveBeenCalled();
  });

  it('normalizes roleDefinition arrays before invoking the service', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computePerformancePredictionMock.mockResolvedValue({
      candidateId: 'candidate-1',
      performancePredictionScore: 0.52,
      band: 'moderate',
      components: { roleReadiness: 0.5, evidenceReliability: 0.5, networkConfidence: 0.5, careerProgression: 0.5, predictionConfidence: 0.4 },
      explanation: [],
      caveats: [],
      diagnostics: {
        appliedCeilings: {
          roleReadiness: { capApplied: false, wasReduced: false, capValue: null, score: 0.52, gatingInputs: { roleReadiness: 0.5, requiredSkillScore: 0.5 } },
          confidencePromotion: { capApplied: true, wasReduced: false, capValue: 0.719, score: 0.52, baseScoreWithoutConfidence: 0.48 }
        }
      }
    });

    const response = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({
        roleDefinition: JSON.stringify({
          requiredSkills: ['analytics', ' ', 'analytics'],
          preferredSkills: ['operations', ''],
          keywords: ['finance', null, 'finance'],
          seniorityLevel: ' senior '
        })
      })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(computePerformancePredictionMock).toHaveBeenCalledWith('candidate-1', expect.objectContaining({
      requiredSkills: expect.any(Array),
      preferredSkills: expect.any(Array),
      keywords: expect.any(Array),
      seniorityLevel: 'senior',
      weightOverrides: null
    }));
  });

  it('returns a bounded payload for an authorized recruiter', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computePerformancePredictionMock.mockResolvedValue({
      candidateId: 'candidate-1',
      performancePredictionScore: 0.713,
      band: 'moderate',
      components: {
        roleReadiness: 0.78,
        evidenceReliability: 0.69,
        networkConfidence: 0.72,
        careerProgression: 0.63,
        predictionConfidence: 0.67
      },
      explanation: ['Role-fit signals align well with the target role requirements.'],
      caveats: ['Future-role prediction is supportive context, not an objective guarantee of performance.'],
      diagnostics: {
        appliedCeilings: {
          roleReadiness: { capApplied: false, wasReduced: false, capValue: null, score: 0.713, gatingInputs: { roleReadiness: 0.78, requiredSkillScore: 0.78 } },
          confidencePromotion: { capApplied: true, wasReduced: false, capValue: 0.719, score: 0.713, baseScoreWithoutConfidence: 0.646 }
        }
      }
    });

    const response = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({ roleDefinition: JSON.stringify({ requiredSkills: ['analytics'], seniorityLevel: 'senior' }) })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.performancePredictionScore).toBe(0.713);
    expect(response.body.band).toBe('moderate');
    expect(response.body.components.networkConfidence).toBe(0.72);
    expect(response.body.explanation).toHaveLength(1);
    expect(response.body.caveats).toHaveLength(1);
    expect(computePerformancePredictionMock).toHaveBeenCalledWith('candidate-1', expect.objectContaining({ seniorityLevel: 'senior' }));
  });

  it('returns 400 for malformed JSON roleDefinition input', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });

    const response = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({ roleDefinition: '{invalid-json' })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: 'INVALID_ROLE_DEFINITION' });
    expect(computePerformancePredictionMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid roleDefinition types', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });

    const arrayResponse = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({ roleDefinition: '[]' })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    const nullResponse = await request(app)
      .get('/api/performance-prediction/candidate-1')
      .query({ roleDefinition: 'null' })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(arrayResponse.status).toBe(400);
    expect(nullResponse.status).toBe(400);
    expect(arrayResponse.body.error).toBe('INVALID_ROLE_DEFINITION');
    expect(nullResponse.body.error).toBe('INVALID_ROLE_DEFINITION');
    expect(computePerformancePredictionMock).not.toHaveBeenCalled();
  });

  it('includes stable top-level and component keys in the success payload', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computePerformancePredictionMock.mockResolvedValue({
      candidateId: 'candidate-2',
      performancePredictionScore: 0.455,
      band: 'moderate',
      components: {
        roleReadiness: 0.5,
        evidenceReliability: 0.46,
        networkConfidence: 0.42,
        careerProgression: 0.4,
        predictionConfidence: 0.35
      },
      explanation: ['Role-fit signals show partial alignment with the requested role profile.'],
      caveats: ['Prediction remains limited by sparse or uneven evidence.'],
      diagnostics: {
        appliedCeilings: {
          roleReadiness: { capApplied: false, wasReduced: false, capValue: null, score: 0.455, gatingInputs: { roleReadiness: 0.5, requiredSkillScore: 0.5 } },
          confidencePromotion: { capApplied: true, wasReduced: false, capValue: 0.719, score: 0.455, baseScoreWithoutConfidence: 0.42 }
        }
      }
    });

    const response = await request(app)
      .get('/api/performance-prediction/candidate-2')
      .query({ roleDefinition: JSON.stringify({ requiredSkills: ['operations'] }) })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      ok: true,
      candidateId: expect.any(String),
      performancePredictionScore: expect.any(Number),
      band: expect.any(String),
      components: expect.objectContaining({
        roleReadiness: expect.any(Number),
        evidenceReliability: expect.any(Number),
        networkConfidence: expect.any(Number),
        careerProgression: expect.any(Number),
        predictionConfidence: expect.any(Number)
      }),
      explanation: expect.any(Array),
      caveats: expect.any(Array),
      diagnostics: expect.objectContaining({
        appliedCeilings: expect.objectContaining({
          roleReadiness: expect.any(Object),
          confidencePromotion: expect.any(Object)
        })
      })
    }));
  });
});
