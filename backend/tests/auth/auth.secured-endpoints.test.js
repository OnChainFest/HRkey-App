/**
 * Secured Endpoints Integration Tests
 * Tests authentication and authorization for critical endpoints that were previously public
 *
 * PRODUCTION HARDENING: These endpoints were unprotected before this change
 * - POST /api/wallet/create (now requires auth + self-authorization)
 * - POST /api/reference/request (now requires auth + self-authorization)
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockUserData
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

describe('Secured Endpoints - Authentication & Authorization Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-establish the query builder mock after clearing
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

    // Re-establish all chainable method mocks
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // TEST SUITE: POST /api/wallet/create
  // =========================================================================
  describe('POST /api/wallet/create', () => {
    const validWalletPayload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com'
    };

    test('SEC-W1: Should reject request without authentication token', async () => {
      const response = await request(app)
        .post('/api/wallet/create')
        .send(validWalletPayload)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('SEC-W2: Should reject request with invalid token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('Invalid token')
      );

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer invalid-token')
        .send(validWalletPayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
    });

    test('SEC-W3: Should reject request with expired token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('JWT expired')
      );

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer expired-token')
        .send(validWalletPayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
    });

    test('SEC-W4: Should reject when authenticated user tries to create wallet for different user', async () => {
      const attackerUserId = '660e8400-e29b-41d4-a716-446655440001';
      const victimUserId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: attackerUserId, email: 'attacker@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(attackerUserId, 'attacker@example.com')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: victimUserId, // Different from authenticated user
          email: 'victim@example.com'
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('You can only create a wallet for yourself');
    });

    test('SEC-W5: Should allow authenticated user to create wallet for themselves', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId, email: 'test@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId, 'test@example.com')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send(validWalletPayload);

      // Auth passed - should NOT be 401 (unauthenticated) or 403 (unauthorized)
      // Service might succeed (200) or fail (400/500), but auth worked
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);

      // Verify authentication was checked
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });

    test('SEC-W6: Should enforce validation even with valid auth', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      // Missing email (validation should fail)
      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: userId });

      // Validation should fail (400), not auth (401/403)
      expect(response.status).toBe(400);
      // Verify auth was checked first
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TEST SUITE: POST /api/reference/request
  // =========================================================================
  describe('POST /api/reference/request', () => {
    const validReferencePayload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'referee@example.com',
      name: 'John Referee'
    };

    test('SEC-R1: Should reject request without authentication token', async () => {
      const response = await request(app)
        .post('/api/reference/request')
        .send(validReferencePayload)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('SEC-R2: Should reject request with invalid token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('Invalid token')
      );

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer invalid-token')
        .send(validReferencePayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
    });

    test('SEC-R3: Should reject request with expired token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserError('JWT expired')
      );

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer expired-token')
        .send(validReferencePayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
    });

    test('SEC-R4: Should reject when authenticated user tries to request reference for different user', async () => {
      const attackerUserId = '660e8400-e29b-41d4-a716-446655440001';
      const victimUserId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: attackerUserId, email: 'attacker@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(attackerUserId, 'attacker@example.com')
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: victimUserId, // Different from authenticated user
          email: 'referee@example.com',
          name: 'John Referee'
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('You can only request references for yourself');
    });

    test('SEC-R5: Should allow authenticated user to request reference for themselves', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send(validReferencePayload);

      // Auth passed - should NOT be 401 (unauthenticated) or 403 (unauthorized)
      // Service might succeed (200) or fail (400/500), but auth worked
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);

      // Verify authentication was checked
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });

    test('SEC-R6: Should enforce validation even with valid auth', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(userId)
      );

      mockSupabaseClient.from().single.mockResolvedValue(
        mockDatabaseSuccess(authenticatedUser)
      );

      // Missing required field (name)
      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: userId,
          email: 'referee@example.com'
          // Missing name
        });

      // Validation should fail (400), not auth (401/403)
      expect(response.status).toBe(400);
      // Verify auth was checked first
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    });
  });
});
