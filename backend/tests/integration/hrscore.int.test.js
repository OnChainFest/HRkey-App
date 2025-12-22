/**
 * HRScore Integration Tests (Scaffolding)
 *
 * Tests for HRScore endpoints:
 * - POST /api/hrkey-score
 * - GET /api/hrkey-score/model-info
 *
 * This file provides scaffolding with basic smoke tests.
 * Full implementation pending based on business requirements.
 *
 * CRITICAL: These endpoints currently lack resource-scoped permission checks.
 * See PERMISSION_SYSTEM_AUDIT_REPORT.md for details.
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

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

function buildTableMock({
  singleResponses = [],
  maybeSingleResponses = [],
  rangeResponse = null,
  selectResponse = null
} = {}) {
  const builder = {
    select: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
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
  builder.limit.mockImplementation(() => (selectResponse ? Promise.resolve(selectResponse) : builder));

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation((table) => tableMocks[table] || mockQueryBuilder);
}

// Mock Supabase
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Mock email service
jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendSignerInvitation: jest.fn().mockResolvedValue(),
  sendCompanyVerificationNotification: jest.fn().mockResolvedValue(),
  sendIdentityVerificationConfirmation: jest.fn().mockResolvedValue(),
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue()
}));

// Mock audit logger
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

// Import app after mocking
const { default: app } = await import('../../server.js');

// ============================================================================
// TEST SUITE
// ============================================================================

describe('HRScore Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // --------------------------------------------------------------------------
  // SMOKE TESTS
  // --------------------------------------------------------------------------

  describe('Smoke Tests', () => {
    test('SMOKE-HR1: test framework is working', () => {
      expect(true).toBe(true);
    });

    test('SMOKE-HR2: app is defined', () => {
      expect(app).toBeDefined();
    });

    test('SMOKE-HR3: mock Supabase client is working', () => {
      expect(mockSupabaseClient).toBeDefined();
      expect(mockSupabaseClient.auth).toBeDefined();
      expect(mockSupabaseClient.from).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/hrkey-score - Permission Tests
  // --------------------------------------------------------------------------

  describe('POST /api/hrkey-score', () => {
    test('INT-HR1: requires authentication', async () => {
      const response = await request(app)
        .post('/api/hrkey-score')
        .send({
          subject_wallet: '0xTEST_WALLET',
          role_id: 'test-role-id'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('INT-HR2: authenticated user can calculate own score (placeholder)', async () => {
      // User calculating score for their OWN wallet
      const user = mockUserData({
        id: 'user-1',
        email: 'test@example.com',
        wallet_address: '0xTEST_WALLET'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      // NOTE: This test is a placeholder
      // HRScore calculation requires model configuration which may not be available in tests
      // Expected behavior: Should either calculate score or return graceful error

      const response = await request(app)
        .post('/api/hrkey-score')
        .set('Authorization', 'Bearer mock-token')
        .send({
          subject_wallet: '0xTEST_WALLET', // Same as user's wallet
          role_id: 'test-role-id'
        });

      // Accept multiple valid status codes based on model availability
      // 403 excluded - authorization should pass since user is calculating own score
      expect([200, 422, 500, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('ok', true);
        expect(response.body).toHaveProperty('score');
      } else if (response.status === 422) {
        // NOT_ENOUGH_DATA or NO_VALID_KPIS
        expect(response.body).toHaveProperty('ok', false);
      }
    });

    test('INT-HR3: superadmin can calculate any user score (placeholder)', async () => {
      const superadmin = mockUserData({
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'superadmin',
        wallet_address: '0xADMIN_WALLET'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(superadmin)]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: superadmin.id, email: superadmin.email } },
        error: null
      });

      // Superadmin calculating score for different wallet - should be allowed
      const response = await request(app)
        .post('/api/hrkey-score')
        .set('Authorization', 'Bearer mock-token')
        .send({
          subject_wallet: '0xOTHER_WALLET',
          role_id: 'test-role-id'
        });

      // Accept multiple valid status codes - 403 excluded (superadmin bypass works)
      expect([200, 422, 500, 503]).toContain(response.status);
    });

    test('INT-HR4: cross-user access denied - user cannot calculate score for other wallet', async () => {
      // User A tries to calculate score for User B's wallet - should be 403
      const userA = mockUserData({
        id: 'user-a',
        email: 'usera@example.com',
        role: 'user',
        wallet_address: '0xUSER_A_WALLET'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(userA)]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: userA.id, email: userA.email } },
        error: null
      });

      const response = await request(app)
        .post('/api/hrkey-score')
        .set('Authorization', 'Bearer mock-token')
        .send({
          subject_wallet: '0xUSER_B_WALLET', // Different wallet
          role_id: 'test-role-id'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('You can only calculate HRKey Score for your own wallet');
    });

    test('INT-HR5: user without wallet gets 403', async () => {
      const userNoWallet = mockUserData({
        id: 'user-no-wallet',
        email: 'nowallet@example.com',
        role: 'user',
        wallet_address: null
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(userNoWallet)]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: userNoWallet.id, email: userNoWallet.email } },
        error: null
      });

      const response = await request(app)
        .post('/api/hrkey-score')
        .set('Authorization', 'Bearer mock-token')
        .send({
          subject_wallet: '0xANY_WALLET',
          role_id: 'test-role-id'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('You must have a linked wallet to calculate scores');
    });

    test('INT-HR6: requires subject_wallet and role_id', async () => {
      const user = mockUserData({ id: 'user-1', wallet_address: '0xUSER_WALLET' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .post('/api/hrkey-score')
        .set('Authorization', 'Bearer mock-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'MISSING_FIELDS');
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/hrkey-score/history - Permission Tests
  // --------------------------------------------------------------------------

  describe('GET /api/hrkey-score/history', () => {
    test('INT-HR-HIST-1: user sees own history', async () => {
      const user = mockUserData({
        id: 'user-1',
        email: 'user1@example.com',
        role: 'user'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const snapshots = [
        {
          id: 'snapshot-1',
          user_id: user.id,
          score: 88.4,
          breakdown: { n_observations: 10 },
          trigger_source: 'manual',
          created_at: '2025-01-01T00:00:00Z'
        }
      ];

      const snapshotsTable = buildTableMock();
      snapshotsTable.limit.mockResolvedValue(mockDatabaseSuccess(snapshots));

      configureTableMocks({
        users: usersTable,
        hrscore_snapshots: snapshotsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/history?limit=10')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0]).toHaveProperty('id', 'snapshot-1');
    });

    test('INT-HR-HIST-2: user cannot see others', async () => {
      const user = mockUserData({
        id: 'user-2',
        email: 'user2@example.com',
        role: 'user'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/history?user_id=other-user')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
    });

    test('INT-HR-HIST-3: superadmin can see any user history', async () => {
      const superadmin = mockUserData({
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'superadmin'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(superadmin)]
      });

      const snapshots = [
        {
          id: 'snapshot-2',
          user_id: 'target-user',
          score: 91.2,
          breakdown: null,
          trigger_source: 'kpi',
          created_at: '2025-02-01T00:00:00Z'
        }
      ];

      const snapshotsTable = buildTableMock();
      snapshotsTable.limit.mockResolvedValue(mockDatabaseSuccess(snapshots));

      configureTableMocks({
        users: usersTable,
        hrscore_snapshots: snapshotsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: superadmin.id, email: superadmin.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/history?user_id=target-user&limit=5')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0]).toHaveProperty('user_id', 'target-user');
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/hrkey-score/export - Permission Tests
  // --------------------------------------------------------------------------

  describe('GET /api/hrkey-score/export', () => {
    test('INT-HR-EXP-1: user can export own data (json)', async () => {
      const user = mockUserData({
        id: 'user-export-1',
        email: 'userexport1@example.com',
        role: 'user'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const scoresTable = buildTableMock({
        maybeSingleResponses: [
          mockDatabaseSuccess({
            score: 77.5,
            created_at: '2025-02-01T00:00:00Z'
          })
        ]
      });

      configureTableMocks({
        users: usersTable,
        hrkey_scores: scoresTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/export')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('current_score', 77.5);
      expect(response.body).toHaveProperty('last_calculated_at', '2025-02-01T00:00:00Z');
    });

    test('INT-HR-EXP-2: user cannot export other users', async () => {
      const user = mockUserData({
        id: 'user-export-2',
        email: 'userexport2@example.com',
        role: 'user'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/export?user_id=other-user')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
    });

    test('INT-HR-EXP-3: superadmin can export any user', async () => {
      const superadmin = mockUserData({
        id: 'admin-export-1',
        email: 'adminexport1@example.com',
        role: 'superadmin'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(superadmin)]
      });

      const scoresTable = buildTableMock({
        maybeSingleResponses: [
          mockDatabaseSuccess({
            score: 85.25,
            created_at: '2025-03-01T00:00:00Z'
          })
        ]
      });

      configureTableMocks({
        users: usersTable,
        hrkey_scores: scoresTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: superadmin.id, email: superadmin.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/export?user_id=target-user')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('current_score', 85.25);
    });

    test('INT-HR-EXP-4: csv export returns correct headers and content-type', async () => {
      const user = mockUserData({
        id: 'user-export-3',
        email: 'userexport3@example.com',
        role: 'user'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const scoresTable = buildTableMock({
        maybeSingleResponses: [
          mockDatabaseSuccess({
            score: 90.1,
            created_at: '2025-04-01T00:00:00Z'
          })
        ]
      });

      const snapshots = [
        {
          user_id: user.id,
          score: 90.1,
          trigger_source: 'manual',
          created_at: '2025-04-01T00:00:00Z'
        }
      ];

      const snapshotsTable = buildTableMock();
      snapshotsTable.limit.mockResolvedValue(mockDatabaseSuccess(snapshots));

      configureTableMocks({
        users: usersTable,
        hrkey_scores: scoresTable,
        hrscore_snapshots: snapshotsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/export?format=csv&include_history=true')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('user_id,score,trigger_source,created_at');
      expect(response.text).toContain(`${user.id},90.1,manual,2025-04-01T00:00:00Z`);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/hrkey-score/model-info - Permission Tests
  // --------------------------------------------------------------------------

  describe('GET /api/hrkey-score/model-info', () => {
    test('INT-HR7: requires authentication', async () => {
      const response = await request(app)
        .get('/api/hrkey-score/model-info');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('INT-HR8: regular user gets 403 - superadmin only endpoint', async () => {
      const user = mockUserData({
        id: 'user-1',
        email: 'test@example.com',
        role: 'user'  // Regular user, not superadmin
      });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/model-info')
        .set('Authorization', 'Bearer mock-token');

      // Model info is restricted to superadmins to prevent model extraction attacks
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Forbidden');
      expect(response.body).toHaveProperty('message', 'Superadmin access required');
    });

    test('INT-HR8b: superadmin can access model info', async () => {
      const superadmin = mockUserData({
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'superadmin'
      });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(superadmin)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: superadmin.id, email: superadmin.email } },
        error: null
      });

      const response = await request(app)
        .get('/api/hrkey-score/model-info')
        .set('Authorization', 'Bearer mock-token');

      // Model info might not be available in test environment (500)
      // But authorization should pass (not 403)
      expect([200, 500]).toContain(response.status);
      expect(response.status).not.toBe(403);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('ok', true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // FAIL-SOFT BEHAVIOR TESTS
  // --------------------------------------------------------------------------

  describe('Fail-Soft Behavior', () => {
    test('INT-HR9: gracefully handles NOT_ENOUGH_DATA scenario', async () => {
      // TODO: Implement test for insufficient KPI observations
      // Should return 422 with clear error message, not 500
      expect(true).toBe(true); // Placeholder
    });

    test('INT-HR10: gracefully handles MODEL_NOT_CONFIGURED scenario', async () => {
      // TODO: Implement test for missing model configuration
      // Should return 503 with clear error message
      expect(true).toBe(true); // Placeholder
    });

    test('INT-HR11: never leaks sensitive error details', async () => {
      // TODO: Verify error responses don't expose internal implementation details
      // Stack traces, DB errors, etc should be logged but not returned to client
      expect(true).toBe(true); // Placeholder
    });
  });
});

// ============================================================================
// NOTES FOR FULL IMPLEMENTATION
// ============================================================================

/*
 * SECURITY HARDENING COMPLETED:
 *
 * ✅ 1. Resource-Scoped Permission Check (FIXED)
 *    - POST /api/hrkey-score: Users can only calculate score for their own wallet
 *    - Uses requireOwnWallet middleware for clean, reusable authorization
 *    - Superadmins bypass for administrative purposes
 *    - Tests: INT-HR4 (cross-user denied), INT-HR5 (no wallet denied)
 *
 * ✅ 2. Model Info Endpoint Locked Down (FIXED)
 *    - GET /api/hrkey-score/model-info: Superadmin only
 *    - Prevents model extraction attacks
 *    - Tests: INT-HR8 (user denied), INT-HR8b (superadmin allowed)
 *
 * REMAINING ITEMS:
 *
 * 3. Model Configuration in Tests
 *    - HRScore service requires trained model (ml/output/hrkey_model_config_global.json)
 *    - Tests accept 422/500/503 as valid when model unavailable
 *
 * 4. KPI Observations Setup
 *    - HRScore calculation requires KPI observations in database
 *    - Integration tests focus on authorization, not score calculation
 *
 * 5. Error Scenarios
 *    - Test all error paths: NOT_ENOUGH_DATA, NO_VALID_KPIS, MODEL_NOT_CONFIGURED
 *    - Verify appropriate HTTP status codes and error messages
 */
