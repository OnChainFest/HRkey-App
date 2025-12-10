/**
 * Company Controller Permission Tests
 * Focuses on role-based behaviors and permission failures
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData,
  mockCompanySignerData
} from '../__mocks__/supabase.mock.js';

// Mock Supabase before importing the app
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
  AuditActionTypes: { UPDATE_COMPANY: 'UPDATE_COMPANY' },
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Company Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  describe('POST /api/company/create (createCompany)', () => {
    test('allows authenticated user to create a company', async () => {
      const userId = 'creator-1';
      const authedUser = mockUserData({ id: userId, email: 'creator@example.com' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(authedUser));

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess({
          id: 'company-123',
          name: 'Test Company',
          tax_id: null,
          domain_email: '@test.com',
          logo_url: null,
          verified: false,
          created_at: '2024-01-01T00:00:00Z'
        })
      );

      await request(app)
        .post('/api/company/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Test Company' })
        .expect(200);
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
    const companyId = 'company-456';

    test('allows active signer to view company details', async () => {
      const userId = 'signer-1';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId });
      const companyRecord = {
        id: companyId,
        name: 'Viewer Co',
        tax_id: null,
        domain_email: null,
        logo_url: null,
        verified: false,
        created_at: '2024-01-01T00:00:00Z'
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      const usersQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockDatabaseSuccess(authedUser))
      };

      const companySignersQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(),
        not: jest.fn(),
        single: jest.fn().mockResolvedValue(mockDatabaseSuccess(signerRecord))
      };

      let eqCall = 0;
      companySignersQuery.eq.mockImplementation(() => {
        eqCall += 1;
        if (eqCall === 5) {
          return Promise.resolve({ data: null, error: null, count: 2 });
        }
        return companySignersQuery;
      });

      companySignersQuery.not.mockResolvedValueOnce({ data: null, error: null, count: 1 });

      const companiesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockDatabaseSuccess(companyRecord))
      };

      mockSupabaseClient.from.mockImplementation((table) => {
        if (table === 'users') return usersQuery;
        if (table === 'company_signers') return companySignersQuery;
        if (table === 'companies') return companiesQuery;
        return mockQueryBuilder;
      });

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.company.id).toBe(companyId);
    });

    test('rejects non-signer attempting to view another company', async () => {
      const userId = 'regular-user';
      const authedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .get(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('PATCH /api/company/:companyId (updateCompany)', () => {
    const companyId = 'company-789';

    test('rejects unauthenticated update attempt', async () => {
      await request(app)
        .patch(`/api/company/${companyId}`)
        .send({ name: 'Updated Co' })
        .expect(401);
    });

    test('rejects updates with no provided fields', async () => {
      const userId = 'signer-2';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord));

      await request(app)
        .patch(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);
    });

    test('allows superadmin to update any company', async () => {
      const userId = 'superadmin-2';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });
      const updatedCompany = { id: companyId, name: 'Updated Co' };

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(superadmin))
        .mockResolvedValueOnce(mockDatabaseSuccess(updatedCompany));

      await request(app)
        .patch(`/api/company/${companyId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Co' })
        .expect(200);
    });
  });

  describe('POST /api/company/:companyId/verify (verifyCompany)', () => {
    const companyId = 'company-verify-1';

    test('rejects unauthenticated verification attempt', async () => {
      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .send({ verified: true })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('requires superadmin role to verify company', async () => {
      const userId = 'admin-user-1';
      const admin = mockUserData({ id: userId, role: 'admin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(admin));

      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .set('Authorization', 'Bearer valid-token')
        .send({ verified: true })
        .expect(403);

      expect(response.body.message).toBe('Superadmin access required');
    });

    test('returns 400 when verified flag missing or invalid', async () => {
      const userId = 'superadmin-verify';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(superadmin));

      const response = await request(app)
        .post(`/api/company/${companyId}/verify`)
        .set('Authorization', 'Bearer valid-token')
        .send({ notes: 'No flag provided' })
        .expect(400);

      expect(response.body.error).toBe('Invalid request');
    });
  });
});
