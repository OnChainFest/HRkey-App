import logger from '../logger.js';
import {
  ReferenceService,
  resolveCandidateId,
  getActiveSignerCompanyIds,
  hasApprovedReferenceAccess,
  fetchInviteByToken,
  fetchSelfReferences,
  fetchCandidateReferences,
  hashInviteToken
  fetchCandidateReferences
} from '../services/references.service.js';

export async function requestReferenceInvite(req, res) {
  try {
    const { candidate_id, candidate_wallet, referee_email, role_id, message } = req.body;
    const candidateId = await resolveCandidateId({
      candidateId: candidate_id,
      candidateWallet: candidate_wallet
    });

    if (!candidateId) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Candidate not found'
      });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const isSelf = req.user?.id === candidateId;

    if (!isSelf && !isSuperadmin) {
      const companyIds = await getActiveSignerCompanyIds(req.user?.id);

      if (!companyIds.length) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Company signer access required'
        });
      }

      const hasAccess = await hasApprovedReferenceAccess({ candidateId, companyIds });
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Approved data access required'
        });
      }
    }

    const result = await ReferenceService.createReferenceRequest({
      userId: candidateId,
      email: referee_email,
      name: null,
      applicantData: {
        role_id: role_id || null,
        message: message || null,
        requested_by: req.user?.id || null
      },
      expiresInDays: 7
    });

    return res.json({
      ok: true,
      reference_id: result.reference_id
    });
  } catch (e) {
    logger.error('Failed to create reference invite', {
      requestId: req.requestId,
      requesterId: req.user?.id,
      candidateId: req.body.candidate_id,
      refereeEmail: req.body.referee_email,
      error: e.message,
      stack: e.stack
    });
    return res.status(500).json({ ok: false, error: 'Failed to create reference request' });
  }
}

export async function respondToReferenceInvite(req, res) {
  try {
    const { token } = req.params;
    const { ratings, comments } = req.body;

    const { data: invite, error: inviteError } = await fetchInviteByToken(token);

    if (inviteError || !invite) {
      return res.status(404).json({
        ok: false,
        error: 'Invitation not found'
      });
    }

    if (invite.status === 'completed') {
      return res.status(422).json({
        ok: false,
        error: 'Reference already submitted'
      });
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(422).json({
        ok: false,
        error: 'Invitation expired'
      });
    }

    await ReferenceService.submitReference({
      token,
      invite,
      ratings,
      comments
    });

    return res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to submit reference response', {
      requestId: req.requestId,
      tokenHashPrefix: req.params.token ? hashInviteToken(req.params.token).slice(0, 12) : undefined,
      error: e.message,
      stack: e.stack
    });
    return res.status(e.status || 500).json({
      ok: false,
      error: e.status ? e.message : 'Failed to submit reference'
    });
  }
}

export async function getMyReferences(req, res) {
  try {
    const { data: references, error } = await fetchSelfReferences(req.user.id);

    if (error) {
      return res.status(500).json({
        error: 'Database error',
        message: error.message
      });
    }

    return res.json({
      ok: true,
      references: references || []
    });
  } catch (e) {
    logger.error('Failed to fetch self references', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: e.message,
      stack: e.stack
    });
    return res.status(500).json({ error: 'Failed to fetch references' });
  }
}

export async function getCandidateReferences(req, res) {
  try {
    const { candidateId } = req.params;
    const { data: references, error } = await fetchCandidateReferences(candidateId);

    if (error) {
      return res.status(500).json({
        error: 'Database error',
        message: error.message
      });
    }

    return res.json({
      ok: true,
      references: references || []
    });
  } catch (e) {
    logger.error('Failed to fetch candidate references', {
      requestId: req.requestId,
      candidateId: req.params.candidateId,
      error: e.message,
      stack: e.stack
    });
    return res.status(500).json({ error: 'Failed to fetch references' });
  }
}

export default {
  requestReferenceInvite,
  respondToReferenceInvite,
  getMyReferences,
  getCandidateReferences
};
