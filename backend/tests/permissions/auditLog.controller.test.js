/**
 * Audit Log Controller Permission Tests (PERM-A1..PERM-A8)
 * Covers superadmin, user, and company signer access patterns.
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

const mockGetAllAuditLogs = jest.fn();
const mockGetUserAuditLogs = jest.fn();
const mockGetCompanyAuditLogs = jest.fn();

function buildTableMock({ singleResponses = [] } = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
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
  logIdentityVerification: jest.fn().mockResolvedValue(),
  logCompanyCreation: jest.fn().mockResolvedValue(),
  logCompanyVerification: jest.fn().mockResolvedValue(),
  logSignerInvitation: jest.fn().mockResolvedValue(),
  logSignerAcceptance: jest.fn().mockResolvedValue(),
  logSignerStatusChange: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {},
  ResourceTypes: {},
  getUserAuditLogs: mockGetUserAuditLogs,
  getCompanyAuditLogs: mockGetCompanyAuditLogs,
  getAllAuditLogs: mockGetAllAuditLogs,
  getUserAuditLogsPaginated: mockGetUserAuditLogs,
  auditMiddleware: () => (req, res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('Audit Log Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('GET /api/audit/logs', () => {
    test('PERM-A1: superadmin can query all audit logs', async () => {
      const superadmin = mockUserData({ id: 'super-1', role: 'superadmin' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(superadmin)] });
      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(superadmin.id));
      mockGetAllAuditLogs.mockResolvedValue({ logs: [{ id: 'log-1', user_id: 'u1' }], total: 1 });

      const response = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.logs).toHaveLength(1);
      expect(mockGetAllAuditLogs).toHaveBeenCalled();
    });

    test('PERM-A2: regular user can view only their own logs', async () => {
      const user = mockUserData({ id: 'user-1', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));
      mockGetUserAuditLogs.mockResolvedValue([{ id: 'log-self', user_id: user.id }]);

      const response = await request(app)
        .get(`/api/audit/logs?userId=${user.id}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.logs[0].user_id).toBe(user.id);
      expect(mockGetUserAuditLogs).toHaveBeenCalledWith(user.id, expect.any(Number), expect.any(Number));
    });

    test('PERM-A3: regular user cannot view another user\'s logs (IDOR)', async () => {
      const user = mockUserData({ id: 'user-2', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/audit/logs?userId=other-user')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-A4: company signer can view logs for their company', async () => {
      const signer = mockUserData({ id: 'signer-1', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(signer)] });
      const companySignersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess({ id: 'cs-1' })] });
      configureTableMocks({ users: usersTable, company_signers: companySignersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(signer.id));
      mockGetCompanyAuditLogs.mockResolvedValue([{ id: 'log-company', company_id: 'company-1' }]);

      const response = await request(app)
        .get('/api/audit/logs?companyId=company-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.logs[0].company_id).toBe('company-1');
      expect(mockGetCompanyAuditLogs).toHaveBeenCalledWith('company-1', expect.any(Number), expect.any(Number));
    });

    test('PERM-A5: non-signer cannot view company logs', async () => {
      const user = mockUserData({ id: 'user-3', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const companySignersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(null)] });
      configureTableMocks({ users: usersTable, company_signers: companySignersTable });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/audit/logs?companyId=company-x')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-A6: unauthenticated requests to audit endpoints return 401', async () => {
      await request(app).get('/api/audit/logs').expect(401);
      await request(app).get('/api/audit/recent').expect(401);
    });
  });

  describe('GET /api/audit/recent', () => {
    test('PERM-A7: user can view recent activity for companies they belong to', async () => {
      const user = mockUserData({ id: 'signer-recent', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });

      let eqCall = 0;
      const companySignersTable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(() => {
          eqCall += 1;
          if (eqCall === 2) {
            return Promise.resolve({ data: [{ company_id: 'company-2' }], error: null });
          }
          return companySignersTable;
        })
      };

      const auditLogsTable = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ id: 'log-recent', company_id: 'company-2' }], error: null })
      };

      configureTableMocks({
        users: usersTable,
        company_signers: companySignersTable,
        audit_logs: auditLogsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/audit/recent')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.activity).toHaveLength(1);
      expect(response.body.activity[0].company_id).toBe('company-2');
    });

    test('PERM-A8: user not belonging to any company receives empty activity list (current behavior)', async () => {
      const user = mockUserData({ id: 'no-company', role: 'user' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      let eqCall = 0;
      const companySignersTable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(() => {
          eqCall += 1;
          if (eqCall === 2) {
            return Promise.resolve({ data: [], error: null });
          }
          return companySignersTable;
        })
      };

      configureTableMocks({ users: usersTable, company_signers: companySignersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id));

      const response = await request(app)
        .get('/api/audit/recent')
        .set('Authorization', 'Bearer valid-token')
        .expect(200); // Controller returns empty list rather than 403

      expect(response.body.success).toBe(true);
      expect(response.body.activity).toHaveLength(0);
    });
  });
});
