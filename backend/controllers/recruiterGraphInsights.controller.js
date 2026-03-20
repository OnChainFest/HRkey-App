import logger from '../logger.js';
import { ReputationGraphError } from '../services/reputationGraph.service.js';
import { computeCandidateRecruiterInsights } from '../services/recruiterGraphInsights.service.js';

function handleRecruiterInsightError(res, error, fallbackMessage) {
  if (error instanceof ReputationGraphError) {
    return res.status(error.status).json({ ok: false, error: error.code, message: error.message });
  }

  return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: fallbackMessage });
}

export async function getCandidateRecruiterGraphInsights(req, res) {
  try {
    const result = await computeCandidateRecruiterInsights(req.params.candidateId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute recruiter graph insights', {
      requestId: req.requestId,
      candidateId: req.params.candidateId,
      userId: req.user?.id,
      error: error.message
    });
    return handleRecruiterInsightError(res, error, 'Failed to compute recruiter graph insights');
  }
}

export default {
  getCandidateRecruiterGraphInsights
};
