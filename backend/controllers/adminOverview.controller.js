import logger from '../logger.js';
import { getAdminOverview } from '../services/adminOverview.service.js';

/**
 * GET /api/admin/overview
 * Admin overview of core metrics.
 *
 * Access rules:
 * - If authenticated via admin_key (requireAdminKey middleware),
 *   allow access without JWT.
 * - Otherwise, require a superadmin JWT user.
 */
export async function getAdminOverviewHandler(req, res) {
  try {
    // 🔑 Flag puesto por requireAdminKey middleware
    const isAdminKeyAuth = req.isAdminKeyAuth === true;

    // 👤 Usuario JWT (si existe)
    const user = req.user;

    // Caso 1: NO admin_key → exigir JWT superadmin
    if (!isAdminKeyAuth) {
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Caso 2: admin_key → acceso directo (sin JWT)
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
