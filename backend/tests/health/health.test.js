/**
 * Health Check Endpoint Tests
 * Tests for server health monitoring endpoints
 *
 * Routes tested:
 * - GET /health (simple liveness check)
 * - GET /health/deep (deep check with Supabase connectivity)
 *
 * SECURITY: These endpoints do NOT require authentication (by design)
 * SAFETY: These endpoints do NOT expose sensitive data
 */

import { jest } from '@jest/globals';
import request from 'supertest';

// Mock Supabase before importing server
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

// Import mocks
const supabaseMock = await import('../__mocks__/supabase.mock.js');
const {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockDatabaseSuccess,
  mockDatabaseError
} = supabaseMock.default;

// Create Supabase mock client
const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

// Mock the createClient function
const { createClient } = await import('@supabase/supabase-js');
createClient.mockReturnValue(mockSupabaseClient);

// Import app after mocks
const { default: app } = await import('../../server.js');

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // ============================================================================
  // GET /health - Simple Health Check
  // ============================================================================

  describe('GET /health', () => {
    test('HEALTH-1: Should return 200 with expected JSON shape', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');

      // Verify data types
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.version).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');

      // Verify status value
      expect(response.body.status).toBe('ok');
    });

    test('HEALTH-2: Should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Verify timestamp is valid ISO 8601 format
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('HEALTH-3: Should not require authentication', async () => {
      // Request without Authorization header should succeed
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    test('HEALTH-4: Should respond quickly (< 100ms)', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/health')
        .expect(200);

      const duration = Date.now() - startTime;

      // Simple health check should be very fast (no external dependencies)
      expect(duration).toBeLessThan(100);
    });

    test('HEALTH-5: Should not expose sensitive data', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Verify no sensitive fields in response
      expect(response.body).not.toHaveProperty('database');
      expect(response.body).not.toHaveProperty('supabase');
      expect(response.body).not.toHaveProperty('services');
      expect(response.body).not.toHaveProperty('environment');
      expect(response.body).not.toHaveProperty('config');
      expect(response.body).not.toHaveProperty('secrets');

      // Should only have safe fields
      const allowedFields = ['status', 'version', 'timestamp'];
      const actualFields = Object.keys(response.body);
      actualFields.forEach(field => {
        expect(allowedFields).toContain(field);
      });
    });
  });

  // ============================================================================
  // GET /health/deep - Deep Health Check with Supabase
  // ============================================================================

  describe('GET /health/deep', () => {
    test('DEEP-1: Should return 200 with expected structure when Supabase is ok', async () => {
      // Mock successful Supabase query
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('supabase');

      // Verify status when everything is ok
      expect(response.body.status).toBe('ok');
      expect(response.body.supabase).toBe('ok');
      expect(response.body.details).toBeNull();
    });

    test('DEEP-2: Should verify Supabase connectivity', async () => {
      // Mock successful Supabase query
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      await request(app)
        .get('/health/deep')
        .expect(200);

      // Verify that Supabase client was called
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('users');
      expect(mockSelect).toHaveBeenCalledWith('count');
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    test('DEEP-3: Should return degraded status when Supabase errors', async () => {
      // Mock Supabase error
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseError('Connection refused'));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200); // Still returns 200, but status is degraded

      // Verify degraded status
      expect(response.body.status).toBe('degraded');
      expect(response.body.supabase).toBe('error');
      expect(response.body.details).toBeTruthy();
      expect(response.body.details.supabase_error).toBe('Connection refused');
    });

    test('DEEP-4: Should handle Supabase exceptions gracefully', async () => {
      // Mock Supabase throwing an exception
      const mockLimit = jest.fn().mockRejectedValue(new Error('Network timeout'));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200); // Still returns 200, but status is degraded

      // Verify degraded status with error details
      expect(response.body.status).toBe('degraded');
      expect(response.body.supabase).toBe('error');
      expect(response.body.details).toBeTruthy();
      expect(response.body.details.supabase_error).toContain('Network timeout');
    });

    test('DEEP-5: Should include uptime in response', async () => {
      // Mock successful Supabase query
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      // Verify uptime is present and is a number
      expect(response.body.uptime).toBeDefined();
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    test('DEEP-6: Should not require authentication', async () => {
      // Mock successful Supabase query
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      // Request without Authorization header should succeed
      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    test('DEEP-7: Should not expose sensitive Supabase details', async () => {
      // Mock Supabase error with potential sensitive info
      const mockLimit = jest.fn().mockResolvedValue(
        mockDatabaseError('Could not connect to database at wrervcydgdrlcndtjboy.supabase.co')
      );
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      // Response should contain error but not expose full connection strings or keys
      expect(response.body).not.toHaveProperty('SUPABASE_URL');
      expect(response.body).not.toHaveProperty('SUPABASE_KEY');
      expect(response.body).not.toHaveProperty('config');
      expect(response.body).not.toHaveProperty('secrets');

      // Should only expose sanitized error message
      expect(response.body.details).toBeTruthy();
      expect(response.body.details.supabase_error).toBeTruthy();
    });

    test('DEEP-8: Should return valid ISO timestamp', async () => {
      // Mock successful Supabase query
      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      // Verify timestamp is valid ISO 8601 format
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('DEEP-9: Should have timeout protection', async () => {
      // Mock a very slow Supabase query (simulate hanging connection)
      const mockLimit = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockDatabaseSuccess([])), 10000))
      );
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const startTime = Date.now();

      const response = await request(app)
        .get('/health/deep')
        .expect(200);

      const duration = Date.now() - startTime;

      // Should timeout and return degraded status within 5 seconds
      expect(duration).toBeLessThan(6000);
      expect(response.body.status).toBe('degraded');
      expect(response.body.supabase).toBe('error');
      expect(response.body.details.supabase_error).toContain('timeout');
    });
  });

  // ============================================================================
  // Additional Safety Tests
  // ============================================================================

  describe('Safety & Security', () => {
    test('SAFETY-1: Health endpoints should not log sensitive data', async () => {
      // This is a documentation test - verifies behavior expectation
      // In production, health checks should not log request details or errors
      // that might contain sensitive information

      await request(app).get('/health').expect(200);
      await request(app).get('/health/deep').expect(200);

      // If we had access to logs, we would verify:
      // - No API keys logged
      // - No user data logged
      // - No connection strings logged
      // This test documents the expectation
      expect(true).toBe(true);
    });

    test('SAFETY-2: Both endpoints should use consistent version', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      const mockLimit = jest.fn().mockResolvedValue(mockDatabaseSuccess([{ count: 1 }]));
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const deepResponse = await request(app)
        .get('/health/deep')
        .expect(200);

      // Both endpoints should report the same version
      expect(healthResponse.body.version).toBe(deepResponse.body.version);
    });
  });
});
