import { jest, afterAll } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();
const evaluateCandidateForUser = jest.fn();

function buildTableMock({ singleResponses = [], maybeSingleResponses = [], orderResponses = [] } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn(),
    limit: jest.fn().mockReturnThis(),
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

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser
}));

const authMiddleware = await import('../../middleware/auth.js');
const { default: app } = await import('../../server.js');

describe('Data Access Integration', () => {
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

  test('DA-INT-01: should return 401 for unauthenticated user on pending list', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

    const res = await request(app).get('/api/data-access/pending');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('DA-INT-02: should return 403 when non-signer requests approved data', async () => {
    const authedUser = mockUserData({ id: 'user-1' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const requestsTable = buildTableMock({
      singleResponses: [
        mockDatabaseSuccess({
          id: 'req-1',
          company_id: 'company-1',
          target_user_id: 'target-1',
          status: 'APPROVED',
          requested_data_type: 'profile',
          reference_id: null,
          access_count: 0
        })
      ]
    });

    const companySignersTable = buildTableMock({
      maybeSingleResponses: [{ data: null, error: null }]
    });

    configureTableMocks({
      users: usersTable,
      data_access_requests: requestsTable,
      company_signers: companySignersTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-1'));

    const res = await request(app)
      .get('/api/data-access/req-1/data')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Permission denied');
  });

  test('DA-INT-03: should list pending requests for authenticated user', async () => {
    const authedUser = mockUserData({ id: 'user-2' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const pendingRequests = [
      {
        id: 'req-2',
        companies: { id: 'comp-1', name: 'Acme', verified: false, logo_url: null },
        references: { id: 'ref-1', referrer_name: 'Ref One', overall_rating: 4 },
        requested_data_type: 'profile',
        request_reason: 'Need profile review',
        price_amount: 120,
        currency: 'USD',
        status: 'PENDING',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-02-01T00:00:00Z'
      }
    ];

    const dataAccessTable = buildTableMock({
      orderResponses: [mockDatabaseSuccess(pendingRequests)]
    });

    configureTableMocks({
      users: usersTable,
      data_access_requests: dataAccessTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-2'));

    const res = await request(app)
      .get('/api/data-access/pending')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.requests[0].company.name).toBe('Acme');
  });

  test('DA-INT-04: should allow target user to reject request', async () => {
    const authedUser = mockUserData({ id: 'target-1' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const requestRecord = {
      id: 'req-3',
      company_id: 'comp-2',
      target_user_id: 'target-1',
      status: 'PENDING',
      requested_data_type: 'profile',
      price_amount: 75,
      currency: 'USD'
    };

    const dataAccessTable = buildTableMock({
      singleResponses: [
        mockDatabaseSuccess(requestRecord),
        mockDatabaseSuccess({ ...requestRecord, status: 'REJECTED' })
      ]
    });

    configureTableMocks({
      users: usersTable,
      data_access_requests: dataAccessTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('target-1'));

    const res = await request(app)
      .post('/api/data-access/req-3/reject')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request.status).toBe('REJECTED');
  });

  test('DA-INT-05: should return 400 when approving without required fields', async () => {
    const authedUser = mockUserData({ id: 'target-2' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    configureTableMocks({
      users: usersTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('target-2'));

    const res = await request(app)
      .post('/api/data-access/req-4/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('DA-INT-06: should return 500 when pending fetch fails', async () => {
    const authedUser = mockUserData({ id: 'user-5' });

    const usersTable = buildTableMock({
      singleResponses: [mockDatabaseSuccess(authedUser)]
    });

    const dataAccessTable = buildTableMock({
      orderResponses: [{ data: null, error: { message: 'Database error' } }]
    });

    configureTableMocks({
      users: usersTable,
      data_access_requests: dataAccessTable
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-5'));

    const res = await request(app)
      .get('/api/data-access/pending')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Database error');
  });
});