import logger from '../logger.js';
import { computeCareerTrajectory } from '../services/careerTrajectory.service.js';

export async function getCareerTrajectory(req, res) {
  try {
    const result = await computeCareerTrajectory(req.params.candidateId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;

    logger.error('Failed to compute career trajectory', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(status).json({
      ok: false,
      error: status === 400 ? 'INVALID_CANDIDATE_ID' : 'INTERNAL_ERROR',
      message: status === 400 ? 'A valid candidateId is required' : 'Failed to compute career trajectory'
    });
  }
}

export default { getCareerTrajectory };
