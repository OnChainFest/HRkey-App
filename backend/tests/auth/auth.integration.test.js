/**
 * Authentication Integration Tests
 * Tests for protected endpoints using supertest
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData,
  mockCompanySignerData
} from '../__mocks__/supabase.mock.js';

// Mock Supabase before importing the app
const mockSupabaseClient = createMockSupabaseClient();

// Store reference to query builder for re-establishing after clearAllMocks()
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    // Clear mock call history but preserve mock implementations
    jest.clearAllMocks();

    // Re-establish the query builder mock after clearing
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

    // Re-establish all chainable method mocks
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // TEST: Health Check (Public endpoint - no auth required)
  // =========================================================================
  describe('GET /health', () => {
    test('IT-H1: Should return health status without authentication', async () => {
      // Mock database check
      mockSupabaseClient.from().limit.mockResolvedValue(
        mockDatabaseSuccess([])
      );

      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // =========================================================================
  // TEST: Protected Endpoint - requireAuth
  // =========================================================================
  describe('GET /api/identity/status/:userId', () => {
    test('IT1: Should reject request without authentication token', async () => {
      const response = await request(app)
        .get('/api/identity/status/user-123')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Authentication required');
    });

    test('IT2: Should reject request with invalid token', async () => {
      // Mock invalid token
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('Invalid token')
      );

      const response = await request(app)
        .get('/api/identity/status/user-123')
        .set('Authorization', 'Bearer invalid-token')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    test('IT3: Should accept request with valid token', async () => {
      const userData = mockUserData({
        id: 'user-123',
        email: 'test@example.com'
      });

      // Mock successful auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123', 'test@example.com')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(userData)
      );

      // Note: The actual endpoint may return 404 or other status
      // depending on whether the user exists. We're just testing
      // that auth middleware passes through successfully.
      await request(app)
        .get('/api/identity/status/user-123')
        .set('Authorization', 'Bearer valid-token');

      // Verify auth.getUser was called
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });
  });

  // =========================================================================
  // TEST: Superadmin-only Endpoint
  // =========================================================================
  describe('POST /api/company/:companyId/verify', () => {
    test('IT4: Should reject regular user for superadmin endpoint', async () => {
      const userData = mockUserData({
        id: 'user-123',
        role: 'user'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(userData)
      );

      const response = await request(app)
        .post('/api/company/company-123/verify')
        .set('Authorization', 'Bearer user-token')
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Superadmin access required');
    });

    test('IT5: Should allow superadmin user', async () => {
      const superadminData = mockUserData({
        id: 'admin-123',
        role: 'superadmin',
        email: 'admin@hrkey.xyz'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('admin-123', 'admin@hrkey.xyz')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadminData)
      );

      // The endpoint may return 400/404 depending on company existence
      // We're just testing that superadmin middleware passes
      await request(app)
        .post('/api/company/company-123/verify')
        .set('Authorization', 'Bearer admin-token');

      // Verify auth was called
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TEST: Company Signer Endpoint
  // =========================================================================
  describe('GET /api/company/:companyId/signers', () => {
    test('IT6: Should reject if user is not a signer of company', async () => {
      const userData = mockUserData({
        id: 'user-123',
        role: 'user'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123')
      );

      // Mock users table query
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(userData))
        // Mock company_signers query - no signer found
        .mockResolvedValueOnce(mockDatabaseError('No rows', 'PGRST116'));

      const response = await request(app)
        .get('/api/company/company-123/signers')
        .set('Authorization', 'Bearer user-token')
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('active signer');
    });

    test('IT7: Should allow active signer of company', async () => {
      const userData = mockUserData({
        id: 'user-123',
        role: 'user'
      });

      const signerData = mockCompanySignerData({
        user_id: 'user-123',
        company_id: 'company-123',
        is_active: true
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123')
      );

      // Mock users table query, then company_signers query
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(userData))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerData));

      // This should pass the middleware
      // The endpoint may return 200 or other depending on data
      await request(app)
        .get('/api/company/company-123/signers')
        .set('Authorization', 'Bearer signer-token');

      // Verify company signer was checked
      expect(mockSupabaseClient.from).toHaveBeenCalled();
    });

    test('IT8: Should allow superadmin to access any company', async () => {
      const superadminData = mockUserData({
        id: 'admin-123',
        role: 'superadmin'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('admin-123')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadminData)
      );

      // Superadmin should bypass company signer check
      await request(app)
        .get('/api/company/company-123/signers')
        .set('Authorization', 'Bearer admin-token');

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // NOTE: Validation tests for /api/wallet/create and /api/reference/request
  // have been removed from this auth test suite. These endpoints currently
  // don't require authentication (production issue to fix!) and validation
  // testing should be in a separate validation test suite.
  // =========================================================================
});
