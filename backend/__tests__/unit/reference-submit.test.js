import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.NODE_ENV = 'test';

const auditEntries = [];
const mockRpc = jest.fn();
const mockGetUserById = jest.fn();
let referenceCallPlan = [];

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
    admin: {
      getUserById: mockGetUserById
    }
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

const { ReferenceService } = await import('../../services/references.service.js');

describe('ReferenceService.submitReference', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    auditEntries.length = 0;
    referenceCallPlan = [];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: jest.fn().mockResolvedValue('')
    });
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          email: 'candidate@example.com'
        }
      }
    });
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'audit_logs') {
        return createAuditLogsBuilder();
      }

      if (table === 'references') {
        const next = referenceCallPlan.shift();
        if (!next) {
          throw new Error('No mock plan available for references table call');
        }
        return next();
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('persists attempt and success audit records for the authoritative submit flow', async () => {
    const createdReference = {
      id: 'reference-1',
      invite_id: 'invite-1',
      owner_id: 'user-1',
      referrer_name: 'Taylor Referee',
      referrer_email: 'referee@example.com',
      summary: 'Excellent hire',
      overall_rating: 5,
      kpi_ratings: { leadership: 5 },
      detailed_feedback: { recommendation: 'Excellent hire' },
      status: 'active'
    };

    mockRpc.mockResolvedValueOnce({ data: [{ reference_id: 'reference-1' }], error: null });
    referenceCallPlan = [
      () => createFetchReferenceBuilder(createdReference),
      () => createUpdateBuilder(),
      () => createPreviousReferencesBuilder([]),
      () => createUpdateBuilder(),
      () => createUpdateBuilder()
    ];

    const result = await ReferenceService.submitReference({
      token: 'valid-token',
      ratings: { leadership: 5 },
      comments: { recommendation: 'Excellent hire' },
      clientIpHash: 'hashed-ip',
      userAgent: 'UnitTestAgent/1.0'
    });

    expect(result).toEqual({ success: true, reference_id: 'reference-1' });
    expect(mockRpc).toHaveBeenCalledWith('submit_reference_by_token', {
      p_token: 'valid-token',
      p_summary: 'Excellent hire',
      p_rating: 5,
      p_kpi_ratings: { leadership: 5 },
      p_detailed_feedback: { recommendation: 'Excellent hire' },
      p_ip_hash: 'hashed-ip',
      p_user_agent: 'UnitTestAgent/1.0'
    });

    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]).toMatchObject({
      action_type: 'submit_reference_attempt',
      resource_type: 'reference',
      resource_id: null,
      ip_address: 'hashed-ip',
      user_agent: 'UnitTestAgent/1.0'
    });
    expect(auditEntries[0].details).toMatchObject({
      flow: 'reference_invite_token',
      actor_type: 'public_invite_submitter',
      outcome: 'attempted',
      client_ip_hash: 'hashed-ip'
    });

    expect(auditEntries[1]).toMatchObject({
      user_id: 'user-1',
      action_type: 'submit_reference_success',
      resource_type: 'reference',
      resource_id: 'reference-1',
      ip_address: 'hashed-ip',
      user_agent: 'UnitTestAgent/1.0'
    });
    expect(auditEntries[1].details).toMatchObject({
      flow: 'reference_invite_token',
      actor_type: 'public_invite_submitter',
      invite_id: 'invite-1',
      outcome: 'succeeded',
      client_ip_hash: 'hashed-ip'
    });

    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-resend-key',
          'Content-Type': 'application/json'
        })
      })
    );

    const fetchPayload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(fetchPayload.to).toBe('candidate@example.com');
    expect(fetchPayload.subject).toBe('Your reference has been completed!');
    expect(fetchPayload.html).toContain('Great news! Your reference is ready');
    expect(fetchPayload.html).toContain('Taylor Referee has completed your professional reference.');
    expect(fetchPayload.html).toContain('Overall Rating:</strong> 5/5');
  });

  it('persists attempt and failure audit records when the invite is invalid or already used', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(
      ReferenceService.submitReference({
        token: 'used-token',
        ratings: { professionalism: 4 },
        comments: { recommendation: 'Strong hire' },
        clientIpHash: 'hashed-ip',
        userAgent: 'UnitTestAgent/1.0'
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]).toMatchObject({ action_type: 'submit_reference_attempt' });
    expect(auditEntries[1]).toMatchObject({
      action_type: 'submit_reference_failure',
      resource_type: 'reference',
      resource_id: null,
      ip_address: 'hashed-ip',
      user_agent: 'UnitTestAgent/1.0'
    });
    expect(auditEntries[1].details).toMatchObject({
      outcome: 'failed',
      error_code: 'invalid_or_expired_invite',
      flow: 'reference_invite_token',
      actor_type: 'public_invite_submitter'
    });
    expect(mockGetUserById).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not send an email when the authoritative RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(
      ReferenceService.submitReference({
        token: 'rpc-error-token',
        ratings: { professionalism: 2 },
        comments: { recommendation: 'Needs support' },
        clientIpHash: 'hashed-ip',
        userAgent: 'UnitTestAgent/1.0'
      })
    ).rejects.toMatchObject({ status: 500 });

    expect(mockGetUserById).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps submission successful when the email provider responds with a non-2xx status', async () => {
    const createdReference = {
      id: 'reference-2',
      invite_id: 'invite-2',
      owner_id: 'user-2',
      referrer_name: 'Jordan Referee',
      referrer_email: 'referee2@example.com',
      summary: 'Strong performer',
      overall_rating: 4,
      kpi_ratings: { execution: 4 },
      detailed_feedback: { recommendation: 'Strong performer' },
      status: 'active'
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('provider unavailable')
    });

    mockRpc.mockResolvedValueOnce({ data: [{ reference_id: 'reference-2' }], error: null });
    referenceCallPlan = [
      () => createFetchReferenceBuilder(createdReference),
      () => createUpdateBuilder(),
      () => createPreviousReferencesBuilder([]),
      () => createUpdateBuilder(),
      () => createUpdateBuilder()
    ];

    await expect(
      ReferenceService.submitReference({
        token: 'valid-token-2',
        ratings: { execution: 4 },
        comments: { recommendation: 'Strong performer' },
        clientIpHash: 'hashed-ip',
        userAgent: 'UnitTestAgent/1.0'
      })
    ).resolves.toEqual({ success: true, reference_id: 'reference-2' });

    expect(mockGetUserById).toHaveBeenCalledWith('user-2');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
