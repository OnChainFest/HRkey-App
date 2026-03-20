import logger from '../logger.js';
import { ReputationGraphError } from '../services/reputationGraph.service.js';
import {
  computeCandidatePropagation,
  computeRefereePropagation,
  propagateReputationFromNode
} from '../services/reputationPropagation.service.js';

function handlePropagationError(res, error, fallbackMessage) {
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

export async function getCandidatePropagation(req, res) {
  try {
    const result = await computeCandidatePropagation(req.params.candidateId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute candidate reputation propagation', {
      requestId: req.requestId,
      candidateId: req.params.candidateId,
      userId: req.user?.id,
      error: error.message
    });
    return handlePropagationError(res, error, 'Failed to compute candidate reputation propagation');
  }
}

export async function getRefereePropagation(req, res) {
  try {
    const result = await computeRefereePropagation(req.params.refereeId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute referee reputation propagation', {
      requestId: req.requestId,
      refereeId: req.params.refereeId,
      userId: req.user?.id,
      error: error.message
    });
    return handlePropagationError(res, error, 'Failed to compute referee reputation propagation');
  }
}

export async function getNodePropagation(req, res) {
  try {
    const result = await propagateReputationFromNode(req.params.nodeId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute node reputation propagation', {
      requestId: req.requestId,
      nodeId: req.params.nodeId,
      userId: req.user?.id,
      error: error.message
    });
    return handlePropagationError(res, error, 'Failed to compute node reputation propagation');
  }
}

export default {
  getCandidatePropagation,
  getRefereePropagation,
  getNodePropagation
};
