import { jest, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import { createMockSupabaseClient, mockDatabaseSuccess } from '../../tests/__mocks__/supabase.mock.js';
import { resetRateLimiter } from '../../middleware/rateLimit.js';

const originalEnv = { ...process.env };

process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_TOKEN_MAX = '10';
process.env.RATE_LIMIT_SUBMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_SUBMIT_MAX = '2';
process.env.INVITE_IP_SALT = 'test-invite-salt';
process.env.NODE_ENV = 'test';

const mockSupabaseClient = createMockSupabaseClient();

function buildTableMock({
  singleResponses = [],
  maybeSingleResponses = [],
  limitResponses = [],
  awaitedResponses = []
} = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    then: jest.fn(),
    catch: jest.fn(),
    finally: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
  );

  builder.limit.mockImplementation(() =>
    Promise.resolve(limitResponses.length ? limitResponses.shift() : mockDatabaseSuccess([]))
  );

  const consumeAwaited = () =>
    Promise.resolve(awaitedResponses.length ? awaitedResponses.shift() : mockDatabaseSuccess([]));

  builder.then.mockImplementation((resolve, reject) => consumeAwaited().then(resolve, reject));
  builder.catch.mockImplementation((reject) => consumeAwaited().catch(reject));
  builder.finally.mockImplementation((handler) => consumeAwaited().finally(handler));

  return builder;
}

const referencesTable = buildTableMock();
const referenceInvitesTable = buildTableMock();

mockSupabaseClient.rpc = jest.fn();
mockSupabaseClient.from.mockImplementation((table) => {
  if (table === 'references') return referencesTable;
  if (table === 'reference_invites') return referenceInvitesTable;
  return buildTableMock();
});

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendSignerInvitation: jest.fn().mockResolvedValue(),
  sendCompanyVerificationNotification: jest.fn().mockResolvedValue(),
  sendIdentityVerificationConfirmation: jest.fn().mockResolvedValue(),
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logAudit: jest.fn().mockResolvedValue(),
  logIdentityVerification: jest.fn().mockResolvedValue(),
  logCompanyCreation: jest.fn().mockResolvedValue(),
  logCompanyVerification: jest.fn().mockResolvedValue(),
  logSignerInvitation: jest.fn().mockResolvedValue(),
  logSignerAcceptance: jest.fn().mockResolvedValue(),
  logSignerStatusChange: jest.fn().mockResolvedValue(),
  logReferenceSubmissionAudit: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {
    SUBMIT_REFERENCE_ATTEMPT: 'submit_reference_attempt',
    SUBMIT_REFERENCE_SUCCESS: 'submit_reference_success',
    SUBMIT_REFERENCE_FAILURE: 'submit_reference_failure'
  },
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
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

const { default: app } = await import('../../server.js');
const appModule = await import('../../app.js');
const auditLogger = await import('../../utils/auditLogger.js');

describe('Invite security remediation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    mockSupabaseClient.rpc.mockReset();
    referencesTable.single.mockReset();
    referencesTable.limit.mockReset();
    referencesTable.then.mockReset();
    referencesTable.catch.mockReset();
    referencesTable.finally.mockReset();
    referencesTable.select.mockReturnThis();
    referencesTable.insert.mockReturnThis();
    referencesTable.update.mockReturnThis();
    referencesTable.eq.mockReturnThis();
    referencesTable.neq.mockReturnThis();
    referencesTable.limit.mockResolvedValue(mockDatabaseSuccess([]));
    referencesTable.single.mockResolvedValue(
      mockDatabaseSuccess({
        id: 'reference-1',
        owner_id: 'user-1',
        referrer_email: 'ref@example.com',
        referrer_name: 'Ref',
        summary: 'Great candidate',
        overall_rating: 5,
        kpi_ratings: { overall: 5 },
        detailed_feedback: { recommendation: 'Great candidate' },
        status: 'active'
      })
    );
    referencesTable.then.mockImplementation((resolve, reject) => Promise.resolve(mockDatabaseSuccess([])).then(resolve, reject));
    referencesTable.catch.mockImplementation((reject) => Promise.resolve(mockDatabaseSuccess([])).catch(reject));
    referencesTable.finally.mockImplementation((handler) => Promise.resolve(mockDatabaseSuccess([])).finally(handler));
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  test('normalizes public lookup failures to a generic 404', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: [], error: null });

    const res = await request(app).get('/api/reference/by-token/bad');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Invalid or expired invite' });
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_invite_by_token', { p_token: 'bad' });
  });

  test('returns invite details only for valid pending invites', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: [{
        reference_id: 'invite-1',
        referrer_email: 'ref@example.com',
        referrer_name: 'Ref',
        expires_at: '2099-01-01T00:00:00Z'
      }],
      error: null
    });

    const res = await request(app).get('/api/reference/by-token/valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      invite: {
        referee_name: 'Ref',
        referee_email: 'ref@example.com',
        expires_at: '2099-01-01T00:00:00Z'
      }
    });
  });

  test('submits through the authoritative RPC path and persists hashed IP metadata', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: [{ reference_id: 'reference-1' }],
      error: null
    });

    const res = await request(app)
      .post('/api/references/respond/valid-token')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'UnitTestAgent/1.0')
      .send({
        ratings: { leadership: 5, communication: 4 },
        comments: { recommendation: 'Excellent hire' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const rpcArgs = mockSupabaseClient.rpc.mock.calls[0][1];
    expect(rpcArgs.p_token).toBe('valid-token');
    expect(rpcArgs.p_kpi_ratings).toEqual({ leadership: 5, communication: 4 });
    expect(rpcArgs.p_detailed_feedback).toEqual({ recommendation: 'Excellent hire' });
    expect(rpcArgs.p_user_agent).toBe('UnitTestAgent/1.0');
    expect(rpcArgs.p_ip_hash).toBe(
      crypto.createHash('sha256').update('203.0.113.10test-invite-salt').digest('hex')
    );
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenCalledTimes(2);
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenNthCalledWith(1, {
      actionType: 'submit_reference_attempt',
      tokenHashPrefix: crypto.createHash('sha256').update('valid-token').digest('hex').slice(0, 12),
      clientIpHash: rpcArgs.p_ip_hash,
      userAgent: 'UnitTestAgent/1.0',
      outcome: 'attempted'
    });
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenNthCalledWith(2, {
      actionType: 'submit_reference_success',
      referenceId: 'reference-1',
      inviteId: null,
      tokenHashPrefix: crypto.createHash('sha256').update('valid-token').digest('hex').slice(0, 12),
      clientIpHash: rpcArgs.p_ip_hash,
      userAgent: 'UnitTestAgent/1.0',
      outcome: 'succeeded',
      ownerId: 'user-1'
    });
  });

  test('returns a generic 404 when the authoritative RPC rejects expired or replayed submits', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: [], error: null });

    const res = await request(app)
      .post('/api/references/respond/expired-or-used-token')
      .send({
        ratings: { professionalism: 4 },
        comments: { recommendation: 'Strong hire' }
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'Invalid or expired invite' });
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenCalledTimes(2);
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenNthCalledWith(1, {
      actionType: 'submit_reference_attempt',
      tokenHashPrefix: crypto.createHash('sha256').update('expired-or-used-token').digest('hex').slice(0, 12),
      clientIpHash: expect.any(String),
      userAgent: expect.any(String),
      outcome: 'attempted'
    });
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenNthCalledWith(2, {
      actionType: 'submit_reference_failure',
      tokenHashPrefix: crypto.createHash('sha256').update('expired-or-used-token').digest('hex').slice(0, 12),
      clientIpHash: expect.any(String),
      userAgent: expect.any(String),
      outcome: 'failed',
      errorCode: 'invalid_or_expired_invite'
    });
  });

  test('consumes a token after success and rejects replay attempts on the same route', async () => {
    mockSupabaseClient.rpc
      .mockResolvedValueOnce({ data: [{ reference_id: 'reference-1' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const first = await request(app)
      .post('/api/references/respond/replay-token')
      .send({
        ratings: { professionalism: 5 },
        comments: { recommendation: 'Strong hire' }
      });

    const second = await request(app)
      .post('/api/references/respond/replay-token')
      .send({
        ratings: { professionalism: 5 },
        comments: { recommendation: 'Strong hire' }
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenCalledTimes(4);
    expect(auditLogger.logReferenceSubmissionAudit).toHaveBeenNthCalledWith(4, {
      actionType: 'submit_reference_failure',
      tokenHashPrefix: crypto.createHash('sha256').update('replay-token').digest('hex').slice(0, 12),
      clientIpHash: expect.any(String),
      userAgent: expect.any(String),
      outcome: 'failed',
      errorCode: 'invalid_or_expired_invite'
    });
  });

  test('rate limits the real submit endpoint on the runtime entrypoint', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

    await request(app)
      .post('/api/references/respond/rate-limit-token')
      .send({ ratings: { professionalism: 4 } });

    await request(app)
      .post('/api/references/respond/rate-limit-token')
      .send({ ratings: { professionalism: 4 } });

    const blocked = await request(app)
      .post('/api/references/respond/rate-limit-token')
      .send({ ratings: { professionalism: 4 } });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  test('removes the legacy public submit endpoint from runtime', async () => {
    const res = await request(app)
      .post('/api/reference/submit')
      .send({
        token: 'legacy-token',
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(404);
    expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
  });

  test('server runtime entrypoint reuses the hardened app wiring', () => {
    expect(app).toBe(appModule.default);
  });
});
