/**
 * Authentication Integration Tests
 * Tests for protected endpoints using supertest
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
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
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const authMiddleware = await import('../../middleware/auth.js');
const { __setSupabaseClientForTests, __resetSupabaseClientForTests } = authMiddleware;

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    __setSupabaseClientForTests(mockSupabaseClient);

    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);

    mockSupabaseClient.auth.getUser.mockReset();
    mockQueryBuilder.single.mockReset();
    mockQueryBuilder.maybeSingle?.mockReset?.();

    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.order?.mockReturnThis?.();
    mockQueryBuilder.insert?.mockReturnThis?.();
    mockQueryBuilder.update?.mockReturnThis?.();
    mockQueryBuilder.delete?.mockReturnThis?.();
  });

  afterEach(() => {
    __resetSupabaseClientForTests();
  });

  describe('GET /health', () => {
    test('IT-H1: Should return health status without authentication', async () => {
      const response = await request(app).get('/health').expect('Content-Type', /json/).expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.status).toBe('ok');
    });
  });

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
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const response = await request(app)
        .get('/api/identity/status/user-123')
        .set('Authorization', 'Bearer invalid-token')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('invalid-token');
    });

    test('IT3: Should accept request with valid token', async () => {
      const userData = mockUserData({
        id: 'user-123',
        email: 'test@example.com'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123', 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(userData))
        .mockResolvedValueOnce(
          mockDatabaseSuccess({
            id: 'user-123',
            identity_verified: true
          })
        );

      await request(app).get('/api/identity/status/user-123').set('Authorization', 'Bearer valid-token');

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('POST /api/company/:companyId/verify', () => {
    test('IT4: Should reject regular user for superadmin endpoint', async () => {
      const userData = mockUserData({
        id: 'user-123',
        role: 'user'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123'));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(userData));

      const response = await request(app)
        .post('/api/company/company-123/verify')
        .set('Authorization', 'Bearer user-token')
        .send({ verified: true })
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Superadmin access required');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('user-token');
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

      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(superadminData));

      await request(app)
        .post('/api/company/company-123/verify')
        .set('Authorization', 'Bearer admin-token')
        .send({ verified: true });

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('admin-token');
    });
  });

  describe('GET /api/company/:companyId/signers', () => {
    test('IT6: Should reject if user is not a signer of company', async () => {
      const userData = mockUserData({
        id: 'user-123',
        role: 'user'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(userData))
        .mockResolvedValueOnce(mockDatabaseError('No rows', 'PGRST116'));

      const response = await request(app)
        .get('/api/company/company-123/signers')
        .set('Authorization', 'Bearer user-token')
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('active signer');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('user-token');
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

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-123'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(userData))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerData))
        .mockResolvedValueOnce(
          mockDatabaseSuccess({
            id: 'company-123',
            name: 'Acme Inc'
          })
        );

      await request(app).get('/api/company/company-123/signers').set('Authorization', 'Bearer signer-token');

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('signer-token');
      expect(mockSupabaseClient.from).toHaveBeenCalled();
    });

    test('IT8: Should allow superadmin to access any company', async () => {
      const superadminData = mockUserData({
        id: 'admin-123',
        role: 'superadmin'
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-123'));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(superadminData));

      await request(app).get('/api/company/company-123/signers').set('Authorization', 'Bearer admin-token');

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('admin-token');
    });
  });
});