import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

jest.unstable_mockModule('../../services/recruiterGraphInsights.service.js', () => ({
  computeCandidateRecruiterInsights: jest.fn(async (candidateId) => ({
    target: { entityType: 'candidate', entityId: candidateId },
    summary: {
      overallGraphReadiness: 'moderate',
      networkCredibilityBand: 'moderate',
      candidateInfluenceBand: 'limited',
      trustedCollaboratorBand: 'moderate'
    },
    insights: [
      { type: 'candidate_influence', band: 'limited', headline: 'Candidate shows limited graph-backed support so far.', details: ['1 canonical referee provides direct graph support.'] }
    ],
    supportingCounts: { referenceCount: 1, canonicalRefereeCount: 1, confirmedRelationshipCount: 0, inferredRelationshipCount: 1, unresolvedReferenceCount: 0 },
    caveats: ['Graph remains sparse; treat these insights as supportive context rather than objective truth.']
  })),
  __setSupabaseClientForTests: jest.fn(),
  __resetSupabaseClientForTests: jest.fn()
}));

let app;

describe('Recruiter graph insights API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  it('returns recruiter graph insights to the candidate owner', async () => {
    const response = await request(app)
      .get('/api/recruiter-graph-insights/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.target.entityId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.summary.networkCredibilityBand).toBe('moderate');
  });

  it('denies recruiter graph insight access to unauthorized users', async () => {
    const response = await request(app)
      .get('/api/recruiter-graph-insights/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '99999999-9999-4999-8999-999999999999')
      .set('x-test-user-email', 'other@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('allows superadmin access', async () => {
    const response = await request(app)
      .get('/api/recruiter-graph-insights/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '99999999-9999-4999-8999-999999999999')
      .set('x-test-user-email', 'admin@example.com')
      .set('x-test-user-role', 'superadmin');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
