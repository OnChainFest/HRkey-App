import logger from '../logger.js';
import { ReputationGraphError } from '../services/reputationGraph.service.js';
import {
  computeCandidateTrustWeights,
  computeRefereeTrustWeights
} from '../services/reputationTrustWeighting.service.js';

function handleTrustWeightingError(res, error, fallbackMessage) {
  if (error instanceof ReputationGraphError) {
    return res.status(error.status).json({
      ok: false,
      error: error.code,
      message: error.message
    });
  }

  return res.status(500).json({
    ok: false,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage
  });
}

export async function getCandidateTrustWeighting(req, res) {
  try {
    const result = await computeCandidateTrustWeights(req.params.candidateId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute candidate reputation trust weighting', {
      requestId: req.requestId,
      candidateId: req.params.candidateId,
      userId: req.user?.id,
      error: error.message
    });
    return handleTrustWeightingError(res, error, 'Failed to compute candidate reputation trust weighting');
  }
}

export async function getRefereeTrustWeighting(req, res) {
  try {
    const result = await computeRefereeTrustWeights(req.params.refereeId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute referee reputation trust weighting', {
      requestId: req.requestId,
      refereeId: req.params.refereeId,
      userId: req.user?.id,
      error: error.message
    });
    return handleTrustWeightingError(res, error, 'Failed to compute referee reputation trust weighting');
  }
}

export default {
  getCandidateTrustWeighting,
  getRefereeTrustWeighting
};
