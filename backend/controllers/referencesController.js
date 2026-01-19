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
import { getPaymentProcessor } from '../services/payments/payment-processor.js';
import { getWalletManager } from '../services/wallet/wallet-manager.js';

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

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(422).json({
        ok: false,
        error: 'Invitation expired'
      });
    }

    const referenceId = await ReferenceService.submitReference({
      token,
      invite,
      ratings,
      comments
    });

    // ========================================
    // PAYMENT INTEGRATION: Trigger payment after successful reference submission
    // ========================================
    try {
      // Get reference details including provider and candidate
      const { data: reference, error: refError } = await supabase
        .from('references')
        .select(`
          id,
          owner_id,
          evaluator_id,
          referrer_name,
          referrer_email,
          candidate:users!owner_id(id, email, name, wallet_address),
          provider:users!evaluator_id(id, email, name, wallet_address)
        `)
        .eq('id', referenceId)
        .single();

      if (refError || !reference) {
        logger.warn('Could not fetch reference for payment creation', {
          requestId: req.requestId,
          referenceId,
          error: refError?.message
        });
        // Don't fail the request - reference was created successfully
        return res.json({ ok: true, referenceId });
      }

      // Check if both participants have wallets
      const walletManager = getWalletManager();
      const providerHasWallet = await walletManager.hasWallet(reference.evaluator_id);
      const candidateHasWallet = await walletManager.hasWallet(reference.owner_id);

      if (!providerHasWallet || !candidateHasWallet) {
        logger.warn('Payment skipped - participants missing wallets', {
          requestId: req.requestId,
          referenceId,
          providerHasWallet,
          candidateHasWallet
        });

        // Return response with wallet requirement flag
        return res.json({
          ok: true,
          referenceId,
          paymentPending: false,
          requiresWallet: true,
          missingWallets: {
            provider: !providerHasWallet,
            candidate: !candidateHasWallet
          },
          message: 'Reference submitted successfully. Payment will be created once all participants set up their wallets.'
        });
      }

      // Both have wallets - create payment intent
      const paymentProcessor = getPaymentProcessor();
      const payment = await paymentProcessor.createPaymentIntent({
        referenceId: reference.id,
        referenceProvider: reference.evaluator_id, // User ID
        candidate: reference.owner_id, // User ID
        amount: 100, // $100 RLUSD standard amount
        payerEmail: invite.metadata?.employer_email || reference.referrer_email || 'employer@unknown.com'
      });

      // Link payment to reference
      await supabase
        .from('references')
        .update({
          payment_id: payment.paymentId,
          payment_status: 'pending'
        })
        .eq('id', referenceId);

      logger.info('Payment intent created for reference', {
        requestId: req.requestId,
        referenceId,
        paymentId: payment.paymentId,
        amount: payment.amount
      });

      // Return success with payment info
      return res.json({
        ok: true,
        referenceId,
        paymentPending: true,
        payment: {
          paymentId: payment.paymentId,
          amount: payment.amount,
          qrCode: payment.qrCode,
          expiresAt: payment.expiresAt,
          message: 'Payment request sent to employer. Waiting for payment confirmation.'
        }
      });

    } catch (paymentError) {
      logger.error('Failed to create payment for reference', {
        requestId: req.requestId,
        referenceId,
        error: paymentError.message,
        stack: paymentError.stack
      });

      // Don't fail the request - reference was created successfully
      return res.json({
        ok: true,
        referenceId,
        paymentPending: false,
        paymentError: 'Payment creation failed. This can be retried later.',
        message: 'Reference submitted successfully, but payment creation encountered an issue.'
      });
    }
    // ========================================
  } catch (e) {
    // SECURITY: Never log raw tokens - use hash prefix only
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

export default {
  getMyReferences,
  getCandidateReferences,
  getMyPendingInvites,
  requestReferenceInvite,
  respondToReferenceInvite
};
