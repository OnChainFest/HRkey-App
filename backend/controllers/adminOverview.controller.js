import logger from '../logger.js';
import { getAdminOverview } from '../services/adminOverview.service.js';

/**
 * GET /api/admin/overview
 * Superadmin-only overview of core metrics.
 */
export async function getAdminOverviewHandler(req, res) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const overview = await getAdminOverview();
    return res.status(200).json(overview);
  } catch (err) {
    logger.error('Error in getAdminOverviewHandler', {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Failed to load admin overview' });
  }
}

export default {
  getAdminOverviewHandler
};
