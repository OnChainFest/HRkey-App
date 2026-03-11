
// ============================================================================
// Consent Validation Middleware Tests - P0 Security Enhancement
// ============================================================================

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ============================================================================
// MOCKS (must be declared BEFORE dynamic imports)
// ============================================================================

jest.unstable_mockModule('../../utils/consentManager.js', () => ({
  checkConsent: jest.fn(),
  createConsent: jest.fn(),
  revokeConsent: jest.fn(),
  logAuditEvent: jest.fn()
}));

// ============================================================================
// DYNAMIC IMPORTS (after mock registration)
// ============================================================================

const consentManagerModule = await import('../../utils/consentManager.js');
const { validateConsent, requireApprovedDataAccess } = await import('../../middleware/validateConsent.js');

// ============================================================================
// TEST DATA
// ============================================================================

const mockUsers = {
  dataOwner: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'owner@example.com',
    role: 'user'
  },
  requester: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'requester@example.com',
    role: 'user'
  },
  superadmin: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'admin@example.com',
    role: 'superadmin'
  }
};

const mockCompany = {
  id: '00000000-0000-0000-0000-000000000010'
};

const mockConsent = {
  id: 'consent-123',
  subject_user_id: mockUsers.dataOwner.id,
  granted_to_user: mockUsers.requester.id,
  resource_type: 'references',
  scope: ['read'],
  purpose: 'test_access',
  status: 'active',
  granted_at: '2026-01-22T00:00:00Z',
  expires_at: null
};

function createMockRequest(user, params = {}, query = {}, body = {}) {
  return {
    user,
    params,
    query,
    body,
    path: '/api/test',
    method: 'GET',
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'jest-test',
      'x-forwarded-for': '127.0.0.1'
    }
  };
}

function createMockResponse() {
  const res = {
    statusCode: null,
    jsonData: null,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      res.jsonData = data;
      return res;
    })
  };
  return res;
}

let checkConsentMock;
let logAuditEventMock;

beforeEach(() => {
  checkConsentMock = consentManagerModule.checkConsent;
  logAuditEventMock = consentManagerModule.logAuditEvent;

  jest.clearAllMocks();
  checkConsentMock.mockReset();
  logAuditEventMock.mockReset();

  checkConsentMock.mockReset();
  logAuditEventMock.mockReset();

  logAuditEventMock.mockResolvedValue({ id: 'audit-event-123' });
});

describe('validateConsent middleware', () => {
  test('returns 403 when consent does not exist', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'no_consent'
    });

    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => 'target-resource-id',
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester, { referenceId: 'test-ref-123' });
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toMatchObject({
      error: 'Forbidden',
      message: 'You do not have consent to access this resource',
      reason: 'no_consent'
    });
    expect(next).not.toHaveBeenCalled();

    expect(checkConsentMock).toHaveBeenCalledWith({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToOrg: null,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      resourceId: 'target-resource-id'
    });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.requester.id
      })
    );
  });

  test('returns 200 when consent is valid and active', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: mockConsent,
      reason: 'valid_consent'
    });

    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    expect(req.consent).toBeDefined();
    expect(req.consent.id).toBe(mockConsent.id);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.requester.id,
        result: 'allowed',
        reason: 'valid_consent',
        consentId: mockConsent.id
      })
    );
  });

  test('returns 403 when consent is expired', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'consent_expired'
    });

    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.reason).toBe('consent_expired');
    expect(next).not.toHaveBeenCalled();
  });

  test('allows superadmin to bypass consent check', async () => {
    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: mockUsers.superadmin.id }),
      allowSuperadmin: true,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.superadmin);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    expect(checkConsentMock).not.toHaveBeenCalled();

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.superadmin.id,
        result: 'allowed',
        reason: 'superadmin_override'
      })
    );
  });

  test('allows user to access their own data without consent', async () => {
    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: mockUsers.dataOwner.id }),
      allowSuperadmin: false,
      allowSelf: true
    });

    const req = createMockRequest(mockUsers.dataOwner);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    expect(checkConsentMock).not.toHaveBeenCalled();

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.dataOwner.id,
        result: 'allowed',
        reason: 'self_access'
      })
    );
  });

  test('validates consent granted to company', async () => {
    const companyConsent = {
      ...mockConsent,
      granted_to_org: mockCompany.id,
      granted_to_user: null
    };

    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: companyConsent,
      reason: 'valid_consent'
    });

    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: mockCompany.id, userId: null }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    expect(req.consent.id).toBe(companyConsent.id);

    expect(checkConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        grantedToOrg: mockCompany.id,
        grantedToUser: null
      })
    );
  });

  test('returns 401 when user is not authenticated', async () => {
    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: null }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(null);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData.error).toBe('Authentication required');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 on internal error and fails closed', async () => {
    checkConsentMock.mockRejectedValue(new Error('Database connection failed'));

    const middleware = validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => null,
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toBe('Internal server error');
    expect(next).not.toHaveBeenCalled();
  });

  test('validates consent for different resource types', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: { ...mockConsent, resource_type: 'kpi_observations' },
      reason: 'valid_consent'
    });

    const middleware = validateConsent({
      resourceType: 'kpi_observations',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => 'kpi-123',
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    expect(checkConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'kpi_observations',
        resourceId: 'kpi-123'
      })
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'kpi_observations',
        targetId: 'kpi-123'
      })
    );
  });
});

describe('validateConsent configuration', () => {
  test('throws error when resourceType is missing', () => {
    expect(() => {
      validateConsent({
        getTargetOwnerId: async () => 'user-id',
        getGrantee: async () => ({ companyId: null, userId: 'user-id' })
      });
    }).toThrow('validateConsent: resourceType is required');
  });

  test('throws error when getTargetOwnerId is missing', () => {
    expect(() => {
      validateConsent({
        resourceType: 'references',
        getGrantee: async () => ({ companyId: null, userId: 'user-id' })
      });
    }).toThrow('validateConsent: getTargetOwnerId function is required');
  });

  test('throws error when getGrantee is missing', () => {
    expect(() => {
      validateConsent({
        resourceType: 'references',
        getTargetOwnerId: async () => 'user-id'
      });
    }).toThrow('validateConsent: getGrantee function is required');
  });
});