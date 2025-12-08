/**
 * Authentication Middleware Tests
 * Tests for all auth middleware functions in backend/middleware/auth.js
 */

import { jest } from '@jest/globals';
import {
  mockRequest,
  mockResponse,
  mockNext,
  mockAuthenticatedRequest,
  mockAuthenticatedRequestWithUser,
  mockCompanySignerRequest
} from '../__mocks__/express.mock.js';
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

// Mock the entire @supabase/supabase-js module
const mockSupabaseClient = createMockSupabaseClient();

// Store reference to query builder for re-establishing after clearAllMocks()
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import middleware AFTER mocking Supabase
const authMiddleware = await import('../../middleware/auth.js');
const {
  requireAuth,
  requireSuperadmin,
  requireAdmin,
  requireCompanySigner,
  requireAnySigner,
  optionalAuth
} = authMiddleware;

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-establish the query builder mock after clearing
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

    // Re-establish all chainable method mocks
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // TEST SUITE 1: requireAuth() Middleware
  // =========================================================================
  describe('requireAuth()', () => {
    test('T1.1: Should authenticate user with valid token', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      const userData = mockUserData({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      });

      // Mock successful auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123', 'test@example.com')
      );

      // Mock successful database query
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(userData)
      );

      await requireAuth(req, res, next);

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
      expect(req.user).toEqual(userData);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T1.2: Should reject request without Authorization header', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Please provide an authorization token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T1.3: Should reject request with invalid token', async () => {
      const req = mockAuthenticatedRequest('invalid-token');
      const res = mockResponse();
      const next = mockNext();

      // Mock auth failure
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('Invalid token')
      );

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T1.4: Should reject expired token', async () => {
      const req = mockAuthenticatedRequest('expired-token');
      const res = mockResponse();
      const next = mockNext();

      // Mock expired token error
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('Token has expired')
      );

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
    });

    test('T1.5: Should use fallback user data if database query fails', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      // Mock successful auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123', 'test@example.com')
      );

      // Mock database query failure
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseError('Users table error')
      );

      await requireAuth(req, res, next);

      // Should use fallback data from auth
      expect(req.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        identity_verified: false
      });
      expect(next).toHaveBeenCalled();
    });

    test('T1.6: Should handle unexpected exceptions', async () => {
      const req = mockAuthenticatedRequest('token');
      const res = mockResponse();
      const next = mockNext();

      // Mock unexpected error
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Network error')
      );

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication error',
        message: 'An error occurred during authentication'
      });
    });
  });

  // =========================================================================
  // TEST SUITE 2: requireSuperadmin() Middleware
  // =========================================================================
  describe('requireSuperadmin()', () => {
    test('T2.1: Should allow superadmin user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'superadmin' });
      const res = mockResponse();
      const next = mockNext();

      await requireSuperadmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T2.2: Should reject regular user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'user' });
      const res = mockResponse();
      const next = mockNext();

      await requireSuperadmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Superadmin access required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T2.3: Should reject if no user authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireSuperadmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });
  });

  // =========================================================================
  // TEST SUITE 3: requireAdmin() Middleware
  // =========================================================================
  describe('requireAdmin()', () => {
    test('T3.1: Should allow admin user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'admin' });
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T3.2: Should allow superadmin user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'superadmin' });
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('T3.3: Should reject regular user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'user' });
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    });

    test('T3.4: Should reject if no user authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // =========================================================================
  // TEST SUITE 4: requireCompanySigner() Middleware
  // =========================================================================
  describe('requireCompanySigner()', () => {
    test('T4.1: Should allow active company signer', async () => {
      const req = mockCompanySignerRequest('company-123');
      const res = mockResponse();
      const next = mockNext();

      const signerData = mockCompanySignerData({
        company_id: 'company-123',
        user_id: 'user-123',
        is_active: true
      });

      // Mock successful signer query
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(signerData)
      );

      await requireCompanySigner(req, res, next);

      expect(req.signer).toEqual(signerData);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T4.2: Should bypass check for superadmin', async () => {
      const req = mockCompanySignerRequest(
        'company-123',
        { role: 'superadmin' }
      );
      const res = mockResponse();
      const next = mockNext();

      await requireCompanySigner(req, res, next);

      expect(req.isSuperadmin).toBe(true);
      expect(next).toHaveBeenCalled();
      // Should NOT query database for superadmin
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    test('T4.3: Should reject if user is not a signer', async () => {
      const req = mockCompanySignerRequest('company-123');
      const res = mockResponse();
      const next = mockNext();

      // Mock no signer found
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseError('No rows returned', 'PGRST116')
      );

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
    });

    test('T4.4: Should reject if companyId is missing', async () => {
      const req = mockAuthenticatedRequestWithUser();
      const res = mockResponse();
      const next = mockNext();

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad request',
        message: 'Company ID is required'
      });
    });

    test('T4.5: Should reject inactive signer', async () => {
      const req = mockCompanySignerRequest('company-123');
      const res = mockResponse();
      const next = mockNext();

      // When signer is inactive, the query with .eq('is_active', true) returns no results
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseError('No rows found', 'PGRST116')
      );

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
    });

    test('T4.6: Should handle database errors gracefully', async () => {
      const req = mockCompanySignerRequest('company-123');
      const res = mockResponse();
      const next = mockNext();

      // Mock database error
      mockSupabaseClient.from().single.mockRejectedValue(
        new Error('Database connection failed')
      );

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization error',
        message: 'An error occurred checking company permissions'
      });
    });
  });

  // =========================================================================
  // TEST SUITE 5: requireAnySigner() Middleware
  // =========================================================================
  describe('requireAnySigner()', () => {
    test('T5.1: Should allow user who is a signer of any company', async () => {
      const req = mockAuthenticatedRequestWithUser();
      const res = mockResponse();
      const next = mockNext();

      const signers = [mockCompanySignerData()];

      // Mock successful query returning signers
      mockSupabaseClient.from().limit.mockResolvedValue(
        mockDatabaseSuccess(signers)
      );

      await requireAnySigner(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T5.2: Should bypass check for superadmin', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'superadmin' });
      const res = mockResponse();
      const next = mockNext();

      await requireAnySigner(req, res, next);

      expect(next).toHaveBeenCalled();
      // Should NOT query database
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    test('T5.3: Should reject if user is not a signer of any company', async () => {
      const req = mockAuthenticatedRequestWithUser();
      const res = mockResponse();
      const next = mockNext();

      // Mock empty array (no signers)
      mockSupabaseClient.from().limit.mockResolvedValue(
        mockDatabaseSuccess([])
      );

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be a company signer to access this resource'
      });
    });

    test('T5.4: Should reject if no user authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('T5.5: Should handle database errors', async () => {
      const req = mockAuthenticatedRequestWithUser();
      const res = mockResponse();
      const next = mockNext();

      // Mock database error
      mockSupabaseClient.from().limit.mockResolvedValue(
        mockDatabaseError('Query failed')
      );

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // =========================================================================
  // TEST SUITE 6: optionalAuth() Middleware
  // =========================================================================
  describe('optionalAuth()', () => {
    test('T6.1: Should set req.user with valid token', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      const userData = mockUserData();

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess()
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(userData)
      );

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(userData);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T6.2: Should set req.user to null if no token provided', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T6.3: Should set req.user to null if token is invalid', async () => {
      const req = mockAuthenticatedRequest('invalid-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError()
      );

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      // Should NOT return error response
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T6.4: Should use fallback data if users table query fails', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess('user-123', 'test@example.com')
      );

      // Users table query fails
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseError()
      );

      await optionalAuth(req, res, next);

      expect(req.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      });
      expect(next).toHaveBeenCalled();
    });

    test('T6.5: Should handle unexpected errors gracefully', async () => {
      const req = mockAuthenticatedRequest('token');
      const res = mockResponse();
      const next = mockNext();

      // Mock unexpected error
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Unexpected error')
      );

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      // Should NOT throw or return error response
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
