/**
 * Signers Controller Permission Tests
 * Tests authorization and permission logic for company signer operations
 *
 * Routes tested:
 * - POST /api/company/:companyId/signers (requireAuth + requireCompanySigner)
 * - GET /api/company/:companyId/signers (requireAuth + requireCompanySigner)
 * - PATCH /api/company/:companyId/signers/:signerId (requireAuth + requireCompanySigner)
 * - GET /api/signers/invite/:token (public - no auth)
 * - POST /api/signers/accept/:token (requireAuth)
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

describe('Signers Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // TEST SUITE: POST /api/company/:companyId/signers (invite signer)
  // Permission: requireAuth + requireCompanySigner
  // =========================================================================
  describe('POST /api/company/:companyId/signers', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';
    const invitationData = {
      email: 'newsigner@company.com',
      role: 'HR Manager'
    };

    test('PERM-S1: Should allow company signer to invite new signer', async () => {
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
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send(invitationData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S2: Should allow superadmin to invite signer to any company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadmin)
      );

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send(invitationData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S3: Should reject non-signer user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send(invitationData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-S4: Should reject invitation with invalid email', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });
      const signer = mockCompanySignerData({
        user_id: userId,
        company_id: companyId
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(signer));

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'invalid-email',
          role: 'HR Manager'
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid email');
    });

    test('PERM-S5: Should reject invitation with missing fields', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });
      const signer = mockCompanySignerData({
        user_id: userId,
        company_id: companyId
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(signer));

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'test@example.com' }) // Missing role
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });

    test('PERM-S6: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .send(invitationData);

      // May return 401 (no auth) or 429 (rate limited before auth check)
      expect([401, 429]).toContain(response.status);
    });
  });

  // =========================================================================
  // TEST SUITE: GET /api/company/:companyId/signers
  // Permission: requireAuth + requireCompanySigner
  // =========================================================================
  describe('GET /api/company/:companyId/signers', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';

    test('PERM-S7: Should allow company signer to view signers', async () => {
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
        .get(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S8: Should allow superadmin to view signers of any company', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(superadmin)
      );

      const response = await request(app)
        .get(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S9: Should reject non-signer user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .get(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-S18: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .get(`/api/company/${companyId}/signers`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  // =========================================================================
  // TEST SUITE: PATCH /api/company/:companyId/signers/:signerId
  // Permission: requireAuth + requireCompanySigner
  // =========================================================================
  describe('PATCH /api/company/:companyId/signers/:signerId', () => {
    const companyId = '660e8400-e29b-41d4-a716-446655440001';
    const signerId = '770e8400-e29b-41d4-a716-446655440002';
    const updateData = { is_active: false };

    test('PERM-S10: Should allow company signer to update signer status', async () => {
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
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S11: Should reject non-signer user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-S17: Should allow superadmin to update any signer', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId, role: 'superadmin' });
      const targetSigner = {
        id: signerId,
        user_id: '880e8400-e29b-41d4-a716-446655440003',
        company_id: companyId,
        is_active: true,
        role: 'HR Manager'
      };
      const updatedSigner = {
        ...targetSigner,
        is_active: false
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // First .single() for user lookup in requireAuth
      // Second .single() for fetching current signer info
      // Third .single() for update operation
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseSuccess(targetSigner))
        .mockResolvedValueOnce(mockDatabaseSuccess(updatedSigner));

      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  // =========================================================================
  // TEST SUITE: GET /api/signers/invite/:token (public endpoint)
  // Permission: None (public access)
  // =========================================================================
  describe('GET /api/signers/invite/:token', () => {
    test('PERM-S12: Should allow anyone to view invitation (no auth required)', async () => {
      const token = 'valid-invitation-token-12345678901234567890123456789012';

      const response = await request(app)
        .get(`/api/signers/invite/${token}`);

      // Should not return 401 (no auth required)
      expect(response.status).not.toBe(401);
    });

    test('PERM-S13: Should handle invalid/not-found token gracefully', async () => {
      const token = 'nonexistent-token-12345678901234567890123456789012';

      // Mock database returning no invitation found
      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseError('No rows found', 'PGRST116')
      );

      const response = await request(app)
        .get(`/api/signers/invite/${token}`);

      // Controller returns 404 when invitation not found
      expect([404, 500]).toContain(response.status);
    });
  });

  // =========================================================================
  // TEST SUITE: POST /api/signers/accept/:token
  // Permission: requireAuth
  // =========================================================================
  describe('POST /api/signers/accept/:token', () => {
    const token = 'valid-invitation-token-12345678901234567890123456789012';

    test('PERM-S14: Should allow authenticated user to accept invitation', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(user)
      );

      const response = await request(app)
        .post(`/api/signers/accept/${token}`)
        .set('Authorization', 'Bearer valid-token');

      // Auth should pass (not 401/403)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('PERM-S15: Should reject unauthenticated user', async () => {
      const response = await request(app)
        .post(`/api/signers/accept/${token}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('PERM-S16: Should handle nonexistent invitation token', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = mockUserData({ id: userId });
      const invalidToken = 'nonexistent-token-12345678901234567890123456789012';

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      // Mock: auth succeeds, but invitation not found
      mockSupabaseClient.from().single
        .mockResolvedValueOnce(mockDatabaseSuccess(user))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .post(`/api/signers/accept/${invalidToken}`)
        .set('Authorization', 'Bearer valid-token');

      // Controller returns error when invitation not found
      expect([400, 404, 500]).toContain(response.status);
    });
  });
});
