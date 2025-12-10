/**
 * Analytics Controller
 *
 * Handles HTTP requests for analytics data.
 * Provides endpoints for dashboards, metrics, and insights.
 *
 * @module controllers/analyticsController
 */

import {
  getAnalyticsDashboard,
  getAnalyticsInfo,
  getCandidateActivity,
  getCompanyActivity,
  getConversionFunnel,
  getConversionFunnelForDays,
  getSkillDemandTrends,
  getTrendingSkills,
  getMarketDemandSummary
} from '../services/analytics/index.js';
import logger from '../logger.js';

/**
 * GET /api/analytics/dashboard
 * Get comprehensive analytics dashboard data.
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
export async function getAnalyticsDashboardEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;

    if (days < 1 || days > 365) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'Days must be between 1 and 365'
      });
    }

    logger.info('Analytics: Fetching dashboard data', {
      user_id: req.user?.id,
      days
    });

    const dashboard = await getAnalyticsDashboard({ days });

    if (!dashboard) {
      return res.status(500).json({
        error: 'Failed to generate dashboard',
        message: 'An error occurred while generating analytics dashboard'
      });
    }

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    logger.error('Analytics: Dashboard endpoint error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch analytics dashboard'
    });
  }
}

/**
 * GET /api/analytics/info
 * Get analytics layer information and capabilities.
 */
export async function getAnalyticsInfoEndpoint(req, res) {
  try {
    const info = getAnalyticsInfo();

    res.json({
      success: true,
      data: info
    });

  } catch (error) {
    logger.error('Analytics: Info endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch analytics info'
    });
  }
}

/**
 * GET /api/analytics/candidates/activity
 * Get candidate activity metrics.
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 * - limit: Max results (default: 50)
 */
export async function getCandidateActivityEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 50;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activity = await getCandidateActivity({ startDate, endDate, limit });

    res.json({
      success: true,
      data: {
        period: {
          days,
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        activity
      }
    });

  } catch (error) {
    logger.error('Analytics: Candidate activity endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch candidate activity'
    });
  }
}

/**
 * GET /api/analytics/companies/activity
 * Get company activity metrics.
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 * - limit: Max results (default: 50)
 */
export async function getCompanyActivityEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 50;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activity = await getCompanyActivity({ startDate, endDate, limit });

    res.json({
      success: true,
      data: {
        period: {
          days,
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        activity
      }
    });

  } catch (error) {
    logger.error('Analytics: Company activity endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch company activity'
    });
  }
}

/**
 * GET /api/analytics/funnel
 * Get conversion funnel metrics.
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
export async function getConversionFunnelEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;

    const funnel = await getConversionFunnelForDays(days);

    if (!funnel) {
      return res.status(500).json({
        error: 'Failed to generate funnel',
        message: 'An error occurred while generating conversion funnel'
      });
    }

    res.json({
      success: true,
      data: funnel
    });

  } catch (error) {
    logger.error('Analytics: Funnel endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch conversion funnel'
    });
  }
}

/**
 * GET /api/analytics/demand-trends
 * Get market demand trends (skills, locations).
 *
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
export async function getDemandTrendsEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;

    const demand = await getMarketDemandSummary(days);

    if (!demand) {
      return res.status(500).json({
        error: 'Failed to generate demand trends',
        message: 'An error occurred while analyzing demand trends'
      });
    }

    res.json({
      success: true,
      data: demand
    });

  } catch (error) {
    logger.error('Analytics: Demand trends endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch demand trends'
    });
  }
}

/**
 * GET /api/analytics/skills/trending
 * Get trending skills (recent vs previous period).
 *
 * Query params:
 * - days: Days for recent period (default: 7)
 */
export async function getTrendingSkillsEndpoint(req, res) {
  try {
    const days = parseInt(req.query.days) || 7;

    if (days < 1 || days > 90) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'Days must be between 1 and 90'
      });
    }

    const trending = await getTrendingSkills(days);

    if (!trending) {
      return res.status(500).json({
        error: 'Failed to generate trending skills',
        message: 'An error occurred while analyzing trending skills'
      });
    }

    res.json({
      success: true,
      data: trending
    });

  } catch (error) {
    logger.error('Analytics: Trending skills endpoint error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch trending skills'
    });
  }
}

export default {
  getAnalyticsDashboardEndpoint,
  getAnalyticsInfoEndpoint,
  getCandidateActivityEndpoint,
  getCompanyActivityEndpoint,
  getConversionFunnelEndpoint,
  getDemandTrendsEndpoint,
  getTrendingSkillsEndpoint
};
