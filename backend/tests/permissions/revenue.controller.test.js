/**
 * Revenue Controller Permission Tests (PERM-R1..PERM-R6)
 * Focuses on authentication, self-only revenue access, and payout validation.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

function buildTableMock({ singleResponses = [], maybeSingleResponses = [], rangeResponse = null, selectResponse = null } = {}) {
  const builder = {
    select: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
  );

  builder.select.mockImplementation(() => (selectResponse ? Promise.resolve(selectResponse) : builder));
  builder.range.mockImplementation(() => (rangeResponse ? Promise.resolve(rangeResponse) : builder));

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

const { default: app } = await import('../../server.js');

describe('Revenue Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('GET /api/revenue/balance', () => {
    test('PERM-R1: authenticated user can view their own balance', async () => {
      const user = mockUserData({ id: 'user-rev-1', email: 'user1@example.com' });
      const balance = {
        id: 'bal-1',
        user_id: user.id,
        total_earned: 150,
        total_paid_out: 50,
        current_balance: 100,
        currency: 'USD',
        min_payout_threshold: 25,
        preferred_payout_method: 'wallet'
      };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const balanceTable = buildTableMock({ maybeSingleResponses: [mockDatabaseSuccess(balance)] });

      configureTableMocks({ users: usersTable, user_balance_ledger: balanceTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.balance.currentBalance).toBe(100);
      expect(usersTable.single).toHaveBeenCalled();
      expect(balanceTable.maybeSingle).toHaveBeenCalled();
    });

    test('PERM-R2: unauthenticated revenue requests return 401', async () => {
      await request(app)
        .get('/api/revenue/balance')
        .expect(401);
    });
  });

  describe('GET /api/revenue/shares', () => {
    test('PERM-R3: authenticated user can view their own revenue shares', async () => {
      const user = mockUserData({ id: 'user-rev-2' });
      const shares = [
        {
          id: 'share-1',
          data_access_request_id: 'req-1',
          companies: { id: 'company-1', name: 'Acme' },
          data_access_requests: { requested_data_type: 'reference' },
          total_amount: 200,
          user_amount: 80,
          currency: 'USD',
          status: 'PAID',
          user_paid: true,
          user_paid_at: '2024-01-01T00:00:00Z',
          created_at: '2024-01-02T00:00:00Z'
        }
      ];

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const sharesTable = buildTableMock({
        rangeResponse: { data: shares, error: null, count: shares.length }
      });

      configureTableMocks({ users: usersTable, revenue_shares: sharesTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/revenue/shares')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(sharesTable.eq).toHaveBeenCalledWith('target_user_id', user.id);
      expect(response.body.success).toBe(true);
      expect(response.body.shares).toHaveLength(1);
    });

    test('PERM-R4: IDOR attempt does not expose other users shares', async () => {
      const user = mockUserData({ id: 'user-rev-3' });

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const sharesTable = buildTableMock({
        rangeResponse: { data: [], error: null, count: 0 }
      });

      configureTableMocks({ users: usersTable, revenue_shares: sharesTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/revenue/shares?target_user_id=other-user')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(sharesTable.eq).toHaveBeenCalledWith('target_user_id', user.id);
      expect(response.body.total).toBe(0);
    });
  });

  describe('POST /api/revenue/payout/request', () => {
    test('PERM-R5: authenticated user can request payout from their balance', async () => {
      const user = mockUserData({ id: 'user-rev-4', email: 'payer@example.com' });
      const balance = {
        id: 'bal-2',
        user_id: user.id,
        total_earned: 200,
        total_paid_out: 0,
        current_balance: 100,
        currency: 'USD',
        min_payout_threshold: 10,
        user_email: user.email
      };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const balanceTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(balance)] });

      const transaction = {
        id: 'tx-1',
        user_id: user.id,
        transaction_type: 'PAYOUT',
        amount: -50,
        currency: 'USD',
        balance_before: 100,
        balance_after: 50
      };

      const transactionsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(transaction)] });
      transactionsTable.insert.mockReturnThis();
      transactionsTable.select.mockReturnThis();
      transactionsTable.single.mockResolvedValue(mockDatabaseSuccess(transaction));

      configureTableMocks({
        users: usersTable,
        user_balance_ledger: balanceTable,
        revenue_transactions: transactionsTable
      });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 50, payoutMethod: 'wallet' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payout.amount).toBe(50);
    });

    test('PERM-R6: invalid payout request returns 400 (insufficient balance)', async () => {
      const user = mockUserData({ id: 'user-rev-5' });
      const balance = {
        id: 'bal-3',
        user_id: user.id,
        total_earned: 30,
        total_paid_out: 0,
        current_balance: 30,
        currency: 'USD',
        min_payout_threshold: 10,
        user_email: user.email
      };

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const balanceTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(balance)] });

      configureTableMocks({ users: usersTable, user_balance_ledger: balanceTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 100 })
        .expect(400);

      expect(response.body.error).toBe('Insufficient balance');
    });
  });
});
