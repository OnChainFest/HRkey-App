/**
 * Dashboard Overview Controller
 *
 * Handles HTTP requests for the unified Person Dashboard
 */

import { getDashboardOverview } from '../services/dashboardOverview.service.js';
import logger from '../logger.js';

/**
 * GET /api/dashboard/overview
 *
 * Returns aggregated dashboard data for the authenticated user
 * Requires authentication (requireAuth middleware)
 *
 * Response:
 * {
 *   userProfile: { id, email, name, handle, ... },
 *   roles: { candidateEnabled: boolean, referrerEnabled: boolean },
 *   globalSummary: { rewardsBalance, notificationsCount },
 *   candidateSummary: { pendingReferenceRequestsCount, completedReferencesCount, ... },
 *   referrerSummary: { assignedRequestsCount, completedAsReferrerCount, ... }
 * }
 */
export async function getDashboardOverviewHandler(req, res) {
  try {
    // User is already attached by requireAuth middleware
    const user = req.user;

    if (!user || !user.id) {
      logger.warn('Dashboard overview accessed without authentication');
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info('Dashboard overview requested', {
      userId: user.id,
      email: user.email
    });

    // Fetch dashboard overview
    const overview = await getDashboardOverview(user.id);

    return res.status(200).json(overview);
  } catch (error) {
    logger.error('Error fetching dashboard overview', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Failed to fetch dashboard overview',
      message: error.message
    });
  }
}

export default {
  getDashboardOverviewHandler
};
