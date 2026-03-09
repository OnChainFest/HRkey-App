// ============================================================================
// Consent Validation Middleware Tests - P0 Security Enhancement
// ============================================================================
// Unit tests with mocks (NO real Supabase connection required)
// ============================================================================

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { validateConsent, requireApprovedDataAccess } from '../../middleware/validateConsent.js';
import * as consentManagerModule from '../../utils/consentManager.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock consentManager module
jest.unstable_mockModule('../../utils/consentManager.js', () => ({
  checkConsent: jest.fn(),
  createConsent: jest.fn(),
  revokeConsent: jest.fn(),
  logAuditEvent: jest.fn()
}));

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

// ============================================================================
// SETUP
// ============================================================================

let checkConsentMock;
let logAuditEventMock;

beforeEach(() => {

  checkConsentMock = consentManagerModule.checkConsent;

  // Force mock to avoid ESM reference issues
  logAuditEventMock = jest.fn().mockResolvedValue({ id: 'audit-event-123' });

  consentManagerModule.logAuditEvent = logAuditEventMock;

  jest.clearAllMocks();
});

// ============================================================================
// TESTS: validateConsent middleware
// ============================================================================

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

    expect(checkConsentMock).toHaveBeenCalled();

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.requester.id,
        result: 'denied'
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
    expect(req.consent.id).toBe(mockConsent.id);

    expect(logAuditEventMock).toHaveBeenCalled();
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
    expect(checkConsentMock).not.toHaveBeenCalled();
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
    expect(checkConsentMock).not.toHaveBeenCalled();
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
  });
});

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

describe('validateConsent configuration', () => {

  test('throws error when resourceType is missing', () => {
    expect(() => {
      validateConsent({
        getTargetOwnerId: async () => 'user-id',
        getGrantee: async () => ({ companyId: null, userId: 'user-id' })
      });
    }).toThrow();
  });

  test('throws error when getTargetOwnerId is missing', () => {
    expect(() => {
      validateConsent({
        resourceType: 'references',
        getGrantee: async () => ({ companyId: null, userId: 'user-id' })
      });
    }).toThrow();
  });

  test('throws error when getGrantee is missing', () => {
    expect(() => {
      validateConsent({
        resourceType: 'references',
        getTargetOwnerId: async () => 'user-id'
      });
    }).toThrow();
  });

});
