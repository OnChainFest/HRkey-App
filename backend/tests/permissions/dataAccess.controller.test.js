/**
 * Data Access Controller Permission Tests (PERM-D1..PERM-D14)
 * Focuses on authentication/authorization, IDOR prevention, and status codes.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData,
  mockCompanySignerData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

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

const { default: app } = await import('../../server.js');

function buildTableMock({ singleResponses = [], maybeSingleResponses = [] } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
  );

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation((table) => tableMocks[table] || mockQueryBuilder);
}

describe('Data Access Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/data-access/request', () => {
    test('PERM-D1: allows active company signer to request data access', async () => {
      const companyId = 'company-001';
      const targetUserId = 'user-target-1';
      const requester = mockUserData({ id: 'signer-user-1' });
      const targetUser = mockUserData({ id: targetUserId, email: 'target@example.com' });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: requester.id });
      const pricing = { id: 'price-1', price_amount: 25, currency: 'USD', platform_fee_percent: 40, user_fee_percent: 40, ref_creator_fee_percent: 20 };
      const createdRequest = {
        id: 'req-1',
        company_id: companyId,
        target_user_id: targetUserId,
        reference_id: null,
        price_amount: pricing.price_amount,
        currency: pricing.currency,
        requested_data_type: 'reference',
        status: 'PENDING',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-02T00:00:00Z'
      };

      const usersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess(requester),
          mockDatabaseSuccess(targetUser)
        ]
      });

      const companySignersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(signerRecord)]
      });

      const pricingTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(pricing)]
      });

      const dataAccessTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }],
        singleResponses: [mockDatabaseSuccess(createdRequest)]
      });

      const companiesTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess({ name: 'Acme Corp' })]
      });

      configureTableMocks({
        users: usersTable,
        company_signers: companySignersTable,
        data_access_pricing: pricingTable,
        data_access_requests: dataAccessTable,
        companies: companiesTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(requester.id));

      const response = await request(app)
        .post('/api/data-access/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ companyId, targetUserId, requestedDataType: 'reference' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.request.id).toBe(createdRequest.id);
    });

    test('PERM-D2: rejects non-signer with 403', async () => {
      const requester = mockUserData({ id: 'user-no-signer' });
      const companyId = 'company-002';
      const targetUserId = 'user-target-2';

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(requester)]
      });

      const companySignersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseError('No rows found', 'PGRST116')]
      });

      configureTableMocks({
        users: usersTable,
        company_signers: companySignersTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(requester.id));

      const response = await request(app)
        .post('/api/data-access/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ companyId, targetUserId })
        .expect(403);

      expect(response.body.error).toBe('Permission denied');
    });

    test('PERM-D3: rejects unauthenticated with 401', async () => {
      await request(app)
        .post('/api/data-access/request')
        .send({ companyId: 'company-unauth', targetUserId: 'user-unauth' })
        .expect(401);
    });

    test('PERM-D4: returns 400 on invalid payload', async () => {
      const requester = mockUserData({ id: 'user-invalid-payload' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requester)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(requester.id));

      const response = await request(app)
        .post('/api/data-access/request')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /api/data-access/pending', () => {
    test('PERM-D5: returns only pending requests for the logged-in user', async () => {
      const user = mockUserData({ id: 'pending-owner' });
      const pendingRequests = [
        {
          id: 'req-pending-1',
          requested_data_type: 'reference',
          request_reason: 'Background check',
          price_amount: 10,
          currency: 'USD',
          status: 'PENDING',
          created_at: '2024-01-01T00:00:00Z',
          expires_at: '2024-01-02T00:00:00Z',
          companies: { id: 'company-1', name: 'Viewer Co', verified: false },
          references: { id: 'ref-1', referrer_name: 'Ref One', overall_rating: 5 }
        }
      ];

      const dataAccessTable = buildTableMock();
      dataAccessTable.order.mockResolvedValueOnce(mockDatabaseSuccess(pendingRequests));

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });

      configureTableMocks({
        users: usersTable,
        data_access_requests: dataAccessTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/data-access/pending')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(1);
      expect(response.body.requests[0].id).toBe('req-pending-1');
    });

    test('PERM-D6: does not leak pending requests for other users (filtered out)', async () => {
      const user = mockUserData({ id: 'pending-filter' });
      const dataAccessTable = buildTableMock();
      dataAccessTable.order.mockResolvedValueOnce(mockDatabaseSuccess([]));
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });

      configureTableMocks({
        users: usersTable,
        data_access_requests: dataAccessTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/data-access/pending')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.total).toBe(0);
    });
  });

  describe('POST /api/data-access/:requestId/approve', () => {
    test('PERM-D7: allows data owner to approve own request', async () => {
      const user = mockUserData({ id: 'approver-1', wallet_address: '0xabc' });
      const requestId = 'req-approve-1';
      const requestRecord = {
        id: requestId,
        target_user_id: user.id,
        requested_by_user_id: 'requester-1',
        company_id: 'company-approve',
        status: 'PENDING',
        expires_at: '2099-01-01T00:00:00Z',
        price_amount: 50,
        currency: 'USD',
        requested_data_type: 'reference',
        metadata: {}
      };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user), mockDatabaseSuccess({ email: 'requester@acme.com' })] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord), mockDatabaseSuccess({ ...requestRecord, status: 'APPROVED' })] });
      const companiesTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ name: 'Approve Co' })] });
      const revenueShareTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ id: 'rev-1' })] });
      const ledgerTable = buildTableMock({ maybeSingleResponses: [{ data: null, error: null }] });
      const userBalancesTable = ledgerTable; // reuse for both balance lookups

      configureTableMocks({
        users: usersTable,
        data_access_requests: requestsTable,
        companies: companiesTable,
        revenue_shares: revenueShareTable,
        user_balance_ledger: userBalancesTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post(`/api/data-access/${requestId}/approve`)
        .set('Authorization', 'Bearer valid-token')
        .send({ signature: '0xsig', walletAddress: '0xabc', message: 'approve it' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.request.status).toBe('APPROVED');
    });

    test('PERM-D8: rejects non-owner trying to approve (403)', async () => {
      const user = mockUserData({ id: 'not-owner' });
      const requestRecord = { id: 'req-approve-2', target_user_id: 'actual-owner', status: 'PENDING' };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord)] });

      configureTableMocks({ users: usersTable, data_access_requests: requestsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post('/api/data-access/req-approve-2/approve')
        .set('Authorization', 'Bearer valid-token')
        .send({ signature: '0xsig', walletAddress: '0xabc' })
        .expect(403);

      expect(response.body.error).toBe('Permission denied');
    });

    test('PERM-D14: returns 404 for non-existent requestId', async () => {
      const user = mockUserData({ id: 'missing-req-user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseError('No rows found', 'PGRST116')] });

      configureTableMocks({ users: usersTable, data_access_requests: requestsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post('/api/data-access/non-existent/approve')
        .set('Authorization', 'Bearer valid-token')
        .send({ signature: '0xsig', walletAddress: '0xabc' })
        .expect(404);

      expect(response.body.error).toBe('Request not found');
    });
  });

  describe('POST /api/data-access/:requestId/reject', () => {
    test('PERM-D9: allows data owner to reject own request', async () => {
      const user = mockUserData({ id: 'reject-owner' });
      const requestRecord = { id: 'req-reject-1', target_user_id: user.id, company_id: 'reject-co', status: 'PENDING' };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord), mockDatabaseSuccess({ ...requestRecord, status: 'REJECTED' })] });

      configureTableMocks({ users: usersTable, data_access_requests: requestsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post(`/api/data-access/${requestRecord.id}/reject`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.request.status).toBe('REJECTED');
    });

    test('PERM-D10: rejects non-owner trying to reject (403)', async () => {
      const user = mockUserData({ id: 'reject-non-owner' });
      const requestRecord = { id: 'req-reject-2', target_user_id: 'owner-else', status: 'PENDING' };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord)] });

      configureTableMocks({ users: usersTable, data_access_requests: requestsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post('/api/data-access/req-reject-2/reject')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Permission denied');
    });
  });

  describe('GET /api/data-access/:requestId/data', () => {
    const requestId = 'req-data-1';

    test('PERM-D11: allows company signer to retrieve approved data after payment', async () => {
      const signerUser = mockUserData({ id: 'signer-data' });
      const requestRecord = {
        id: requestId,
        company_id: 'company-data',
        target_user_id: 'target-data',
        status: 'APPROVED',
        requested_data_type: 'reference',
        reference_id: 'ref-123',
        access_count: 0
      };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(signerUser), mockDatabaseSuccess({ id: 'target-data', email: 'target@x.com', wallet_address: null, identity_verified: false })] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord)] });
      const companySignersTable = buildTableMock({ maybeSingleResponses: [mockDatabaseSuccess(mockCompanySignerData({ company_id: requestRecord.company_id, user_id: signerUser.id }))] });
      const referencesTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ id: 'ref-123', overall_rating: 5 })] });

      configureTableMocks({
        users: usersTable,
        data_access_requests: requestsTable,
        company_signers: companySignersTable,
        references: referencesTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(signerUser.id));

      const response = await request(app)
        .get(`/api/data-access/${requestId}/data`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBe(requestId);
    });

    test('PERM-D12: forbids access if request is not approved (403)', async () => {
      const signerUser = mockUserData({ id: 'signer-unapproved' });
      const requestRecord = { id: requestId, company_id: 'company-data', target_user_id: 'target-data', status: 'PENDING', requested_data_type: 'reference', access_count: 0 };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(signerUser)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord)] });
      const companySignersTable = buildTableMock({ maybeSingleResponses: [mockDatabaseSuccess(mockCompanySignerData({ company_id: requestRecord.company_id, user_id: signerUser.id }))] });

      configureTableMocks({
        users: usersTable,
        data_access_requests: requestsTable,
        company_signers: companySignersTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(signerUser.id));

      const response = await request(app)
        .get(`/api/data-access/${requestId}/data`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });

    test('PERM-D13: forbids non-company-signer from accessing data (403)', async () => {
      const user = mockUserData({ id: 'not-signer-data' });
      const requestRecord = { id: requestId, company_id: 'company-data', target_user_id: 'target-data', status: 'APPROVED', requested_data_type: 'reference', access_count: 0 };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const requestsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(requestRecord)] });
      const companySignersTable = buildTableMock({ maybeSingleResponses: [{ data: null, error: null }] });

      configureTableMocks({
        users: usersTable,
        data_access_requests: requestsTable,
        company_signers: companySignersTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get(`/api/data-access/${requestId}/data`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Permission denied');
    });
  });
});
