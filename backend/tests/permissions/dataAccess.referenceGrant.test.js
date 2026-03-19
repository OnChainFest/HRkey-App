import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const fromMock = jest.fn();
const mockSupabaseClient = {
  from: fromMock,
  auth: {
    getUser: jest.fn(),
    admin: { getUserById: jest.fn() }
  }
};
const recordAccessDecisionMock = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/accessDecisionAudit.service.js', () => ({
  recordAccessDecision: recordAccessDecisionMock,
  recordCapabilityMint: jest.fn().mockResolvedValue({ success: true }),
  recordCapabilityRevocation: jest.fn().mockResolvedValue({ success: true })
}));

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: jest.fn().mockResolvedValue({ score: 88 })
}));

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn(),
  EventTypes: {}
}));

jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: { ACCESS_GRANTED: 'access_granted' }
}));

const dataAccessControllerModule = await import('../../controllers/dataAccessController.js');
const { getDataByRequestId, __setSupabaseClientForTests } = dataAccessControllerModule;
__setSupabaseClientForTests(mockSupabaseClient);

function createBuilder({ singleQueue = [], maybeSingleQueue = [], orderResponse = { data: [], error: null } } = {}) {
  const builder = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    or: jest.fn(() => builder),
    single: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null })),
    maybeSingle: jest.fn(async () => (maybeSingleQueue.length ? maybeSingleQueue.shift() : { data: null, error: null })),
    order: jest.fn(async () => orderResponse)
  };
  return builder;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('dataAccessController explicit reference grant enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('denies approved company data access when no explicit recruiter grant exists', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'data_access_requests') {
        return createBuilder({
          singleQueue: [{ data: { id: 'req-1', company_id: 'company-1', target_user_id: 'candidate-1', requested_data_type: 'reference', reference_id: 'ref-1', status: 'APPROVED', access_count: 0 }, error: null }]
        });
      }
      if (table === 'company_signers') {
        return createBuilder({ maybeSingleQueue: [
          { data: { id: 'signer-controller-1' }, error: null },
          { data: { id: 'signer-service-1', company_id: 'company-1', user_id: 'recruiter-1', is_active: true }, error: null }
        ] });
      }
      if (table === 'users') {
        return createBuilder({ singleQueue: [{ data: { id: 'recruiter-1', wallet_address: '0xabc' }, error: null }] });
      }
      if (table === 'staking_tiers') {
        return createBuilder({ maybeSingleQueue: [{ data: { user_id: 'recruiter-1', wallet_address: '0xabc', tier: 'platinum', updated_at: new Date().toISOString() }, error: null }] });
      }
      if (table === 'reference_pack_access_grants') {
        return createBuilder({ maybeSingleQueue: [{ data: null, error: null }] });
      }
      if (table === 'references') {
        return createBuilder({ singleQueue: [{ data: { id: 'ref-1', owner_id: 'candidate-1' }, error: null }] });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const req = { params: { requestId: 'req-1' }, user: { id: 'recruiter-1' }, requestId: 'req-1' };
    const res = createRes();

    await getDataByRequestId(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'Access denied', message: 'Explicit reference access is required' });
    expect(recordAccessDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'recruiter-1',
      targetOwnerId: 'candidate-1',
      result: 'denied'
    }));
  });

  test('allows approved company data access when an explicit recruiter grant is active', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'data_access_requests') {
        const builder = createBuilder({
          singleQueue: [{ data: { id: 'req-2', company_id: 'company-1', target_user_id: 'candidate-1', requested_data_type: 'reference', reference_id: 'ref-2', status: 'APPROVED', access_count: 1 }, error: null }]
        });
        builder.update = jest.fn(() => builder);
        return builder;
      }
      if (table === 'company_signers') {
        return createBuilder({ maybeSingleQueue: [
          { data: { id: 'signer-controller-2' }, error: null },
          { data: { id: 'signer-service-2', company_id: 'company-1', user_id: 'recruiter-1', is_active: true }, error: null }
        ] });
      }
      if (table === 'users') {
        return createBuilder({ singleQueue: [{ data: { id: 'recruiter-1', wallet_address: '0xabc' }, error: null }] });
      }
      if (table === 'staking_tiers') {
        return createBuilder({ maybeSingleQueue: [{ data: { user_id: 'recruiter-1', wallet_address: '0xabc', tier: 'platinum', updated_at: new Date().toISOString() }, error: null }] });
      }
      if (table === 'reference_pack_access_grants') {
        return createBuilder({ maybeSingleQueue: [{ data: { id: 'grant-1', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', status: 'active', expires_at: '2030-01-01T00:00:00.000Z' }, error: null }] });
      }
      if (table === 'references') {
        return createBuilder({ singleQueue: [{ data: { id: 'ref-2', owner_id: 'candidate-1', status: 'approved' }, error: null }] });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const req = { params: { requestId: 'req-2' }, user: { id: 'recruiter-1' }, requestId: 'req-2' };
    const res = createRes();

    await getDataByRequestId(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference.id).toBe('ref-2');
    expect(recordAccessDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'recruiter-1',
      targetOwnerId: 'candidate-1',
      result: 'allowed'
    }));
  });
});
