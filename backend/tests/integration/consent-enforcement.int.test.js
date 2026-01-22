// ============================================================================
// Consent Enforcement Integration Tests
// ============================================================================
// Tests that validateConsent middleware correctly protects sensitive endpoints
// Unit tests with mocks (NO real Supabase required)
// ============================================================================

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { validateConsent } from '../../middleware/validateConsent.js';
import * as consentManagerModule from '../../utils/consentManager.js';

// Mock consentManager module
jest.unstable_mockModule('../../utils/consentManager.js', () => ({
  checkConsent: jest.fn(),
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
  company: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'company@example.com',
    role: 'user',
    companyId: '00000000-0000-0000-0000-000000000010'
  },
  superadmin: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'admin@example.com',
    role: 'superadmin'
  },
  unauthorized: {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'unauthorized@example.com',
    role: 'user'
  }
};

const mockConsent = {
  id: 'consent-123',
  subject_user_id: mockUsers.dataOwner.id,
  granted_to_org: mockUsers.company.companyId,
  resource_type: 'references',
  scope: ['read'],
  purpose: 'hiring_decision',
  status: 'active',
  granted_at: '2026-01-22T00:00:00Z',
  expires_at: null
};

// ============================================================================
// TEST APP SETUP
// ============================================================================

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  app.use((req, res, next) => {
    // Attach user from test headers
    const userId = req.headers['x-test-user-id'];
    if (userId) {
      const user = Object.values(mockUsers).find((u) => u.id === userId);
      req.user = user;
    }
    next();
  });

  // Test endpoint: /api/references/candidate/:candidateId
  app.get(
    '/api/references/candidate/:candidateId',
    validateConsent({
      resourceType: 'references',
      getTargetOwnerId: async (req) => req.params.candidateId,
      getTargetId: async (req) => null,
      getGrantee: async (req) => ({
        companyId: req.user?.companyId || null,
        userId: req.user?.companyId ? null : req.user?.id
      }),
      action: 'read',
      allowSuperadmin: true,
      allowSelf: true
    }),
    (req, res) => {
      res.json({
        ok: true,
        candidateId: req.params.candidateId,
        references: [{ id: 'ref-1', summary: 'Great developer' }]
      });
    }
  );

  // Test endpoint: /api/hrscore/user/:userId/latest
  app.get(
    '/api/hrscore/user/:userId/latest',
    validateConsent({
      resourceType: 'hrkey_score',
      getTargetOwnerId: async (req) => req.params.userId,
      getTargetId: async (req) => null,
      getGrantee: async (req) => ({
        companyId: req.user?.companyId || null,
        userId: req.user?.companyId ? null : req.user?.id
      }),
      action: 'read',
      allowSuperadmin: true,
      allowSelf: true
    }),
    (req, res) => {
      res.json({
        success: true,
        score: {
          id: 'score-1',
          user_id: req.params.userId,
          score: 85.5,
          confidence: 0.92
        }
      });
    }
  );

  // Test endpoint: /api/candidates/:userId/evaluation
  app.get(
    '/api/candidates/:userId/evaluation',
    validateConsent({
      resourceType: 'profile',
      getTargetOwnerId: async (req) => req.params.userId,
      getTargetId: async (req) => null,
      getGrantee: async (req) => ({
        companyId: req.user?.companyId || null,
        userId: req.user?.companyId ? null : req.user?.id
      }),
      action: 'read',
      allowSuperadmin: true,
      allowSelf: true
    }),
    (req, res) => {
      res.json({
        ok: true,
        userId: req.params.userId,
        evaluation: { overall_score: 90 }
      });
    }
  );

  return app;
}

// ============================================================================
// SETUP
// ============================================================================

let checkConsentMock;
let logAuditEventMock;
let app;

beforeEach(() => {
  // Get fresh mock references
  checkConsentMock = consentManagerModule.checkConsent;
  logAuditEventMock = consentManagerModule.logAuditEvent;

  // Clear all mocks
  jest.clearAllMocks();

  // Setup default mock implementations
  logAuditEventMock.mockResolvedValue({ id: 'audit-event-123' });

  // Create fresh test app
  app = createTestApp();
});

// ============================================================================
// TESTS: References Endpoint
// ============================================================================

describe('GET /api/references/candidate/:candidateId', () => {
  test('returns 403 when no consent exists', async () => {
    // Mock: No consent
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'no_consent'
    });

    const response = await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.company.id);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: 'Forbidden',
      message: 'You do not have consent to access this resource',
      reason: 'no_consent'
    });

    // Verify audit event logged as denied
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'denied',
        reason: 'no_consent',
        targetType: 'references'
      })
    );
  });

  test('returns 200 when valid consent exists', async () => {
    // Mock: Valid consent
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: mockConsent,
      reason: 'valid_consent'
    });

    const response = await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.company.id);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.references).toBeDefined();

    // Verify audit event logged as allowed
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'allowed',
        reason: 'valid_consent',
        targetType: 'references',
        consentId: mockConsent.id
      })
    );
  });

  test('returns 200 for self-access without consent', async () => {
    const response = await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.dataOwner.id);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    // Verify checkConsent was NOT called (bypassed)
    expect(checkConsentMock).not.toHaveBeenCalled();

    // Verify audit event logged with self_access
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'allowed',
        reason: 'self_access'
      })
    );
  });

  test('returns 200 for superadmin without consent', async () => {
    const response = await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.superadmin.id);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    // Verify checkConsent was NOT called (bypassed)
    expect(checkConsentMock).not.toHaveBeenCalled();

    // Verify audit event logged with superadmin_override
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'allowed',
        reason: 'superadmin_override'
      })
    );
  });

  test('returns 401 when not authenticated', async () => {
    const response = await request(app).get(
      `/api/references/candidate/${mockUsers.dataOwner.id}`
    );
    // No x-test-user-id header = no user

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });
});

// ============================================================================
// TESTS: HRScore Endpoint
// ============================================================================

describe('GET /api/hrscore/user/:userId/latest', () => {
  test('returns 403 when no consent exists', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'no_consent'
    });

    const response = await request(app)
      .get(`/api/hrscore/user/${mockUsers.dataOwner.id}/latest`)
      .set('x-test-user-id', mockUsers.unauthorized.id);

    expect(response.status).toBe(403);
    expect(response.body.reason).toBe('no_consent');

    // Verify correct resource type
    expect(checkConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'hrkey_score'
      })
    );
  });

  test('returns 200 when valid consent exists', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: { ...mockConsent, resource_type: 'hrkey_score' },
      reason: 'valid_consent'
    });

    const response = await request(app)
      .get(`/api/hrscore/user/${mockUsers.dataOwner.id}/latest`)
      .set('x-test-user-id', mockUsers.company.id);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.score).toBeDefined();
  });

  test('returns 200 for self-access', async () => {
    const response = await request(app)
      .get(`/api/hrscore/user/${mockUsers.dataOwner.id}/latest`)
      .set('x-test-user-id', mockUsers.dataOwner.id);

    expect(response.status).toBe(200);
    expect(checkConsentMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// TESTS: Candidate Evaluation Endpoint
// ============================================================================

describe('GET /api/candidates/:userId/evaluation', () => {
  test('returns 403 when no consent exists', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'no_consent'
    });

    const response = await request(app)
      .get(`/api/candidates/${mockUsers.dataOwner.id}/evaluation`)
      .set('x-test-user-id', mockUsers.unauthorized.id);

    expect(response.status).toBe(403);

    // Verify correct resource type
    expect(checkConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'profile'
      })
    );
  });

  test('returns 200 when valid consent exists', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: { ...mockConsent, resource_type: 'profile' },
      reason: 'valid_consent'
    });

    const response = await request(app)
      .get(`/api/candidates/${mockUsers.dataOwner.id}/evaluation`)
      .set('x-test-user-id', mockUsers.company.id);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.evaluation).toBeDefined();
  });

  test('returns 200 for self-access', async () => {
    const response = await request(app)
      .get(`/api/candidates/${mockUsers.dataOwner.id}/evaluation`)
      .set('x-test-user-id', mockUsers.dataOwner.id);

    expect(response.status).toBe(200);
    expect(checkConsentMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// TESTS: Audit Event Logging
// ============================================================================

describe('Audit event logging', () => {
  test('logs denied access with correct metadata', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: false,
      consent: null,
      reason: 'no_consent'
    });

    await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.unauthorized.id);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.unauthorized.id,
        action: 'read',
        targetType: 'references',
        targetOwnerId: mockUsers.dataOwner.id,
        result: 'denied',
        reason: 'no_consent',
        consentId: null
      })
    );
  });

  test('logs allowed access with consent ID', async () => {
    checkConsentMock.mockResolvedValue({
      hasConsent: true,
      consent: mockConsent,
      reason: 'valid_consent'
    });

    await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.company.id);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.company.id,
        action: 'read',
        targetType: 'references',
        targetOwnerId: mockUsers.dataOwner.id,
        result: 'allowed',
        reason: 'valid_consent',
        consentId: mockConsent.id,
        purpose: mockConsent.purpose
      })
    );
  });

  test('logs superadmin override', async () => {
    await request(app)
      .get(`/api/references/candidate/${mockUsers.dataOwner.id}`)
      .set('x-test-user-id', mockUsers.superadmin.id);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mockUsers.superadmin.id,
        result: 'allowed',
        reason: 'superadmin_override',
        purpose: 'superadmin_access'
      })
    );
  });
});
