import logger from '../logger.js';
import { evaluateCandidateForUser } from '../services/candidateEvaluation.service.js';

/**
 * GET /api/candidates/:userId/evaluation
 * Requires authentication and allows self or superadmin access.
 */
export async function getCandidateEvaluation(req, res) {
  try {
    const { userId } = req.params;
    const { includeRawReferences } = req.query;

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

    const options = {
      includeRawReferences: includeRawReferences === 'true'
    };

    const result = await evaluateCandidateForUser(normalizedUserId, options);
    return res.status(200).json(result);
  } catch (err) {
    logger.error('Error in getCandidateEvaluation', {
      requestId: req.requestId,
      userId: req.params?.userId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Failed to evaluate candidate' });
  }
}

export default {
  getCandidateEvaluation
};
