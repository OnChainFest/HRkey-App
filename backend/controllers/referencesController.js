/**
 * References Controller
 *
 * Handles reference viewing with strict permission controls:
 * - Candidates can only view their own references (self-only)
 * - Companies can view references only with approved data-access (TODO)
 * - Superadmins can view all references
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import {
  ReferenceService,
  resolveCandidateId,
  getActiveSignerCompanyIds,
  hasApprovedReferenceAccess,
  fetchInviteByToken,
  hashInviteToken
} from '../services/references.service.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const isProductionEnv = process.env.NODE_ENV === 'production';

const maskEmailForLogs = (email) => {
  if (!email || typeof email !== 'string') return undefined;
  const [local, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 2)}***`;
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
};

/**
 * GET /api/references/me
 * Returns all references for the authenticated user (self-only)
 *
 * Authorization: Authenticated users only, returns own references
 */
export async function getMyReferences(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Fetch references where user is the owner
    // SECURITY: Do NOT include referrer_email - only superadmins can see emails
    const { data: references, error } = await supabase
      .from('references')
      .select(`
        id,
        referrer_name,
        relationship,
        summary,
        overall_rating,
        kpi_ratings,
        detailed_feedback,
        status,
        validation_status,
        created_at
      `)
      .eq('owner_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch user references', {
        requestId: req.requestId,
        userId,
        error: error.message
      });
      return res.status(500).json({
        ok: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch references'
      });
    }

    return res.status(200).json({
      ok: true,
      references: references || [],
      count: references?.length || 0
    });

  } catch (err) {
    logger.error('Exception in getMyReferences', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: err.message,
      stack: isProductionEnv ? undefined : err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

/**
 * GET /api/references/candidate/:candidateId
 * Returns all references for a specific candidate
 *
 * Authorization:
 * - Superadmin: Full access
 * - Company: Only with approved data-access request (TODO - currently denied)
 * - User: Denied (use /api/references/me instead)
 */
export async function getCandidateReferences(req, res) {
  try {
    const { candidateId } = req.params;
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;

    if (!requesterId) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Validate candidateId format
    if (!candidateId || typeof candidateId !== 'string' || candidateId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_CANDIDATE_ID',
        message: 'Valid candidate ID is required'
      });
    }

    const isSuperadmin = requesterRole === 'superadmin';

    // Self-access: redirect to /api/references/me
    if (requesterId === candidateId) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: 'Use /api/references/me to view your own references'
      });
    }

    // Superadmin bypass
    if (isSuperadmin) {
      const { data: references, error } = await supabase
        .from('references')
        .select(`
          id,
          owner_id,
          referrer_name,
          referrer_email,
          relationship,
          summary,
          overall_rating,
          kpi_ratings,
          detailed_feedback,
          status,
          validation_status,
          fraud_score,
          consistency_score,
          created_at,
          validated_at
        `)
        .eq('owner_id', candidateId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch candidate references (superadmin)', {
          requestId: req.requestId,
          candidateId,
          requesterId,
          error: error.message
        });
        return res.status(500).json({
          ok: false,
          error: 'DATABASE_ERROR',
          message: 'Failed to fetch references'
        });
      }

      return res.status(200).json({
        ok: true,
        candidateId,
        references: references || [],
        count: references?.length || 0,
        accessLevel: 'superadmin'
      });
    }

    // TODO: Check for approved data-access request for company users
    // For now, deny all non-superadmin access to other users' references
    //
    // Future implementation:
    // 1. Check if requester is a company signer
    // 2. Check data_access_requests table for approved request
    // 3. If approved, return limited reference data
    //
    // const hasApprovedAccess = await checkDataAccessApproval(requesterId, candidateId);
    // if (hasApprovedAccess) { return references with company-scoped fields }

    logger.warn('Unauthorized attempt to access candidate references', {
      requestId: req.requestId,
      requesterId,
      candidateId,
      requesterRole
    });

    return res.status(403).json({
      ok: false,
      error: 'FORBIDDEN',
      message: 'You do not have permission to view this candidate\'s references'
    });

  } catch (err) {
    logger.error('Exception in getCandidateReferences', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      requesterId: req.user?.id,
      error: err.message,
      stack: isProductionEnv ? undefined : err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

/**
 * GET /api/references/pending
 * Returns pending reference invites for the authenticated user
 *
 * Authorization: Self-only
 */
export async function getMyPendingInvites(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { data: invites, error } = await supabase
      .from('reference_invites')
      .select(`
        id,
        referee_name,
        referee_email,
        status,
        expires_at,
        created_at
      `)
      .eq('requester_id', userId)
      .in('status', ['pending', 'expired'])
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch pending invites', {
        requestId: req.requestId,
        userId,
        error: error.message
      });
      return res.status(500).json({
        ok: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch pending invites'
      });
    }

    return res.status(200).json({
      ok: true,
      invites: invites || [],
      count: invites?.length || 0
    });

  } catch (err) {
    logger.error('Exception in getMyPendingInvites', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: err.message,
      stack: isProductionEnv ? undefined : err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

/**
 * POST /api/references/request
 * Create a reference invite for a candidate
 *
 * Authorization:
 * - Self (candidate requesting reference for themselves)
 * - Superadmin (can request for any candidate)
 * - Company signer with approved data access
 */
export async function requestReferenceInvite(req, res) {
  try {
    const { candidate_id, candidate_wallet, referee_email, role_id, message } = req.body;
    const candidateId = await resolveCandidateId({
      candidateId: candidate_id,
      candidateWallet: candidate_wallet
    });

    if (!candidateId) {
      return res.status(202).json({
        ok: true,
        message: 'If the candidate is eligible, the reference request will be processed.'
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
      refereeEmail: maskEmailForLogs(req.body.referee_email),
      error: e.message,
      stack: isProductionEnv ? undefined : e.stack
    });
    return res.status(500).json({ ok: false, error: 'Failed to create reference request' });
  }
}

/**
 * POST /api/references/respond/:token
 * Submit a reference response using a valid invitation token
 *
 * Authorization: Public (token-based)
 * Security: Token validation (format, expiry, single-use)
 */
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

    if (invite.status === 'processing') {
      return res.status(409).json({
        ok: false,
        error: 'Reference is already being processed'
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
    const status = e.status || 500;
    // SECURITY: Never log raw tokens - use hash prefix only
    logger.error('Failed to submit reference response', {
      requestId: req.requestId,
      tokenHashPrefix: req.params.token ? hashInviteToken(req.params.token).slice(0, 12) : undefined,
      error: e.message,
      stack: isProductionEnv ? undefined : e.stack
    });
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Failed to submit reference' : e.message
    });
  }
}

export default {
  getMyReferences,
  getCandidateReferences,
  getMyPendingInvites,
  requestReferenceInvite,
  respondToReferenceInvite
};
