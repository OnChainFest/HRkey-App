/**
 * Company Controller Permission Tests
 * Tests authorization and permission logic for company operations
 *
 * Routes tested:
 * - POST /api/company/create (requireAuth)
 * - GET /api/companies/my (requireAuth)
 * - GET /api/company/:companyId (requireAuth + requireCompanySigner)
 * - PATCH /api/company/:companyId (requireAuth + requireCompanySigner)
 * - POST /api/company/:companyId/verify (requireAuth + requireSuperadmin)
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
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Company Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // TEST SUITE: POST /api/company/create
  // Permission: requireAuth (any authenticated user can create)
  // =========================================================================
  describe('POST /api/company/create', () => {
    const validCompanyData = {
      name: 'Test Company',
      domain_email: '@testcompany.com'
    };

    test('PERM-C1: Should allow authenticated user to create company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(user)
      );

      const response = await request(app)
        .post('/api/company/create')
        .set('Authorization', 'Bearer valid-token')
        .send(validCompanyData);

      // Auth should pass (not 401/403)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });

    test('PERM-C2: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .post('/api/company/create')
        .send(validCompanyData)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  // =========================================================================
  // TEST SUITE: GET /api/companies/my
  // Permission: requireAuth (user gets their own companies)
  // =========================================================================
  describe('GET /api/companies/my', () => {
    test('PERM-C3: Should allow authenticated user to get their companies', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(user)
      );

      const response = await request(app)
        .get('/api/companies/my')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-C4: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .get('/api/companies/my')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  // =========================================================================
  // TEST SUITE: GET /api/company/:companyId
  // Permission: requireAuth + requireCompanySigner
  // =========================================================================
  describe('GET /api/company/:companyId', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';

    test('PERM-C5: Should allow company signer to view company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'user' });
      const signer = mockCompanySignerData({
        user_id: userId,
        company_id: companyId,
        is_active: true
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // Mock: first call for auth, second for signer check
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(signer));

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-C6: Should allow superadmin to view any company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadmin)
      );

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-C7: Should reject non-signer user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // Mock: user found, but signer check fails (no rows)
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-C8: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  // =========================================================================
  // TEST SUITE: PATCH /api/company/:companyId
  // Permission: requireAuth + requireCompanySigner
  // =========================================================================
  describe('PATCH /api/company/:companyId', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';
    const updateData = { name: 'Updated Company Name' };

    test('PERM-C9: Should allow company signer to update company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });
      const signer = mockCompanySignerData({
        user_id: userId,
        company_id: companyId,
        is_active: true
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(signer));

      const response = await request(app)
        .patch(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-C10: Should reject non-signer user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .patch(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-C15: Should allow superadmin to update any company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'superadmin' });
      const updatedCompany = {
        id: companyId,
        name: 'Updated Company Name',
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // First .single() for user lookup in requireAuth
      // Second .single() for requireCompanySigner (superadmin bypasses)
      // Third .single() for update operation
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(updatedCompany));

      const response = await request(app)
        .patch(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  // =========================================================================
  // TEST SUITE: POST /api/company/:companyId/verify
  // Permission: requireAuth + requireSuperadmin
  // =========================================================================
  describe('POST /api/company/:companyId/verify', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';

    test('PERM-C11: Should allow superadmin to verify company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadmin)
      );

      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-C12: Should reject regular user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(user)
      );

      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Superadmin access required');
    });

    test('PERM-C13: Should reject admin user (only superadmin allowed)', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const admin = mockUserData({ id: userId, role: 'admin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(admin)
      );

      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Superadmin access required');
    });

    test('PERM-C14: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });
});
