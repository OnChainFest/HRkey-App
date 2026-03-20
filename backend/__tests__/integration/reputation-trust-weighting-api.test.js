import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

jest.unstable_mockModule('../../services/reputationTrustWeighting.service.js', () => ({
  computeCandidateTrustWeights: jest.fn(async () => ({
    target: { entityType: 'candidate', entityId: 'ignored' },
    weights: { finalCompositeWeight: 1.22 }
  })),
  computeRefereeTrustWeights: jest.fn(async () => ({
    target: { entityType: 'referee', entityId: 'ignored' },
    weights: { finalCompositeWeight: 1.13 }
  })),
  __setSupabaseClientForTests: jest.fn(),
  __resetSupabaseClientForTests: jest.fn()
}));

let app;

describe('Reputation trust weighting API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  it('returns candidate trust weighting to the candidate owner', async () => {
    const response = await request(app)
      .get('/api/reputation-trust-weighting/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('denies candidate trust weighting access to unauthorized users', async () => {
    const response = await request(app)
      .get('/api/reputation-trust-weighting/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '99999999-9999-4999-8999-999999999999')
      .set('x-test-user-email', 'other@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('allows referee trust weighting only for superadmins', async () => {
    const forbiddenResponse = await request(app)
      .get('/api/reputation-trust-weighting/referee/referee-1')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(forbiddenResponse.status).toBe(403);

    const okResponse = await request(app)
      .get('/api/reputation-trust-weighting/referee/referee-1')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com')
      .set('x-test-user-role', 'superadmin');

    expect(okResponse.status).toBe(200);
    expect(okResponse.body.ok).toBe(true);
  });
});
