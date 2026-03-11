/**
 * Secured Endpoints Integration Tests
 * Tests authentication and authorization for critical endpoints that were previously public
 *
 * PRODUCTION HARDENING: These endpoints were unprotected before this change
 * - POST /api/wallet/create (now requires auth + self-authorization)
 * - POST /api/reference/request (now requires auth + self-authorization)
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

// Mock Supabase before importing app/auth modules
const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import auth middleware first so we can inject the mocked client directly
const authMiddleware = await import('../../middleware/auth.js');
const { __setSupabaseClientForTests, __resetSupabaseClientForTests } = authMiddleware;

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Secured Endpoints - Authentication & Authorization Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    __resetSupabaseClientForTests();
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

  // =========================================================================
  // TEST SUITE: POST /api/wallet/create
  // =========================================================================
  describe('POST /api/wallet/create', () => {
    const validWalletPayload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com'
    };

    test('SEC-W1: Should reject request without authentication token', async () => {
      const response = await request(app).post('/api/wallet/create').send(validWalletPayload).expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('SEC-W2: Should reject request with invalid token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer invalid-token')
        .send(validWalletPayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('invalid-token');
    });

    test('SEC-W3: Should reject request with expired token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('JWT expired'));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer expired-token')
        .send(validWalletPayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('expired-token');
    });

    test('SEC-W4: Should reject when authenticated user tries to create wallet for different user', async () => {
      const attackerUserId = '660e8400-e29b-41d4-a716-446655440001';
      const victimUserId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: attackerUserId, email: 'attacker@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(attackerUserId, 'attacker@example.com')
      );

      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: victimUserId,
          email: 'victim@example.com'
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('You can only create a wallet for yourself');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });

    test('SEC-W5: Should allow authenticated user to create wallet for themselves', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId, email: 'test@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId, 'test@example.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser))
        .mockResolvedValueOnce(mockDatabaseSuccess(null));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send(validWalletPayload);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });

    test('SEC-W6: Should enforce validation even with valid auth', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId });

      expect(response.status).toBe(400);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
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
      const response = await request(app).post('/api/reference/request').send(validReferencePayload).expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('SEC-R2: Should reject request with invalid token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer invalid-token')
        .send(validReferencePayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('invalid-token');
    });

    test('SEC-R3: Should reject request with expired token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('JWT expired'));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer expired-token')
        .send(validReferencePayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Your session has expired or is invalid');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('expired-token');
    });

    test('SEC-R4: Should reject when authenticated user tries to request reference for different user', async () => {
      const attackerUserId = '660e8400-e29b-41d4-a716-446655440001';
      const victimUserId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: attackerUserId, email: 'attacker@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(attackerUserId, 'attacker@example.com')
      );

      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: victimUserId,
          email: 'referee@example.com',
          name: 'John Referee'
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('You can only request references for yourself');
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });

    test('SEC-R5: Should allow authenticated user to request reference for themselves', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send(validReferencePayload);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });

    test('SEC-R6: Should enforce validation even with valid auth', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const authenticatedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authenticatedUser));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId,
          email: 'referee@example.com'
        });

      expect(response.status).toBe(400);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith('valid-token');
    });
  });
});