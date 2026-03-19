import logger from '../logger.js';
import {
  grantReferenceAccess,
  revokeReferenceAccess,
  listReferenceAccessGrants,
  getReferenceAccessStatus,
  createReferenceCapabilityGrant,
  revokeReferenceCapabilityGrant,
  listReferenceCapabilityGrants,
  listReferenceAccessHistory
} from '../services/referenceAccess.service.js';

function badRequest(res, error, message) {
  return res.status(400).json({ ok: false, error, message });
}

export async function grantRecruiterReferenceAccess(req, res) {
  try {
    const candidateUserId = req.user?.id;
    const { recruiterUserId, candidateUserId: requestedCandidateUserId = null, expiresAt = null, notes = null } = req.body || {};

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (requestedCandidateUserId && requestedCandidateUserId !== candidateUserId) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'You can only manage reference access for your own profile' });
    }

    if (!recruiterUserId || typeof recruiterUserId !== 'string') {
      return badRequest(res, 'INVALID_RECRUITER_USER_ID', 'Valid recruiter user ID is required');
    }

    const grant = await grantReferenceAccess({
      candidateUserId,
      recruiterUserId,
      grantedByUserId: candidateUserId,
      expiresAt,
      metadata: notes ? { notes } : null,
      req
    });

    return res.status(200).json({ ok: true, grant });
  } catch (error) {
    logger.warn('Failed to grant recruiter reference access', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      recruiterUserId: req.body?.recruiterUserId,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.status && error.status < 500 ? 'REFERENCE_ACCESS_GRANT_FAILED' : 'INTERNAL_ERROR',
      message: error.status && error.status < 500 ? error.message : 'Failed to grant reference access'
    });
  }
}

export async function revokeRecruiterReferenceAccess(req, res) {
  try {
    const candidateUserId = req.user?.id;
    const recruiterUserId = req.params?.recruiterUserId;
    const requestedCandidateUserId = req.body?.candidateUserId || req.query?.candidateUserId || null;

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (requestedCandidateUserId && requestedCandidateUserId !== candidateUserId) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'You can only manage reference access for your own profile' });
    }

    if (!recruiterUserId || typeof recruiterUserId !== 'string') {
      return badRequest(res, 'INVALID_RECRUITER_USER_ID', 'Valid recruiter user ID is required');
    }

    const grant = await revokeReferenceAccess({
      candidateUserId,
      recruiterUserId,
      revokedByUserId: candidateUserId,
      req
    });

    return res.status(200).json({ ok: true, grant });
  } catch (error) {
    logger.warn('Failed to revoke recruiter reference access', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      recruiterUserId: req.params?.recruiterUserId,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.status && error.status < 500 ? 'REFERENCE_ACCESS_REVOKE_FAILED' : 'INTERNAL_ERROR',
      message: error.status && error.status < 500 ? error.message : 'Failed to revoke reference access'
    });
  }
}

export async function listMyReferenceAccessGrants(req, res) {
  try {
    const candidateUserId = req.user?.id;

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const grants = await listReferenceAccessGrants({ candidateUserId });
    return res.status(200).json({ ok: true, grants, count: grants.length });
  } catch (error) {
    logger.error('Failed to list candidate reference access grants', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Failed to list reference access grants' });
  }
}

export async function getMyReferenceAccessStatus(req, res) {
  try {
    const recruiterUserId = req.user?.id;
    const candidateUserId = req.params?.candidateUserId;

    if (!recruiterUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (!candidateUserId || typeof candidateUserId !== 'string') {
      return badRequest(res, 'INVALID_CANDIDATE_USER_ID', 'Valid candidate user ID is required');
    }

    const status = await getReferenceAccessStatus({ candidateUserId, recruiterUserId });
    return res.status(200).json({ ok: true, ...status });
  } catch (error) {
    logger.warn('Failed to fetch recruiter reference access status', {
      requestId: req.requestId,
      recruiterUserId: req.user?.id,
      candidateUserId: req.params?.candidateUserId,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.status && error.status < 500 ? 'REFERENCE_ACCESS_STATUS_FAILED' : 'INTERNAL_ERROR',
      message: error.status && error.status < 500 ? error.message : 'Failed to fetch reference access status'
    });
  }
}



export async function createCapabilityGrant(req, res) {
  try {
    const candidateUserId = req.user?.id;
    const {
      recruiterUserId = null,
      granteeType = null,
      recipientId = null,
      expiresAt = null,
      allowedActions = null,
      metadata = null
    } = req.body || {};

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const issued = await createReferenceCapabilityGrant({
      candidateUserId,
      recruiterUserId,
      granteeType,
      recipientId,
      allowedActions: allowedActions || undefined,
      expiresAt,
      metadata,
      req
    });

    return res.status(200).json({ ok: true, grant: issued.grant, capabilityToken: issued.capabilityToken });
  } catch (error) {
    logger.warn('Failed to create reference capability grant', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.status && error.status < 500 ? 'CAPABILITY_GRANT_FAILED' : 'INTERNAL_ERROR',
      message: error.status && error.status < 500 ? error.message : 'Failed to create capability grant'
    });
  }
}

export async function revokeCapabilityGrantById(req, res) {
  try {
    const candidateUserId = req.user?.id;
    const grantId = req.params?.grantId;

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (!grantId) {
      return badRequest(res, 'INVALID_GRANT_ID', 'Valid grant ID is required');
    }

    const grant = await revokeReferenceCapabilityGrant({
      candidateUserId,
      grantId,
      revokedByUserId: candidateUserId,
      req
    });

    return res.status(200).json({ ok: true, grant });
  } catch (error) {
    logger.warn('Failed to revoke reference capability grant', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      grantId: req.params?.grantId,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.status && error.status < 500 ? 'CAPABILITY_GRANT_REVOKE_FAILED' : 'INTERNAL_ERROR',
      message: error.status && error.status < 500 ? error.message : 'Failed to revoke capability grant'
    });
  }
}

export async function listMyCapabilityGrants(req, res) {
  try {
    const candidateUserId = req.user?.id;

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const grants = await listReferenceCapabilityGrants({ candidateUserId });
    return res.status(200).json({ ok: true, grants, count: grants.length });
  } catch (error) {
    logger.error('Failed to list capability grants', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Failed to list capability grants' });
  }
}

export async function getMyAccessHistory(req, res) {
  try {
    const candidateUserId = req.user?.id;
    const limit = Number.parseInt(req.query?.limit || '100', 10);

    if (!candidateUserId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const history = await listReferenceAccessHistory({
      candidateUserId,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 250) : 100
    });

    return res.status(200).json({ ok: true, history, count: history.length });
  } catch (error) {
    logger.error('Failed to list reference access history', {
      requestId: req.requestId,
      candidateUserId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Failed to list access history' });
  }
}

export default {
  grantRecruiterReferenceAccess,
  revokeRecruiterReferenceAccess,
  listMyReferenceAccessGrants,
  getMyReferenceAccessStatus,
  createCapabilityGrant,
  revokeCapabilityGrantById,
  listMyCapabilityGrants,
  getMyAccessHistory
};
