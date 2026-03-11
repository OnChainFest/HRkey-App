import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  mockRequest,
  mockResponse,
  mockNext,
  mockAuthenticatedRequest,
  mockAuthenticatedRequestWithUser
} from '../__mocks__/express.mock.js';

// Minimal inline Supabase mock for ESM reliability
const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  limit: jest.fn()
};

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(() => mockQueryBuilder)
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const authMiddleware = await import('../../middleware/auth.js');
const {
  requireAuth,
  requireSuperadmin,
  requireAdmin,
  requireCompanySigner,
  requireAnySigner,
  optionalAuth,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
} = authMiddleware;

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    __resetSupabaseClientForTests();
    __setSupabaseClientForTests(mockSupabaseClient);

    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.single.mockReset();
    mockQueryBuilder.limit.mockReset();
  });

  describe('requireAuth()', () => {
    test('T1.1: Should authenticate user with valid token', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      const userData = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        identity_verified: false,
        wallet_address: null,
        created_at: '2024-01-01T00:00:00Z'
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      });

      mockQueryBuilder.single.mockResolvedValue({
        data: userData,
        error: null
      });

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

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

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

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token has expired' }
      });

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T1.5: Should use fallback user data if database query fails', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      });

      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Users table error' }
      });

      await requireAuth(req, res, next);

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

      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('Network error'));

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication error',
        message: 'An error occurred during authentication'
      });
    });
  });

  describe('requireSuperadmin()', () => {
    test('T2.1: Should allow superadmin user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'superadmin' });
      const res = mockResponse();
      const next = mockNext();

      await requireSuperadmin(req, res, next);

      expect(next).toHaveBeenCalled();
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
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin()', () => {
    test('T3.1: Should allow admin user', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'admin' });
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
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
      expect(next).not.toHaveBeenCalled();
    });

    test('T3.4: Should reject if no user authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireCompanySigner()', () => {
    test('T4.1: Should allow active company signer', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      req.params = { companyId: 'company-123' };
      const res = mockResponse();
      const next = mockNext();

      const signerData = {
        id: 'signer-123',
        role: 'admin',
        is_active: true,
        company_id: 'company-123'
      };

      mockQueryBuilder.single.mockResolvedValue({
        data: signerData,
        error: null
      });

      await requireCompanySigner(req, res, next);

      expect(req.signer).toEqual(signerData);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('T4.2: Should bypass check for superadmin', async () => {
      const req = mockAuthenticatedRequestWithUser({ role: 'superadmin' });
      req.params = { companyId: 'company-123' };
      const res = mockResponse();
      const next = mockNext();

      await requireCompanySigner(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    test('T4.3: Should reject if user is not a signer', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      req.params = { companyId: 'company-123' };
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T4.4: Should reject if companyId is missing', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      req.params = {};
      const res = mockResponse();
      const next = mockNext();

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('T4.5: Should reject inactive signer', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      req.params = { companyId: 'company-123' };
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Inactive signer' }
      });

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T4.6: Should handle database errors gracefully', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      req.params = { companyId: 'company-123' };
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.single.mockRejectedValue(new Error('DB error'));

      await requireCompanySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAnySigner()', () => {
    test('T5.1: Should allow user who is a signer of any company', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.limit.mockResolvedValue({
        data: [{ id: 'signer-123', company_id: 'company-123' }],
        error: null
      });

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
    });

    test('T5.3: Should reject if user is not a signer of any company', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.limit.mockResolvedValue({
        data: [],
        error: null
      });

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You must be a company signer to access this resource'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('T5.4: Should reject if no user authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('T5.5: Should handle database errors', async () => {
      const req = mockAuthenticatedRequestWithUser({ id: 'user-123', role: 'user' });
      const res = mockResponse();
      const next = mockNext();

      mockQueryBuilder.limit.mockRejectedValue(new Error('DB error'));

      await requireAnySigner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth()', () => {
    test('T6.1: Should set req.user with valid token', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      const userData = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        identity_verified: false,
        created_at: '2024-01-01T00:00:00Z'
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      });

      mockQueryBuilder.single.mockResolvedValue({
        data: userData,
        error: null
      });

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(userData);
      expect(next).toHaveBeenCalled();
    });

    test('T6.2: Should set req.user to null if no token provided', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    test('T6.3: Should set req.user to null if token is invalid', async () => {
      const req = mockAuthenticatedRequest('bad-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    test('T6.4: Should use fallback data if users table query fails', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      });

      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'DB error' }
      });

      await optionalAuth(req, res, next);

      expect(req.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      });
      expect(next).toHaveBeenCalled();
    });

    test('T6.5: Should handle unexpected errors gracefully', async () => {
      const req = mockAuthenticatedRequest('valid-token');
      const res = mockResponse();
      const next = mockNext();

      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('Unexpected'));

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });
});