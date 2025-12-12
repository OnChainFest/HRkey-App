/**
 * HRScore Auto-Trigger Service
 *
 * Handles automatic HRScore recalculation when:
 * - New references are validated by RVL
 * - New KPI observations are added
 * - Scheduled batch updates run
 *
 * All functions fail softly and never throw errors.
 *
 * @module services/hrscore/autoTrigger
 */

import { createClient } from '@supabase/supabase-js';
import { calculateAndPersistScore } from './scoreCalculator.js';
import logger from '../../logger.js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// ON REFERENCE VALIDATED
// ============================================================================

/**
 * Auto-trigger HRScore recalculation when a reference is validated.
 *
 * This function:
 * 1. Fetches the validated reference
 * 2. Extracts owner_id (candidate)
 * 3. Determines roleId (if available)
 * 4. Triggers score calculation
 *
 * IMPORTANT: This function NEVER throws errors. It logs failures and returns.
 *
 * @param {string} referenceId - Reference UUID
 * @param {Object} [req=null] - Express request object (for analytics)
 * @returns {Promise<Object|null>} Calculated score or null
 *
 * @example
 * // In server.js after RVL validation:
 * try {
 *   await autoTrigger.onReferenceValidated(reference.id);
 * } catch (err) {
 *   logger.warn('HRScore auto-trigger failed', { error: err.message });
 * }
 */
export async function onReferenceValidated(referenceId, req = null) {
  try {
    logger.info('HRScore auto-trigger: reference validated', {
      referenceId
    });

    // ========================================
    // 1. Fetch the reference
    // ========================================
    const { data: reference, error: refError } = await supabase
      .from('references')
      .select('id, owner_id, validation_status, validated_data, fraud_score')
      .eq('id', referenceId)
      .single();

    if (refError || !reference) {
      logger.warn('Reference not found for HRScore auto-trigger', {
        referenceId,
        error: refError?.message
      });
      return null;
    }

    // Skip if not validated or flagged
    if (reference.validation_status !== 'VALIDATED') {
      logger.debug('Reference not validated, skipping HRScore calculation', {
        referenceId,
        validationStatus: reference.validation_status
      });
      return null;
    }

    if (reference.fraud_score && reference.fraud_score >= 70) {
      logger.warn('Reference has high fraud score, skipping HRScore calculation', {
        referenceId,
        fraudScore: reference.fraud_score
      });
      return null;
    }

    // ========================================
    // 2. Extract candidate (owner)
    // ========================================
    const candidateId = reference.owner_id;

    if (!candidateId) {
      logger.warn('Reference has no owner_id, cannot calculate HRScore', {
        referenceId
      });
      return null;
    }

    // ========================================
    // 3. Determine role (if available)
    // ========================================
    // Check if validated_data contains role information
    let roleId = null;

    if (reference.validated_data && reference.validated_data.role_id) {
      roleId = reference.validated_data.role_id;
    }

    // If no role in validated_data, try to infer from KPI observations
    if (!roleId) {
      const { data: recentObservations } = await supabase
        .from('kpi_observations')
        .select('role_id')
        .eq('subject_wallet', (await getUserWallet(candidateId)))
        .not('role_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentObservations && recentObservations.length > 0) {
        roleId = recentObservations[0].role_id;
        logger.debug('Inferred roleId from KPI observations', {
          referenceId,
          roleId
        });
      }
    }

    // ========================================
    // 4. Calculate and persist score
    // ========================================
    logger.info('Triggering HRScore calculation', {
      referenceId,
      candidateId,
      roleId,
      triggerSource: 'reference_validated'
    });

    const score = await calculateAndPersistScore({
      userId: candidateId,
      roleId: roleId,
      triggerSource: 'reference_validated',
      referenceId: referenceId,
      extraMetadata: {
        reference_validation_status: reference.validation_status,
        reference_fraud_score: reference.fraud_score
      },
      req
    });

    if (score) {
      logger.info('HRScore auto-calculation successful', {
        referenceId,
        candidateId,
        scoreId: score.id,
        score: score.score
      });
    } else {
      logger.warn('HRScore auto-calculation returned null', {
        referenceId,
        candidateId
      });
    }

    return score;

  } catch (err) {
    // Fail softly - never throw
    logger.error('Error in onReferenceValidated auto-trigger', {
      referenceId,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

// ============================================================================
// ON KPI OBSERVATION CREATED
// ============================================================================

/**
 * Auto-trigger HRScore recalculation when a KPI observation is created.
 *
 * @param {string} subjectWallet - Subject wallet address
 * @param {string} roleId - Role ID
 * @param {Object} [req=null] - Express request object
 * @returns {Promise<Object|null>} Calculated score or null
 */
export async function onKpiObservationCreated(subjectWallet, roleId, req = null) {
  try {
    logger.info('HRScore auto-trigger: KPI observation created', {
      subjectWallet,
      roleId
    });

    // Find user by wallet address
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, wallet_address')
      .eq('wallet_address', subjectWallet)
      .single();

    if (userError || !user) {
      logger.warn('User not found by wallet for HRScore auto-trigger', {
        subjectWallet,
        error: userError?.message
      });
      return null;
    }

    // Calculate and persist score
    const score = await calculateAndPersistScore({
      userId: user.id,
      roleId: roleId,
      triggerSource: 'kpi_observation',
      req
    });

    if (score) {
      logger.info('HRScore auto-calculation successful after KPI observation', {
        subjectWallet,
        userId: user.id,
        roleId,
        scoreId: score.id,
        score: score.score
      });
    }

    return score;

  } catch (err) {
    logger.error('Error in onKpiObservationCreated auto-trigger', {
      subjectWallet,
      roleId,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

// ============================================================================
// SCHEDULED BATCH RECALCULATION
// ============================================================================

/**
 * Recalculate scores for all active users (batch job).
 *
 * This should be run periodically (e.g., daily) to keep scores fresh.
 *
 * @param {Object} options - Batch options
 * @param {number} [options.batchSize=50] - Users per batch
 * @param {number} [options.minObservations=3] - Minimum observations required
 * @returns {Promise<Object>} Batch results
 */
export async function scheduledBatchRecalculation({
  batchSize = 50,
  minObservations = 3
} = {}) {
  try {
    logger.info('Starting scheduled HRScore batch recalculation', {
      batchSize,
      minObservations
    });

    // ========================================
    // 1. Find users with KPI observations
    // ========================================
    const { data: usersWithObservations, error: queryError } = await supabase.rpc(
      'get_users_with_kpi_observations',
      { min_count: minObservations }
    ).limit(batchSize);

    if (queryError) {
      // Fallback: Query users directly
      const { data: fallbackUsers } = await supabase
        .from('users')
        .select('id, wallet_address')
        .not('wallet_address', 'is', null)
        .limit(batchSize);

      if (!fallbackUsers || fallbackUsers.length === 0) {
        logger.warn('No users found for batch recalculation');
        return {
          total: 0,
          successful: 0,
          failed: 0
        };
      }

      // Use fallback user list
      usersWithObservations = fallbackUsers.map(u => ({
        user_id: u.id,
        role_id: null
      }));
    }

    // ========================================
    // 2. Calculate scores for each user
    // ========================================
    const results = {
      total: usersWithObservations.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const userRecord of usersWithObservations) {
      try {
        const score = await calculateAndPersistScore({
          userId: userRecord.user_id,
          roleId: userRecord.role_id || null,
          triggerSource: 'scheduled'
        });

        if (score) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            userId: userRecord.user_id,
            error: 'Calculation returned null'
          });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({
          userId: userRecord.user_id,
          error: err.message
        });
      }
    }

    logger.info('Scheduled HRScore batch recalculation complete', {
      total: results.total,
      successful: results.successful,
      failed: results.failed
    });

    return results;

  } catch (err) {
    logger.error('Error in scheduledBatchRecalculation', {
      error: err.message,
      stack: err.stack
    });
    return {
      total: 0,
      successful: 0,
      failed: 1,
      errors: [{ error: err.message }]
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user's wallet address by user ID.
 *
 * @private
 * @param {string} userId - User UUID
 * @returns {Promise<string|null>} Wallet address or null
 */
async function getUserWallet(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.wallet_address;
  } catch (err) {
    logger.error('Error fetching user wallet', {
      userId,
      error: err.message
    });
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  onReferenceValidated,
  onKpiObservationCreated,
  scheduledBatchRecalculation
};
