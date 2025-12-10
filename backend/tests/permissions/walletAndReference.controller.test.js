/**
 * Wallet & Reference Controller Permission Tests (PERM-L1..PERM-L7)
 * Documents permission enforcement and known gaps.
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
mockSupabaseClient.auth.admin = {
  getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'requester@example.com' } }, error: null })
};
const mockQueryBuilder = mockSupabaseClient.from();
const mockCreateRandom = jest.fn(() => ({ address: '0xWALLET', privateKey: '0xPRIVATE' }));

function buildTableMock({ singleResponses = [], maybeSingleResponses = [] } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn()
  };

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

jest.unstable_mockModule('../../middleware/validate.js', () => ({
  validateBody: () => (req, res, next) => next(),
  validateParams: () => (req, res, next) => next(),
  validateQuery: () => (req, res, next) => next()
}));

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    Wallet: {
      createRandom: mockCreateRandom
    }
  }
}));

const { default: app } = await import('../../server.js');

describe('Wallet & Reference - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRandom.mockReturnValue({ address: '0xWALLET', privateKey: '0xPRIVATE' });
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) }));
    mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: 'requester@example.com' } }, error: null });
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/wallet/create', () => {
    test('PERM-L1: allows user to create wallet for themselves', async () => {
      const user = mockUserData({ id: '660e8400-e29b-41d4-a716-446655440000', email: 'owner@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const userWalletsTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }],
        singleResponses: [mockDatabaseSuccess({ address: '0xWALLET' })]
      });
      const userPlansTable = buildTableMock();
      configureTableMocks({ users: usersTable, user_wallets: userWalletsTable, user_plans: userPlansTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: user.id, email: user.email });

      // Debug any unexpected failures
      if (response.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('Wallet create response', response.status, response.body);
      }

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.address).toBe('0xWALLET');
    });

    test('PERM-L2: rejects attempt to create wallet for another user (403)', async () => {
      const user = mockUserData({ id: '660e8400-e29b-41d4-a716-446655440001', email: 'owner2@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: '660e8400-e29b-41d4-a716-446655440999', email: 'other@example.com' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-L3: rejects unauthenticated wallet creation (401)', async () => {
      const response = await request(app)
        .post('/api/wallet/create')
        .send({ userId: 'user-no-auth' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('GET /api/wallet/:userId', () => {
    test('PERM-L4a: unauthenticated access is rejected with 401', async () => {
      const response = await request(app)
        .get('/api/wallet/660e8400-e29b-41d4-a716-446655440123')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('PERM-L4b: authenticated user cannot read another user\'s wallet (403)', async () => {
      const authedUser = mockUserData({ id: 'user-owner-1', email: 'owner@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(authedUser)] });
      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(authedUser.id, authedUser.email));

      const response = await request(app)
        .get('/api/wallet/other-user-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toMatch(/view your own wallet/);
    });

    test('PERM-L4c: authenticated user can read their own wallet', async () => {
      const authedUser = mockUserData({ id: 'user-self-1', email: 'self@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(authedUser)] });
      const userWalletsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ address: '0xSELF' })] });
      configureTableMocks({ users: usersTable, user_wallets: userWalletsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(authedUser.id, authedUser.email));

      const response = await request(app)
        .get(`/api/wallet/${authedUser.id}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.address).toBe('0xSELF');
    });

    test('PERM-L4d: superadmin can read another user\'s wallet', async () => {
      const authedUser = mockUserData({ id: 'superadmin-1', email: 'super@example.com', role: 'superadmin' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(authedUser)] });
      const userWalletsTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ address: '0xADMIN' })] });
      configureTableMocks({ users: usersTable, user_wallets: userWalletsTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(authedUser.id, authedUser.email));

      const response = await request(app)
        .get('/api/wallet/target-user-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.address).toBe('0xADMIN');
    });
  });

  describe('POST /api/reference/request', () => {
    test('PERM-L5: user can request reference for themselves', async () => {
      const user = mockUserData({ id: '660e8400-e29b-41d4-a716-446655440010', email: 'self@example.com' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const invitesTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ id: 'ref-invite-1', token: 'token123' })] });
      configureTableMocks({ users: usersTable, reference_invites: invitesTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: user.id, email: 'referee@example.com', name: 'Ref User' });

      if (response.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('Reference request response', response.status, response.body);
      }

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
    });

    test('PERM-L6: user cannot request reference for another user (403)', async () => {
      const user = mockUserData({ id: '660e8400-e29b-41d4-a716-446655440020' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .post('/api/reference/request')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: '660e8400-e29b-41d4-a716-446655440999', email: 'referee@example.com', name: 'Ref User' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('POST /api/reference/submit', () => {
    test('PERM-L7: public can submit reference with a valid token', async () => {
      const invitesTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: 'invite-1',
            requester_id: '660e8400-e29b-41d4-a716-446655440010',
            referee_email: 'ref@example.com',
            referee_name: 'Referee',
            metadata: {},
            status: 'pending',
            expires_at: '2099-01-01T00:00:00Z'
          })
        ]
      });
      const referencesTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ id: 'reference-1' })] });
      configureTableMocks({ reference_invites: invitesTable, references: referencesTable });

      const response = await request(app)
        .post('/api/reference/submit')
        .send({ token: 'a'.repeat(32), ratings: { professionalism: 5 }, comments: { recommendation: 'Great' } });

      if (response.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('Reference submit response', response.status, response.body, response.text);
      }

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/reference/by-token/:token', () => {
    test('PERM-L8: invalid or non-existent token returns 400 with error', async () => {
      const invitesTable = buildTableMock({ singleResponses: [mockDatabaseError('Invalid invitation token')] });
      configureTableMocks({ reference_invites: invitesTable });

      const response = await request(app)
        .get('/api/reference/by-token/bad-token')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/Invalid invitation token/i);
    });
  });
});
