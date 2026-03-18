import { jest, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

function buildTableMock({
  singleResponses = [],
  maybeSingleResponses = [],
  orderResponses = [],
  limitResponses = [],
  selectResponse = null
} = {}) {
  const builder = {
    select: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(
      maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null }
    )
  );

  builder.order.mockImplementation(() =>
    Promise.resolve(orderResponses.length ? orderResponses.shift() : mockDatabaseSuccess([]))
  );

  builder.limit.mockImplementation(() =>
    Promise.resolve(limitResponses.length ? limitResponses.shift() : mockDatabaseSuccess([]))
  );

  builder.select.mockImplementation(() => (selectResponse ? Promise.resolve(selectResponse) : builder));

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation((table) => tableMocks[table] || mockQueryBuilder);
}

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
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {},
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
  logEventBatch: jest.fn().mockResolvedValue([]),
  EventTypes: {
    REFERENCE_SUBMITTED: 'REFERENCE_SUBMITTED'
  },
  EventCategories: {}
}));

jest.unstable_mockModule('../../services/validation/index.js', () => ({
  validateReference: jest.fn().mockResolvedValue({
    validation_status: 'VALID',
    fraud_score: 0.1,
    consistency_score: 0.9
  })
}));

jest.unstable_mockModule('../../services/hrscore/autoTrigger.js', () => ({
  onReferenceValidated: jest.fn().mockResolvedValue()
}));

const authMiddleware = await import('../../middleware/auth.js');

// Import app after mocking
const { default: app } = await import('../../server.js');

// ============================================================================
// TEST SUITE
// ============================================================================

describe('References Workflow MVP Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
    authMiddleware.__setSupabaseClientForTests(mockSupabaseClient);
    mockSupabaseClient.auth.getUser.mockReset();
  });

  afterAll(() => {
    authMiddleware.__resetSupabaseClientForTests();
  });

  test('REF-INT-01: should return 401 for unauthenticated /api/references/me', async () => {
    const res = await request(app).get('/api/references/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('REF-INT-02: should return 401 for unauthenticated /api/references/request', async () => {
    const res = await request(app)
      .post('/api/references/request')
      .send({
        candidate_id: '11111111-1111-4111-8111-111111111111',
        referee_email: 'referee@example.com'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('REF-INT-03: should return generic 404 for invalid token on respond', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app)
      .post('/api/references/respond/invalid-token-000000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired invite');
  });

  test('REF-INT-04: should return generic 404 for expired token', async () => {
    mockSupabaseClient.rpc = jest.fn().mockResolvedValueOnce({ data: [], error: null });

    const res = await request(app)
      .post('/api/references/respond/expired-token-000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired invite');
  });

  test('REF-INT-05: should return generic 404 for already used token', async () => {
    mockSupabaseClient.rpc = jest.fn().mockResolvedValueOnce({ data: [], error: null });

    const res = await request(app)
      .post('/api/references/respond/used-token-0000000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired invite');
  });

  test('REF-INT-06: should forbid company signer without approved access', async () => {
    const authedUser = mockUserData({ id: 'user-1' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const companySignersTable = buildTableMock({
      orderResponses: [mockDatabaseSuccess([{ company_id: 'company-1' }])]
    });

    const dataAccessRequestsTable = buildTableMock({
      maybeSingleResponses: [{ data: null, error: null }]
    });

    configureTableMocks({
      users: usersTable,
      company_signers: companySignersTable,
      data_access_requests: dataAccessRequestsTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-1'));

    const res = await request(app)
      .post('/api/references/request')
      .set('Authorization', 'Bearer valid-token')
      .send({
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('REF-INT-07: should allow superadmin to fetch candidate references', async () => {
    const adminUser = mockUserData({ id: 'admin-1', role: 'superadmin' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(adminUser)]
    });

    const references = [
      {
        id: 'ref-1',
        owner_id: 'candidate-1',
        referrer_name: 'Ref A',
        overall_rating: 4,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
      }
    ];

    const referencesTable = buildTableMock({
      orderResponses: [mockDatabaseSuccess(references)]
    });

    configureTableMocks({
      users: usersTable,
      references: referencesTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-1'));

    const res = await request(app)
      .get('/api/references/candidate/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.references).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // Data Exposure Prevention Tests
  // --------------------------------------------------------------------------

  test('REF-INT-08: should not return referrer_email for /api/references/me', async () => {
    const authedUser = mockUserData({ id: 'user-3' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const referencesTable = buildTableMock({
      orderResponses: [
        mockDatabaseSuccess([
          {
            id: 'ref-2',
            referrer_name: 'Ref B',
            referrer_email: 'secret@example.com',
            overall_rating: 5,
            status: 'active',
            created_at: '2024-01-02T00:00:00Z'
          }
        ])
      ]
    });

    configureTableMocks({
      users: usersTable,
      references: referencesTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-3'));

    const res = await request(app)
      .get('/api/references/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);

    const selectCalls = []
      .concat(usersTable.select.mock.calls.map((call) => call[0]))
      .concat(referencesTable.select.mock.calls.map((call) => call[0]));

    expect(
      selectCalls.some((value) => typeof value === 'string' && value.includes('referrer_email'))
    ).toBe(false);
  });

  test('REF-INT-09: public token lookup should not expose internal IDs', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
      mockDatabaseSuccess({
        id: 'invite-5',
        requester_id: 'user-999',
        referee_name: 'Ref C',
        referee_email: 'referee@example.com',
        metadata: { applicantCompany: 'Acme' },
        expires_at: '2099-01-01T00:00:00Z',
        status: 'pending'
      })
    );

    const res = await request(app).get(
      '/api/reference/by-token/legacy-token-000000000000000000000000'
    );

    expect(res.status).toBe(200);
    expect(res.body.invite?.requester_id).toBeUndefined();
    expect(res.body.invite?.id).toBeUndefined();
  });

  test('REF-INT-10: token lookup should delegate to the hardened RPC', async () => {
    const token = 'hashed-token-000000000000000000000000';
    mockSupabaseClient.rpc = jest.fn().mockResolvedValueOnce({
      data: [{
        reference_id: 'invite-6',
        referrer_name: 'Ref D',
        referrer_email: 'referee@example.com',
        expires_at: '2099-01-01T00:00:00Z'
      }],
      error: null
    });

    const res = await request(app).get(`/api/reference/by-token/${token}`);

    expect(res.status).toBe(200);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_invite_by_token', { p_token: token });
  });
});
