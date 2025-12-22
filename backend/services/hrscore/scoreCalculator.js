/**
 * HRScore Calculator Service
 *
 * Wraps the existing hrkeyScoreService.js and adds:
 * - Persistent storage of score history
 * - Analytics event emission
 * - Fail-soft error handling
 *
 * @module services/hrscore/scoreCalculator
 */

import { createClient } from '@supabase/supabase-js';
import { computeHrkeyScore } from '../../hrkeyScoreService.js';
import { logEvent, EventTypes } from '../analytics/eventTracker.js';
import logger from '../../logger.js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// CALCULATE AND PERSIST SCORE
// ============================================================================

/**
 * Calculate HRKey Score and persist to database.
 *
 * This function:
 * 1. Calls the existing hrkeyScoreService to compute the score
 * 2. Inserts the result into hrkey_scores table
 * 3. Emits analytics events
 * 4. Fails softly - returns null on error, never throws
 *
 * @param {Object} params - Calculation parameters
 * @param {string} params.userId - User ID (candidate)
 * @param {string} [params.roleId=null] - Optional role ID
 * @param {string} [params.triggerSource='manual'] - Trigger source
 * @param {string} [params.referenceId=null] - Reference ID if triggered by reference
 * @param {Object} [params.extraMetadata={}] - Additional metadata
 * @param {Object} [params.req=null] - Express request object (for analytics)
 * @returns {Promise<Object|null>} Persisted score record or null on error
 *
 * @example
 * const score = await calculateAndPersistScore({
 *   userId: 'user-uuid',
 *   roleId: 'role-uuid',
 *   triggerSource: 'reference_validated',
 *   referenceId: 'ref-uuid'
 * });
 */
export async function calculateAndPersistScore({
  userId,
  roleId = null,
  triggerSource = 'manual',
  referenceId = null,
  extraMetadata = {},
  req = null
}) {
  try {
    logger.info('Calculating and persisting HRKey Score', {
      userId,
      roleId,
      triggerSource,
      referenceId
    });

    // ========================================
    // 1. Get user's wallet address (required by hrkeyScoreService)
    // ========================================
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, wallet_address, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for HRScore calculation', {
        userId,
        error: userError?.message
      });
      return null;
    }

    if (!user.wallet_address) {
      logger.warn('User has no wallet address, cannot calculate HRScore', {
        userId
      });
      return null;
    }

    // ========================================
    // 2. Fetch previous score (for delta calculation)
    // ========================================
    const { data: previousScores } = await supabase
      .from('hrkey_scores')
      .select('score, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const previousScore = previousScores && previousScores.length > 0
      ? previousScores[0].score
      : null;

    // ========================================
    // 3. Compute HRKey Score using existing service
    // ========================================
    logger.debug('Calling computeHrkeyScore', {
      subjectWallet: user.wallet_address,
      roleId
    });

    const scoreResult = await computeHrkeyScore({
      subjectWallet: user.wallet_address,
      roleId: roleId || undefined
    });

    // Handle computation failures
    if (!scoreResult.ok) {
      logger.warn('HRScore computation failed', {
        userId,
        roleId,
        reason: scoreResult.reason,
        message: scoreResult.message
      });
      return null;
    }

    // ========================================
    // 4. Insert score into hrkey_scores table
    // ========================================
    const scoreRecord = {
      user_id: userId,
      role_id: roleId,
      score: scoreResult.score,
      raw_prediction: scoreResult.raw_prediction,
      confidence: scoreResult.confidence,
      n_observations: scoreResult.n_observations,
      used_kpis: scoreResult.used_kpis || [],
      kpi_averages: scoreResult.debug?.kpi_averages || {},
      model_info: {
        model_type: scoreResult.model_info?.model_type,
        trained_at: scoreResult.model_info?.trained_at,
        role_scope: scoreResult.model_info?.role_scope,
        metrics: scoreResult.model_info?.metrics
      },
      trigger_source: triggerSource,
      trigger_reference_id: referenceId,
      metadata: {
        ...extraMetadata,
        previous_score: previousScore,
        score_delta: previousScore !== null
          ? parseFloat((scoreResult.score - previousScore).toFixed(2))
          : null,
        feature_vector: scoreResult.debug?.feature_vector,
        target_stats: scoreResult.debug?.target_stats
      },
      created_at: new Date().toISOString()
    };

    const { data: inserted, error: insertError } = await supabase
      .from('hrkey_scores')
      .insert([scoreRecord])
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to insert HRScore into database', {
        userId,
        roleId,
        error: insertError.message,
        code: insertError.code
      });
      return null;
    }

    logger.info('HRScore calculated and persisted successfully', {
      userId,
      roleId,
      score: inserted.score,
      scoreId: inserted.id,
      previousScore,
      delta: inserted.metadata.score_delta,
      triggerSource
    });

    // ========================================
    // 5. Insert snapshot (non-blocking)
    // ========================================
    try {
      const snapshotRecord = {
        user_id: userId,
        score: scoreResult.score,
        breakdown: {
          used_kpis: scoreResult.used_kpis || [],
          kpi_averages: scoreResult.debug?.kpi_averages || {},
          confidence: scoreResult.confidence,
          n_observations: scoreResult.n_observations
        },
        trigger_source: triggerSource
      };

      const { error: snapshotError } = await supabase
        .from('hrscore_snapshots')
        .insert([snapshotRecord]);

      if (snapshotError) {
        logger.warn('Failed to insert HRScore snapshot', {
          userId,
          scoreId: inserted.id,
          error: snapshotError.message
        });
      }
    } catch (snapshotError) {
      logger.warn('Failed to insert HRScore snapshot', {
        userId,
        scoreId: inserted.id,
        error: snapshotError.message
      });
    }

    // ========================================
    // 6. Emit analytics event (non-blocking)
    // ========================================
    try {
      await logEvent({
        userId: userId,
        eventType: EventTypes.HRSCORE_CALCULATED,
        context: {
          scoreId: inserted.id,
          roleId: roleId,
          score: inserted.score,
          previousScore: previousScore,
          scoreDelta: inserted.metadata.score_delta,
          confidence: inserted.confidence,
          nObservations: inserted.n_observations,
          triggerSource: triggerSource,
          referenceId: referenceId
        },
        source: 'backend',
        req
      });

      // Emit improvement/decline events if score changed significantly
      if (previousScore !== null && inserted.metadata.score_delta !== null) {
        const delta = inserted.metadata.score_delta;

        if (Math.abs(delta) >= 5) {
          // Significant change threshold
          const trendEvent = delta > 0
            ? EventTypes.HRSCORE_IMPROVED
            : EventTypes.HRSCORE_DECLINED;

          await logEvent({
            userId: userId,
            eventType: trendEvent,
            context: {
              scoreId: inserted.id,
              roleId: roleId,
              currentScore: inserted.score,
              previousScore: previousScore,
              scoreDelta: delta,
              improvementPercentage: previousScore > 0
                ? parseFloat(((delta / previousScore) * 100).toFixed(2))
                : null
            },
            source: 'backend',
            req
          });
        }
      }
    } catch (analyticsError) {
      // Analytics failures should never block score persistence
      logger.warn('Failed to emit HRScore analytics event', {
        userId,
        scoreId: inserted.id,
        error: analyticsError.message
      });
    }

    // ========================================
    // 7. Return persisted score
    // ========================================
    return inserted;

  } catch (err) {
    // Catch-all for any unexpected errors
    logger.error('Unexpected error in calculateAndPersistScore', {
      userId,
      roleId,
      triggerSource,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

// ============================================================================
// RECALCULATE SCORE (FORCE REFRESH)
// ============================================================================

/**
 * Force recalculation of HRScore for a user.
 *
 * Useful for:
 * - Manual admin triggers
 * - Scheduled batch recalculations
 * - After data corrections
 *
 * @param {Object} params - Same as calculateAndPersistScore
 * @returns {Promise<Object|null>} Persisted score or null
 */
export async function recalculateScore(params) {
  logger.info('Force recalculating HRScore', {
    userId: params.userId,
    roleId: params.roleId
  });

  return await calculateAndPersistScore({
    ...params,
    triggerSource: params.triggerSource || 'manual'
  });
}

// ============================================================================
// BATCH SCORE CALCULATION
// ============================================================================

/**
 * Calculate scores for multiple users in batch.
 *
 * @param {Array<Object>} users - Array of {userId, roleId} objects
 * @param {string} triggerSource - Trigger source for all calculations
 * @returns {Promise<Object>} Results summary
 */
export async function calculateScoresBatch(users, triggerSource = 'scheduled') {
  logger.info('Starting batch HRScore calculation', {
    userCount: users.length,
    triggerSource
  });

  const results = {
    total: users.length,
    successful: 0,
    failed: 0,
    errors: []
  };

  for (const user of users) {
    try {
      const score = await calculateAndPersistScore({
        userId: user.userId,
        roleId: user.roleId,
        triggerSource
      });

      if (score) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          userId: user.userId,
          roleId: user.roleId,
          error: 'Calculation returned null'
        });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({
        userId: user.userId,
        roleId: user.roleId,
        error: err.message
      });
    }
  }

  logger.info('Batch HRScore calculation complete', {
    total: results.total,
    successful: results.successful,
    failed: results.failed
  });

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateAndPersistScore,
  recalculateScore,
  calculateScoresBatch
};
