/**
 * HRScore History Service
 *
 * Provides functions to query historical HRKey Scores:
 * - Latest scores per user/role
 * - Score evolution over time
 * - Score improvement metrics
 *
 * @module services/hrscore/scoreHistory
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// GET LATEST SCORE
// ============================================================================

/**
 * Get the most recent HRKey Score for a user.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {string} [params.roleId=null] - Optional role filter
 * @returns {Promise<Object|null>} Latest score record or null
 *
 * @example
 * const latest = await getLatestScore({ userId: 'user-uuid' });
 * console.log(latest.score, latest.confidence, latest.created_at);
 */
export async function getLatestScore({ userId, roleId = null }) {
  try {
    logger.debug('Fetching latest HRScore', { userId, roleId });

    let query = supabase
      .from('hrkey_scores')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (roleId) {
      query = query.eq('role_id', roleId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error('Error fetching latest HRScore', {
        userId,
        roleId,
        error: error.message
      });
      return null;
    }

    return data;
  } catch (err) {
    logger.error('Unexpected error in getLatestScore', {
      userId,
      roleId,
      error: err.message
    });
    return null;
  }
}

// ============================================================================
// GET SCORE HISTORY
// ============================================================================

/**
 * Get historical HRKey Scores for a user.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {string} [params.roleId=null] - Optional role filter
 * @param {number} [params.days=90] - Number of days to look back
 * @param {number} [params.limit=100] - Max number of records
 * @returns {Promise<Array>} Array of score records (ordered newest first)
 *
 * @example
 * const history = await getScoreHistory({
 *   userId: 'user-uuid',
 *   days: 30
 * });
 */
export async function getScoreHistory({
  userId,
  roleId = null,
  days = 90,
  limit = 100
}) {
  try {
    logger.debug('Fetching HRScore history', {
      userId,
      roleId,
      days,
      limit
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query = supabase
      .from('hrkey_scores')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (roleId) {
      query = query.eq('role_id', roleId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching HRScore history', {
        userId,
        roleId,
        days,
        error: error.message
      });
      return [];
    }

    // Calculate deltas between consecutive scores
    const historyWithDeltas = (data || []).map((score, index) => {
      const nextScore = index < data.length - 1 ? data[index + 1] : null;

      return {
        ...score,
        previous_score: nextScore ? nextScore.score : null,
        score_delta: nextScore
          ? parseFloat((score.score - nextScore.score).toFixed(2))
          : null,
        score_trend: nextScore
          ? score.score > nextScore.score
            ? 'improved'
            : score.score < nextScore.score
            ? 'declined'
            : 'unchanged'
          : 'first_score'
      };
    });

    return historyWithDeltas;
  } catch (err) {
    logger.error('Unexpected error in getScoreHistory', {
      userId,
      roleId,
      error: err.message
    });
    return [];
  }
}

// ============================================================================
// GET SCORE EVOLUTION
// ============================================================================

/**
 * Get score evolution with rich analytics (uses materialized view).
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {string} [params.roleId=null] - Optional role filter
 * @param {number} [params.days=90] - Number of days to look back
 * @returns {Promise<Array>} Array of evolution records
 */
export async function getScoreEvolution({
  userId,
  roleId = null,
  days = 90
}) {
  try {
    logger.debug('Fetching HRScore evolution', {
      userId,
      roleId,
      days
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query = supabase
      .from('hrkey_score_evolution')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false });

    if (roleId) {
      query = query.eq('role_id', roleId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching HRScore evolution', {
        userId,
        roleId,
        error: error.message
      });
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('Unexpected error in getScoreEvolution', {
      userId,
      roleId,
      error: err.message
    });
    return [];
  }
}

// ============================================================================
// GET SCORE IMPROVEMENT
// ============================================================================

/**
 * Calculate score improvement over a period.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {string} [params.roleId=null] - Optional role filter
 * @param {number} [params.days=30] - Period to measure
 * @returns {Promise<Object>} Improvement metrics
 */
export async function getScoreImprovement({
  userId,
  roleId = null,
  days = 30
}) {
  try {
    logger.debug('Calculating score improvement', {
      userId,
      roleId,
      days
    });

    const history = await getScoreHistory({ userId, roleId, days, limit: 1000 });

    if (history.length < 2) {
      return {
        hasImprovement: false,
        message: 'Not enough historical data',
        currentScore: history[0]?.score || null,
        dataPoints: history.length
      };
    }

    const latestScore = history[0].score;
    const earliestScore = history[history.length - 1].score;
    const absoluteChange = latestScore - earliestScore;
    const percentageChange = earliestScore > 0
      ? (absoluteChange / earliestScore) * 100
      : 0;

    const maxScore = Math.max(...history.map(h => h.score));
    const minScore = Math.min(...history.map(h => h.score));

    return {
      hasImprovement: absoluteChange > 0,
      currentScore: latestScore,
      initialScore: earliestScore,
      absoluteChange: parseFloat(absoluteChange.toFixed(2)),
      percentageChange: parseFloat(percentageChange.toFixed(2)),
      maxScore,
      minScore,
      scoreRange: parseFloat((maxScore - minScore).toFixed(2)),
      dataPoints: history.length,
      period: {
        days,
        startDate: history[history.length - 1].created_at,
        endDate: history[0].created_at
      }
    };
  } catch (err) {
    logger.error('Unexpected error in getScoreImprovement', {
      userId,
      roleId,
      error: err.message
    });
    return {
      hasImprovement: false,
      message: 'Error calculating improvement',
      error: err.message
    };
  }
}

// ============================================================================
// GET SCORE STATS
// ============================================================================

/**
 * Get statistical summary of a user's scores.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {string} [params.roleId=null] - Optional role filter
 * @param {number} [params.days=90] - Period to analyze
 * @returns {Promise<Object>} Statistical summary
 */
export async function getScoreStats({
  userId,
  roleId = null,
  days = 90
}) {
  try {
    logger.debug('Calculating score statistics', {
      userId,
      roleId,
      days
    });

    const history = await getScoreHistory({ userId, roleId, days, limit: 1000 });

    if (history.length === 0) {
      return {
        hasData: false,
        message: 'No score history found'
      };
    }

    const scores = history.map(h => h.score);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / scores.length;

    const sortedScores = [...scores].sort((a, b) => a - b);
    const median = scores.length % 2 === 0
      ? (sortedScores[scores.length / 2 - 1] + sortedScores[scores.length / 2]) / 2
      : sortedScores[Math.floor(scores.length / 2)];

    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Count trends
    const trends = history.map(h => h.score_trend).filter(Boolean);
    const trendCounts = {
      improved: trends.filter(t => t === 'improved').length,
      declined: trends.filter(t => t === 'declined').length,
      unchanged: trends.filter(t => t === 'unchanged').length
    };

    return {
      hasData: true,
      dataPoints: history.length,
      currentScore: history[0].score,
      latestConfidence: history[0].confidence,
      statistics: {
        mean: parseFloat(mean.toFixed(2)),
        median: parseFloat(median.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        min: Math.min(...scores),
        max: Math.max(...scores),
        range: parseFloat((Math.max(...scores) - Math.min(...scores)).toFixed(2))
      },
      trends: trendCounts,
      period: {
        days,
        startDate: history[history.length - 1].created_at,
        endDate: history[0].created_at
      }
    };
  } catch (err) {
    logger.error('Unexpected error in getScoreStats', {
      userId,
      roleId,
      error: err.message
    });
    return {
      hasData: false,
      message: 'Error calculating statistics',
      error: err.message
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getLatestScore,
  getScoreHistory,
  getScoreEvolution,
  getScoreImprovement,
  getScoreStats
};
