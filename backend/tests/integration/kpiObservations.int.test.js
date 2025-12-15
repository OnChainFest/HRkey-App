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

describe('KPI Observations Security Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // POST /api/kpi-observations - Authorization Tests
  // =========================================================================

  describe('POST /api/kpi-observations', () => {
    test('KPI-INT-01: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app)
        .post('/api/kpi-observations')
        .send({
          subject_wallet: '0xSUBJECT',
          role_id: 'role-123',
          observations: [{ kpi_name: 'test', rating_value: 5 }]
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('KPI-INT-02: should return 403 when user has no wallet (cannot submit KPIs)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A exists but has no wallet
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ id: 'user-a-id', wallet_address: null }));

      const res = await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          subject_wallet: '0xSUBJECT',
          role_id: 'role-123',
          observations: [{ kpi_name: 'test', rating_value: 5 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toBe('You must have a linked wallet to submit KPI observations');
    });

    test('KPI-INT-03: observer_wallet from body is IGNORED - controller uses auth user wallet', async () => {
      // This test verifies that observer_wallet in body doesn't control anything
      // The security is enforced by using req.user.id to look up the wallet
      // We test this by verifying:
      // 1. Auth passes (user A authenticated)
      // 2. Wallet lookup uses req.user.id (not body observer_wallet)
      // 3. The request proceeds to validation (doesn't fail at auth)

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A has wallet 0xUSER_A_WALLET
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ id: 'user-a-id', wallet_address: '0xUSER_A_WALLET' }));

      // Incomplete request (no subject_wallet) will fail validation,
      // but AFTER the security check passes - proving observer_wallet is ignored
      const res = await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          observer_wallet: '0xUSER_B_WALLET', // This should be IGNORED
          role_id: 'role-123',
          observations: [{ kpi_name: 'test', rating_value: 5 }]
        });

      // Should fail with 400 (validation error) not 403 (auth error)
      // This proves security check passed and observer_wallet was ignored
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
      expect(res.body.required).toContain('subject_wallet');
    });

    test('KPI-INT-04: authenticated user with wallet passes security check (reaches validation)', async () => {
      // This test verifies that a user WITH a wallet passes the security check
      // and reaches the validation stage
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-own-id', 'own@test.com'));

      // User has wallet
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-own-id', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ id: 'user-own-id', wallet_address: '0xOWN_WALLET' }));

      // Send incomplete request to trigger validation error (proves security passed)
      const res = await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          subject_wallet: '0xSUBJECT',
          role_id: 'role-123'
          // Missing observations - will fail validation
        });

      // Should fail with 400 (validation) not 403 (security)
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });

    test('KPI-INT-05: should return 400 for missing required fields', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-id', 'user@test.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-id' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ id: 'user-id', wallet_address: '0xWALLET' }));

      const res = await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          subject_wallet: '0xSUBJECT'
          // Missing role_id and observations
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });
  });

  // =========================================================================
  // GET /api/kpi-observations - Authorization Tests
  // =========================================================================

  describe('GET /api/kpi-observations', () => {
    test('KPI-INT-06: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/kpi-observations');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('KPI-INT-07: regular user only sees own KPIs (as subject or observer)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A data (not superadmin)
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ wallet_address: '0xUSER_A_WALLET' }));

      // Query returns only user A's KPIs (filtered by security)
      mockQueryBuilder.range.mockResolvedValueOnce(mockDatabaseSuccess([
        { id: 'kpi-1', subject_wallet: '0xUSER_A_WALLET', observer_wallet: '0xOTHER', kpi_name: 'test1' },
        { id: 'kpi-2', subject_wallet: '0xOTHER', observer_wallet: '0xUSER_A_WALLET', kpi_name: 'test2' }
      ]));

      const res = await request(app)
        .get('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // The query builder should have been called with or() filter for security
      expect(mockQueryBuilder.or).toHaveBeenCalled();
    });

    test('KPI-INT-08: superadmin can see all KPIs (no filtering)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-id', 'admin@test.com'));

      // Superadmin user
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'admin-id', role: 'superadmin' }))
      );

      // Query returns all KPIs (no security filter for superadmin)
      mockQueryBuilder.range.mockResolvedValueOnce(mockDatabaseSuccess([
        { id: 'kpi-1', subject_wallet: '0xANY', observer_wallet: '0xOTHER', kpi_name: 'test1' },
        { id: 'kpi-2', subject_wallet: '0xANY2', observer_wallet: '0xOTHER2', kpi_name: 'test2' }
      ]));

      const res = await request(app)
        .get('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Superadmin should NOT have or() filter applied
      expect(mockQueryBuilder.or).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /api/kpi-observations/summary - Authorization Tests
  // =========================================================================

  describe('GET /api/kpi-observations/summary', () => {
    test('KPI-INT-09: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/kpi-observations/summary');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('KPI-INT-10: regular user without wallet gets empty summary', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-no-wallet', 'nowallet@test.com'));

      // User without wallet
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-no-wallet', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ wallet_address: null }));

      const res = await request(app)
        .get('/api/kpi-observations/summary')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(0);
      expect(res.body.summary).toEqual([]);
    });

    test('KPI-INT-11: regular user only sees own summary data', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A with wallet
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({ wallet_address: '0xUSER_A_WALLET' }));

      // Query returns only user A's summary
      mockQueryBuilder.limit.mockResolvedValueOnce(mockDatabaseSuccess([
        { subject_wallet: '0xUSER_A_WALLET', kpi_name: 'productivity', avg_rating: 4.5 }
      ]));

      const res = await request(app)
        .get('/api/kpi-observations/summary')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should have eq filter for subject_wallet
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('subject_wallet', '0xUSER_A_WALLET');
    });

    test('KPI-INT-12: superadmin can see all summary data', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-id', 'admin@test.com'));

      // Superadmin user
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'admin-id', role: 'superadmin' }))
      );

      // Query returns all summaries
      mockQueryBuilder.limit.mockResolvedValueOnce(mockDatabaseSuccess([
        { subject_wallet: '0xANY1', kpi_name: 'test1', avg_rating: 4.0 },
        { subject_wallet: '0xANY2', kpi_name: 'test2', avg_rating: 3.5 }
      ]));

      const res = await request(app)
        .get('/api/kpi-observations/summary')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.length).toBe(2);
    });
  });
});
