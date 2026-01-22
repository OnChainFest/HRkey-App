// ============================================================================
// Consent Controller Tests
// ============================================================================
// Unit tests for consent management endpoints
// ============================================================================

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import * as consentManagerModule from '../../utils/consentManager.js';

// Mock consentManager module
jest.unstable_mockModule('../../utils/consentManager.js', () => ({
  createConsent: jest.fn(),
  revokeConsent: jest.fn(),
  checkConsent: jest.fn(),
  logAuditEvent: jest.fn()
}));

// Mock Supabase
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn()
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import controller after mocks
const { default: consentController } = await import('../../controllers/consentController.js');

// ============================================================================
// TEST DATA
// ============================================================================

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'user'
};

const mockSuperadmin = {
  id: 'admin-123',
  email: 'admin@example.com',
  role: 'superadmin'
};

const mockConsent = {
  id: 'consent-123',
  subject_user_id: mockUser.id,
  granted_to_org: 'company-123',
  granted_to_user: null,
  resource_type: 'references',
  resource_id: null,
  scope: ['read'],
  purpose: 'hiring_decision',
  status: 'active',
  granted_at: '2026-01-22T00:00:00Z',
  expires_at: '2026-02-22T00:00:00Z',
  revoked_at: null,
  created_at: '2026-01-22T00:00:00Z'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockRequest(user, body = {}, params = {}, query = {}) {
  return {
    user,
    body,
    params,
    query,
    headers: {
      'user-agent': 'jest-test'
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

let createConsentMock;
let revokeConsentMock;

beforeEach(() => {
  // Get fresh mock references
  createConsentMock = consentManagerModule.createConsent;
  revokeConsentMock = consentManagerModule.revokeConsent;

  // Clear all mocks
  jest.clearAllMocks();

  // Reset Supabase mock chains
  Object.keys(mockSupabaseClient).forEach((key) => {
    if (typeof mockSupabaseClient[key] === 'function' && mockSupabaseClient[key].mockReturnThis) {
      mockSupabaseClient[key].mockReturnThis();
    }
  });
});

// ============================================================================
// TESTS: createConsentEndpoint
// ============================================================================

describe('createConsentEndpoint', () => {
  test('creates consent with valid data', async () => {
    createConsentMock.mockResolvedValue(mockConsent);

    const req = createMockRequest(mockUser, {
      grantedToOrg: 'company-123',
      resourceType: 'references',
      scope: ['read'],
      purpose: 'hiring_decision',
      expiresAt: '2026-02-22T00:00:00Z'
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.consent).toBeDefined();
    expect(res.jsonData.consent.id).toBe(mockConsent.id);

    // Verify createConsent was called correctly
    expect(createConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectUserId: mockUser.id,
        grantedToOrg: 'company-123',
        resourceType: 'references',
        purpose: 'hiring_decision'
      })
    );
  });

  test('returns 400 when missing required fields', async () => {
    const req = createMockRequest(mockUser, {
      grantedToOrg: 'company-123'
      // Missing resourceType and purpose
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Missing required fields');
    expect(createConsentMock).not.toHaveBeenCalled();
  });

  test('returns 400 when no grantee specified', async () => {
    const req = createMockRequest(mockUser, {
      resourceType: 'references',
      purpose: 'test'
      // Missing both grantedToOrg and grantedToUser
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Missing grantee');
    expect(createConsentMock).not.toHaveBeenCalled();
  });

  test('returns 400 when both grantees specified', async () => {
    const req = createMockRequest(mockUser, {
      grantedToOrg: 'company-123',
      grantedToUser: 'user-456',
      resourceType: 'references',
      purpose: 'test'
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Invalid grantee');
    expect(createConsentMock).not.toHaveBeenCalled();
  });

  test('returns 400 for invalid resourceType', async () => {
    const req = createMockRequest(mockUser, {
      grantedToOrg: 'company-123',
      resourceType: 'invalid_type',
      purpose: 'test'
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Invalid resourceType');
    expect(createConsentMock).not.toHaveBeenCalled();
  });

  test('returns 401 when not authenticated', async () => {
    const req = createMockRequest(null, {
      grantedToOrg: 'company-123',
      resourceType: 'references',
      purpose: 'test'
    });
    const res = createMockResponse();

    await consentController.createConsentEndpoint(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData.error).toBe('Authentication required');
  });
});

// ============================================================================
// TESTS: getMyConsents
// ============================================================================

describe('getMyConsents', () => {
  test('returns consents for authenticated user', async () => {
    mockSupabaseClient.limit.mockResolvedValue({
      data: [mockConsent],
      error: null
    });

    const req = createMockRequest(mockUser, {}, {}, { status: 'active' });
    const res = createMockResponse();

    await consentController.getMyConsents(req, res);

    expect(res.statusCode).toBeNull(); // 200 by default
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.consents).toHaveLength(1);
    expect(res.jsonData.count).toBe(1);

    // Verify query was built correctly
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('consents');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('subject_user_id', mockUser.id);
  });

  test('returns 401 when not authenticated', async () => {
    const req = createMockRequest(null, {}, {}, { status: 'active' });
    const res = createMockResponse();

    await consentController.getMyConsents(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData.error).toBe('Authentication required');
  });
});

// ============================================================================
// TESTS: getGrantedConsents
// ============================================================================

describe('getGrantedConsents', () => {
  test('returns consents granted to user', async () => {
    mockSupabaseClient.limit.mockResolvedValue({
      data: [{ ...mockConsent, granted_to_user: mockUser.id, granted_to_org: null }],
      error: null
    });

    const req = createMockRequest(mockUser, {}, {}, { status: 'active' });
    const res = createMockResponse();

    await consentController.getGrantedConsents(req, res);

    expect(res.statusCode).toBeNull();
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.consents).toHaveLength(1);
  });

  test('returns 401 when not authenticated', async () => {
    const req = createMockRequest(null);
    const res = createMockResponse();

    await consentController.getGrantedConsents(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData.error).toBe('Authentication required');
  });
});

// ============================================================================
// TESTS: revokeConsentEndpoint
// ============================================================================

describe('revokeConsentEndpoint', () => {
  test('revokes consent for owner', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: mockConsent,
      error: null
    });

    revokeConsentMock.mockResolvedValue({
      ...mockConsent,
      status: 'revoked',
      revoked_at: '2026-01-23T00:00:00Z',
      revoked_by: mockUser.id
    });

    const req = createMockRequest(mockUser, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.revokeConsentEndpoint(req, res);

    expect(res.statusCode).toBeNull();
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.consent.status).toBe('revoked');

    expect(revokeConsentMock).toHaveBeenCalledWith(mockConsent.id, mockUser.id);
  });

  test('returns 403 when user is not owner', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: { ...mockConsent, subject_user_id: 'other-user-123' },
      error: null
    });

    const req = createMockRequest(mockUser, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.revokeConsentEndpoint(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toBe('Forbidden');
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  test('allows superadmin to revoke any consent', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: { ...mockConsent, subject_user_id: 'other-user-123' },
      error: null
    });

    revokeConsentMock.mockResolvedValue({
      ...mockConsent,
      status: 'revoked',
      revoked_at: '2026-01-23T00:00:00Z',
      revoked_by: mockSuperadmin.id
    });

    const req = createMockRequest(mockSuperadmin, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.revokeConsentEndpoint(req, res);

    expect(res.statusCode).toBeNull();
    expect(res.jsonData.success).toBe(true);
    expect(revokeConsentMock).toHaveBeenCalled();
  });

  test('returns 400 when consent already revoked', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: { ...mockConsent, status: 'revoked' },
      error: null
    });

    const req = createMockRequest(mockUser, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.revokeConsentEndpoint(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Already revoked');
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  test('returns 404 when consent not found', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: null,
      error: { message: 'Not found' }
    });

    const req = createMockRequest(mockUser, {}, { consentId: 'nonexistent-id' });
    const res = createMockResponse();

    await consentController.revokeConsentEndpoint(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toBe('Consent not found');
  });
});

// ============================================================================
// TESTS: deleteConsent
// ============================================================================

describe('deleteConsent', () => {
  test('allows superadmin to delete consent', async () => {
    mockSupabaseClient.delete.mockReturnThis();
    mockSupabaseClient.eq.mockResolvedValue({
      error: null
    });

    const req = createMockRequest(mockSuperadmin, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.deleteConsent(req, res);

    expect(res.statusCode).toBeNull();
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.message).toBe('Consent deleted successfully');
  });

  test('returns 403 for non-superadmin', async () => {
    const req = createMockRequest(mockUser, {}, { consentId: mockConsent.id });
    const res = createMockResponse();

    await consentController.deleteConsent(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toBe('Forbidden');
    expect(mockSupabaseClient.delete).not.toHaveBeenCalled();
  });
});
