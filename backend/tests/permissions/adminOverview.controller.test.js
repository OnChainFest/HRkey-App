/**
 * Admin Overview Endpoint - Authorization Tests
 *
 * SECURITY: Tests that /api/admin/overview requires superadmin role
 *
 * P0 Fix: Added requireSuperadmin middleware to prevent unauthorized access
 * to platform-wide metrics and admin data.
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

describe('Admin Overview Endpoint - Superadmin Authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  test('SEC-AO1: Should reject unauthenticated requests (401)', async () => {
    const response = await request(app)
      .get('/api/admin/overview')
      .expect(401);

    expect(response.body.error).toBe('Authentication required');
  });

  test('SEC-AO2: Should reject regular user requests (403)', async () => {
    const regularUserId = '550e8400-e29b-41d4-a716-446655440000';
    const regularUser = mockUserData({
      id: regularUserId,
      email: 'user@example.com',
      role: 'user'
    });

    // Mock authentication
    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(regularUserId, 'user@example.com')
    );

    // Mock user table lookup - returns regular user
    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(regularUser)
    );

    const response = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    expect(response.body.error).toBe('Forbidden');
    expect(response.body.message).toBe('Superadmin access required');
  });

  test('SEC-AO3: Should reject company admin requests (403)', async () => {
    const companyAdminId = '660e8400-e29b-41d4-a716-446655440001';
    const companyAdmin = mockUserData({
      id: companyAdminId,
      email: 'admin@company.com',
      role: 'admin'
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(companyAdminId, 'admin@company.com')
    );

    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(companyAdmin)
    );

    const response = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    expect(response.body.error).toBe('Forbidden');
    expect(response.body.message).toBe('Superadmin access required');
  });

  test('SEC-AO4: Should allow superadmin access (200)', async () => {
    const superadminId = '770e8400-e29b-41d4-a716-446655440002';
    const superadmin = mockUserData({
      id: superadminId,
      email: 'superadmin@hrkey.xyz',
      role: 'superadmin'
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(superadminId, 'superadmin@hrkey.xyz')
    );

    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(superadmin)
    );

    // Mock the admin overview data responses
    // First call: audit events count
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.count.mockResolvedValueOnce(
      mockDatabaseSuccess(null, 100)
    );

    // Second call: users count
    mockQueryBuilder.count.mockResolvedValueOnce(
      mockDatabaseSuccess(null, 50)
    );

    // Third call: companies count
    mockQueryBuilder.count.mockResolvedValueOnce(
      mockDatabaseSuccess(null, 25)
    );

    // Fourth call: data access requests count
    mockQueryBuilder.count.mockResolvedValueOnce(
      mockDatabaseSuccess(null, 75)
    );

    const response = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer valid-superadmin-token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('overview');
  });

  test('SEC-AO5: Should not leak admin data in error responses', async () => {
    const regularUserId = '550e8400-e29b-41d4-a716-446655440000';
    const regularUser = mockUserData({
      id: regularUserId,
      email: 'user@example.com',
      role: 'user'
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(regularUserId, 'user@example.com')
    );

    mockQueryBuilder.single.mockResolvedValue(
      mockDatabaseSuccess(regularUser)
    );

    const response = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    // Ensure response doesn't contain any admin metrics
    expect(response.body).not.toHaveProperty('auditEvents');
    expect(response.body).not.toHaveProperty('users');
    expect(response.body).not.toHaveProperty('companies');
    expect(response.body).not.toHaveProperty('overview');
  });
});
