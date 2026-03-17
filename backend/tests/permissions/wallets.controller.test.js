/**
 * Wallets Controller - Permission Tests
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

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();
const mockCreateClient = jest.fn(() => mockSupabaseClient);
const mockVerifyMessage = jest.fn();

function buildTableMock({
  listResponses = [],
  singleResponses = [],
  maybeSingleResponses = [],
  updateResponse = { error: null }
} = {}) {
  let lastWrite = null;

  const builder = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn()
  };

  builder.select.mockReturnValue(builder);

  builder.insert.mockImplementation(() => {
    lastWrite = 'insert';
    return builder;
  });

  builder.update.mockImplementation(() => {
    lastWrite = 'update';
    return builder;
  });

  builder.delete.mockImplementation(() => {
    lastWrite = 'delete';
    return builder;
  });

  builder.eq.mockImplementation(() => {
    if (lastWrite === 'update') {
      lastWrite = null;
      return Promise.resolve(updateResponse);
    }
    return builder;
  });

  builder.order.mockImplementation(() => builder);

  builder.range.mockImplementation(() =>
    Promise.resolve(
      listResponses.length
        ? listResponses.shift()
        : { data: [], error: null }
    )
  );

  builder.single.mockImplementation(() =>
    Promise.resolve(
      singleResponses.length
        ? singleResponses.shift()
        : mockDatabaseSuccess({})
    )
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(
      maybeSingleResponses.length
        ? maybeSingleResponses.shift()
        : { data: null, error: null }
    )
  );

  return builder;
}

function configureTableMocks(tableMocks) {
  mockSupabaseClient.from.mockImplementation(
    (table) => tableMocks[table] || mockQueryBuilder
  );
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: mockCreateClient
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

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    Wallet: {
      createRandom: jest.fn(() => ({
        address: '0xWALLET',
        privateKey: '0xPRIVATE'
      }))
    },
    verifyMessage: mockVerifyMessage
  }
}));

const { default: app } = await import('../../server.js');

describe('Wallets Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCreateClient.mockImplementation(() => mockSupabaseClient);
    mockVerifyMessage.mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');

    mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: new Error('No auth token')
    });

    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/wallets/connect', () => {
    test('WALLET-P1: requires authentication (401)', async () => {
      const response = await request(app)
        .post('/api/wallets/connect')
        .send({ address: '0x123' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('WALLET-P2: authenticated user can connect coinbase smart wallet', async () => {
      const user = mockUserData({ id: 'wallet-user-1' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)],
        updateResponse: { error: null }
      });

      const walletsTable = buildTableMock({
        maybeSingleResponses: [
          { data: null, error: null }, // existing wallet by user_id
          { data: null, error: null } // address already in use
        ],
        singleResponses: [
          mockDatabaseSuccess({
            id: 'wallet1',
            user_id: user.id,
            address: '0x1234567890abcdef1234567890abcdef12345678',
            provider: 'coinbase_smart_wallet',
            chain: 'base',
            created_at: '2026-01-01T00:00:00Z'
          })
        ]
      });

      configureTableMocks({
        users: usersTable,
        wallets: walletsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id)
      );

      const response = await request(app)
        .post('/api/wallets/connect')
        .set('Authorization', 'Bearer valid-token')
        .send({
          provider: 'coinbase_smart_wallet',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'base'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test('WALLET-P3: external wallet without signature is rejected', async () => {
      const user = mockUserData({ id: 'wallet-user-2' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const walletsTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }]
      });

      configureTableMocks({
        users: usersTable,
        wallets: walletsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id)
      );

      const response = await request(app)
        .post('/api/wallets/connect')
        .set('Authorization', 'Bearer valid-token')
        .send({
          provider: 'external',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'base'
          // intentionally missing signed_message and signature
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test('WALLET-P4: rejects if user already has connected wallet (409)', async () => {
      const user = mockUserData({ id: 'wallet-user-3' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const walletsTable = buildTableMock({
        maybeSingleResponses: [
          mockDatabaseSuccess({
            id: 'wallet-existing',
            user_id: user.id,
            address: '0x9999999999999999999999999999999999999999'
          })
        ]
      });

      configureTableMocks({
        users: usersTable,
        wallets: walletsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id)
      );

      const response = await request(app)
        .post('/api/wallets/connect')
        .set('Authorization', 'Bearer valid-token')
        .send({
          provider: 'coinbase_smart_wallet',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'base'
        })
        .expect(409);

      expect(response.body.error).toBe('WALLET_EXISTS');
    });
  });

  describe('GET /api/wallets/me', () => {
    test('WALLET-P5: requires authentication (401)', async () => {
      const response = await request(app)
        .get('/api/wallets/me')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('WALLET-P6: authenticated user can get their own wallet', async () => {
      const user = mockUserData({ id: 'wallet-user-4' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const walletsTable = buildTableMock({
        maybeSingleResponses: [
          mockDatabaseSuccess({
            id: 'wallet-me',
            user_id: user.id,
            address: '0x1234567890abcdef1234567890abcdef12345678',
            provider: 'coinbase_smart_wallet',
            chain: 'base',
            created_at: '2026-01-01T00:00:00Z'
          })
        ]
      });

      configureTableMocks({
        users: usersTable,
        wallets: walletsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id)
      );

      const response = await request(app)
        .get('/api/wallets/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet).toBeDefined();
    });

    test('WALLET-P7: returns 404 if user has no wallet', async () => {
      const user = mockUserData({ id: 'wallet-user-5' });

      const usersTable = buildTableMock({
        singleResponses: [mockDatabaseSuccess(user)]
      });

      const walletsTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }]
      });

      configureTableMocks({
        users: usersTable,
        wallets: walletsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(
        mockAuthGetUserSuccess(user.id)
      );

      const response = await request(app)
        .get('/api/wallets/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('WALLET_NOT_FOUND');
    });
  });
});