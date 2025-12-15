import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendSignerInvitation: jest.fn().mockResolvedValue(),
  sendCompanyVerificationNotification: jest.fn().mockResolvedValue(),
  sendIdentityVerificationConfirmation: jest.fn().mockResolvedValue(),
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logAudit: jest.fn().mockResolvedValue(),
  logIdentityVerification: jest.fn().mockResolvedValue(),
  logCompanyCreation: jest.fn().mockResolvedValue(),
  logCompanyVerification: jest.fn().mockResolvedValue(),
  logSignerInvitation: jest.fn().mockResolvedValue(),
  logSignerAcceptance: jest.fn().mockResolvedValue(),
  logSignerStatusChange: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {},
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('Identity Endpoint Security Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // =========================================================================
  // GET /api/identity/status/:userId - Authorization Tests
  // =========================================================================

  describe('GET /api/identity/status/:userId', () => {
    test('ID-INT-01: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app).get('/api/identity/status/user-123');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('ID-INT-02: user A cannot view identity status of user B (403 Forbidden)', async () => {
      // User A (user-a-id) is authenticated
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A data from users table (not superadmin)
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-a-id', email: 'usera@test.com', role: 'user' }))
      );

      // User A tries to view user B's identity status
      const res = await request(app)
        .get('/api/identity/status/user-b-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toBe('You can only view your own identity status');
    });

    test('ID-INT-03: user can view their own identity status (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-own-id', 'own@test.com'));

      // User data from users table
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-own-id', email: 'own@test.com', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'user-own-id',
          email: 'own@test.com',
          identity_verified: true,
          kyc_provider: 'manual',
          kyc_verified_at: '2024-01-01T00:00:00Z',
          kyc_metadata: { fullName: 'Own User', idNumber: '1234', hasSelfie: false }
        }));

      const res = await request(app)
        .get('/api/identity/status/user-own-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(true);
    });

    test('ID-INT-04: superadmin can view any user identity status (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-id', 'admin@test.com'));

      // Superadmin user data
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'admin-id', email: 'admin@test.com', role: 'superadmin' })))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'other-user-id',
          email: 'other@test.com',
          identity_verified: false,
          kyc_provider: null,
          kyc_verified_at: null,
          kyc_metadata: null
        }));

      const res = await request(app)
        .get('/api/identity/status/other-user-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(false);
    });

    test('ID-INT-05: should return 404 when user not found', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-own-id', 'own@test.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-own-id', email: 'own@test.com', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseError('User not found', 'PGRST116'));

      const res = await request(app)
        .get('/api/identity/status/user-own-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  // =========================================================================
  // POST /api/identity/verify - Authorization Tests
  // =========================================================================

  describe('POST /api/identity/verify', () => {
    test('ID-INT-06: should return 401 for unauthenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserError('Invalid token'));

      const res = await request(app)
        .post('/api/identity/verify')
        .send({ fullName: 'Test User', idNumber: '123456789' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    test('ID-INT-07: user A cannot verify identity for user B (uses own ID automatically)', async () => {
      // User A is authenticated
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-a-id', 'usera@test.com'));

      // User A data
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', email: 'usera@test.com', role: 'user' })))
        // Query for user A (not user B) since controller now uses req.user.id
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', email: 'usera@test.com', identity_verified: false })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-a-id', email: 'usera@test.com', identity_verified: true })));

      // Even if user A sends userId: 'user-b-id' in body, the controller ignores it
      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userId: 'user-b-id', // This should be ignored
          fullName: 'Test User A',
          idNumber: '123456789'
        });

      // Verification succeeds but for user A, not user B
      // The controller now uses req.user.id, so user B's ID in body is ignored
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe('user-a-id'); // Verifies user A, not B
    });

    test('ID-INT-08: user can verify their own identity (200 OK)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-own-id', 'own@test.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-own-id', email: 'own@test.com', role: 'user' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-own-id', email: 'own@test.com', identity_verified: false })))
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'user-own-id',
          email: 'own@test.com',
          identity_verified: true,
          kyc_verified_at: '2024-01-01T00:00:00Z'
        }));

      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({
          fullName: 'Own User',
          idNumber: '987654321'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.identity_verified).toBe(true);
    });

    test('ID-INT-09: should return 400 for missing required fields', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-id', 'user@test.com'));

      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: 'user-id', email: 'user@test.com' }))
      );

      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ fullName: 'Test User' }); // Missing idNumber

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });

    test('ID-INT-10: should return 400 if user already verified', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-id', 'user@test.com'));

      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-id', email: 'user@test.com' })))
        .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-id', email: 'user@test.com', identity_verified: true })));

      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({
          fullName: 'Test User',
          idNumber: '123456789'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Already verified');
    });
  });
});
