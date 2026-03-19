/**
 * References Controller
 *
 * Handles reference viewing with strict permission controls:
 * - Candidates can only view their own references (self-only)
 * - Companies can view references only with approved data-access (TODO)
 * - Superadmins can view all references
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import {
  ReferenceService,
  resolveCandidateId,
  hashInviteToken
} from '../services/references.service.js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseClient;
}
const isProductionEnv = process.env.NODE_ENV === 'production';

const maskEmailForLogs = (email) => {
  if (!email || typeof email !== 'string') return undefined;
  const [local, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 2)}***`;
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
};

/**
 * Extract the real client IP, respecting proxy forwarding headers.
 */
const getClientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim().length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
};

/**
 * Hash a client IP with a server-side salt so the raw IP is never persisted.
 * Set INVITE_IP_SALT in env to a random secret.
 */
const getInviteIpSalt = () => {
  const salt = process.env.INVITE_IP_SALT;
  if (salt) return salt;

  if (process.env.NODE_ENV === 'production') {
    const err = new Error('INVITE_IP_SALT is required in production');
    err.status = 500;
    throw err;
  }

  logger.warn('INVITE_IP_SALT is not configured; using development fallback salt');
  return 'development-only-invite-ip-salt';
};

const hashClientIp = (ip) => {
  const salt = getInviteIpSalt();
  return crypto.createHash('sha256').update(`${ip}${salt}`).digest('hex');
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
    const { data: references, error } = await getSupabaseClient()
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
        reference_hash,
        is_hidden,
        hidden_at,
        hide_reason,
        reference_type,
        correction_of,
        is_correction,
        created_at
      `)
      .eq('owner_id', userId)
      .in('status', ['active', 'approved'])
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
    const accessLevel = req.referenceAccess?.accessLevel;

    if (!requesterId && accessLevel !== 'capability_token') {
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

    const isSuperadmin = accessLevel === 'superadmin';

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
      const { data: references, error } = await getSupabaseClient()
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

    const { data: references, error } = await getSupabaseClient()
      .from('references')
      .select(`
        id,
        owner_id,
        referrer_name,
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
      .in('status', ['active', 'approved'])
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch candidate references (explicit grant)', {
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
      accessLevel
    });
  } catch (err) {
    logger.error('Exception in getCandidateReferences', {
      requestId: req.requestId,
      candidateId: req.params?.candidateId,
      requesterId: req.user?.id,
      error: err.message,
      stack: isProductionEnv ? undefined : err.stack
    });
    return res.status(err.status || 500).json({
      ok: false,
      error: err.status && err.status < 500 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
      message: err.status && err.status < 500 ? err.message : 'An unexpected error occurred'
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

    const { data: invites, error } = await getSupabaseClient()
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

    const clientIp = getClientIp(req);
    const clientIpHash = hashClientIp(clientIp);
    const userAgent = req.get('user-agent')?.slice(0, 512) || null;

    await ReferenceService.submitReference({
      token,
      ratings,
      comments,
      clientIpHash,
      userAgent
    });

    return res.json({ ok: true });
  } catch (e) {
    const status = e.status || 500;
    logger.error('Failed to submit reference response', {
      requestId: req.requestId,
      tokenHashPrefix: req.params.token ? hashInviteToken(req.params.token).slice(0, 12) : undefined,
      error: e.message,
      stack: isProductionEnv ? undefined : e.stack
    });
    return res.status(status >= 500 ? 500 : 404).json({
      ok: false,
      error: status >= 500 ? 'Failed to submit reference' : 'Invalid or expired invite'
    });
  }
}

/**
 * POST /api/references/:referenceId/hide
 * Hide a reference (makes it show as strikethrough in public views)
 *
 * Authorization: Owner only or superadmin
 * Philosophy: Hidden ≠ erased. Strikethrough remains visible forever.
 */
export async function hideReference(req, res) {
  try {
    const { referenceId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    if (!referenceId) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'Reference ID is required'
      });
    }

    const { error } = await supabase.rpc('hide_reference', {
      ref_id: referenceId,
      user_id: userId,
      reason: reason || null
    });

    if (error) {
      logger.error('Failed to hide reference', {
        requestId: req.requestId,
        userId,
        referenceId,
        error: error.message
      });

      if (error.message.includes('Only the reference owner')) {
        return res.status(403).json({
          ok: false,
          error: 'FORBIDDEN',
          message: 'You do not have permission to hide this reference'
        });
      }

      return res.status(500).json({
        ok: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to hide reference'
      });
    }

    logger.info('Reference hidden successfully', {
      requestId: req.requestId,
      userId,
      referenceId,
      hasReason: !!reason
    });

    return res.status(200).json({
      ok: true,
      message: 'Reference hidden successfully',
      referenceId
    });
  } catch (err) {
    logger.error('Exception in hideReference', {
      requestId: req.requestId,
      userId: req.user?.id,
      referenceId: req.params?.referenceId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

/**
 * POST /api/references/:referenceId/unhide
 * Unhide a previously hidden reference
 *
 * Authorization: Owner only or superadmin
 */
export async function unhideReference(req, res) {
  try {
    const { referenceId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    if (!referenceId) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'Reference ID is required'
      });
    }

    const { error } = await supabase.rpc('unhide_reference', {
      ref_id: referenceId,
      user_id: userId
    });

    if (error) {
      logger.error('Failed to unhide reference', {
        requestId: req.requestId,
        userId,
        referenceId,
        error: error.message
      });

      if (error.message.includes('Only the reference owner')) {
        return res.status(403).json({
          ok: false,
          error: 'FORBIDDEN',
          message: 'You do not have permission to unhide this reference'
        });
      }

      return res.status(500).json({
        ok: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to unhide reference'
      });
    }

    logger.info('Reference unhidden successfully', {
      requestId: req.requestId,
      userId,
      referenceId
    });

    return res.status(200).json({
      ok: true,
      message: 'Reference unhidden successfully',
      referenceId
    });
  } catch (err) {
    logger.error('Exception in unhideReference', {
      requestId: req.requestId,
      userId: req.user?.id,
      referenceId: req.params?.referenceId,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

export default {
  getMyReferences,
  getCandidateReferences,
  getMyPendingInvites,
  requestReferenceInvite,
  respondToReferenceInvite,
  hideReference,
  unhideReference
};
