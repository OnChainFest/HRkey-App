// ============================================================================
// HRScore Controller
// ============================================================================
// Handles HTTP endpoints for HRScore persistence and history
// ============================================================================

import {
  calculateAndPersistScore,
  recalculateScore,
  getLatestScore,
  getScoreHistory,
  getScoreEvolution,
  getScoreImprovement,
  getScoreStats,
  getHRScoreLayerInfo
} from '../services/hrscore/index.js';
import logger from '../logger.js';

// ============================================================================
// GET LATEST SCORE FOR USER
// ============================================================================

/**
 * GET /api/hrscore/user/:userId/latest?roleId=
 * Get the most recent HRKey Score for a user.
 *
 * Auth: User can view own scores, superadmins can view all
 *
 * Response:
 * {
 *   success: true,
 *   score: {
 *     id: "uuid",
 *     user_id: "uuid",
 *     role_id: "uuid" | null,
 *     score: 78.45,
 *     confidence: 0.8944,
 *     n_observations: 16,
 *     created_at: "2025-12-11T...",
 *     ...
 *   }
 * }
 */
export async function getLatestScoreEndpoint(req, res) {
  try {
    const { userId } = req.params;
    const { roleId } = req.query;

    logger.debug('Fetching latest HRScore', {
      userId,
      roleId,
      requestedBy: req.user?.id
    });

    // Authorization: User can only view own scores unless superadmin
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const isSuperadmin = req.user.role === 'superadmin';
    const isOwnScore = req.user.id === userId;

    if (!isSuperadmin && !isOwnScore) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'You can only view your own scores'
      });
    }

    // Fetch latest score
    const score = await getLatestScore({
      userId,
      roleId: roleId || null
    });

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'No scores found',
        message: 'No HRKey Scores have been calculated for this user yet'
      });
    }

    return res.json({
      success: true,
      score
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get latest HRScore', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch latest score'
    });
  }
}

// ============================================================================
// GET SCORE HISTORY FOR USER
// ============================================================================

/**
 * GET /api/hrscore/user/:userId/history?roleId=&days=90
 * Get historical HRKey Scores for a user.
 *
 * Auth: User can view own history, superadmins can view all
 *
 * Response:
 * {
 *   success: true,
 *   history: [
 *     {
 *       id: "uuid",
 *       score: 78.45,
 *       score_delta: 2.5,
 *       score_trend: "improved",
 *       confidence: 0.89,
 *       created_at: "2025-12-11T..."
 *     },
 *     ...
 *   ],
 *   count: 15,
 *   period: { days: 90, startDate: "...", endDate: "..." }
 * }
 */
export async function getScoreHistoryEndpoint(req, res) {
  try {
    const { userId } = req.params;
    const { roleId, days, limit } = req.query;

    const daysNum = days ? parseInt(days, 10) : 90;
    // Pagination: default 10, max 50
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50);

    logger.debug('Fetching HRScore history', {
      userId,
      roleId,
      days: daysNum,
      limit: limitNum,
      requestedBy: req.user?.id
    });

    // Authorization
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const isSuperadmin = req.user.role === 'superadmin';
    const isOwnScore = req.user.id === userId;

    if (!isSuperadmin && !isOwnScore) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'You can only view your own score history'
      });
    }

    // Fetch history with pagination
    const history = await getScoreHistory({
      userId,
      roleId: roleId || null,
      days: daysNum,
      limit: limitNum
    });

    return res.json({
      success: true,
      history,
      count: history.length,
      period: {
        days: daysNum,
        startDate: history.length > 0 ? history[history.length - 1].created_at : null,
        endDate: history.length > 0 ? history[0].created_at : null
      }
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get HRScore history', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch score history'
    });
  }
}

// ============================================================================
// GET SCORE EVOLUTION (WITH ANALYTICS)
// ============================================================================

/**
 * GET /api/hrscore/user/:userId/evolution?roleId=&days=90
 * Get score evolution with rich analytics.
 *
 * Auth: Superadmin only (contains advanced metrics)
 */
export async function getScoreEvolutionEndpoint(req, res) {
  try {
    const { userId } = req.params;
    const { roleId, days } = req.query;

    const daysNum = days ? parseInt(days, 10) : 90;

    logger.debug('Fetching HRScore evolution', {
      userId,
      roleId,
      days: daysNum,
      requestedBy: req.user?.id
    });

    // Authorization: Superadmin only for detailed analytics
    if (!req.user || req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'This endpoint requires superadmin privileges'
      });
    }

    // Fetch evolution
    const evolution = await getScoreEvolution({
      userId,
      roleId: roleId || null,
      days: daysNum
    });

    return res.json({
      success: true,
      evolution,
      count: evolution.length,
      period: { days: daysNum }
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get HRScore evolution', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch score evolution'
    });
  }
}

// ============================================================================
// GET SCORE IMPROVEMENT METRICS
// ============================================================================

/**
 * GET /api/hrscore/user/:userId/improvement?roleId=&days=30
 * Calculate score improvement over a period.
 *
 * Auth: User can view own improvement, superadmins can view all
 */
export async function getScoreImprovementEndpoint(req, res) {
  try {
    const { userId } = req.params;
    const { roleId, days } = req.query;

    const daysNum = days ? parseInt(days, 10) : 30;

    logger.debug('Calculating score improvement', {
      userId,
      roleId,
      days: daysNum,
      requestedBy: req.user?.id
    });

    // Authorization
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const isSuperadmin = req.user.role === 'superadmin';
    const isOwnScore = req.user.id === userId;

    if (!isSuperadmin && !isOwnScore) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    // Calculate improvement
    const improvement = await getScoreImprovement({
      userId,
      roleId: roleId || null,
      days: daysNum
    });

    return res.json({
      success: true,
      improvement
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to calculate score improvement', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to calculate improvement'
    });
  }
}

// ============================================================================
// GET SCORE STATISTICS
// ============================================================================

/**
 * GET /api/hrscore/user/:userId/stats?roleId=&days=90
 * Get statistical summary of user's scores.
 *
 * Auth: User can view own stats, superadmins can view all
 */
export async function getScoreStatsEndpoint(req, res) {
  try {
    const { userId } = req.params;
    const { roleId, days } = req.query;

    const daysNum = days ? parseInt(days, 10) : 90;

    logger.debug('Fetching score statistics', {
      userId,
      roleId,
      days: daysNum,
      requestedBy: req.user?.id
    });

    // Authorization
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const isSuperadmin = req.user.role === 'superadmin';
    const isOwnScore = req.user.id === userId;

    if (!isSuperadmin && !isOwnScore) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    // Calculate stats
    const stats = await getScoreStats({
      userId,
      roleId: roleId || null,
      days: daysNum
    });

    return res.json({
      success: true,
      stats
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get score statistics', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to calculate statistics'
    });
  }
}

// ============================================================================
// MANUAL SCORE CALCULATION
// ============================================================================

/**
 * POST /api/hrscore/calculate
 * Manually trigger HRScore calculation for a user.
 *
 * Auth: Superadmin only
 *
 * Body:
 * {
 *   userId: "uuid",
 *   roleId: "uuid" | null,
 *   triggerSource: "manual" | "api_request"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   score: { id: "uuid", score: 78.45, ... }
 * }
 */
export async function calculateScoreEndpoint(req, res) {
  try {
    const { userId, roleId, triggerSource } = req.body;

    logger.info('Manual HRScore calculation requested', {
      userId,
      roleId,
      triggerSource: triggerSource || 'api_request',
      requestedBy: req.user?.id
    });

    // Authorization: Superadmin only
    if (!req.user || req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'This endpoint requires superadmin privileges'
      });
    }

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'userId is required'
      });
    }

    // Calculate and persist score
    const score = await calculateAndPersistScore({
      userId,
      roleId: roleId || null,
      triggerSource: triggerSource || 'api_request',
      req
    });

    if (!score) {
      return res.status(422).json({
        success: false,
        error: 'Score calculation failed',
        message: 'Could not calculate HRKey Score (insufficient data or model error)'
      });
    }

    return res.json({
      success: true,
      score
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to calculate HRScore', {
      userId: req.body?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to calculate score'
    });
  }
}

// ============================================================================
// GET LAYER INFO
// ============================================================================

/**
 * GET /api/hrscore/info
 * Get metadata about the HRScore Persistence Layer.
 *
 * Auth: Authenticated users
 */
export async function getLayerInfoEndpoint(req, res) {
  try {
    const info = getHRScoreLayerInfo();

    return res.json({
      success: true,
      ...info
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get HRScore layer info', {
      error: error.message
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getLatestScoreEndpoint,
  getScoreHistoryEndpoint,
  getScoreEvolutionEndpoint,
  getScoreImprovementEndpoint,
  getScoreStatsEndpoint,
  calculateScoreEndpoint,
  getLayerInfoEndpoint
};
