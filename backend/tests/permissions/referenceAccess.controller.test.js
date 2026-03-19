import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockSupabaseClient = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn(),
    admin: { getUserById: jest.fn() }
  }
};

const grantReferenceAccessMock = jest.fn();
const revokeReferenceAccessMock = jest.fn();
const listReferenceAccessGrantsMock = jest.fn();
const getReferenceAccessStatusMock = jest.fn();
const assertRecruiterCanAccessReferencePackMock = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/referenceAccess.service.js', () => ({
  grantReferenceAccess: grantReferenceAccessMock,
  revokeReferenceAccess: revokeReferenceAccessMock,
  listReferenceAccessGrants: listReferenceAccessGrantsMock,
  getReferenceAccessStatus: getReferenceAccessStatusMock,
  assertRecruiterCanAccessReferencePack: assertRecruiterCanAccessReferencePackMock
}));

jest.unstable_mockModule('../../utils/emailService.js', () => ({
  sendSignerInvitation: jest.fn().mockResolvedValue(),
  sendCompanyVerificationNotification: jest.fn().mockResolvedValue(),
  sendIdentityVerificationConfirmation: jest.fn().mockResolvedValue(),
  sendDataAccessRequestNotification: jest.fn().mockResolvedValue(),
  sendDataAccessApprovedNotification: jest.fn().mockResolvedValue(),
  sendReferenceInvitationEmail: jest.fn().mockResolvedValue(),
  sendReferenceCompletedEmail: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logAudit: jest.fn().mockResolvedValue(),
  logIdentityVerification: jest.fn().mockResolvedValue(),
  logCompanyCreation: jest.fn().mockResolvedValue(),
  logCompanyVerification: jest.fn().mockResolvedValue(),
  logSignerInvitation: jest.fn().mockResolvedValue(),
  logSignerAcceptance: jest.fn().mockResolvedValue(),
  logSignerStatusChange: jest.fn().mockResolvedValue(),
  logReferenceSubmissionAudit: jest.fn().mockResolvedValue(),
  logDataAccessAction: jest.fn().mockResolvedValue(),
  AuditActionTypes: {
    SUBMIT_REFERENCE_ATTEMPT: 'submit_reference_attempt',
    SUBMIT_REFERENCE_SUCCESS: 'submit_reference_success',
    SUBMIT_REFERENCE_FAILURE: 'submit_reference_failure'
  },
  ResourceTypes: {},
  getUserAuditLogs: jest.fn().mockResolvedValue([]),
  getCompanyAuditLogs: jest.fn().mockResolvedValue([]),
  getAllAuditLogs: jest.fn().mockResolvedValue([]),
  auditMiddleware: () => (req, res, next) => next()
}));

const referencesControllerModule = await import('../../controllers/referencesController.js');
referencesControllerModule.__setSupabaseClientForTests(mockSupabaseClient);
const { default: app } = await import('../../server.js');

function createBuilder({ orderResponse = { data: [], error: null } } = {}) {
  const builder = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    single: jest.fn(async () => ({ data: null, error: null })),
    order: jest.fn(async () => orderResponse)
  };
  return builder;
}

describe('reference access controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockImplementation(() => createBuilder());
  });

  test('authenticated candidate can grant access', async () => {
    grantReferenceAccessMock.mockResolvedValue({ id: 'grant-1', recruiter_user_id: 'recruiter-1', status: 'active' });

    const response = await request(app)
      .post('/api/reference-access/grants')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com')
      .send({ recruiterUserId: 'recruiter-1', expiresAt: '2030-01-01T00:00:00Z' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(grantReferenceAccessMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      grantedByUserId: 'candidate-1'
    }));
  });

  test('non-owner cannot grant access', async () => {
    const response = await request(app)
      .post('/api/reference-access/grants')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com')
      .send({ candidateUserId: 'candidate-2', recruiterUserId: 'recruiter-1' });

    expect(response.status).toBe(403);
    expect(grantReferenceAccessMock).not.toHaveBeenCalled();
  });

  test('authenticated candidate can revoke access', async () => {
    revokeReferenceAccessMock.mockResolvedValue({ id: 'grant-2', recruiter_user_id: 'recruiter-1', status: 'revoked' });

    const response = await request(app)
      .delete('/api/reference-access/grants/recruiter-1')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(revokeReferenceAccessMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      revokedByUserId: 'candidate-1'
    }));
  });

  test('non-owner cannot revoke access', async () => {
    const response = await request(app)
      .delete('/api/reference-access/grants/recruiter-1?candidateUserId=candidate-2')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(403);
    expect(revokeReferenceAccessMock).not.toHaveBeenCalled();
  });

  test('invalid recruiter/candidate combinations are rejected', async () => {
    const error = new Error('Recruiter must be an active company signer');
    error.status = 400;
    grantReferenceAccessMock.mockRejectedValue(error);

    const response = await request(app)
      .post('/api/reference-access/grants')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com')
      .send({ recruiterUserId: 'recruiter-1' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Recruiter must be an active company signer');
  });

  test('recruiter cannot view reference pack without permission', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/references/candidate/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
  });

  test('recruiter can view reference pack with active permission', async () => {
    assertRecruiterCanAccessReferencePackMock.mockResolvedValue({ id: 'grant-3', status: 'active' });
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return createBuilder({ orderResponse: { data: [{ id: 'ref-1', owner_id: 'candidate-1', summary: 'Strong performer', status: 'approved' }], error: null } });
      }
      return createBuilder();
    });

    const response = await request(app)
      .get('/api/references/candidate/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(200);
    expect(response.body.accessLevel).toBe('explicit_grant');
    expect(response.body.references).toHaveLength(1);
  });

  test('recruiter loses access after revocation', async () => {
    const error = new Error('Reference access grant has been revoked');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/references/candidate/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
  });

  test('recruiter loses access after expiration', async () => {
    const error = new Error('Reference access grant has expired');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/references/candidate/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
  });
});
