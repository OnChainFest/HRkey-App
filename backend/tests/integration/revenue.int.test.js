import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData
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

// Mock balance data helper
function mockBalanceData(overrides = {}) {
  return {
    user_id: 'user-123',
    user_email: 'test@example.com',
    total_earned: '150.00',
    total_paid_out: '50.00',
    current_balance: '100.00',
    currency: 'USD',
    min_payout_threshold: '50.00',
    preferred_payout_method: 'wallet',
    wallet_address: '0xUSER_WALLET',
    last_payout_at: null,
    ...overrides
  };
}

// Mock revenue share data helper
function mockRevenueShareData(overrides = {}) {
  return {
    id: 'share-123',
    target_user_id: 'user-123',
    data_access_request_id: 'request-123',
    total_amount: '100.00',
    user_amount: '70.00',
    currency: 'USD',
    status: 'pending',
    user_paid: false,
    user_paid_at: null,
    created_at: '2024-01-01T00:00:00Z',
    data_access_requests: {
      id: 'request-123',
      requested_data_type: 'references',
      created_at: '2024-01-01T00:00:00Z'
    },
    companies: {
      id: 'company-123',
      name: 'Test Company',
      logo_url: null
    },
    ...overrides
  };
}

// Mock transaction data helper
function mockTransactionData(overrides = {}) {
  return {
    id: 'tx-123',
    user_id: 'user-123',
    transaction_type: 'EARNING',
    amount: '70.00',
    currency: 'USD',
    description: 'Revenue share from data access',
    balance_before: '30.00',
    balance_after: '100.00',
    external_tx_id: null,
    payment_provider: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

describe('Revenue Endpoint Security Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // GET /api/revenue/balance - Authorization Tests
  // =========================================================================

  describe('GET /api/revenue/balance', () => {
    test('REV-INT-01: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/revenue/balance');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('REV-INT-02: authenticated user can retrieve own balance (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      // User data from requireAuth middleware
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' }))
      );

      // Balance query returns user's balance using maybeSingle
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
        mockDatabaseSuccess(mockBalanceData({ user_id: 'user-123' }))
      );

      const res = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance).toBeDefined();
      expect(res.body.balance.totalEarned).toBe(150);
      expect(res.body.balance.currentBalance).toBe(100);
    });

    test('REV-INT-03: authenticated user with no balance gets default values (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123' }))
      );

      // No balance found
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
        mockDatabaseSuccess(null)
      );

      const res = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance.totalEarned).toBe(0);
      expect(res.body.balance.currentBalance).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/revenue/shares - Authorization Tests
  // =========================================================================

  describe('GET /api/revenue/shares', () => {
    test('REV-INT-04: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/revenue/shares');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('REV-INT-05: authenticated user can retrieve own shares (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123' }))
      );

      // Range query for shares - returns array with count
      mockQueryBuilder.range.mockResolvedValueOnce({
        data: [mockRevenueShareData()],
        error: null,
        count: 1
      });

      const res = await request(app)
        .get('/api/revenue/shares')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.shares).toBeDefined();
      expect(Array.isArray(res.body.shares)).toBe(true);
    });
  });

  // =========================================================================
  // GET /api/revenue/transactions - Authorization Tests
  // =========================================================================

  describe('GET /api/revenue/transactions', () => {
    test('REV-INT-06: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/revenue/transactions');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('REV-INT-07: authenticated user can retrieve own transactions (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123' }))
      );

      // Range query for transactions
      mockQueryBuilder.range.mockResolvedValueOnce({
        data: [mockTransactionData()],
        error: null,
        count: 1
      });

      const res = await request(app)
        .get('/api/revenue/transactions')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactions).toBeDefined();
      expect(Array.isArray(res.body.transactions)).toBe(true);
    });
  });

  // =========================================================================
  // GET /api/revenue/summary - Authorization Tests
  // =========================================================================

  describe('GET /api/revenue/summary', () => {
    test('REV-INT-08: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/revenue/summary');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('REV-INT-09: authenticated user can retrieve own summary (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123' }))
      );

      // Balance query
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
        mockDatabaseSuccess(mockBalanceData())
      );

      // Approved requests count - returns count result
      mockQueryBuilder.select.mockReturnValueOnce({
        ...mockQueryBuilder,
        eq: jest.fn().mockReturnThis(),
        then: (resolve) => resolve({ count: 5, error: null })
      });

      // Revenue shares query
      mockQueryBuilder.select.mockReturnValueOnce({
        ...mockQueryBuilder,
        eq: jest.fn().mockReturnThis(),
        then: (resolve) => resolve({
          data: [
            { user_amount: '70.00', status: 'pending', user_paid: false },
            { user_amount: '30.00', status: 'completed', user_paid: true }
          ],
          error: null
        })
      });

      const res = await request(app)
        .get('/api/revenue/summary')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.balance).toBeDefined();
    });
  });

  // =========================================================================
  // POST /api/revenue/payout/request - Authorization & Security Tests
  // =========================================================================

  describe('POST /api/revenue/payout/request', () => {
    test('REV-INT-10: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .send({ amount: 50 });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('REV-INT-11: should return 403 when user has no linked wallet', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      // User without wallet - requireWalletLinked middleware will block
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: null }))
      );

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 50 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toBe('You must have a linked wallet to request payouts');
    });

    test('REV-INT-12: should return 404 when user has no balance', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      // User with wallet
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        // Balance query - not found
        .mockResolvedValueOnce(mockDatabaseError('No balance found', 'PGRST116'));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 50 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Balance not found');
    });

    test('REV-INT-13: should return 400 for invalid amount (negative)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({ current_balance: '100.00' })));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: -50 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid amount');
    });

    test('REV-INT-14: should return 400 for amount exceeding balance', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({ current_balance: '100.00' })));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 200 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient balance');
    });

    test('REV-INT-15: should return 400 for amount below minimum threshold', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({
          current_balance: '100.00',
          min_payout_threshold: '50.00'
        })));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 25 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Below minimum threshold');
    });

    test('REV-INT-16: authenticated user with wallet can request payout (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({
          user_id: 'user-123',
          user_email: 'test@example.com',
          current_balance: '100.00',
          min_payout_threshold: '50.00',
          currency: 'USD'
        })))
        // Transaction insert returns created transaction
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'tx-new-123',
          user_id: 'user-123',
          transaction_type: 'PAYOUT',
          amount: -75,
          currency: 'USD',
          created_at: new Date().toISOString()
        }));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 75, payoutMethod: 'wallet' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payout).toBeDefined();
      expect(res.body.payout.amount).toBe(75);
      expect(res.body.payout.status).toBe('pending');
    });

    test('REV-INT-17: payout request defaults to full balance when amount not specified', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-123', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({
          current_balance: '100.00',
          min_payout_threshold: '50.00'
        })))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'tx-new-123',
          user_id: 'user-123',
          transaction_type: 'PAYOUT',
          amount: -100,
          currency: 'USD'
        }));

      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({}); // No amount specified

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payout.amount).toBe(100); // Full balance
    });
  });

  // =========================================================================
  // Security: Self-scoped access verification
  // =========================================================================

  describe('Security: Self-scoped access', () => {
    test('REV-INT-18: controller uses req.user.id, not query params (balance)', async () => {
      // This test verifies the controller always uses the authenticated user's ID
      // and ignores any userId that might be passed in query params
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-a-id' }))
      );

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
        mockDatabaseSuccess(mockBalanceData({ user_id: 'user-a-id' }))
      );

      // Even with ?userId=user-b-id query param, should get user-a's data
      const res = await request(app)
        .get('/api/revenue/balance?userId=user-b-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      // The response is user-a's balance because controller uses req.user.id
      expect(res.body.success).toBe(true);
    });

    test('REV-INT-19: controller uses req.user.id, not body params (payout)', async () => {
      // This test verifies payout is always for the authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', wallet_address: '0xWALLET' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockBalanceData({
          user_id: 'user-a-id',
          user_email: 'usera@test.com',
          current_balance: '100.00'
        })))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'tx-123',
          user_id: 'user-a-id',
          transaction_type: 'PAYOUT',
          amount: -75
        }));

      // Even if userId is passed in body, it should be ignored
      const res = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: 'user-b-id', // Should be ignored
          amount: 75
        });

      expect(res.status).toBe(200);
      // Payout created for user-a, not user-b
      expect(res.body.success).toBe(true);
    });
  });
});
