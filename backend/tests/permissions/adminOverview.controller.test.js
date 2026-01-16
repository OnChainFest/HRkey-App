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
  mockDatabaseSuccess
} from '../__mocks__/supabase.mock.js';

const originalAdminKey = process.env.HRKEY_ADMIN_KEY;
process.env.HRKEY_ADMIN_KEY = 'test-admin-key-123456';

// Mock Supabase before importing the app
const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../middleware/auth.js', () => {
  const requireAuth = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      req.user = JSON.parse(header);
    } catch (err) {
      req.user = { id: header, role: 'user' };
    }
    return next();
  };

  const requireSuperadmin = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Superadmin access required'
      });
    }

    return next();
  };

  return {
    requireAuth,
    requireSuperadmin,
    requireCompanySigner: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
    requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
    requireWalletLinked: () => (_req, _res, next) => next(),
    requireOwnWallet: (_field, _options) => (_req, _res, next) => next(),
    optionalAuth: (_req, _res, next) => next()
  };
});

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Admin Overview Endpoint - Superadmin Authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  afterAll(() => {
    process.env.HRKEY_ADMIN_KEY = originalAdminKey;
  });

  test('SEC-AO1: Should reject missing admin key (401)', async () => {
    const response = await request(app)
      .get('/api/admin/overview')
      .expect(401);

    expect(response.body.error).toBe('Authentication required');
  });

  test('SEC-AO2: Should reject invalid admin key (403)', async () => {
    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'invalid-admin-key-0000')
      .expect(403);

    expect(response.body.error).toBe('Forbidden');
    expect(response.body.message).toBe('Invalid admin key');
  });

  test('SEC-AO3: Should reject invalid admin key via query param (403)', async () => {
    const response = await request(app)
      .get('/api/admin/overview?admin_key=bad-key')
      .expect(403);

    expect(response.body.error).toBe('Forbidden');
    expect(response.body.message).toBe('Invalid admin key');
  });

  test('SEC-AO4: Should allow access with valid admin key (200)', async () => {
    const now = new Date().toISOString();
    mockQueryBuilder.select
      .mockResolvedValueOnce(mockDatabaseSuccess([{ created_at: now }]))
      .mockResolvedValueOnce(mockDatabaseSuccess([{ amount: 42, created_at: now }]))
      .mockResolvedValueOnce(mockDatabaseSuccess([{ status: 'APPROVED', created_at: now }]))
      .mockResolvedValueOnce(mockDatabaseSuccess([{ created_at: now }]));

    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'test-admin-key-123456')
      .expect(200);

    expect(response.body).toHaveProperty('auditEvents');
    expect(response.body).toHaveProperty('revenue');
    expect(response.body).toHaveProperty('dataAccessRequests');
    expect(response.body).toHaveProperty('kpiObservations');
  });

  test('SEC-AO5: Should not leak admin data in error responses', async () => {
    const response = await request(app)
      .get('/api/admin/overview')
      .set('x-admin-key', 'invalid-admin-key-0000')
      .expect(403);

    // Ensure response doesn't contain any admin metrics
    expect(response.body).not.toHaveProperty('auditEvents');
    expect(response.body).not.toHaveProperty('users');
    expect(response.body).not.toHaveProperty('companies');
    expect(response.body).not.toHaveProperty('overview');
  });
});
