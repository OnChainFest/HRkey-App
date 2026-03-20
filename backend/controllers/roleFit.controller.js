import logger from '../logger.js';
import { computeRoleFitScore } from '../services/roleFit.service.js';

function parseRoleDefinition(req) {
  if (req.body?.roleDefinition && typeof req.body.roleDefinition === 'object') {
    return req.body.roleDefinition;
  }

  if (typeof req.query?.roleDefinition === 'string' && req.query.roleDefinition.trim()) {
    return JSON.parse(req.query.roleDefinition);
  }

  throw new Error('roleDefinition is required');
}

export async function getRoleFit(req, res) {
  try {
    const roleDefinition = parseRoleDefinition(req);
    const result = await computeRoleFitScore(req.params.candidateId, roleDefinition);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = error.message === 'roleDefinition is required' || error instanceof SyntaxError ? 400 : (error.status || 500);

    logger.error('Failed to compute role fit', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(status).json({
      ok: false,
      error: status === 400 ? 'INVALID_ROLE_DEFINITION' : 'INTERNAL_ERROR',
      message: status === 400 ? 'A valid roleDefinition payload is required' : 'Failed to compute role fit'
    });
  }
}

export default { getRoleFit };
