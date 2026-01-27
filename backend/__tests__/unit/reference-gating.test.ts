import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { createSupabaseMock, mockSuccess, mockError } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

// Mock Supabase client before importing the service
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const { checkReferenceAllowance, consumeReferenceAllowance } = await import('../../services/referenceGating.service.js');

describe('Reference Gating Service - Unit Tests', () => {
  const testUserId = 'unit-test-user-001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkReferenceAllowance', () => {
    it('should return allowed=true with consumeType=free when free reference is available', async () => {
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: false })
        ]
      });

      const result = await checkReferenceAllowance(testUserId);

      expect(result.allowed).toBe(true);
      expect(result.consumeType).toBe('free');
    });

    it('should return allowed=false with reason=PAYMENT_REQUIRED when free is used and no flags', async () => {
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: true })
        ]
      });

      setTableResponses('user_feature_flags', {
        maybeSingleResponses: [mockSuccess(null)]
      });

      const result = await checkReferenceAllowance(testUserId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('PAYMENT_REQUIRED');
    });

    it('should return allowed=true with consumeType=paid when user has feature flag', async () => {
      const flagId = 'flag-unit-test-001';

      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: true })
        ]
      });

      setTableResponses('user_feature_flags', {
        maybeSingleResponses: [
          mockSuccess({
            id: flagId,
            user_id: testUserId,
            feature_code: 'additional_reference',
            granted_at: new Date().toISOString()
          })
        ]
      });

      const result = await checkReferenceAllowance(testUserId);

      expect(result.allowed).toBe(true);
      expect(result.consumeType).toBe('paid');
      expect(result.flagId).toBe(flagId);
    });

    it('should fail-safe and allow on user fetch error', async () => {
      setTableResponses('users', {
        singleResponses: [mockError('Database connection failed', 'PGRST000')]
      });

      const result = await checkReferenceAllowance(testUserId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('fallback_on_error');
      expect(result.consumeType).toBeNull();
    });

    it('should fail-closed on feature flag fetch error', async () => {
      setTableResponses('users', {
        singleResponses: [
          mockSuccess({ id: testUserId, free_reference_used: true })
        ]
      });

      setTableResponses('user_feature_flags', {
        maybeSingleResponses: [mockError('Feature flags table unavailable', 'PGRST000')]
      });

      const result = await checkReferenceAllowance(testUserId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('PAYMENT_REQUIRED');
    });
  });

  describe('consumeReferenceAllowance', () => {
    it('should mark free reference as used', async () => {
      setTableResponses('users', {
        updateResponses: [mockSuccess({ id: testUserId, free_reference_used: true })]
      });

      const result = await consumeReferenceAllowance(testUserId, 'free');

      expect(result.success).toBe(true);
    });

    it('should delete feature flag for paid reference', async () => {
      const flagId = 'flag-to-delete';

      setTableResponses('user_feature_flags', {
        deleteResponses: [mockSuccess(null)]
      });

      const result = await consumeReferenceAllowance(testUserId, 'paid', flagId);

      expect(result.success).toBe(true);
    });

    it('should return success for null consumeType (fallback mode)', async () => {
      const result = await consumeReferenceAllowance(testUserId, null as any);

      expect(result.success).toBe(true);
    });

    it('should return error for invalid consumeType', async () => {
      const result = await consumeReferenceAllowance(testUserId, 'invalid' as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid consume type');
    });

    it('should handle update error gracefully', async () => {
      setTableResponses('users', {
        updateResponses: [mockError('Update failed', 'UPDATE_ERROR')]
      });

      const result = await consumeReferenceAllowance(testUserId, 'free');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
