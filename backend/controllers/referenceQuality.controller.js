import logger from '../logger.js';
import { computeReferenceQuality } from '../services/referenceQuality.service.js';

export async function getReferenceQuality(req, res) {
  try {
    const result = await computeReferenceQuality(req.params.referenceId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Failed to compute reference quality', {
      requestId: req.requestId,
      referenceId: req.params.referenceId,
      userId: req.user?.id,
      error: error.message
    });

    const status = error.status || 500;
    return res.status(status).json({
      ok: false,
      error: status === 404 ? 'REFERENCE_NOT_FOUND' : 'INTERNAL_ERROR',
      message: status === 404 ? 'Reference not found' : 'Failed to compute reference quality'
    });
  }
}

export default {
  getReferenceQuality
};
