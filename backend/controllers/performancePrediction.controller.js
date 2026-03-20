import logger from '../logger.js';
import { computePerformancePrediction, normalizePerformanceRoleDefinition } from '../services/performancePrediction.service.js';

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseRoleDefinition(req) {
  if (req.body?.roleDefinition !== undefined) {
    if (!isPlainObject(req.body.roleDefinition)) {
      throw new Error('roleDefinition must be a plain object');
    }
    return normalizePerformanceRoleDefinition(req.body.roleDefinition);
  }

  if (typeof req.query?.roleDefinition === 'string' && req.query.roleDefinition.trim()) {
    const parsed = JSON.parse(req.query.roleDefinition);
    if (!isPlainObject(parsed)) {
      throw new Error('roleDefinition must be a plain object');
    }
    return normalizePerformanceRoleDefinition(parsed);
  }

  throw new Error('roleDefinition is required');
}

function isValidationError(error) {
  return error instanceof SyntaxError || error.status === 400 || /roleDefinition|requiredSkills|preferredSkills|keywords|seniorityLevel|weightOverrides/.test(error.message || '');
}

export async function getPerformancePrediction(req, res) {
  try {
    const roleDefinition = parseRoleDefinition(req);
    const result = await computePerformancePrediction(req.params.candidateId, roleDefinition);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = isValidationError(error) ? 400 : (error.status || 500);

    logger.error('Failed to compute performance prediction', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(status).json({
      ok: false,
      error: status === 400 ? 'INVALID_ROLE_DEFINITION' : 'INTERNAL_ERROR',
      message: status === 400 ? 'A valid roleDefinition object is required' : 'Failed to compute performance prediction'
    });
  }
}

export default { getPerformancePrediction };
