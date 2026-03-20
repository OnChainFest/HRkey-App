import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const computeCandidateBenchmarkMock = jest.fn();
const normalizeCandidateBenchmarkInputMock = jest.fn(({ candidateId, roleDefinition }) => ({
  candidateId,
  roleDefinition: roleDefinition ? JSON.parse(roleDefinition) : null
}));
const assertRecruiterCanAccessReferencePackMock = jest.fn();

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

jest.unstable_mockModule('../../services/candidateBenchmark.service.js', () => ({
  computeCandidateBenchmark: computeCandidateBenchmarkMock,
  normalizeCandidateBenchmarkInput: normalizeCandidateBenchmarkInputMock
}));

let app;

describe('Candidate benchmark API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-1', status: 'active' });
    computeCandidateBenchmarkMock.mockResolvedValue({
      candidateId: 'candidate-1',
      signals: {
        roleFit: 0.81,
        performance: 0.67,
        evidenceQuality: 0.63,
        networkSupport: 0.41
      },
      relativePositioning: {
        strongestSignal: 'roleFit',
        weakestSignal: 'networkSupport',
        comparisons: ['Role fit is currently stronger than graph-backed support.']
      },
      benchmarkSummary: 'This v1 benchmark is a bounded comparison across currently available signals for the same candidate only.',
      caveats: ['Comparisons are derived only from currently available signals for this candidate and do not represent peer, population, industry, or percentile benchmarking.']
    });
  });

  it('returns bounded benchmark output for an authorized recruiter with stable top-level keys', async () => {
    const response = await request(app)
      .get('/api/candidate-benchmark/candidate-1')
      .query({ roleDefinition: JSON.stringify({ requiredSkills: ['analytics'] }) })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      candidateId: 'candidate-1',
      signals: {
        roleFit: 0.81,
        performance: 0.67,
        evidenceQuality: 0.63,
        networkSupport: 0.41
      },
      relativePositioning: {
        strongestSignal: 'roleFit',
        weakestSignal: 'networkSupport',
        comparisons: ['Role fit is currently stronger than graph-backed support.']
      },
      benchmarkSummary: 'This v1 benchmark is a bounded comparison across currently available signals for the same candidate only.',
      caveats: ['Comparisons are derived only from currently available signals for this candidate and do not represent peer, population, industry, or percentile benchmarking.']
    });
    expect(response.body.benchmarkSummary).not.toMatch(/percentile|peer ranking|industry comparison|better than others|top performer/i);
    expect(normalizeCandidateBenchmarkInputMock).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      roleDefinition: '{"requiredSkills":["analytics"]}'
    });
  });

  it('accepts omitted roleDefinition and still succeeds', async () => {
    const response = await request(app)
      .get('/api/candidate-benchmark/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(normalizeCandidateBenchmarkInputMock).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      roleDefinition: undefined
    });
    expect(computeCandidateBenchmarkMock).toHaveBeenCalledWith('candidate-1', { roleDefinition: null });
  });

  it('returns a bounded validation error for invalid roleDefinition input', async () => {
    normalizeCandidateBenchmarkInputMock.mockImplementationOnce(() => {
      const error = new Error('roleDefinition must be valid JSON');
      error.status = 400;
      throw error;
    });

    const response = await request(app)
      .get('/api/candidate-benchmark/candidate-1')
      .query({ roleDefinition: '{invalid-json' })
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      error: 'INVALID_BENCHMARK_INPUT'
    });
    expect(computeCandidateBenchmarkMock).not.toHaveBeenCalled();
  });

  it('keeps unauthorized access behavior unchanged', async () => {
    assertRecruiterCanAccessReferencePackMock.mockRejectedValueOnce(Object.assign(new Error('Explicit reference access is required'), { status: 403 }));

    const response = await request(app)
      .get('/api/candidate-benchmark/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(computeCandidateBenchmarkMock).not.toHaveBeenCalled();
  });
});
