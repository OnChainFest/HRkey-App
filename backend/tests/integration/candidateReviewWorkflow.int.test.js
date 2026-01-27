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

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
  logEventBatch: jest.fn().mockResolvedValue([]),
  EventTypes: {
    REFERENCE_SUBMITTED: 'REFERENCE_SUBMITTED'
  },
  EventCategories: {}
}));

jest.unstable_mockModule('../../services/validation/index.js', () => ({
  validateReference: jest.fn().mockResolvedValue({
    validation_status: 'VALID',
    fraud_score: 0.1,
    consistency_score: 0.9
  })
}));

jest.unstable_mockModule('../../services/hrscore/autoTrigger.js', () => ({
  onReferenceValidated: jest.fn().mockResolvedValue()
}));

// Import app after mocking
const { default: app } = await import('../../server.js');

// ============================================================================
// FASE 1: CANDIDATE REVIEW WORKFLOW TEST SUITE
// ============================================================================

describe('FASE 1: Candidate Review Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
  });

  // --------------------------------------------------------------------------
  // Accept Reference Tests
  // --------------------------------------------------------------------------

  describe('POST /api/references/:referenceId/accept', () => {
    test('CRW-01: Candidate can accept their own reference', async () => {
      const userId = 'user-owner-1';
      const referenceId = 'ref-submitted-1';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock accept_reference RPC call
      mockSupabaseClient.rpc.mockResolvedValueOnce(
        mockDatabaseSuccess(true)
      );

      const res = await request(app)
        .post(`/api/references/${referenceId}/accept`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('ACCEPTED');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('accept_reference', {
        ref_id: referenceId,
        user_id: userId
      });
    });

    test('CRW-02: Non-owner cannot accept reference', async () => {
      const userId = 'user-not-owner';
      const referenceId = 'ref-submitted-2';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for non-owner
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Only the reference owner can accept a reference' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/accept`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    test('CRW-03: Returns 401 for unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/references/ref-1/accept')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });
  });

  // --------------------------------------------------------------------------
  // Request Revision Tests
  // --------------------------------------------------------------------------

  describe('POST /api/references/:referenceId/request-revision', () => {
    test('CRW-04: Candidate can request revision for their own reference', async () => {
      const userId = 'user-owner-2';
      const referenceId = 'ref-submitted-3';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock request_reference_revision RPC call
      mockSupabaseClient.rpc.mockResolvedValueOnce(
        mockDatabaseSuccess(true)
      );

      const res = await request(app)
        .post(`/api/references/${referenceId}/request-revision`)
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Please update the project dates' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('REVISION_REQUESTED');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('request_reference_revision', {
        ref_id: referenceId,
        user_id: userId,
        reason: 'Please update the project dates'
      });
    });

    test('CRW-05: Non-owner cannot request revision', async () => {
      const userId = 'user-not-owner-2';
      const referenceId = 'ref-submitted-4';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for non-owner
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Only the reference owner can request revision' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/request-revision`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // Omit Reference Tests
  // --------------------------------------------------------------------------

  describe('POST /api/references/:referenceId/omit', () => {
    test('CRW-06: Candidate can omit their own reference', async () => {
      const userId = 'user-owner-3';
      const referenceId = 'ref-submitted-5';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock omit_reference RPC call
      mockSupabaseClient.rpc.mockResolvedValueOnce(
        mockDatabaseSuccess(true)
      );

      const res = await request(app)
        .post(`/api/references/${referenceId}/omit`)
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Reference no longer relevant' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('OMITTED');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('omit_reference', {
        ref_id: referenceId,
        user_id: userId,
        reason: 'Reference no longer relevant'
      });
    });

    test('CRW-07: Non-owner cannot omit reference', async () => {
      const userId = 'user-not-owner-3';
      const referenceId = 'ref-submitted-6';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for non-owner
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Only the reference owner can omit a reference' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/omit`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // Get My References Tests (with new status support)
  // --------------------------------------------------------------------------

  describe('GET /api/references/me', () => {
    test('CRW-08: Returns references with status counts', async () => {
      const userId = 'user-with-refs';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock references query
      const mockReferences = [
        { id: 'ref-1', status: 'SUBMITTED', referrer_name: 'Alice', overall_rating: 4 },
        { id: 'ref-2', status: 'ACCEPTED', referrer_name: 'Bob', overall_rating: 5 },
        { id: 'ref-3', status: 'REVISION_REQUESTED', referrer_name: 'Carol', overall_rating: 3 }
      ];
      mockQueryBuilder.order.mockResolvedValueOnce(mockDatabaseSuccess(mockReferences));

      const res = await request(app)
        .get('/api/references/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.references).toHaveLength(3);
      expect(res.body.statusCounts).toBeDefined();
    });

    test('CRW-09: usableOnly filter returns only ACCEPTED references', async () => {
      const userId = 'user-filter-test';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock query - the controller will filter by status=ACCEPTED
      mockQueryBuilder.order.mockResolvedValueOnce(
        mockDatabaseSuccess([
          { id: 'ref-accepted', status: 'ACCEPTED', referrer_name: 'Dan', overall_rating: 5 }
        ])
      );

      const res = await request(app)
        .get('/api/references/me?usableOnly=true')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Check that .eq was called with status=ACCEPTED (via in() for multiple statuses)
      const selectCalls = mockQueryBuilder.eq.mock.calls;
      expect(selectCalls.some(call => call[0] === 'status' && call[1] === 'ACCEPTED')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Reference Status Lifecycle Tests
  // --------------------------------------------------------------------------

  describe('Reference Status Lifecycle', () => {
    test('CRW-10: Cannot accept already ACCEPTED reference', async () => {
      const userId = 'user-lifecycle';
      const referenceId = 'ref-already-accepted';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for invalid state transition
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Reference cannot be accepted from current status: ACCEPTED' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/accept`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_STATE');
    });

    test('CRW-11: Cannot request revision for OMITTED reference', async () => {
      const userId = 'user-lifecycle-2';
      const referenceId = 'ref-omitted';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for invalid state
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Revision can only be requested for submitted references' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/request-revision`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_STATE');
    });
  });

  // --------------------------------------------------------------------------
  // Reference Not Found Tests
  // --------------------------------------------------------------------------

  describe('Reference Not Found', () => {
    test('CRW-12: Returns 404 for non-existent reference', async () => {
      const userId = 'user-not-found-test';
      const referenceId = 'ref-does-not-exist';

      // Mock auth
      mockSupabaseClient.auth.getUser.mockResolvedValue(mockAuthGetUserSuccess(userId));
      mockQueryBuilder.single.mockResolvedValueOnce(
        mockDatabaseSuccess(mockUserData({ id: userId }))
      );

      // Mock RPC returns error for non-existent reference
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Reference not found' }
      });

      const res = await request(app)
        .post(`/api/references/${referenceId}/accept`)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
