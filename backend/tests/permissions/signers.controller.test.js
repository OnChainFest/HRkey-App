/**
 * Signers Controller Permission Tests
 * Focuses on authorization/permission behaviors and status codes
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
  AuditActionTypes: {
    UPDATE_SIGNER: 'UPDATE_SIGNER'
  },
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

// Import app AFTER mocking dependencies
const { default: app } = await import('../../server.js');

describe('Signers Controller - Permission Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  const companyId = '660e8400-e29b-41d4-a716-446655440001';

  describe('POST /api/company/:companyId/signers (inviteSigner)', () => {
    test('allows active company signer to invite a new signer', async () => {
      const userId = 'user-signer-1';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId, is_active: true });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser)) // requireAuth: users
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord)) // requireCompanySigner
        .mockResolvedValueOnce(mockDatabaseSuccess({ name: 'Acme Corp', domain_email: '@acme.com' })) // companies lookup
        .mockResolvedValueOnce(mockDatabaseSuccess({
          id: 'new-signer-id',
          company_id: companyId,
          email: 'new@acme.com',
          role: 'HR Manager',
          invite_token: 'token123'
        })); // insert/select

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'new@acme.com', role: 'HR Manager' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('rejects non-signer attempting to invite', async () => {
      const userId = 'user-no-signer';
      const authedUser = mockUserData({ id: userId, role: 'user' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser)) // requireAuth
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116')); // requireCompanySigner fails

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'new@acme.com', role: 'HR Manager' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toMatch(/active signer/);
    });

    test('returns 404 when company does not exist', async () => {
      const userId = 'user-signer-2';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord))
        .mockResolvedValueOnce(mockDatabaseError('Company not found', 'PGRST116'));

      const response = await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'new@acme.com', role: 'HR Manager' })
        .expect(404);

      expect(response.body.error).toBe('Company not found');
    });

    test('returns 400 when missing required fields', async () => {
      const userId = 'user-signer-3';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord));

      await request(app)
        .post(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: '' })
        .expect(400);
    });
  });

  describe('GET /api/company/:companyId/signers (getSigners)', () => {
    test('allows superadmin to list signers for any company', async () => {
      const userId = 'superadmin-1';
      const superadmin = mockUserData({ id: userId, role: 'superadmin' });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(mockDatabaseSuccess(superadmin));

      mockQueryBuilder.order.mockResolvedValueOnce(
        mockDatabaseSuccess([
          {
            id: 'signer-1',
            email: 'a@acme.com',
            role: 'Admin',
            is_active: true,
            invited_at: '2024-01-01T00:00:00Z',
            accepted_at: null,
            user_id: null,
            invited_by: null
          }
        ])
      );

      const response = await request(app)
        .get(`/api/company/${companyId}/signers`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.signers).toHaveLength(1);
    });

    test('rejects unauthenticated requests', async () => {
      const response = await request(app)
        .get(`/api/company/${companyId}/signers`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('PATCH /api/company/:companyId/signers/:signerId (updateSigner)', () => {
    const signerId = 'signer-to-update';

    test('requires authentication to update signer', async () => {
      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .send({ role: 'Viewer' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('returns 404 when target signer is not found in the company', async () => {
      const userId = 'user-signer-4';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'Viewer' })
        .expect(404);

      expect(response.body.error).toBe('Signer not found');
    });

    test('rejects users who are not signers for the company', async () => {
      const userId = 'user-not-signer';
      const authedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'Viewer' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('PERM-S19: signer cannot deactivate themselves', async () => {
      const userId = 'self-signer-1';
      const authedUser = mockUserData({ id: userId });
      const signerRecord = mockCompanySignerData({ company_id: companyId, user_id: userId, is_active: true });
      const targetSigner = mockCompanySignerData({ id: signerId, company_id: companyId, user_id: userId, is_active: true });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser)) // requireAuth lookup
        .mockResolvedValueOnce(mockDatabaseSuccess(signerRecord)) // requireCompanySigner
        .mockResolvedValueOnce(mockDatabaseSuccess(targetSigner)); // controller fetch current signer

      const response = await request(app)
        .patch(`/api/company/${companyId}/signers/${signerId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ isActive: false })
        .expect(400);

      expect(response.body.error).toBe('Cannot deactivate yourself');
    });
  });

  describe('POST /api/signers/accept/:token (acceptSignerInvitation)', () => {
    const token = 'nonexistent-token';

    test('requires authentication to accept invitation', async () => {
      const response = await request(app)
        .post(`/api/signers/accept/${token}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('returns 404 for invalid invitation token', async () => {
      const userId = 'user-accepting';
      const authedUser = mockUserData({ id: userId });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser))
        .mockResolvedValueOnce(mockDatabaseError('No rows found', 'PGRST116'));

      const response = await request(app)
        .post(`/api/signers/accept/${token}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toMatch(/Invalid or expired invitation/);
    });

    test('PERM-S20: cannot accept invitation when authenticated email mismatches token email', async () => {
      const userId = 'user-mismatch';
      const authedUser = mockUserData({ id: userId, email: 'other@example.com' });
      const invitationSigner = mockCompanySignerData({
        id: 'signer-invite-1',
        company_id: 'company-xyz',
        user_id: null,
        email: 'invitee@example.com',
        invite_token: token
      });

      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId, authedUser.email));
      mockQueryBuilder.single
        .mockResolvedValueOnce(mockDatabaseSuccess(authedUser)) // requireAuth user fetch
        .mockResolvedValueOnce(mockDatabaseSuccess(invitationSigner)) // fetch signer by token
        .mockResolvedValueOnce(mockDatabaseSuccess({ email: authedUser.email })); // fetch user email for comparison

      const response = await request(app)
        .post(`/api/signers/accept/${token}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.error).toBe('Email mismatch');
    });
  });
});
