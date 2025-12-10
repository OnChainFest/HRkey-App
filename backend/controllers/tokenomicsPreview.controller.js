import logger from '../logger.js';
import { getTokenomicsPreviewForUser } from '../services/tokenomicsPreview.service.js';

/**
 * GET /api/candidates/:userId/tokenomics-preview
 * Requires authentication and allows self or superadmin access.
 */
export async function getTokenomicsPreview(req, res) {
  try {
    const { userId } = req.params;
    const normalizedUserId = userId?.trim();

    if (!normalizedUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const requester = req.user;
    const isSuperadmin = requester?.role === 'superadmin';
    const isSelf = requester?.id === normalizedUserId;

    if (!isSuperadmin && !isSelf) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const preview = await getTokenomicsPreviewForUser(normalizedUserId);
    return res.status(200).json(preview);
  } catch (err) {
    logger.error('Error in getTokenomicsPreview', {
      requestId: req.requestId,
      userId: req.params?.userId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Failed to compute tokenomics preview' });
  }
}

export default {
  getTokenomicsPreview
};
