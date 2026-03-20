import logger from '../logger.js';
import { computeCandidateBenchmark, normalizeCandidateBenchmarkInput } from '../services/candidateBenchmark.service.js';

function isValidationError(error) {
  return error instanceof SyntaxError || error.status === 400 || /candidateId|roleDefinition/.test(error.message || '');
}

export async function getCandidateBenchmark(req, res) {
  try {
    const normalizedInput = normalizeCandidateBenchmarkInput({
      candidateId: req.params.candidateId,
      roleDefinition: req.query?.roleDefinition
    });
    const result = await computeCandidateBenchmark(normalizedInput.candidateId, {
      roleDefinition: normalizedInput.roleDefinition
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = isValidationError(error) ? 400 : (error.status || 500);

    logger.error('Failed to compute candidate benchmark', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(status).json({
      ok: false,
      error: status === 400 ? 'INVALID_BENCHMARK_INPUT' : 'INTERNAL_ERROR',
      message: status === 400 ? 'A valid candidateId and optional roleDefinition are required' : 'Failed to compute candidate benchmark'
    });
  }
}

export default { getCandidateBenchmark };
