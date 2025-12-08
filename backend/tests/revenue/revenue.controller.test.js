/**
 * Revenue Controller Tests
 * Tests for user earnings, revenue shares, transactions, and payouts
 *
 * Routes tested:
 * - GET /api/revenue/balance
 * - GET /api/revenue/shares
 * - GET /api/revenue/transactions
 * - POST /api/revenue/payout/request
 * - GET /api/revenue/summary
 *
 * All routes require authentication (requireAuth middleware)
 */

import { jest } from '@jest/globals';
import request from 'supertest';

// Mock Supabase
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

// Import mocks
const supabaseMock = await import('../__mocks__/supabase.mock.js');
const {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData
} = supabaseMock.default;

// Create Supabase mock client
const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

// Mock the createClient function
const { createClient } = await import('@supabase/supabase-js');
createClient.mockReturnValue(mockSupabaseClient);

// Import app after mocks
const { default: app } = await import('../../server.js');

describe('Revenue Controller Tests', () => {
  const validToken = 'valid-jwt-token-12345';
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // ============================================================================
  // GET /api/revenue/balance
  // ============================================================================

  describe('GET /api/revenue/balance', () => {
    test('AUTH-RC1: Should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/revenue/balance')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('HAPPY-RC1: Should return user balance successfully', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      const balance = {
        user_id: userId,
        user_email: 'user@example.com',
        total_earned: '250.00',
        total_paid_out: '100.00',
        current_balance: '150.00',
        currency: 'USD',
        min_payout_threshold: '50.00',
        preferred_payout_method: 'wallet',
        wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        last_payout_at: '2025-01-01T00:00:00Z'
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance));

      const response = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: {
          totalEarned: 250.00,
          totalPaidOut: 100.00,
          currentBalance: 150.00,
          currency: 'USD',
          minPayoutThreshold: 50.00,
          preferredPayoutMethod: 'wallet',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          lastPayoutAt: '2025-01-01T00:00:00Z'
        }
      });
    });

    test('HAPPY-RC2: Should return default balance if no record exists', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: {
          totalEarned: 0,
          totalPaidOut: 0,
          currentBalance: 0,
          currency: 'USD',
          minPayoutThreshold: 50.00
        }
      });
    });

    test('ERROR-RC1: Should handle database errors', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('Connection timeout', 'DB_ERROR'));

      const response = await request(app)
        .get('/api/revenue/balance')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Database error');
      expect(response.body.message).toBe('Failed to fetch balance');
    });
  });

  // ============================================================================
  // GET /api/revenue/shares
  // ============================================================================

  describe('GET /api/revenue/shares', () => {
    test('AUTH-RC2: Should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/revenue/shares')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('HAPPY-RC4: Should return user revenue shares with pagination', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      const shares = [
        {
          id: 'share-1',
          data_access_request_id: 'dar-1',
          total_amount: '100.00',
          user_amount: '70.00',
          currency: 'USD',
          status: 'COMPLETED',
          user_paid: true,
          user_paid_at: '2025-01-01T00:00:00Z',
          created_at: '2024-12-01T00:00:00Z',
          companies: {
            id: 'company-1',
            name: 'Tech Corp',
            logo_url: 'https://example.com/logo.png'
          },
          data_access_requests: {
            id: 'dar-1',
            requested_data_type: 'employment_history',
            created_at: '2024-12-01T00:00:00Z'
          }
        }
      ];

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      mockSupabaseClient.from().mockReturnValue({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: shares,
          error: null,
          count: 1
        })
      });

      const response = await request(app)
        .get('/api/revenue/shares?limit=10&offset=0')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.shares).toHaveLength(1);
      expect(response.body.shares[0]).toEqual({
        id: 'share-1',
        requestId: 'dar-1',
        company: {
          id: 'company-1',
          name: 'Tech Corp',
          logo_url: 'https://example.com/logo.png'
        },
        dataType: 'employment_history',
        totalAmount: 100.00,
        userAmount: 70.00,
        currency: 'USD',
        status: 'COMPLETED',
        userPaid: true,
        userPaidAt: '2025-01-01T00:00:00Z',
        createdAt: '2024-12-01T00:00:00Z'
      });
      expect(response.body.total).toBe(1);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(0);
    });

    test('HAPPY-RC5: Should filter shares by status', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      const queryBuilder = {
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0
        })
      };

      mockSupabaseClient.from.mockReturnValueOnce(queryBuilder);

      await request(app)
        .get('/api/revenue/shares?status=PENDING')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Verify status filter was applied
      expect(queryBuilder.eq).toHaveBeenCalledWith('target_user_id', userId);
      expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'PENDING');
    });

    test('ERROR-RC2: Should handle database errors', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
          count: null
        })
      });

      const response = await request(app)
        .get('/api/revenue/shares')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Database error');
    });
  });

  // ============================================================================
  // GET /api/revenue/transactions
  // ============================================================================

  describe('GET /api/revenue/transactions', () => {
    test('AUTH-RC3: Should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/revenue/transactions')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('HAPPY-RC9: Should return transaction history', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      const transactions = [
        {
          id: 'tx-1',
          transaction_type: 'REVENUE_SHARE',
          amount: '70.00',
          currency: 'USD',
          description: 'Revenue share from data access request',
          balance_before: '100.00',
          balance_after: '170.00',
          external_tx_id: 'stripe_tx_123',
          payment_provider: 'stripe',
          created_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: transactions,
          error: null,
          count: 1
        })
      });

      const response = await request(app)
        .get('/api/revenue/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0]).toEqual({
        id: 'tx-1',
        type: 'REVENUE_SHARE',
        amount: 70.00,
        currency: 'USD',
        description: 'Revenue share from data access request',
        balanceBefore: 100.00,
        balanceAfter: 170.00,
        externalTxId: 'stripe_tx_123',
        paymentProvider: 'stripe',
        createdAt: '2025-01-01T00:00:00Z'
      });
    });

    test('HAPPY-RC10: Should filter transactions by type', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      const queryBuilder = {
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0
        })
      };

      mockSupabaseClient.from.mockReturnValueOnce(queryBuilder);

      await request(app)
        .get('/api/revenue/transactions?type=PAYOUT')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Verify type filter was applied
      expect(queryBuilder.eq).toHaveBeenCalledWith('user_id', userId);
      expect(queryBuilder.eq).toHaveBeenCalledWith('transaction_type', 'PAYOUT');
    });

    test('ERROR-RC3: Should handle database errors', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Query timeout' },
          count: null
        })
      });

      const response = await request(app)
        .get('/api/revenue/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Database error');
    });
  });

  // ============================================================================
  // POST /api/revenue/payout/request
  // ============================================================================

  describe('POST /api/revenue/payout/request', () => {
    const balance = {
      user_id: userId,
      user_email: 'user@example.com',
      total_earned: '250.00',
      total_paid_out: '0.00',
      current_balance: '250.00',
      currency: 'USD',
      min_payout_threshold: '50.00'
    };

    test('AUTH-RC4: Should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/revenue/payout/request')
        .send({ amount: 100 })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('HAPPY-RC12: Should create payout request successfully', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'tx-payout-1',
          user_id: userId,
          transaction_type: 'PAYOUT',
          amount: -100.00,
          currency: 'USD'
        }));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 100,
          payoutMethod: 'wallet'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payout).toEqual({
        transactionId: 'tx-payout-1',
        amount: 100,
        currency: 'USD',
        payoutMethod: 'wallet',
        status: 'pending',
        estimatedProcessingTime: '2-5 business days'
      });
    });

    test('HAPPY-RC13: Should create negative transaction for payout', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(mockDatabaseSuccess({
            id: 'tx-payout-1',
            amount: -100.00
          }))
        })
      });

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance));

      mockSupabaseClient.from().insert = insertMock;

      await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 100 })
        .expect(200);

      // Verify negative amount was inserted
      const insertCall = insertMock.mock.calls[0][0][0];
      expect(insertCall.amount).toBe(-100);
      expect(insertCall.transaction_type).toBe('PAYOUT');
    });

    test('HAPPY-RC14: Should use full balance if amount not specified', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'tx-payout-full',
          amount: -250.00
        }));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({}) // No amount specified
        .expect(200);

      expect(response.body.payout.amount).toBe(250);
    });

    test('ERROR-RC4: Should reject if balance not found', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 100 })
        .expect(404);

      expect(response.body.error).toBe('Balance not found');
    });

    test('ERROR-RC5: Should reject invalid amount (≤ 0)', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: -50 })
        .expect(400);

      expect(response.body.error).toBe('Invalid amount');
      expect(response.body.message).toBe('Payout amount must be greater than 0');
    });

    test('ERROR-RC6: Should reject amount exceeding balance', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 300 }) // Exceeds balance of 250
        .expect(400);

      expect(response.body.error).toBe('Insufficient balance');
      expect(response.body.message).toContain('exceeds current balance');
    });

    test('ERROR-RC7: Should reject amount below minimum threshold', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(balance));

      const response = await request(app)
        .post('/api/revenue/payout/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 25 }) // Below threshold of 50
        .expect(400);

      expect(response.body.error).toBe('Below minimum threshold');
      expect(response.body.message).toBe('Minimum payout amount is 50 USD');
    });

    test('INCOMPLETE-RC1: Should document incomplete payout processing', async () => {
      // CURRENT IMPLEMENTATION (revenueController.js:275-310):
      // - Creates transaction with status 'pending'
      // - Does NOT actually process the payout
      // - Does NOT update user_balance_ledger
      // - Balance stays in current_balance until manually processed
      //
      // TODO COMMENT (line 275): "TODO: Implement actual payout processing"
      //
      // MISSING IMPLEMENTATION:
      // - Integration with payment provider (Stripe, crypto wallet, bank)
      // - Actual money transfer
      // - Balance update after successful payout
      // - Failure handling and retry logic
      // - Notification to user (email, in-app)

      expect(true).toBe(true); // Documentation test
    });
  });

  // ============================================================================
  // GET /api/revenue/summary
  // ============================================================================

  describe('GET /api/revenue/summary', () => {
    test('AUTH-RC5: Should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/revenue/summary')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('HAPPY-RC15: Should return comprehensive earnings summary', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      const balance = {
        user_id: userId,
        total_earned: '250.00',
        current_balance: '150.00',
        total_paid_out: '100.00',
        currency: 'USD',
        min_payout_threshold: '50.00',
        preferred_payout_method: 'wallet',
        last_payout_at: '2025-01-01T00:00:00Z'
      };

      const revenueShares = [
        { user_amount: '70.00', user_paid: true, status: 'COMPLETED' },
        { user_amount: '80.00', user_paid: true, status: 'COMPLETED' },
        { user_amount: '100.00', user_paid: false, status: 'PENDING' }
      ];

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // Mock for requireAuth user lookup
      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      // Mock for balance query (maybeSingle)
      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue(mockDatabaseSuccess(balance))
          })
        })
      });

      // Mock for approved requests count
      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockResolvedValue({
          data: null,
          error: null,
          count: 5
        })
      });

      // Mock for revenue shares
      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue(mockDatabaseSuccess(revenueShares))
        })
      });

      const response = await request(app)
        .get('/api/revenue/summary')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary).toEqual({
        balance: {
          total: 250,
          available: 150,
          paidOut: 100,
          currency: 'USD'
        },
        stats: {
          totalApprovedRequests: 5,
          totalRevenueShares: 3,
          paidShares: 2,
          pendingShares: 1,
          totalEarnedFromShares: 250
        },
        payoutInfo: {
          minThreshold: 50.00,
          preferredMethod: 'wallet',
          lastPayoutAt: '2025-01-01T00:00:00Z'
        }
      });
    });

    test('HAPPY-RC16: Should handle missing balance gracefully', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      // Mock all queries to return empty/null results
      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      });

      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockResolvedValue({
          data: null,
          error: null,
          count: 0
        })
      });

      mockSupabaseClient.from.mockReturnValueOnce({
        ...mockQueryBuilder,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      });

      const response = await request(app)
        .get('/api/revenue/summary')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.summary.balance).toEqual({
        total: 0,
        available: 0,
        paidOut: 0,
        currency: 'USD'
      });
    });

    test('ERROR-RC9: Should handle database errors', async () => {
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValueOnce(
        mockDatabaseSuccess(user)
      );

      // Simulate database error on balance query
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const response = await request(app)
        .get('/api/revenue/summary')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });
});
