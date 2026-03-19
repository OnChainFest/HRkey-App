import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';

const fromMock = jest.fn();
const mockSupabaseClient = { from: fromMock };
const recordAccessDecisionMock = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/accessDecisionAudit.service.js', () => ({
  recordAccessDecision: recordAccessDecisionMock
}));

const {
  issueCapabilityGrant,
  validateCapabilityToken,
  revokeCapabilityGrant,
  extractCapabilityToken,
  CapabilityActions,
  CapabilityGranteeTypes
} = await import('../../services/capabilityToken.service.js');

function createBuilder(response = { data: null, error: null }) {
  const builder = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(async () => response),
    maybeSingle: jest.fn(async () => response),
    single: jest.fn(async () => response)
  };

  return builder;
}

describe('capabilityToken.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('issues a capability token without storing plaintext secret', async () => {
    let insertedPayload;
    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        const builder = createBuilder({
          data: {
            id: 'grant-1',
            candidate_user_id: 'candidate-1',
            resource_type: 'candidate_reference_data',
            resource_id: 'candidate-1',
            allowed_actions: [CapabilityActions.READ_REFERENCES],
            grantee_type: CapabilityGranteeTypes.LINK,
            token_jti: '11111111-1111-4111-8111-111111111111',
            token_hint: 'hint1234',
            status: 'active'
          },
          error: null
        });
        builder.insert = jest.fn((payload) => {
          insertedPayload = payload[0];
          return builder;
        });
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await issueCapabilityGrant({
      candidateUserId: 'candidate-1',
      ownerUserId: 'candidate-1',
      allowedActions: [CapabilityActions.READ_REFERENCES]
    });

    expect(result.capabilityToken.startsWith('cap_')).toBe(true);
    expect(insertedPayload.token_hash).toBeTruthy();
    expect(insertedPayload.token_hash).not.toContain(result.capabilityToken);
    expect(recordAccessDecisionMock).toHaveBeenCalled();
  });

  test('allows valid access with active token', async () => {
    const issued = await (async () => {
      let insertResponse;
      fromMock.mockImplementation((table) => {
        if (table === 'capability_grants') {
          const builder = createBuilder();
          builder.insert = jest.fn((payload) => {
            insertResponse = payload[0];
            return builder;
          });
          builder.single = jest.fn(async () => ({
            data: {
              id: 'grant-2',
              ...insertResponse,
              token_jti: '22222222-2222-4222-8222-222222222222'
            },
            error: null
          }));
          builder.maybeSingle = jest.fn(async () => ({
            data: {
              id: 'grant-2',
              ...insertResponse,
              token_jti: '22222222-2222-4222-8222-222222222222'
            },
            error: null
          }));
          return builder;
        }
        throw new Error(`Unexpected table ${table}`);
      });
      return issueCapabilityGrant({
        candidateUserId: 'candidate-1',
        ownerUserId: 'candidate-1'
      });
    })();

    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        return createBuilder({
          data: issued.grant,
          error: null
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const validated = await validateCapabilityToken({
      token: issued.capabilityToken,
      action: CapabilityActions.READ_REFERENCE_PACK,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    });

    expect(validated.grant.id).toBe('grant-2');
  });

  test('expired token denied', async () => {
    const issued = await (async () => {
      let insertResponse;
      fromMock.mockImplementation((table) => {
        if (table === 'capability_grants') {
          const builder = createBuilder();
          builder.insert = jest.fn((payload) => {
            insertResponse = payload[0];
            return builder;
          });
          builder.single = jest.fn(async () => ({
            data: {
              id: 'grant-3',
              ...insertResponse,
              status: 'active',
              token_jti: '33333333-3333-4333-8333-333333333333'
            },
            error: null
          }));
          return builder;
        }
        throw new Error(`Unexpected table ${table}`);
      });
      return issueCapabilityGrant({
        candidateUserId: 'candidate-1',
        ownerUserId: 'candidate-1',
        allowedActions: [CapabilityActions.READ_REFERENCES]
      });
    })();

    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        return createBuilder({ data: { ...issued.grant, status: 'expired' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(validateCapabilityToken({
      token: issued.capabilityToken,
      action: CapabilityActions.READ_REFERENCES,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    })).rejects.toMatchObject({ status: 403, reason: 'TOKEN_EXPIRED' });
  });

  test('revoked token denied immediately', async () => {
    const grant = {
      id: 'grant-4',
      candidate_user_id: 'candidate-1',
      owner_user_id: 'candidate-1',
      status: 'active'
    };
    let updateCalled = false;
    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        const builder = createBuilder({ data: grant, error: null });
        builder.maybeSingle = jest.fn(async () => ({ data: grant, error: null }));
        builder.update = jest.fn(() => {
          updateCalled = true;
          return builder;
        });
        builder.single = jest.fn(async () => ({ data: { ...grant, status: 'revoked' }, error: null }));
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const revoked = await revokeCapabilityGrant({
      grantId: 'grant-4',
      candidateUserId: 'candidate-1',
      revokedByUserId: 'candidate-1'
    });

    expect(updateCalled).toBe(true);
    expect(revoked.status).toBe('revoked');
  });

  test('wrong resource denied', async () => {
    const issued = await (async () => {
      let insertResponse;
      fromMock.mockImplementation((table) => {
        if (table === 'capability_grants') {
          const builder = createBuilder();
          builder.insert = jest.fn((payload) => {
            insertResponse = payload[0];
            return builder;
          });
          builder.single = jest.fn(async () => ({
            data: {
              id: 'grant-5',
              ...insertResponse,
              token_jti: '55555555-5555-4555-8555-555555555555'
            },
            error: null
          }));
          return builder;
        }
        throw new Error(`Unexpected table ${table}`);
      });
      return issueCapabilityGrant({
        candidateUserId: 'candidate-1',
        ownerUserId: 'candidate-1',
        allowedActions: [CapabilityActions.READ_REFERENCES]
      });
    })();

    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        return createBuilder({ data: { ...issued.grant, resource_id: 'candidate-2' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(validateCapabilityToken({
      token: issued.capabilityToken,
      action: CapabilityActions.READ_REFERENCES,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    })).rejects.toMatchObject({ status: 403, reason: 'SCOPE_MISMATCH' });
  });

  test('wrong action denied', async () => {
    const issued = await (async () => {
      let insertResponse;
      fromMock.mockImplementation((table) => {
        if (table === 'capability_grants') {
          const builder = createBuilder();
          builder.insert = jest.fn((payload) => {
            insertResponse = payload[0];
            return builder;
          });
          builder.single = jest.fn(async () => ({
            data: {
              id: 'grant-6',
              ...insertResponse,
              allowed_actions: [CapabilityActions.READ_REFERENCES],
              token_jti: '66666666-6666-4666-8666-666666666666'
            },
            error: null
          }));
          return builder;
        }
        throw new Error(`Unexpected table ${table}`);
      });
      return issueCapabilityGrant({
        candidateUserId: 'candidate-1',
        ownerUserId: 'candidate-1',
        allowedActions: [CapabilityActions.READ_REFERENCES]
      });
    })();

    fromMock.mockImplementation((table) => {
      if (table === 'capability_grants') {
        return createBuilder({ data: issued.grant, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(validateCapabilityToken({
      token: issued.capabilityToken,
      action: CapabilityActions.READ_REFERENCE_PACK,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    })).rejects.toMatchObject({ status: 403, reason: 'SCOPE_MISMATCH' });
  });

  test('malformed token denied', async () => {
    await expect(validateCapabilityToken({
      token: 'invalid-token',
      action: CapabilityActions.READ_REFERENCES,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    })).rejects.toMatchObject({ status: 403, reason: 'TOKEN_NOT_FOUND' });
  });

  test('missing token denied', async () => {
    await expect(validateCapabilityToken({
      token: null,
      action: CapabilityActions.READ_REFERENCES,
      resourceType: 'candidate_reference_data',
      resourceId: 'candidate-1',
      candidateUserId: 'candidate-1',
      req: { headers: {} }
    })).rejects.toMatchObject({ status: 403, reason: 'TOKEN_MISSING' });
  });

  test('extractCapabilityToken prefers explicit header', () => {
    expect(extractCapabilityToken({ headers: { 'x-capability-token': 'cap_direct' } })).toBe('cap_direct');
    expect(extractCapabilityToken({ headers: { authorization: 'Bearer cap_authorization' } })).toBe('cap_authorization');
    expect(extractCapabilityToken({ headers: { authorization: 'Bearer user-jwt' } })).toBeNull();
  });
});
