import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockAuthGetUserError,
  mockDatabaseSuccess,
  mockDatabaseError,
  mockUserData
} from '../__mocks__/supabase.mock.js';

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
  AuditActionTypes: {},
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const { default: app } = await import('../../server.js');

describe('References Workflow MVP Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  test('REF-INT-01: should return 401 for unauthenticated /api/references/me', async () => {
    const res = await request(app).get('/api/references/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('REF-INT-02: should return 401 for unauthenticated /api/references/request', async () => {
    const res = await request(app)
      .post('/api/references/request')
      .send({
        candidate_id: '11111111-1111-4111-8111-111111111111',
        referee_email: 'referee@example.com'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('REF-INT-03: should return 404 for invalid token on respond', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app)
      .post('/api/references/respond/invalid-token-000000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invitation not found');
  });

  test('REF-INT-04: should return 422 for expired token', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
      mockDatabaseSuccess({
        id: 'invite-1',
        status: 'pending',
        expires_at: '2000-01-01T00:00:00Z'
      })
    );

    const res = await request(app)
      .post('/api/references/respond/expired-token-000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Invitation expired');
  });

  test('REF-INT-05: should reject already used token', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
      mockDatabaseSuccess({
        id: 'invite-2',
        status: 'completed',
        expires_at: '2099-01-01T00:00:00Z'
      })
    );

    const res = await request(app)
      .post('/api/references/respond/used-token-0000000000000000000000000')
      .send({
        ratings: { professionalism: 4 }
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Reference already submitted');
  });

  test('REF-INT-06: should forbid company signer without approved access', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-1'));
    mockQueryBuilder.single.mockResolvedValueOnce(
      mockDatabaseSuccess(mockUserData({ id: 'user-1' }))
    );
    mockQueryBuilder.order.mockResolvedValueOnce(
      mockDatabaseSuccess([{ company_id: 'company-1' }])
    );
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app)
      .post('/api/references/request')
      .set('Authorization', 'Bearer valid-token')
      .send({
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('REF-INT-07: should allow company signer with approved access to request reference', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-2'));
    mockQueryBuilder.single
      .mockResolvedValueOnce(mockDatabaseSuccess(mockUserData({ id: 'user-2' })))
      .mockResolvedValueOnce(mockDatabaseSuccess({ id: 'invite-1' }));
    mockQueryBuilder.order.mockResolvedValueOnce(
      mockDatabaseSuccess([{ company_id: 'company-1' }])
    );
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
      mockDatabaseSuccess({
        id: 'request-1',
        company_id: 'company-1',
        target_user_id: '22222222-2222-4222-8222-222222222222',
        status: 'APPROVED',
        requested_data_type: 'reference'
      })
    );

    const res = await request(app)
      .post('/api/references/request')
      .set('Authorization', 'Bearer valid-token')
      .send({
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com'
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('REF-INT-08: should allow superadmin to fetch candidate references', async () => {
  test('REF-INT-07: should allow superadmin to fetch candidate references', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('admin-1'));
    mockQueryBuilder.single.mockResolvedValueOnce(
      mockDatabaseSuccess(mockUserData({ id: 'admin-1', role: 'superadmin' }))
    );
    const references = [
      {
        id: 'ref-1',
        owner_id: 'candidate-1',
        referrer_name: 'Ref A',
        overall_rating: 4,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
      }
    ];
    mockQueryBuilder.order.mockResolvedValueOnce(mockDatabaseSuccess(references));

    const res = await request(app)
      .get('/api/references/candidate/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.references).toHaveLength(1);
  });

  test('REF-INT-09: should not return referrer_email for /api/references/me', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess('user-3'));
    mockQueryBuilder.single.mockResolvedValueOnce(
      mockDatabaseSuccess(mockUserData({ id: 'user-3' }))
    );
    mockQueryBuilder.order.mockResolvedValueOnce(
      mockDatabaseSuccess([
        {
          id: 'ref-2',
          referrer_name: 'Ref B',
          referrer_email: 'secret@example.com',
          overall_rating: 5,
          status: 'active',
          created_at: '2024-01-02T00:00:00Z'
        }
      ])
    );

    const res = await request(app)
      .get('/api/references/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const selectCalls = mockQueryBuilder.select.mock.calls.map((call) => call[0]);
    expect(selectCalls.some((value) => typeof value === 'string' && value.includes('referrer_email'))).toBe(false);
  });

  test('REF-INT-10: public token lookup should not expose internal IDs', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
      mockDatabaseSuccess({
        id: 'invite-5',
        requester_id: 'user-999',
        referee_name: 'Ref C',
        referee_email: 'referee@example.com',
        metadata: { applicantCompany: 'Acme' },
        expires_at: '2099-01-01T00:00:00Z',
        status: 'pending'
      })
    );

    const res = await request(app)
      .get('/api/reference/by-token/legacy-token-000000000000000000000000');

    expect(res.status).toBe(200);
    expect(res.body.invite?.requester_id).toBeUndefined();
    expect(res.body.invite?.id).toBeUndefined();
  });

  test('REF-INT-11: token lookup should hash when flag enabled', async () => {
    const token = 'hashed-token-000000000000000000000000';
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    process.env.USE_HASHED_REFERENCE_TOKENS = 'true';

    try {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce(
        mockDatabaseSuccess({
          id: 'invite-6',
          referee_name: 'Ref D',
          referee_email: 'referee@example.com',
          metadata: null,
          expires_at: '2099-01-01T00:00:00Z',
          status: 'pending'
        })
      );

      const res = await request(app)
        .get(`/api/reference/by-token/${token}`);

      expect(res.status).toBe(200);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('invite_token', hashed);
    } finally {
      delete process.env.USE_HASHED_REFERENCE_TOKENS;
    }
  });
});
