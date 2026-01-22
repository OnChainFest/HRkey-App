// ============================================================================
// Consent Validation Middleware Tests - P0 Security Enhancement
// ============================================================================
// Tests for consent enforcement and audit logging
// ============================================================================

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { validateConsent, requireApprovedDataAccess } from '../../middleware/validateConsent.js';
import { createConsent, revokeConsent, checkConsent } from '../../utils/consentManager.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
// SETUP & TEARDOWN
// ============================================================================

let testConsentIds = [];

beforeEach(async () => {
  // Clean up test data before each test
  await cleanupTestData();
});

afterEach(async () => {
  // Clean up test data after each test
  await cleanupTestData();
});

async function cleanupTestData() {
  // Delete test consents
  if (testConsentIds.length > 0) {
    await supabase.from('consents').delete().in('id', testConsentIds);
    testConsentIds = [];
  }

  // Delete test audit events (cleanup by actor_user_id)
  const testUserIds = Object.values(mockUsers).map((u) => u.id);
  await supabase.from('audit_events').delete().in('actor_user_id', testUserIds);
}

// ============================================================================
// TESTS: validateConsent middleware
// ============================================================================

describe('validateConsent middleware', () => {
  // ========================================
  // Test: No consent exists
  // ========================================
  test('returns 403 when consent does not exist', async () => {
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

    // Verify audit event was logged
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.requester.id)
      .eq('result', 'denied');

    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents[0]).toMatchObject({
      result: 'denied',
      reason: 'no_consent',
      target_type: 'references'
    });
  });

  // ========================================
  // Test: Valid consent exists
  // ========================================
  test('returns 200 when consent is valid and active', async () => {
    // Create valid consent
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'test_access',
      scope: ['read']
    });
    testConsentIds.push(consent.id);

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
    expect(res.statusCode).toBeNull(); // No error response
    expect(req.consent).toBeDefined();
    expect(req.consent.id).toBe(consent.id);

    // Verify audit event was logged as 'allowed'
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.requester.id)
      .eq('result', 'allowed');

    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents[0]).toMatchObject({
      result: 'allowed',
      reason: 'valid_consent',
      consent_id: consent.id
    });
  });

  // ========================================
  // Test: Revoked consent
  // ========================================
  test('returns 403 when consent is revoked', async () => {
    // Create consent
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'test_access',
      scope: ['read']
    });
    testConsentIds.push(consent.id);

    // Revoke consent
    await revokeConsent(consent.id, mockUsers.dataOwner.id);

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
    expect(res.jsonData.reason).toBe('no_consent'); // Revoked consents are not returned
    expect(next).not.toHaveBeenCalled();
  });

  // ========================================
  // Test: Expired consent
  // ========================================
  test('returns 403 when consent is expired', async () => {
    // Create consent that expires in the past
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'test_access',
      scope: ['read'],
      expiresAt: expiredDate
    });
    testConsentIds.push(consent.id);

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

  // ========================================
  // Test: Superadmin bypass
  // ========================================
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

    // Verify audit event logged with superadmin_override
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.superadmin.id)
      .eq('result', 'allowed');

    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents[0].reason).toBe('superadmin_override');
  });

  // ========================================
  // Test: Self-access bypass
  // ========================================
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

    // Verify audit event logged with self_access
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.dataOwner.id)
      .eq('result', 'allowed');

    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents[0].reason).toBe('self_access');
  });

  // ========================================
  // Test: Company consent
  // ========================================
  test('validates consent granted to company', async () => {
    // Create consent for company
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToOrg: mockCompany.id,
      resourceType: 'references',
      purpose: 'hiring_decision',
      scope: ['read']
    });
    testConsentIds.push(consent.id);

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
    expect(req.consent.id).toBe(consent.id);
  });

  // ========================================
  // Test: Audit event logging on deny
  // ========================================
  test('logs audit event with result=denied when blocked', async () => {
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

    expect(res.statusCode).toBe(403);

    // Verify audit event
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.requester.id)
      .eq('target_owner_id', mockUsers.dataOwner.id)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0]).toMatchObject({
      actor_user_id: mockUsers.requester.id,
      action: 'read',
      target_type: 'kpi_observations',
      target_id: 'kpi-123',
      target_owner_id: mockUsers.dataOwner.id,
      result: 'denied',
      reason: 'no_consent'
    });
  });

  // ========================================
  // Test: Audit event logging on allow
  // ========================================
  test('logs audit event with result=allowed when granted', async () => {
    // Create valid consent
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'hrkey_score',
      purpose: 'performance_review',
      scope: ['read']
    });
    testConsentIds.push(consent.id);

    const middleware = validateConsent({
      resourceType: 'hrkey_score',
      getTargetOwnerId: async () => mockUsers.dataOwner.id,
      getTargetId: async () => 'score-456',
      getGrantee: async () => ({ companyId: null, userId: mockUsers.requester.id }),
      allowSuperadmin: false,
      allowSelf: false
    });

    const req = createMockRequest(mockUsers.requester);
    const res = createMockResponse();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Verify audit event
    const { data: auditEvents } = await supabase
      .from('audit_events')
      .select('*')
      .eq('actor_user_id', mockUsers.requester.id)
      .eq('target_owner_id', mockUsers.dataOwner.id)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0]).toMatchObject({
      actor_user_id: mockUsers.requester.id,
      action: 'read',
      target_type: 'hrkey_score',
      target_id: 'score-456',
      target_owner_id: mockUsers.dataOwner.id,
      result: 'allowed',
      reason: 'valid_consent',
      consent_id: consent.id,
      purpose: 'performance_review'
    });
  });
});

// ============================================================================
// TESTS: checkConsent helper function
// ============================================================================

describe('checkConsent function', () => {
  test('returns hasConsent=true for valid consent', async () => {
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'profile',
      purpose: 'background_check',
      scope: ['read']
    });
    testConsentIds.push(consent.id);

    const result = await checkConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'profile'
    });

    expect(result.hasConsent).toBe(true);
    expect(result.consent.id).toBe(consent.id);
    expect(result.reason).toBe('valid_consent');
  });

  test('returns hasConsent=false when no consent exists', async () => {
    const result = await checkConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'nonexistent_resource'
    });

    expect(result.hasConsent).toBe(false);
    expect(result.consent).toBeNull();
    expect(result.reason).toBe('no_consent');
  });
});
