import logger from '../logger.js';
import { getPublicIdentifierForUser } from '../services/publicProfile/index.js';

/**
 * GET /api/me/public-identifier
 * Returns the preferred public identifier for the authenticated user.
 *
 * Uses the Public Profile & Discovery Layer with fail-soft error handling.
 *
 * External contract (backwards-compatible):
 * - Returns 401 if not authenticated
 * - Returns 404 if user not found
 * - Returns 200 with identifier data on success
 * - Returns 500 on server errors
 */
export async function getMyPublicIdentifier(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const identifier = await getPublicIdentifierForUser(userId);

    if (!identifier) {
      return res.status(404).json({ error: 'Public identifier not found' });
    }

    return res.status(200).json({
      userId: identifier.userId,
      identifier: identifier.identifier,
      handle: identifier.handle,
      isPublicProfile: identifier.isPublicProfile
    });
  } catch (err) {
    logger.error('Error in getMyPublicIdentifier', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Failed to resolve public identifier' });
  }
}

export default {
  getMyPublicIdentifier
};
