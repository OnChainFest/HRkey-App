/**
 * Reference Gating Service
 *
 * Handles the free reference allocation and payment gating:
 * - First reference request is FREE
 * - Subsequent references require payment (Stripe)
 *
 * Flow:
 * 1. Check users.free_reference_used
 * 2. If false → allow, mark true after success
 * 3. If true → check user_feature_flags for 'additional_reference'
 * 4. If flag exists → allow and consume flag
 * 5. If no flag → return PAYMENT_REQUIRED
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase;
const getSupabase = () => {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
};

/**
 * Check if user can request a reference
 *
 * @param {string} userId - User ID
 * @returns {Promise<{allowed: boolean, reason?: string, consumeType?: 'free'|'paid'}>}
 */
export async function checkReferenceAllowance(userId) {
  try {
    // 1. Get user's free reference status
    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('free_reference_used')
      .eq('id', userId)
      .single();

    if (userError) {
      logger.error('Failed to fetch user for reference gating', {
        userId,
        error: userError.message
      });
      // Fail-safe: allow on database error to not block legitimate users
      // The reference service will handle its own validation
      return { allowed: true, reason: 'fallback_on_error', consumeType: null };
    }

    // 2. If free reference not used yet, allow it
    if (!user.free_reference_used) {
      return { allowed: true, consumeType: 'free' };
    }

    // 3. Free reference already used - check for paid allowance
    const { data: featureFlag, error: flagError } = await getSupabase()
      .from('user_feature_flags')
      .select('id, feature_code, granted_at')
      .eq('user_id', userId)
      .eq('feature_code', 'additional_reference')
      .limit(1)
      .maybeSingle();

    if (flagError) {
      logger.error('Failed to check feature flags for reference gating', {
        userId,
        error: flagError.message
      });
      // Fail-closed: if we can't verify payment, require payment
      return { allowed: false, reason: 'PAYMENT_REQUIRED' };
    }

    // 4. If user has paid for additional reference, allow
    if (featureFlag) {
      return { allowed: true, consumeType: 'paid', flagId: featureFlag.id };
    }

    // 5. No free reference, no paid allowance
    return { allowed: false, reason: 'PAYMENT_REQUIRED' };

  } catch (error) {
    logger.error('Exception in checkReferenceAllowance', {
      userId,
      error: error.message,
      stack: error.stack
    });
    // Fail-closed on exception
    return { allowed: false, reason: 'PAYMENT_REQUIRED' };
  }
}

/**
 * Consume the reference allowance after successful reference creation
 *
 * @param {string} userId - User ID
 * @param {'free'|'paid'} consumeType - Type of allowance to consume
 * @param {string} flagId - Feature flag ID (only for paid type)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function consumeReferenceAllowance(userId, consumeType, flagId = null) {
  try {
    if (consumeType === 'free') {
      // Mark free reference as used
      const { error } = await getSupabase()
        .from('users')
        .update({ free_reference_used: true })
        .eq('id', userId);

      if (error) {
        logger.error('Failed to mark free reference as used', {
          userId,
          error: error.message
        });
        return { success: false, error: error.message };
      }

      logger.info('Free reference consumed', { userId });
      return { success: true };
    }

    if (consumeType === 'paid' && flagId) {
      // Delete the feature flag (single-use)
      const { error } = await getSupabase()
        .from('user_feature_flags')
        .delete()
        .eq('id', flagId);

      if (error) {
        logger.error('Failed to consume paid reference allowance', {
          userId,
          flagId,
          error: error.message
        });
        return { success: false, error: error.message };
      }

      logger.info('Paid reference allowance consumed', { userId, flagId });
      return { success: true };
    }

    // Null consumeType means fallback mode, nothing to consume
    if (consumeType === null) {
      return { success: true };
    }

    return { success: false, error: 'Invalid consume type' };

  } catch (error) {
    logger.error('Exception in consumeReferenceAllowance', {
      userId,
      consumeType,
      flagId,
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

export default {
  checkReferenceAllowance,
  consumeReferenceAllowance
};
