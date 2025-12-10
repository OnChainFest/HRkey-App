/**
 * KPI Observations Controller Permission Tests (PERM-K1..PERM-K5)
 * Focuses on authentication, payload validation, and data visibility.
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

function buildTableMock({ singleResponses = [], maybeSingleResponses = [], rangeResponse = null, selectResponse = null } = {}) {
  const builder = {
    select: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({}))
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(maybeSingleResponses.length ? maybeSingleResponses.shift() : { data: null, error: null })
  );

  builder.select.mockImplementation(() => (selectResponse ? Promise.resolve(selectResponse) : builder));
  builder.range.mockImplementation(() => (rangeResponse ? Promise.resolve(rangeResponse) : builder));
  builder.limit.mockImplementation(() => (rangeResponse ? Promise.resolve(rangeResponse) : builder));

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
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('KPI Observations Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/kpi-observations', () => {
    test('PERM-K1: authenticated user can create KPI observation', async () => {
      const user = mockUserData({ id: 'kpi-user-1', email: 'kpi1@example.com' });
      const inserted = [{ id: 'obs-1', kpi_name: 'quality', rating_value: 5 }];

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const maybeUserLookup = buildTableMock({ maybeSingleResponses: [{ data: null, error: null }] });
      const observationsTable = buildTableMock({ selectResponse: mockDatabaseSuccess(inserted) });
      observationsTable.insert.mockReturnThis();
      observationsTable.select.mockResolvedValue(mockDatabaseSuccess(inserted));

      configureTableMocks({
        users: usersTable,
        kpi_observations: observationsTable
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));
      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'users') return usersTable;
        if (table === 'kpi_observations') return observationsTable;
        return maybeUserLookup;
      });

      const response = await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          subject_wallet: '0xsub',
          observer_wallet: '0xobs',
          role_id: 'role-1',
          observations: [{ kpi_name: 'quality', rating_value: 5 }]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.inserted).toBe(inserted.length);
    });

    test('PERM-K2: unauthenticated creation returns 401', async () => {
      await request(app)
        .post('/api/kpi-observations')
        .send({ kpi_name: 'quality', rating_value: 5 })
        .expect(401);
    });

    test('PERM-K3: invalid KPI payload returns 400', async () => {
      const user = mockUserData({ id: 'kpi-user-2' });
      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      configureTableMocks({ users: usersTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      await request(app)
        .post('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/kpi-observations', () => {
    test('PERM-K4: authenticated user can query observations', async () => {
      const user = mockUserData({ id: 'kpi-user-3' });
      const observations = [
        { id: 'obs-1', kpi_name: 'deployment_frequency', rating_value: 4 },
        { id: 'obs-2', kpi_name: 'code_quality', rating_value: 5 }
      ];

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const observationsTable = buildTableMock({
        rangeResponse: { data: observations, error: null, count: observations.length }
      });

      configureTableMocks({ users: usersTable, kpi_observations: observationsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
    });

    test('PERM-K5: observations are global (no user isolation enforced)', async () => {
      const user = mockUserData({ id: 'kpi-user-4' });
      const observations = [
        { id: 'obs-a', subject_wallet: 'wallet-user-a', kpi_name: 'quality', rating_value: 5 },
        { id: 'obs-b', subject_wallet: 'wallet-user-b', kpi_name: 'delivery', rating_value: 3 }
      ];

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const observationsTable = buildTableMock({
        rangeResponse: { data: observations, error: null, count: observations.length }
      });

      configureTableMocks({ users: usersTable, kpi_observations: observationsTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/kpi-observations')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Controller currently returns global observations without user filtering; this test documents that behavior.
      expect(response.body.observations).toHaveLength(2);
      expect(response.body.observations.find((o) => o.subject_wallet === 'wallet-user-b')).toBeTruthy();
    });
  });

  describe('GET /api/kpi-observations/summary', () => {
    test('PERM-K4 (summary extension): authenticated user can query KPI summary', async () => {
      const user = mockUserData({ id: 'kpi-user-5' });
      const summary = [
        { subject_wallet: 'wallet-user-a', kpi_name: 'quality', observation_count: 2, avg_rating: 4.5 }
      ];

      const usersTable = buildTableMock({ singleResponses: [mockDatabaseSuccess(user)] });
      const summaryTable = buildTableMock({
        rangeResponse: { data: summary, error: null, count: summary.length }
      });

      configureTableMocks({ users: usersTable, kpi_observations_summary: summaryTable });
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(user.id, user.email));

      const response = await request(app)
        .get('/api/kpi-observations/summary')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary).toHaveLength(1);
    });
  });
});
