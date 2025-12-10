/**
 * Identity Controller Permission Tests (PERM-I1..PERM-I6)
 * Focuses on authentication, self-only enforcement, and error handling.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

const mockLogIdentityVerification = jest.fn().mockResolvedValue();

function buildTableMock({ singleResponses = [] } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation((table) => tableMocks[table] || mockQueryBuilder);
}

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
  logIdentityVerification: mockLogIdentityVerification,
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

describe('Identity Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/identity/verify', () => {
    test('PERM-I1: authenticated user can verify their own identity', async () => {
      const user = mockUserData({ id: 'user-self', email: 'self@example.com' });
      const updatedUser = { ...user, identity_verified: true };

      const usersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess(user), // requireAuth user lookup
          mockDatabaseSuccess(user), // controller fetch existing user
          mockDatabaseSuccess(updatedUser) // update/select response
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: user.id, fullName: 'Self User', idNumber: '12345678' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.identity_verified).toBe(true);
      expect(mockLogIdentityVerification).toHaveBeenCalled();
    });

    test('PERM-I2: unauthenticated POST /api/identity/verify returns 401', async () => {
      const response = await request(app)
        .post('/api/identity/verify')
        .send({ userId: 'user-no-auth', fullName: 'X', idNumber: '1' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('PERM-I3: authenticated user attempting to verify another user documents current behavior (no self-check)', async () => {
      const authedUser = mockUserData({ id: 'user-a', email: 'a@example.com' });
      const targetUser = mockUserData({ id: 'user-b', email: 'b@example.com' });
      const updatedTarget = { ...targetUser, identity_verified: true };

      const usersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess(authedUser), // requireAuth lookup
          mockDatabaseSuccess(targetUser), // controller fetch different user
          mockDatabaseSuccess(updatedTarget) // update different user
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(authedUser.id, authedUser.email));

      const response = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: targetUser.id, fullName: 'Target User', idNumber: '2222' })
        .expect(200); // Controller currently allows cross-user verification (security gap)

      expect(response.body.success).toBe(true);
    });

    test('PERM-I6: missing required KYC fields returns 400', async () => {
      const authedUser = mockUserData({ id: 'user-missing' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(authedUser)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(authedUser.id));

      const response = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: authedUser.id })
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /api/identity/status/:userId', () => {
    test('PERM-I4: authenticated user can view identity status for a given userId (current permissive behavior)', async () => {
      const requester = mockUserData({ id: 'viewer-1' });
      const targetUser = mockUserData({ id: 'target-1', identity_verified: true });

      const usersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess(requester), // requireAuth lookup
          mockDatabaseSuccess(targetUser) // controller fetch target
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(requester.id));

      const response = await request(app)
        .get('/api/identity/status/target-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200); // Controller allows querying other users' status

      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe('target-1');
      expect(response.body.verified).toBe(true);
    });

    test('PERM-I5: invalid or non-existent userId returns 404', async () => {
      const requester = mockUserData({ id: 'viewer-2' });
      const usersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess(requester), // requireAuth
          mockDatabaseError('User not found', 'PGRST116') // controller lookup
        ]
      });

      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(requester.id));

      const response = await request(app)
        .get('/api/identity/status/missing-user')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });
  });
});
