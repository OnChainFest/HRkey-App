/**
 * Company Controller - Permission Tests
 * Focuses on authentication, signer authorization, superadmin authorization,
 * and validation/error handling for company endpoints.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

let currentAuthUser = null;

function setCurrentAuthUser(user) {
  currentAuthUser = user;
}

function buildTableMock({
  singleResponses = [],
  maybeSingleResponses = [],
  orderResponse = null,
  selectResponse = null,
  rangeResponse = null,
  limitResponse = null
} = {}) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  };

  builder.single.mockImplementation(() =>
    Promise.resolve(
      singleResponses.length ? singleResponses.shift() : mockDatabaseSuccess({})
    )
  );

  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve(
      maybeSingleResponses.length
        ? maybeSingleResponses.shift()
        : { data: null, error: null }
    )
  );

  if (selectResponse) {
    builder.select.mockImplementation(() => Promise.resolve(selectResponse));
  }

  if (orderResponse) {
    builder.order.mockImplementation(() => Promise.resolve(orderResponse));
  }

  if (rangeResponse) {
    builder.range.mockImplementation(() => Promise.resolve(rangeResponse));
  }

  if (limitResponse) {
    builder.limit.mockImplementation(() => Promise.resolve(limitResponse));
  }

  return builder;
}

function buildFlexibleEntityTable(entity) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(mockDatabaseSuccess(Array.isArray(entity) ? entity : [entity])),
    range: jest.fn().mockResolvedValue(mockDatabaseSuccess(Array.isArray(entity) ? entity : [entity])),
    limit: jest.fn().mockResolvedValue(mockDatabaseSuccess(Array.isArray(entity) ? entity : [entity])),
    single: jest.fn().mockResolvedValue(mockDatabaseSuccess(entity)),
    maybeSingle: jest.fn().mockResolvedValue(mockDatabaseSuccess(entity))
  };
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
  auditMiddleware: () => (req, _res, next) => next()
}));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide an authorization token'
      });
    }

    if (!currentAuthUser) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
    }

    req.user = currentAuthUser;
    return next();
  },

  requireSuperadmin: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Superadmin access required'
      });
    }

    return next();
  },

  requireAdmin: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }

    return next();
  },

  requireCompanySigner: async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    const companyId = req.params.companyId;

    const { data: signer, error } = await mockSupabaseClient
      .from('company_signers')
      .select('id, role, is_active, company_id, user_id, created_at')
      .eq('company_id', companyId)
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !signer) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
    }

    req.signer = signer;
    return next();
  },

  requireAnySigner: async (_req, _res, next) => next(),
  requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
  requireWalletLinked: () => (_req, _res, next) => next(),
  requireOwnWallet: () => (_req, _res, next) => next(),
  optionalAuth: (req, _res, next) => {
    req.user = currentAuthUser;
    return next();
  }
}));

const { default: app } = await import('../../server.js');

describe('Company Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCurrentAuthUser(null);
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/company/create (createCompany)', () => {
    test('allows authenticated user to create a company', async () => {
      const authedUser = mockUserData({
        id: 'user-1',
        email: 'user1@test.com',
        role: 'user'
      });
      setCurrentAuthUser(authedUser);

      const companiesTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: 'company-1',
            name: 'Test Company',
            verified: false
          })
        ]
      });

      const signersTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: 'signer-1',
            company_id: 'company-1',
            user_id: authedUser.id,
            is_active: true
          })
        ]
      });

      configureTableMocks({
        companies: companiesTable,
        company_signers: signersTable
      });

      const response = await request(app)
        .post('/api/company/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Test Company' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('rejects unauthenticated creation attempt', async () => {
      const response = await request(app)
        .post('/api/company/create')
        .send({ name: 'Test Company' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('GET /api/company/:companyId (getCompany)', () => {
    test('allows active signer to view company details', async () => {
      const companyId = 'company-1';

      const authedUser = mockUserData({
        id: 'user-2',
        email: 'user2@test.com',
        role: 'user'
      });
      setCurrentAuthUser(authedUser);

      const signerRecord = {
        id: 'signer-1',
        company_id: companyId,
        user_id: authedUser.id,
        is_active: true,
        role: 'admin'
      };

      const companyRecord = {
        id: companyId,
        name: 'Acme Corp',
        verified: false,
        created_at: '2024-01-01T00:00:00Z'
      };

      const signersTable = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue(mockDatabaseSuccess([signerRecord])),
        range: jest.fn().mockResolvedValue(mockDatabaseSuccess([signerRecord])),
        limit: jest.fn().mockResolvedValue(mockDatabaseSuccess([signerRecord])),
        single: jest.fn().mockResolvedValue(mockDatabaseSuccess(signerRecord)),
        maybeSingle: jest.fn().mockResolvedValue(mockDatabaseSuccess(signerRecord))
      };

      const companiesTable = buildFlexibleEntityTable(companyRecord);

      const usersTable = buildFlexibleEntityTable({
        id: authedUser.id,
        email: authedUser.email,
        full_name: 'User Two'
      });

      configureTableMocks({
        company_signers: signersTable,
        companies: companiesTable,
        users: usersTable
      });

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.company.id).toBe(companyId);
    });

    test('rejects non-signer attempting to view another company', async () => {
      const companyId = 'company-2';

      const authedUser = mockUserData({
        id: 'user-3',
        email: 'user3@test.com',
        role: 'user'
      });
      setCurrentAuthUser(authedUser);

      const signersTable = buildTableMock({
        maybeSingleResponses: [{ data: null, error: null }]
      });

      configureTableMocks({
        company_signers: signersTable
      });

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('PATCH /api/company/:companyId (updateCompany)', () => {
    test('rejects unauthenticated update attempt', async () => {
      const response = await request(app)
        .patch('/api/company/company-1')
        .send({ name: 'Updated Co' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('rejects updates with no provided fields', async () => {
      const superadmin = mockUserData({
        id: 'admin-1',
        email: 'admin@test.com',
        role: 'superadmin'
      });
      setCurrentAuthUser(superadmin);

      await request(app)
        .patch('/api/company/company-1')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);
    });

    test('allows superadmin to update any company', async () => {
      const superadmin = mockUserData({
        id: 'admin-2',
        email: 'admin2@test.com',
        role: 'superadmin'
      });
      setCurrentAuthUser(superadmin);

      const companiesTable = buildTableMock({
        singleResponses: [
          mockDatabaseSuccess({
            id: 'company-1',
            name: 'Updated Co',
            verified: false
          })
        ]
      });

      configureTableMocks({
        companies: companiesTable
      });

      await request(app)
        .patch('/api/company/company-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Co' })
        .expect(200);
    });
  });

  describe('POST /api/company/:companyId/verify (verifyCompany)', () => {
    test('rejects unauthenticated verification attempt', async () => {
      const response = await request(app)
        .post('/api/company/company-1/verify')
        .send({ verified: true })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('requires superadmin role to verify company', async () => {
      const regularUser = mockUserData({
        id: 'user-5',
        email: 'user5@test.com',
        role: 'user'
      });
      setCurrentAuthUser(regularUser);

      const response = await request(app)
        .post('/api/company/company-1/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ verified: true })
        .expect(403);

      expect(response.body.message).toBe('Superadmin access required');
    });

    test('returns 400 when verified flag missing or invalid', async () => {
      const superadmin = mockUserData({
        id: 'admin-3',
        email: 'admin3@test.com',
        role: 'superadmin'
      });
      setCurrentAuthUser(superadmin);

      const response = await request(app)
        .post('/api/company/company-1/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ notes: 'No flag provided' })
        .expect(400);

      expect(response.body.error).toBe('Invalid request');
    });
  });
});