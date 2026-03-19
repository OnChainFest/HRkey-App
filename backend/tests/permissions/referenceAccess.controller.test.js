import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.BASE_SEPOLIA_RPC_URL = 'https://base-sepolia.example';
process.env.PROOF_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
process.env.PROOF_SIGNER_PRIVATE_KEY = '0x'.padEnd(66, '1');

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
const createReferenceCapabilityGrantMock = jest.fn();
const revokeReferenceCapabilityGrantMock = jest.fn();
const listReferenceCapabilityGrantsMock = jest.fn();
const listReferenceAccessHistoryMock = jest.fn();
const buildCanonicalReferencePackMock = jest.fn();
const canonicalHashMock = jest.fn();
const recordReferencePackProofMock = jest.fn();
const waitForProofTxMock = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/referenceAccess.service.js', () => ({
  grantReferenceAccess: grantReferenceAccessMock,
  revokeReferenceAccess: revokeReferenceAccessMock,
  listReferenceAccessGrants: listReferenceAccessGrantsMock,
  getReferenceAccessStatus: getReferenceAccessStatusMock,
  createReferenceCapabilityGrant: createReferenceCapabilityGrantMock,
  revokeReferenceCapabilityGrant: revokeReferenceCapabilityGrantMock,
  listReferenceCapabilityGrants: listReferenceCapabilityGrantsMock,
  listReferenceAccessHistory: listReferenceAccessHistoryMock,
  assertRecruiterCanAccessReferencePack: assertRecruiterCanAccessReferencePackMock
}));

jest.unstable_mockModule('../../services/capabilityToken.service.js', () => ({
  extractCapabilityToken: jest.fn((req) => req.headers['x-capability-token'] || null),
  validateCapabilityToken: jest.fn().mockResolvedValue({ grant: { id: 'cap-grant-1', status: 'active' } }),
  CapabilityActions: { READ_REFERENCES: 'read_references', READ_REFERENCE_PACK: 'read_reference_pack' },
  CapabilityResourceTypes: { CANDIDATE_REFERENCE_DATA: 'candidate_reference_data' }
}));

jest.unstable_mockModule('../../services/referencePack.service.js', () => ({
  buildCanonicalReferencePack: buildCanonicalReferencePackMock
}));

jest.unstable_mockModule('../../utils/canonicalHash.js', () => ({
  canonicalHash: canonicalHashMock
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

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn(),
    Contract: function MockContract() {
      this.recordReferencePackProof = recordReferencePackProofMock;
      this.getProof = jest.fn();
    }
  }
}));

const referencesControllerModule = await import('../../controllers/referencesController.js');
referencesControllerModule.__setSupabaseClientForTests(mockSupabaseClient);
const { default: app } = await import('../../server.js');

function createBuilder({
  orderResponse = { data: [], error: null },
  singleQueue = [],
  maybeSingleQueue = []
} = {}) {
  const builder = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => (maybeSingleQueue.length ? maybeSingleQueue.shift() : { data: null, error: null })),
    single: jest.fn(async () => (singleQueue.length ? singleQueue.shift() : { data: null, error: null })),
    order: jest.fn(async () => orderResponse)
  };
  return builder;
}

describe('reference access controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockImplementation(() => createBuilder());
    buildCanonicalReferencePackMock.mockResolvedValue({ candidate_id: 'candidate-1', references: [] });
    canonicalHashMock.mockReturnValue({ hash: 'a'.repeat(64), canonicalJson: '{}' });
    waitForProofTxMock.mockResolvedValue({ blockNumber: 1 });
    recordReferencePackProofMock.mockResolvedValue({ hash: '0xtx', wait: waitForProofTxMock });
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

  test('reference pack endpoint enforces explicit recruiter permission', async () => {
    const error = new Error('Explicit reference access is required');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    const response = await request(app)
      .get('/api/reference-pack/candidate-1')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
    expect(assertRecruiterCanAccessReferencePackMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      targetId: 'candidate-1'
    }));
  });

  test('reference pack commit preserves owner access without recruiter grant', async () => {
    const response = await request(app)
      .post('/api/reference-pack/candidate-1/commit')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(assertRecruiterCanAccessReferencePackMock).not.toHaveBeenCalled();
    expect(recordReferencePackProofMock).toHaveBeenCalled();
  });



  test('candidate can issue capability token and list history', async () => {
    createReferenceCapabilityGrantMock.mockResolvedValue({
      grant: { id: 'cap-grant-1', status: 'active' },
      capabilityToken: 'cap_token_123'
    });
    listReferenceAccessHistoryMock.mockResolvedValue([{ id: 'audit-1', result: 'allowed' }]);

    const issueResponse = await request(app)
      .post('/api/reference-access/capabilities')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com')
      .send({ granteeType: 'link', expiresAt: '2030-01-01T00:00:00Z' });

    expect(issueResponse.status).toBe(200);
    expect(issueResponse.body.capabilityToken).toBe('cap_token_123');

    const historyResponse = await request(app)
      .get('/api/reference-access/history')
      .set('x-test-user-id', 'candidate-1')
      .set('x-test-user-email', 'candidate@example.com');

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.history).toHaveLength(1);
  });

  test('capability token can access protected candidate references endpoint', async () => {
    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'references') {
        return createBuilder({ orderResponse: { data: [{ id: 'ref-1', owner_id: 'candidate-1', summary: 'Strong performer', status: 'approved' }], error: null } });
      }
      return createBuilder();
    });

    const response = await request(app)
      .get('/api/references/candidate/candidate-1')
      .set('x-capability-token', 'cap_demo_token')
      .set('x-test-user-id', 'external-reviewer-1')
      .set('x-test-user-email', 'reviewer@example.com');

    expect(response.status).toBe(200);
    expect(response.body.references).toHaveLength(1);
  });

  test('approved company data route enforces explicit recruiter permission', async () => {
    const error = new Error('Reference access grant has expired');
    error.status = 403;
    assertRecruiterCanAccessReferencePackMock.mockRejectedValue(error);

    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'data_access_requests') {
        return createBuilder({
          singleQueue: [
            {
              data: {
                id: 'req-1',
                company_id: 'company-1',
                target_user_id: 'candidate-1',
                requested_data_type: 'reference',
                reference_id: 'ref-1',
                status: 'APPROVED',
                access_count: 0
              },
              error: null
            }
          ]
        });
      }
      if (table === 'company_signers') {
        return createBuilder({ maybeSingleQueue: [{ data: { id: 'signer-1' }, error: null }] });
      }
      if (table === 'users') {
        return createBuilder({ singleQueue: [{ data: { id: 'recruiter-1', wallet_address: '0xabc' }, error: null }] });
      }
      if (table === 'staking_tiers') {
        return createBuilder({ maybeSingleQueue: [{ data: { tier: 'platinum', updated_at: new Date().toISOString() }, error: null }] });
      }
      if (table === 'references') {
        return createBuilder({ singleQueue: [{ data: { id: 'ref-1' }, error: null }] });
      }
      return createBuilder();
    });

    const response = await request(app)
      .get('/api/data-access/req-1/data')
      .set('x-test-user-id', 'recruiter-1')
      .set('x-test-user-email', 'recruiter@example.com');

    expect(response.status).toBe(403);
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
