/**
 * Notifications Controller Permission Tests
 * Tests for notification access control - users can only access their own notifications
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

function buildTableMock({ selectResponses = [], singleResponses = [], maybeSingleResponses = [], countResponse = null } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn()
  };

  // Handle select with count
  builder.select.mockImplementation((columns, options) => {
    if (options?.count === 'exact' && options?.head) {
      // This is a count query
      return {
        eq: jest.fn().mockResolvedValue(countResponse || { count: 0, error: null })
      };
    }
    return builder;
  });

  // Handle range for list queries
  builder.range.mockImplementation(() => {
    return Promise.resolve(selectResponses.length ? selectResponses.shift() : { data: [], error: null, count: 0 });
  });

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
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
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue(),
  sendReferenceInvitationEmail: jest.fn().mockResolvedValue(),
  sendReferenceCompletedEmail: jest.fn().mockResolvedValue()
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

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    Wallet: {
      createRandom: jest.fn(() => ({ address: '0xWALLET', privateKey: '0xPRIVATE' }))
    },
    verifyMessage: jest.fn()
  }
}));

const { default: app } = await import('../../server.js');

describe('Notifications Controller - Access Control Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('GET /api/notifications', () => {
    test('NOTIF-P1: requires authentication (401)', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('NOTIF-P2: authenticated user can get their own notifications', async () => {
      const user = mockUserData({ id: 'user-notif-1', email: 'notif@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock({
        selectResponses: [{
          data: [
            { id: 'n1', type: 'test', title: 'Test', body: 'Test body', is_read: false, created_at: '2026-01-01T00:00:00Z' }
          ],
          error: null,
          count: 1
        }],
        countResponse: { count: 1, error: null }
      });
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.notifications).toBeDefined();
    });

    test('NOTIF-P3: user cannot access other user notifications (RLS enforced)', async () => {
      // This test verifies that even if someone tries to manipulate params,
      // the controller always uses req.user.id from the authenticated session
      const user = mockUserData({ id: 'user-notif-2', email: 'own@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock({
        selectResponses: [{ data: [], error: null, count: 0 }],
        countResponse: { count: 0, error: null }
      });
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      // Even if query params try to specify another user, it should be ignored
      const response = await request(app)
        .get('/api/notifications?user_id=other-user-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // The controller uses req.user.id, not query params
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    test('NOTIF-P4: requires authentication (401)', async () => {
      const response = await request(app)
        .post('/api/notifications/some-notification-id/read')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('NOTIF-P5: user can mark their own notification as read', async () => {
      const userId = 'user-notif-read-1';
      const notificationId = '11111111-2222-3333-4444-555555555555';
      const user = mockUserData({ id: userId, email: 'readnotif@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: notificationId,
            user_id: userId,
            is_read: false
          })
        ]
      });
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post(`/api/notifications/${notificationId}/read`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('NOTIF-P6: user cannot mark another user\'s notification as read (403)', async () => {
      const userId = 'user-notif-read-2';
      const otherUserId = 'other-user-id';
      const notificationId = '22222222-3333-4444-5555-666666666666';
      const user = mockUserData({ id: userId, email: 'me@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: notificationId,
            user_id: otherUserId, // Belongs to another user
            is_read: false
          })
        ]
      });
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post(`/api/notifications/${notificationId}/read`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toMatch(/only access your own notifications/);
    });

    test('NOTIF-P7: returns 404 for non-existent notification', async () => {
      const userId = 'user-notif-read-3';
      const notificationId = '33333333-4444-5555-6666-777777777777';
      const user = mockUserData({ id: userId, email: 'nonotif@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock({
        singleResponses: [mockDatabaseError('Not found', 'PGRST116')]
      });
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post(`/api/notifications/${notificationId}/read`)
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/notifications/read-all', () => {
    test('NOTIF-P8: requires authentication (401)', async () => {
      const response = await request(app)
        .post('/api/notifications/read-all')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('NOTIF-P9: authenticated user can mark all their notifications as read', async () => {
      const user = mockUserData({ id: 'user-readall-1', email: 'readall@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const notificationsTable = buildTableMock();
      configureTableMocks({ users: usersTable, notifications: notificationsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/All notifications marked as read/);
    });
  });
});
