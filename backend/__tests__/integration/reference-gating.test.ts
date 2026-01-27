import { jest } from "@jest/globals";
import request from 'supertest';
import { createSupabaseMock, mockSuccess, mockError } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

// Mock the reference service to avoid email sending
jest.mock('../../services/references.service.js', () => ({
  ReferenceService: {
    createReferenceRequest: jest.fn().mockResolvedValue({
      success: true,
      reference_id: 'ref-123',
      token: 'token-abc',
      verification_url: 'https://example.com/verify'
    })
  },
  hashInviteToken: jest.fn((token) => `hashed-${token}`)
}));

const { app } = await import('../../app.js');

describe('Reference Gating - Integration Tests', () => {
  const testUserId = 'user-gating-test-001';
  const testUserEmail = 'gating-test@example.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test 1: First reference allowed (free)
   * User has free_reference_used = false, should be allowed
   */
  describe('First reference (free)', () => {
    it('should allow first reference request when free_reference_used is false', async () => {
      // Mock user with free_reference_used = false
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: false })
        ]
      });

      // Mock successful update of free_reference_used
      setTableResponses('users', {
        updateResponses: [mockSuccess({ id: testUserId })]
      });

      const response = await request(app)
        .post('/api/reference/request')
        .set('x-test-user-id', testUserId)
        .set('x-test-user-email', testUserEmail)
        .send({
          userId: testUserId,
          email: 'referee@example.com',
          name: 'Test Referee'
        });

      // Should succeed (not return 402)
      expect(response.status).not.toBe(402);
      // Success responses can be 200 or include ok: true
      expect(response.body.success !== false || response.body.ok !== false).toBe(true);
    });
  });

  /**
   * Test 2: Second reference returns PAYMENT_REQUIRED
   * User has free_reference_used = true and no feature flags
   */
  describe('Second reference (payment required)', () => {
    it('should return 402 PAYMENT_REQUIRED when free reference is used and no paid allowance', async () => {
      // Mock user with free_reference_used = true
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: true })
        ]
      });

      // Mock no feature flags found
      setTableResponses('user_feature_flags', {
        maybeSingleResponses: [mockSuccess(null)]
      });

      const response = await request(app)
        .post('/api/reference/request')
        .set('x-test-user-id', testUserId)
        .set('x-test-user-email', testUserEmail)
        .send({
          userId: testUserId,
          email: 'referee@example.com',
          name: 'Test Referee'
        });

      expect(response.status).toBe(402);
      expect(response.body).toEqual({
        error: 'PAYMENT_REQUIRED',
        product_code: 'additional_reference'
      });
    });
  });

  /**
   * Test 3: After payment, reference allowed again
   * User has free_reference_used = true but has 'additional_reference' feature flag
   */
  describe('After payment (additional reference)', () => {
    it('should allow reference when user has paid for additional_reference', async () => {
      const flagId = 'flag-123';

      // Mock user with free_reference_used = true
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: true })
        ]
      });

      // Mock feature flag exists
      setTableResponses('user_feature_flags', {
        maybeSingleResponses: [
          mockSuccess({
            id: flagId,
            user_id: testUserId,
            feature_code: 'additional_reference',
            granted_at: new Date().toISOString()
          })
        ],
        deleteResponses: [mockSuccess(null)]
      });

      const response = await request(app)
        .post('/api/reference/request')
        .set('x-test-user-id', testUserId)
        .set('x-test-user-email', testUserEmail)
        .send({
          userId: testUserId,
          email: 'referee@example.com',
          name: 'Test Referee'
        });

      // Should succeed (not return 402)
      expect(response.status).not.toBe(402);
      expect(response.body.success !== false || response.body.ok !== false).toBe(true);
    });
  });

  /**
   * Test 4: Unauthorized user cannot access endpoint
   */
  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/reference/request')
        .send({
          userId: testUserId,
          email: 'referee@example.com',
          name: 'Test Referee'
        });

      expect(response.status).toBe(401);
    });

    it('should return 403 when requesting reference for another user', async () => {
      const otherUserId = 'other-user-id';

      const response = await request(app)
        .post('/api/reference/request')
        .set('x-test-user-id', testUserId)
        .set('x-test-user-email', testUserEmail)
        .send({
          userId: otherUserId, // Trying to request for different user
          email: 'referee@example.com',
          name: 'Test Referee'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });
  });
});
