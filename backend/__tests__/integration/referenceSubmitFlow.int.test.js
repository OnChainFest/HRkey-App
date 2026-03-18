import request from 'supertest';
import { jest } from '@jest/globals';
import { resetRateLimiter } from '../../middleware/rateLimit.js';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.INVITE_IP_SALT = 'test-invite-salt';
process.env.NODE_ENV = 'test';

const auditEntries = [];
const mockRpc = jest.fn();
let referenceTableFactories = [];

function createAuditLogsBuilder() {
  let insertedEntry = null;
  const builder = {
    insert: jest.fn((entry) => {
      insertedEntry = entry;
      auditEntries.push(entry);
      return builder;
    }),
    select: jest.fn(() => builder),
    single: jest.fn(async () => ({ data: insertedEntry, error: null }))
  };
  return builder;
}

function createFetchReferenceBuilder(referenceRow) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(async () => ({ data: referenceRow, error: null }))
  };
  return builder;
}

function createUpdateBuilder() {
  const result = { data: null, error: null };
  const builder = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject)
  };
  return builder;
}

function createPreviousReferencesBuilder(previousRefs = []) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    limit: jest.fn(async () => ({ data: previousRefs, error: null }))
  };
  return builder;
}

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
  },
  rpc: mockRpc,
  from: jest.fn()
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
  EventTypes: {
    REFERENCE_SUBMITTED: 'REFERENCE_SUBMITTED'
  }
}));

jest.unstable_mockModule('../../services/validation/index.js', () => ({
  validateReference: jest.fn().mockResolvedValue({
    validation_status: 'VALID',
    fraud_score: 0.01,
    consistency_score: 0.99
  })
}));

jest.unstable_mockModule('../../services/hrscore/autoTrigger.js', () => ({
  onReferenceValidated: jest.fn().mockResolvedValue()
}));

async function loadRuntimeApp() {
  const module = await import('../../app.js');
  return module.default;
}

describe('Modern reference submit flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    auditEntries.length = 0;
    referenceTableFactories = [];
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'audit_logs') {
        return createAuditLogsBuilder();
      }

      if (table === 'references') {
        const next = referenceTableFactories.shift();
        if (!next) {
          throw new Error('Unexpected references table call');
        }
        return next();
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  test('persists audit logs on successful token submission and rejects replay on reuse', async () => {
    const runtimeApp = await loadRuntimeApp();
    const referenceRow = {
      id: 'reference-1',
      invite_id: 'invite-1',
      owner_id: 'candidate-1',
      referrer_email: 'ref@example.com',
      summary: 'Strong hire',
      overall_rating: 4.5,
      kpi_ratings: { leadership: 5, communication: 4 },
      detailed_feedback: { recommendation: 'Strong hire' },
      status: 'active'
    };

    mockRpc
      .mockResolvedValueOnce({ data: [{ reference_id: 'reference-1' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    referenceTableFactories = [
      () => createFetchReferenceBuilder(referenceRow),
      () => createUpdateBuilder(),
      () => createPreviousReferencesBuilder([]),
      () => createUpdateBuilder(),
      () => createUpdateBuilder()
    ];

    const first = await request(runtimeApp)
      .post('/api/references/respond/live-token')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'RouteIntegration/1.0')
      .send({
        ratings: { leadership: 5, communication: 4 },
        comments: { recommendation: 'Strong hire' }
      });

    const second = await request(runtimeApp)
      .post('/api/references/respond/live-token')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'RouteIntegration/1.0')
      .send({
        ratings: { leadership: 5, communication: 4 },
        comments: { recommendation: 'Strong hire' }
      });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });
    expect(second.status).toBe(404);
    expect(second.body).toEqual({ ok: false, error: 'Invalid or expired invite' });

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'submit_reference_by_token', {
      p_token: 'live-token',
      p_summary: 'Strong hire',
      p_rating: 4.5,
      p_kpi_ratings: { leadership: 5, communication: 4 },
      p_detailed_feedback: { recommendation: 'Strong hire' },
      p_ip_hash: expect.any(String),
      p_user_agent: 'RouteIntegration/1.0'
    });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'submit_reference_by_token', {
      p_token: 'live-token',
      p_summary: 'Strong hire',
      p_rating: 4.5,
      p_kpi_ratings: { leadership: 5, communication: 4 },
      p_detailed_feedback: { recommendation: 'Strong hire' },
      p_ip_hash: expect.any(String),
      p_user_agent: 'RouteIntegration/1.0'
    });

    expect(auditEntries).toHaveLength(4);
    expect(auditEntries[0]).toMatchObject({
      action_type: 'submit_reference_attempt',
      resource_type: 'reference',
      ip_address: mockRpc.mock.calls[0][1].p_ip_hash,
      user_agent: 'RouteIntegration/1.0'
    });
    expect(auditEntries[1]).toMatchObject({
      user_id: 'candidate-1',
      action_type: 'submit_reference_success',
      resource_type: 'reference',
      resource_id: 'reference-1',
      ip_address: mockRpc.mock.calls[0][1].p_ip_hash,
      user_agent: 'RouteIntegration/1.0'
    });
    expect(auditEntries[1].details).toMatchObject({
      invite_id: 'invite-1',
      flow: 'reference_invite_token',
      actor_type: 'public_invite_submitter',
      outcome: 'succeeded'
    });
    expect(auditEntries[2]).toMatchObject({
      action_type: 'submit_reference_attempt',
      resource_type: 'reference'
    });
    expect(auditEntries[3]).toMatchObject({
      action_type: 'submit_reference_failure',
      resource_type: 'reference',
      ip_address: mockRpc.mock.calls[1][1].p_ip_hash,
      user_agent: 'RouteIntegration/1.0'
    });
    expect(auditEntries[3].details).toMatchObject({
      error_code: 'invalid_or_expired_invite',
      flow: 'reference_invite_token',
      actor_type: 'public_invite_submitter',
      outcome: 'failed'
    });
  });

  test('persists audit logs when the authoritative RPC returns an error', async () => {
    const runtimeApp = await loadRuntimeApp();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    const response = await request(runtimeApp)
      .post('/api/references/respond/rpc-error-token')
      .set('x-forwarded-for', '198.51.100.20')
      .set('user-agent', 'RouteIntegration/1.0')
      .send({
        ratings: { professionalism: 3 },
        comments: { recommendation: 'Needs review' }
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ ok: false, error: 'Failed to submit reference' });
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]).toMatchObject({ action_type: 'submit_reference_attempt' });
    expect(auditEntries[1]).toMatchObject({
      action_type: 'submit_reference_failure',
      resource_type: 'reference'
    });
    expect(auditEntries[1].details).toMatchObject({
      error_code: 'rpc_error',
      outcome: 'failed'
    });
  });

  test('removes the legacy /api/reference/submit endpoint from the runtime app', async () => {
    const runtimeApp = await loadRuntimeApp();
    const response = await request(runtimeApp)
      .post('/api/reference/submit')
      .send({
        token: 'legacy-token',
        ratings: { professionalism: 4 },
        comments: { recommendation: 'Legacy path' }
      });

    expect(response.status).toBe(404);
  });
});
