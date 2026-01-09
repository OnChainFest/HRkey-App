/**
 * Dashboard Overview Endpoint - Authorization Tests
 *
 * SECURITY: Tests that /api/dashboard/overview requires authentication
 * and only returns data for the authenticated user
 *
 * Tests cover:
 * - Unauthenticated access (401)
 * - Authenticated access (200)
 * - Data isolation (user can only see their own data)
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

// Mock Supabase before importing the app
const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Dashboard Overview Endpoint - Authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  test('SEC-DO1: Should reject unauthenticated requests (401)', async () => {
    const response = await request(app)
      .get('/api/dashboard/overview')
      .expect(401);

    expect(response.body.error).toBe('Authentication required');
  });

  test('SEC-DO2: Should allow authenticated user access (200)', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const user = mockUserData({
      id: userId,
      email: 'user@example.com',
      role: 'user',
      full_name: 'Test User',
      wallet_address: '0x1234567890abcdef',
      identity_verified: true
    });

    // Mock authentication
    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(userId, 'user@example.com')
    );

    // Mock all database queries to return empty/default data
    // This simulates the service gracefully handling missing data
    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(user)
    );

    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.order.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.maybeSingle.mockReturnThis();

    // Return empty arrays for most queries
    mockQueryBuilder.eq.mockResolvedValue(
      mockDatabaseSuccess([])
    );

    const response = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toHaveProperty('userProfile');
    expect(response.body).toHaveProperty('roles');
    expect(response.body).toHaveProperty('globalSummary');
    expect(response.body).toHaveProperty('candidateSummary');
    expect(response.body).toHaveProperty('referrerSummary');

    // Verify user profile data
    expect(response.body.userProfile.id).toBe(userId);
    expect(response.body.userProfile.email).toBe('user@example.com');
  });

  test('SEC-DO3: Should return safe defaults when tables are missing', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const user = mockUserData({
      id: userId,
      email: 'user@example.com',
      role: 'user'
    });

    // Mock authentication
    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(userId, 'user@example.com')
    );

    // Mock user queries
    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(user)
    );

    // Mock query builders
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.order.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.maybeSingle.mockReturnThis();

    // Return empty data for all queries
    mockQueryBuilder.eq.mockResolvedValue(
      mockDatabaseSuccess([])
    );

    const response = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    // Should still return valid structure with defaults
    expect(response.body.roles).toHaveProperty('candidateEnabled');
    expect(response.body.roles).toHaveProperty('referrerEnabled');

    expect(response.body.candidateSummary).toHaveProperty('pendingReferenceRequestsCount');
    expect(response.body.candidateSummary).toHaveProperty('completedReferencesCount');
    expect(response.body.referrerSummary).toHaveProperty('assignedRequestsCount');
  });

  test('SEC-DO4: Should only return data for authenticated user', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const user = mockUserData({
      id: userId,
      email: 'user@example.com',
      role: 'user'
    });

    // Mock authentication
    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(userId, 'user@example.com')
    );

    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(user)
    );

    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.order.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.maybeSingle.mockReturnThis();

    mockQueryBuilder.eq.mockResolvedValue(
      mockDatabaseSuccess([])
    );

    const response = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    // Verify only the authenticated user's ID is in the response
    expect(response.body.userProfile.id).toBe(userId);
  });

  test('SEC-DO5: Should handle service errors gracefully', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const user = mockUserData({
      id: userId,
      email: 'user@example.com',
      role: 'user'
    });

    // Mock authentication
    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(userId, 'user@example.com')
    );

    // Auth middleware gets user successfully
    mockQueryBuilder.single.mockResolvedValueOnce(
      mockDatabaseSuccess(user)
    );

    // But user profile fetch in service fails
    mockQueryBuilder.single.mockRejectedValueOnce(
      new Error('Database connection failed')
    );

    const response = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    // Service should still return data with safe defaults
    expect(response.body).toHaveProperty('userProfile');
    expect(response.body).toHaveProperty('candidateSummary');
  });
});
