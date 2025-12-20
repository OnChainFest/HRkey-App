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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { data: references, error } = await supabase
      .from('references')
      .select(`
        id,
        referrer_name,
        referrer_email,
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
  getMyPendingInvites
};
