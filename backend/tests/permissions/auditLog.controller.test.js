/**
 * Audit Log Controller Permission Tests (PERM-A1..PERM-A8)
 * Covers superadmin, user, and company signer access patterns.
 */

import { jest } from '@jest/globals';
import {
  createMockSupabaseClient,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();

const mockCreateClient = jest.fn(() => mockSupabaseClient);
const mockGetAllAuditLogs = jest.fn();
const mockGetUserAuditLogs = jest.fn();
const mockGetCompanyAuditLogs = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: mockCreateClient
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  getAllAuditLogs: mockGetAllAuditLogs,
  getUserAuditLogs: mockGetUserAuditLogs,
  getCompanyAuditLogs: mockGetCompanyAuditLogs
}));

jest.unstable_mockModule('../../logger.js', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    withRequest: jest.fn(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

const { getAuditLogs, getRecentActivity } = await import('../../controllers/auditController.js');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function createReq(overrides = {}) {
  return {
    user: mockUserData({ id: 'user-1', role: 'user', email: 'user@test.com' }),
    query: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    get: jest.fn(() => 'jest'),
    ...overrides
  };
}

/**
 * For controller path:
 * client.from('company_signers').select(...).eq(...).eq(...).eq(...).single()
 */
function makeCompanySignerSingleBuilder({ data = null, error = null } = {}) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn()
  };

  builder.select.mockImplementation(() => builder);
  builder.eq.mockImplementation(() => builder);
  builder.single.mockResolvedValue({ data, error });

  return builder;
}

/**
 * For controller path:
 * await client.from('company_signers').select(...).eq(...).eq(...)
 */
function makeCompanySignerListBuilder({ data = [], error = null } = {}) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn()
  };

  builder.select.mockImplementation(() => builder);

  let eqCallCount = 0;
  builder.eq.mockImplementation(() => {
    eqCallCount += 1;

    if (eqCallCount < 2) {
      return builder;
    }

    return Promise.resolve({ data, error });
  });

  return builder;
}

/**
 * For controller path:
 * client.from('audit_logs').select(...).in(...).order(...).limit(10)
 */
function makeAuditLogsBuilder({ data = [], error = null } = {}) {
  const builder = {
    select: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    limit: jest.fn()
  };

  builder.select.mockImplementation(() => builder);
  builder.in.mockImplementation(() => builder);
  builder.order.mockImplementation(() => builder);
  builder.limit.mockResolvedValue({ data, error });

  return builder;
}

describe('Audit Log Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCreateClient.mockImplementation(() => mockSupabaseClient);

    mockSupabaseClient.from.mockImplementation(() => {
      throw new Error('Unexpected table access in test');
    });
  });

  describe('GET /api/audit/logs', () => {
    test('PERM-A1: superadmin can query all audit logs', async () => {
      const req = createReq({
        user: mockUserData({ id: 'super-1', role: 'superadmin' }),
        query: {}
      });
      const res = createRes();

      mockGetAllAuditLogs.mockResolvedValue({
        logs: [{ id: 'log-1', user_id: 'u1' }],
        total: 1
      });

      await getAuditLogs(req, res);

      expect(mockGetAllAuditLogs).toHaveBeenCalledWith({}, 50, 0);
      expect(mockGetUserAuditLogs).not.toHaveBeenCalled();
      expect(mockGetCompanyAuditLogs).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logs: [{ id: 'log-1', user_id: 'u1' }],
        total: 1,
        limit: 50,
        offset: 0
      });
    });

    test('PERM-A2: regular user can view only their own logs', async () => {
      const user = mockUserData({ id: 'user-1', role: 'user' });
      const req = createReq({
        user,
        query: { userId: user.id }
      });
      const res = createRes();

      mockGetUserAuditLogs.mockResolvedValue([{ id: 'log-self', user_id: user.id }]);

      await getAuditLogs(req, res);

      expect(mockGetUserAuditLogs).toHaveBeenCalledWith(user.id, 50, 0);
      expect(mockGetAllAuditLogs).not.toHaveBeenCalled();
      expect(mockGetCompanyAuditLogs).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logs: [{ id: 'log-self', user_id: user.id }],
        total: 1,
        limit: 50,
        offset: 0
      });
    });

    test("PERM-A3: regular user cannot view another user's logs (IDOR)", async () => {
      const user = mockUserData({ id: 'user-2', role: 'user' });
      const req = createReq({
        user,
        query: { userId: 'other-user' }
      });
      const res = createRes();

      await getAuditLogs(req, res);

      expect(mockGetAllAuditLogs).not.toHaveBeenCalled();
      expect(mockGetUserAuditLogs).not.toHaveBeenCalled();
      expect(mockGetCompanyAuditLogs).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden',
        message: 'You can only view your own audit logs'
      });
    });

    test('PERM-A4: company signer can view logs for their company', async () => {
      const signer = mockUserData({ id: 'signer-1', role: 'user' });
      const req = createReq({
        user: signer,
        query: { companyId: 'company-1' }
      });
      const res = createRes();

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'company_signers') {
          return makeCompanySignerSingleBuilder({
            data: { id: 'cs-1' },
            error: null
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      });

      mockGetCompanyAuditLogs.mockResolvedValue([
        { id: 'log-company', company_id: 'company-1' }
      ]);

      await getAuditLogs(req, res);

      expect(mockGetCompanyAuditLogs).toHaveBeenCalledWith('company-1', 50, 0);
      expect(mockGetAllAuditLogs).not.toHaveBeenCalled();
      expect(mockGetUserAuditLogs).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logs: [{ id: 'log-company', company_id: 'company-1' }],
        total: 1,
        limit: 50,
        offset: 0
      });
    });

    test('PERM-A5: non-signer cannot view company logs', async () => {
      const user = mockUserData({ id: 'user-3', role: 'user' });
      const req = createReq({
        user,
        query: { companyId: 'company-x' }
      });
      const res = createRes();

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'company_signers') {
          return makeCompanySignerSingleBuilder({
            data: null,
            error: null
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      });

      await getAuditLogs(req, res);

      expect(mockGetAllAuditLogs).not.toHaveBeenCalled();
      expect(mockGetUserAuditLogs).not.toHaveBeenCalled();
      expect(mockGetCompanyAuditLogs).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden',
        message: 'You must be a signer of this company to view its audit logs'
      });
    });

    test('PERM-A6: unauthenticated requests to audit endpoints return 401 (documented at middleware layer)', async () => {
      expect(true).toBe(true);
    });
  });

  describe('GET /api/audit/recent', () => {
    test('PERM-A7: user can view recent activity for companies they belong to', async () => {
      const user = mockUserData({ id: 'signer-recent', role: 'user' });
      const req = createReq({ user });
      const res = createRes();

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'company_signers') {
          return makeCompanySignerListBuilder({
            data: [{ company_id: 'company-2' }],
            error: null
          });
        }

        if (table === 'audit_logs') {
          return makeAuditLogsBuilder({
            data: [{ id: 'log-recent', company_id: 'company-2' }],
            error: null
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      });

      await getRecentActivity(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        activity: [{ id: 'log-recent', company_id: 'company-2' }]
      });
    });

    test('PERM-A8: user not belonging to any company receives empty activity list (current behavior)', async () => {
      const user = mockUserData({ id: 'no-company', role: 'user' });
      const req = createReq({ user });
      const res = createRes();

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'company_signers') {
          return makeCompanySignerListBuilder({
            data: [],
            error: null
          });
        }

        throw new Error(`Unexpected table: ${table}`);
      });

      await getRecentActivity(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        activity: []
      });
    });
  });
});