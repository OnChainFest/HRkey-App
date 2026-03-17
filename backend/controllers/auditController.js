/**
 * Audit Log Controller - Permission Tests (PERM-A1..PERM-A8)
 * Direct controller tests with explicit Supabase chain mocks.
 */

import { jest } from '@jest/globals';
import {
  createMockSupabaseClient,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();

const mockGetAllAuditLogs = jest.fn();
const mockGetUserAuditLogs = jest.fn();
const mockGetCompanyAuditLogs = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

let supabaseClient;

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  if (process.env.NODE_ENV === 'test') {
    return createClient(supabaseUrl, supabaseServiceKey);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }

  return supabaseClient;
}

function createFallbackLogger() {
  return {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {}
  };
}

function getReqLogger(req) {
  try {
    if (logger && typeof logger.withRequest === 'function') {
      const contextualLogger = logger.withRequest(req);
      if (
        contextualLogger &&
        typeof contextualLogger.error === 'function' &&
        typeof contextualLogger.warn === 'function'
      ) {
        return contextualLogger;
      }
    }

    if (
      logger &&
      typeof logger.error === 'function' &&
      typeof logger.warn === 'function'
    ) {
      return logger;
    }

    return createFallbackLogger();
  } catch {
    return createFallbackLogger();
  }
}

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
export async function getAuditLogs(req, res) {
  try {
    const client = getSupabaseClient();

    const {
      userId,
      companyId,
      actionType,
      limit = 50,
      offset = 0
    } = req.query;

    const parsedLimit = Math.min(Number.parseInt(limit, 10) || 50, 100);
    const parsedOffset = Number.parseInt(offset, 10) || 0;
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin) {
      if (userId && userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only view your own audit logs'
        });
      }

      if (companyId) {
        const signerResult = await client
          .from('company_signers')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', req.user.id)
          .eq('is_active', true)
          .single();

        const signer = signerResult?.data || null;
        const signerError = signerResult?.error || null;

        if (signerError || !signer) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'You must be a signer of this company to view its audit logs'
          });
        }

        const logs = await getCompanyAuditLogs(companyId, parsedLimit, parsedOffset);

        return res.json({
          success: true,
          logs: Array.isArray(logs) ? logs : [],
          total: Array.isArray(logs) ? logs.length : 0,
          limit: parsedLimit,
          offset: parsedOffset
        });
      }

      const effectiveUserId = userId || req.user.id;
      const logs = await getUserAuditLogs(effectiveUserId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    if (companyId && !userId) {
      const logs = await getCompanyAuditLogs(companyId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    if (userId && !companyId) {
      const logs = await getUserAuditLogs(userId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    const filters = {};
    if (userId) filters.userId = userId;
    if (companyId) filters.companyId = companyId;
    if (actionType) filters.actionType = actionType;

    const result = await getAllAuditLogs(filters, parsedLimit, parsedOffset);

    return res.json({
      success: true,
      logs: Array.isArray(result?.logs) ? result.logs : [],
      total:
        typeof result?.total === 'number'
          ? result.total
          : Array.isArray(result?.logs)
            ? result.logs.length
            : 0,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get audit logs', {
      userId: req.user?.id,
      queryUserId: req.query?.userId,
      queryCompanyId: req.query?.companyId,
      error: error?.message,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An error occurred while fetching audit logs'
    });
  }
}

/**
 * For controller path:
 * await client.from('company_signers').select(...).eq(...).eq(...)
 * The second eq resolves the final payload.
 */
function makeCompanySignerListBuilder({ data = [], error = null } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn()
  };

  builder.eq
    .mockImplementationOnce(() => builder)
    .mockImplementationOnce(() => Promise.resolve({ data, error }));

  return builder;
}

/**
 * For controller path:
 * client.from('audit_logs').select(...).in(...).order(...).limit(10)
 */
export async function getRecentActivity(req, res) {
  try {
    const client = getSupabaseClient();
    const userId = req.user.id;

    const signerResult = await client
      .from('company_signers')
      .select('company_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    const signerRecords = signerResult?.data || [];
    const signerError = signerResult?.error || null;

    if (signerError) {
      const reqLogger = getReqLogger(req);
      reqLogger.error('Failed to fetch signer records for recent activity', {
        userId: req.user?.id,
        error: signerError?.message,
        stack: signerError?.stack
      });

      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!Array.isArray(signerRecords) || signerRecords.length === 0) {
      return res.json({
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

    const companyIds = signerRecords
      .map((record) => record.company_id)
      .filter(Boolean);

    if (companyIds.length === 0) {
      return res.json({
        success: true,
        activity: []
      });
    }

    const logsResult = await client
      .from('audit_logs')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
      .limit(10);

    const logs = logsResult?.data || [];
    const logsError = logsResult?.error || null;

    if (logsError) {
      const reqLogger = getReqLogger(req);
      reqLogger.error('Failed to fetch recent activity', {
        userId: req.user?.id,
        companyIds,
        error: logsError?.message,
        stack: logsError?.stack
      });

      return res.status(500).json({
        success: false,
        error: 'Database error'
      });

    return res.json({
      success: true,
      activity: Array.isArray(logs) ? logs : []
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get recent activity', {
      userId: req.user?.id,
      error: error?.message,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
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
