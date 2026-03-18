/**
 * Public Profile Integration Tests (Scaffolding)
 *
 * Tests for Public Profile endpoints:
 * - GET /api/public/candidates/:identifier (public endpoint with optional auth)
 * - GET /api/me/public-identifier (authenticated endpoint)
 *
 * This file provides scaffolding with basic smoke tests.
 * Full implementation pending Codex's integration tests in parallel branch.
 *
 * IMPORTANT: These endpoints are being tested in parallel branch by Codex.
 * This scaffolding focuses on permission/security aspects only.
 * DO NOT break backwards compatibility!
 */

import { jest, afterAll } from '@jest/globals';
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
    Promise.resolve(
      maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null }
    )
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

// Mock analytics/eventTracker to prevent actual event logging during tests
jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
  logEventBatch: jest.fn().mockResolvedValue([]),
  logPageView: jest.fn().mockResolvedValue({ id: 'mock-page-view' }),
  logProfileView: jest.fn().mockResolvedValue({ id: 'mock-profile-view' }),
  logCandidateSearch: jest.fn().mockResolvedValue({ id: 'mock-search' }),
  logDataAccessRequest: jest.fn().mockResolvedValue({ id: 'mock-data-access' }),
  EventTypes: {
    PAGE_VIEW: 'PAGE_VIEW',
    PROFILE_VIEW: 'PROFILE_VIEW',
    SEARCH: 'CANDIDATE_SEARCH',
    DATA_ACCESS_REQUEST: 'DATA_ACCESS_REQUEST',
    SIGNUP: 'USER_SIGNUP'
  },
  EventCategories: {
    ENGAGEMENT: 'engagement',
    CONVERSION: 'conversion'
  }
}));

// Mock candidate evaluation service (used by Public Profile enrichment)
jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: jest.fn().mockResolvedValue({
    userId: 'mock-user-id',
    scoring: {
      hrScoreResult: { hrScore: 85, normalizedScore: 0.85 },
      pricingResult: { priceUsd: 2500 }
    }
  })
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
  logReferenceSubmissionAudit: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {
    SUBMIT_REFERENCE_ATTEMPT: 'submit_reference_attempt',
    SUBMIT_REFERENCE_SUCCESS: 'submit_reference_success',
    SUBMIT_REFERENCE_FAILURE: 'submit_reference_failure'
  },
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const authMiddleware = await import('../../middleware/auth.js');

// Import app after mocking
const { default: app } = await import('../../server.js');

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Public Profile Integration Tests', () => {
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

  describe('Smoke Tests', () => {
    test('SMOKE-PP1: test framework is working', () => {
      expect(true).toBe(true);
    });

    test('SMOKE-PP2: app is defined', () => {
      expect(app).toBeDefined();
    });

    test('SMOKE-PP3: mock Supabase client is working', () => {
      expect(mockSupabaseClient).toBeDefined();
      expect(mockSupabaseClient.auth).toBeDefined();
      expect(mockSupabaseClient.from).toBeDefined();
    });
  });

  describe('GET /api/public/candidates/:identifier', () => {
    test('INT-PP1: allows public access (no auth required)', async () => {
      const publicProfile = {
        id: 'user-123',
        public_handle: 'john_doe',
        full_name: 'John Doe',
        headline: 'Software Engineer',
        skills: ['JavaScript', 'Node.js'],
        is_public_profile: true
      };

      const usersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(publicProfile)]
      });

      const analyticsTable = buildTableMock({
        selectResponse: mockDatabaseSuccess([])
      });

      configureTableMocks({
        users: usersTable,
        analytics_events: analyticsTable
      });

      const response = await request(app).get('/api/public/candidates/john_doe');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', 'user-123');
      expect(response.body).toHaveProperty('handle', 'john_doe');
      expect(response.body).toHaveProperty('fullName', 'John Doe');
    });

    test('INT-PP2: respects is_public_profile flag (privacy control)', async () => {
      const privateProfile = {
        id: 'user-456',
        public_handle: 'private_user',
        full_name: 'Private User',
        is_public_profile: false
      };

      const usersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(privateProfile)]
      });

      configureTableMocks({ users: usersTable });

      const response = await request(app).get('/api/public/candidates/private_user');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('INT-PP3: returns 404 for non-existent profile', async () => {
      const usersTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }]
      });

      configureTableMocks({ users: usersTable });

      const response = await request(app).get('/api/public/candidates/nonexistent_user');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('INT-PP4: returns 400 for empty identifier', async () => {
      const response = await request(app).get('/api/public/candidates/%20');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('INT-PP5: enriches with HRScore data (additive fields)', async () => {
      const publicProfile = {
        id: 'user-789',
        public_handle: 'jane_doe',
        full_name: 'Jane Doe',
        is_public_profile: true
      };

      const usersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(publicProfile)]
      });

      const analyticsTable = buildTableMock({
        selectResponse: mockDatabaseSuccess([])
      });

      configureTableMocks({
        users: usersTable,
        analytics_events: analyticsTable
      });

      const response = await request(app).get('/api/public/candidates/jane_doe');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('handle');
      expect(response.body).toHaveProperty('fullName');
      expect(response.body).toHaveProperty('hrScore');
      expect(response.body).toHaveProperty('priceUsd');
      expect(response.body).toHaveProperty('hrscore');
      expect(response.body).toHaveProperty('metrics');

      if (response.body.hrscore) {
        expect(response.body.hrscore).toHaveProperty('current');
      }
      if (response.body.metrics) {
        expect(response.body.metrics).toHaveProperty('profileViews');
      }
    });

    test('INT-PP6: handles enrichment failures gracefully (fail-soft)', async () => {
      const { evaluateCandidateForUser } = await import('../../services/candidateEvaluation.service.js');
      evaluateCandidateForUser.mockRejectedValueOnce(new Error('Evaluation service down'));

      const publicProfile = {
        id: 'user-999',
        public_handle: 'test_user',
        is_public_profile: true
      };

      const usersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(publicProfile)]
      });

      const analyticsTable = buildTableMock({
        selectResponse: mockDatabaseSuccess([])
      });

      configureTableMocks({
        users: usersTable,
        analytics_events: analyticsTable
      });

      const response = await request(app).get('/api/public/candidates/test_user');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId');
      expect(response.body.hrScore).toBe(0);
      expect(response.body.priceUsd).toBe(0);
    });
  });

  describe('GET /api/me/public-identifier', () => {
    test('INT-PP7: requires authentication', async () => {
      const response = await request(app).get('/api/me/public-identifier');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test("INT-PP8: returns authenticated user's public identifier", async () => {
      const user = mockUserData({
        id: 'auth-user-1',
        email: 'auth@example.com',
        public_handle: 'my_handle'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)],
        maybeSingleResponses: [
          mockDatabaseSuccess({
            id: user.id,
            public_handle: 'my_handle',
            is_public_profile: true
          })
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id, user.email)
      );

      const response = await request(app)
        .get('/api/me/public-identifier')
        .set('Authorization', 'Bearer mock-token');

      console.log('INT-PP8 STATUS:', response.status);
      console.log('INT-PP8 BODY:', response.body);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', user.id);
      expect(response.body).toHaveProperty('identifier', 'my_handle');
      expect(response.body).toHaveProperty('handle', 'my_handle');
      expect(response.body).toHaveProperty('isPublicProfile', true);
    });

    test('INT-PP9: falls back to userId when no handle exists', async () => {
      const user = mockUserData({
        id: 'auth-user-2',
        email: 'nohandle@example.com'
      });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)],
        maybeSingleResponses: [
          mockDatabaseSuccess({
            id: user.id,
            public_handle: null,
            is_public_profile: true
          })
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id, user.email)
      );

      const response = await request(app)
        .get('/api/me/public-identifier')
        .set('Authorization', 'Bearer mock-token');

      console.log('INT-PP9 STATUS:', response.status);
      console.log('INT-PP9 BODY:', response.body);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('identifier', user.id);
      expect(response.body).toHaveProperty('handle', null);
    });

    test('INT-PP10: returns 404 if user not found in database', async () => {
      const user = mockUserData({ id: 'missing-user', email: 'missing@example.com' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)],
        maybeSingleResponses: [{ data: null, error: null }]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id, user.email)
      );

      const response = await request(app)
        .get('/api/me/public-identifier')
        .set('Authorization', 'Bearer mock-token');

      console.log('INT-PP10 STATUS:', response.status);
      console.log('INT-PP10 BODY:', response.body);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Fail-Soft Behavior', () => {
    test('INT-PP11: analytics failures do not block profile display', async () => {
      const { logEvent } = await import('../../services/analytics/eventTracker.js');
      logEvent.mockRejectedValueOnce(new Error('Analytics service down'));

      const publicProfile = {
        id: 'user-analytics-test',
        public_handle: 'analytics_test',
        is_public_profile: true
      };

      const usersTable = buildTableMock({
        maybeSingleResponses: [mockDatabaseSuccess(publicProfile)]
      });

      const analyticsTable = buildTableMock({
        selectResponse: mockDatabaseSuccess([])
      });

      configureTableMocks({
        users: usersTable,
        analytics_events: analyticsTable
      });

      const response = await request(app).get('/api/public/candidates/analytics_test');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId');
    });

    test('INT-PP12: database errors return safe error messages', async () => {
      const usersTable = buildTableMock({
        maybeSingleResponses: [
          {
            data: null,
            error: { message: 'Database connection failed', code: 'PGRST301' }
          }
        ]
      });

      configureTableMocks({ users: usersTable });

      const response = await request(app).get('/api/public/candidates/db_error_test');

      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('code');
      expect(response.body.error).not.toContain('database');
      expect(response.body.error).not.toContain('PGRST');
    });
  });
});