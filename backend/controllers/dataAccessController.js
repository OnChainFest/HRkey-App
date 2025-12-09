// ============================================================================
// Data Access Controller
// ============================================================================
// Handles data access requests from companies with user consent workflow
// Implements pay-per-query with revenue sharing
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { logDataAccessAction, AuditActionTypes } from '../utils/auditLogger.js';
import { sendDataAccessRequestNotification, sendDataAccessApprovedNotification } from '../utils/emailService.js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// CREATE DATA ACCESS REQUEST
// ============================================================================

/**
 * POST /api/data-access/request
 * Company requests access to user data/reference
 *
 * Body: {
 *   companyId: UUID,
 *   targetUserId: UUID (profile owner),
 *   referenceId?: UUID (optional - specific reference),
 *   requestedDataType?: string ('reference', 'profile', 'full_data'),
 *   requestReason?: string
 * }
 */
export async function createDataAccessRequest(req, res) {
  try {
    const { companyId, targetUserId, referenceId, requestedDataType = 'reference', requestReason } = req.body;
    const requestedByUserId = req.user.id;

    // Validate required fields
    if (!companyId || !targetUserId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'companyId and targetUserId are required'
      });
    }

    // Verify user is an active signer of the company
    const { data: signer, error: signerError } = await supabaseClient
      .from('company_signers')
      .select('id, company_id')
      .eq('company_id', companyId)
      .eq('user_id', requestedByUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (signerError || !signer) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You must be an active signer of this company'
      });
    }

    // Verify target user exists
    const { data: targetUser, error: userError } = await supabaseClient
      .from('users')
      .select('id, email, wallet_address')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Target user does not exist'
      });
    }

    // If referenceId provided, verify it exists and belongs to target user
    if (referenceId) {
      const { data: reference, error: refError } = await supabaseClient
        .from('references')
        .select('id, owner_id')
        .eq('id', referenceId)
        .single();

      if (refError || !reference) {
        return res.status(404).json({
          error: 'Reference not found',
          message: 'Specified reference does not exist'
        });
      }

      if (reference.owner_id !== targetUserId) {
        return res.status(400).json({
          error: 'Invalid reference',
          message: 'Reference does not belong to target user'
        });
      }
    }

    // Get pricing for the requested data type
    const { data: pricing, error: pricingError } = await supabaseClient
      .from('data_access_pricing')
      .select('*')
      .eq('data_type', requestedDataType)
      .eq('is_active', true)
      .single();

    if (pricingError || !pricing) {
      return res.status(500).json({
        error: 'Pricing not configured',
        message: `No pricing found for data type: ${requestedDataType}`
      });
    }

    // Check if there's already a pending request for the same data
    const { data: existing } = await supabaseClient
      .from('data_access_requests')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('target_user_id', targetUserId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: 'Request already exists',
        message: 'There is already a pending request for this user'
      });
    }

    // Create the data access request
    const requestData = {
      company_id: companyId,
      requested_by_user_id: requestedByUserId,
      target_user_id: targetUserId,
      reference_id: referenceId || null,
      status: 'PENDING',
      price_amount: pricing.price_amount,
      currency: pricing.currency,
      requested_data_type: requestedDataType,
      request_reason: requestReason || null,
      metadata: {
        pricing_id: pricing.id,
        platform_fee_percent: pricing.platform_fee_percent,
        user_fee_percent: pricing.user_fee_percent,
        ref_creator_fee_percent: pricing.ref_creator_fee_percent
      },
      payment_status: 'PENDING',
      payment_provider: 'internal_ledger',
      created_at: new Date().toISOString()
    };

    const { data: request, error: createError } = await supabaseClient
      .from('data_access_requests')
      .insert([requestData])
      .select()
      .single();

    if (createError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to create data access request', {
        userId: req.user?.id,
        companyId: companyId,
        targetUserId: targetUserId,
        dataType: requestedDataType,
        error: createError.message,
        stack: createError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to create data access request'
      });
    }

    // Log audit trail
    await logDataAccessAction(
      requestedByUserId,
      companyId,
      'create_data_access_request',
      {
        requestId: request.id,
        targetUserId,
        referenceId,
        dataType: requestedDataType,
        priceAmount: pricing.price_amount
      },
      req
    );

    // Send notification to target user
    try {
      const { data: company } = await supabaseClient
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

      await sendDataAccessRequestNotification({
        recipientEmail: targetUser.email,
        companyName: company?.name || 'A company',
        dataType: requestedDataType,
        priceAmount: pricing.price_amount,
        currency: pricing.currency,
        requestId: request.id
      });
    } catch (emailError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.warn('Failed to send notification email', {
        userId: req.user?.id,
        companyId: companyId,
        targetUserId: targetUserId,
        recipientEmail: targetUser.email,
        error: emailError.message
      });
      // Don't fail the request if email fails
    }

    return res.json({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        targetUserId: request.target_user_id,
        referenceId: request.reference_id,
        priceAmount: request.price_amount,
        currency: request.currency,
        dataType: request.requested_data_type,
        expiresAt: request.expires_at,
        createdAt: request.created_at
      },
      message: 'Data access request created. Awaiting user consent.'
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to create data access request', {
      userId: req.user?.id,
      companyId: req.body?.companyId,
      targetUserId: req.body?.targetUserId,
      dataType: req.body?.requestedDataType,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating the request'
    });
  }
}

// ============================================================================
// GET PENDING REQUESTS FOR USER
// ============================================================================

/**
 * GET /api/data-access/pending
 * Get all pending data access requests for the authenticated user
 */
export async function getPendingRequests(req, res) {
  try {
    const userId = req.user.id;

    const { data: requests, error } = await supabaseClient
      .from('data_access_requests')
      .select(`
        *,
        companies (
          id,
          name,
          verified,
          logo_url
        ),
        references (
          id,
          referrer_name,
          overall_rating
        )
      `)
      .eq('target_user_id', userId)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch pending requests', {
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to fetch pending requests'
      });
    }

    return res.json({
      success: true,
      requests: requests.map(req => ({
        id: req.id,
        company: req.companies,
        reference: req.references,
        dataType: req.requested_data_type,
        requestReason: req.request_reason,
        priceAmount: req.price_amount,
        currency: req.currency,
        status: req.status,
        createdAt: req.created_at,
        expiresAt: req.expires_at
      })),
      total: requests.length
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get pending requests', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// APPROVE DATA ACCESS REQUEST
// ============================================================================

/**
 * POST /api/data-access/:requestId/approve
 * User approves data access request with wallet signature
 *
 * Body: {
 *   signature: string,
 *   walletAddress: string,
 *   message: string
 * }
 */
export async function approveDataAccessRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { signature, walletAddress, message } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!signature || !walletAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'signature and walletAddress are required'
      });
    }

    // Get the request
    const { data: request, error: requestError } = await supabaseClient
      .from('data_access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        error: 'Request not found'
      });
    }

    // Verify user owns this request
    if (request.target_user_id !== userId) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You can only approve your own data access requests'
      });
    }

    // Verify status is PENDING
    if (request.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Request is ${request.status}, cannot approve`
      });
    }

    // Verify not expired
    if (new Date(request.expires_at) < new Date()) {
      // Auto-expire
      await supabaseClient
        .from('data_access_requests')
        .update({ status: 'EXPIRED' })
        .eq('id', requestId);

      return res.status(400).json({
        error: 'Request expired',
        message: 'This request has expired'
      });
    }

    // TODO: Verify wallet signature (ethers.js)
    // For now, we just store it

    // Process payment and create revenue share
    const revenueShareResult = await createRevenueShare(request, supabaseClient);

    if (!revenueShareResult.success) {
      return res.status(500).json({
        error: 'Payment processing failed',
        message: revenueShareResult.error
      });
    }

    // Update request status
    const { data: updatedRequest, error: updateError } = await supabaseClient
      .from('data_access_requests')
      .update({
        status: 'APPROVED',
        consent_given_at: new Date().toISOString(),
        consent_wallet_signature: signature,
        consent_message: message || `Approved data access request ${requestId}`,
        payment_status: 'COMPLETED',
        payment_completed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to approve request', {
        userId: req.user?.id,
        requestId: requestId,
        companyId: request.company_id,
        error: updateError.message,
        stack: updateError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to approve request'
      });
    }

    // Log audit trail
    await logDataAccessAction(
      userId,
      request.company_id,
      'approve_data_access_request',
      {
        requestId,
        revenueShareId: revenueShareResult.revenueShareId,
        signature: signature.substring(0, 20) + '...'
      },
      req
    );

    // Send notification to company
    try {
      const { data: company } = await supabaseClient
        .from('companies')
        .select('name')
        .eq('id', request.company_id)
        .single();

      const { data: targetUser } = await supabaseClient
        .from('users')
        .select('email')
        .eq('id', request.requested_by_user_id)
        .single();

      if (targetUser?.email) {
        await sendDataAccessApprovedNotification({
          recipientEmail: targetUser.email,
          companyName: company?.name || 'Your company',
          requestId,
          dataType: request.requested_data_type
        });
      }
    } catch (emailError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.warn('Failed to send approval notification', {
        userId: req.user?.id,
        requestId: requestId,
        recipientEmail: targetUser?.email,
        error: emailError.message
      });
    }

    return res.json({
      success: true,
      request: updatedRequest,
      revenueShare: revenueShareResult.revenueShare,
      message: 'Data access request approved successfully'
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to approve data access request', {
      userId: req.user?.id,
      requestId: req.params?.requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// REJECT DATA ACCESS REQUEST
// ============================================================================

/**
 * POST /api/data-access/:requestId/reject
 * User rejects data access request
 */
export async function rejectDataAccessRequest(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Get the request
    const { data: request, error: requestError } = await supabaseClient
      .from('data_access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        error: 'Request not found'
      });
    }

    // Verify user owns this request
    if (request.target_user_id !== userId) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You can only reject your own data access requests'
      });
    }

    // Verify status is PENDING
    if (request.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Request is ${request.status}, cannot reject`
      });
    }

    // Update status to REJECTED
    const { data: updatedRequest, error: updateError } = await supabaseClient
      .from('data_access_requests')
      .update({
        status: 'REJECTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to reject request', {
        userId: req.user?.id,
        requestId: requestId,
        companyId: request.company_id,
        error: updateError.message,
        stack: updateError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to reject request'
      });
    }

    // Log audit trail
    await logDataAccessAction(
      userId,
      request.company_id,
      'reject_data_access_request',
      { requestId },
      req
    );

    return res.json({
      success: true,
      request: updatedRequest,
      message: 'Data access request rejected'
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to reject data access request', {
      userId: req.user?.id,
      requestId: req.params?.requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET DATA BY REQUEST ID (for companies after approval)
// ============================================================================

/**
 * GET /api/data-access/:requestId/data
 * Company retrieves the approved data
 */
export async function getDataByRequestId(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Get the request
    const { data: request, error: requestError } = await supabaseClient
      .from('data_access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        error: 'Request not found'
      });
    }

    // Verify user is authorized (company signer)
    const { data: signer } = await supabaseClient
      .from('company_signers')
      .select('id')
      .eq('company_id', request.company_id)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!signer) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You must be an active signer of the requesting company'
      });
    }

    // Verify request is APPROVED
    if (request.status !== 'APPROVED') {
      return res.status(403).json({
        error: 'Access denied',
        message: `Request status is ${request.status}. Only approved requests can be accessed.`
      });
    }

    // Fetch the data based on requested_data_type
    let responseData = {};

    if (request.reference_id) {
      // Fetch specific reference
      const { data: reference } = await supabaseClient
        .from('references')
        .select('*')
        .eq('id', request.reference_id)
        .single();

      responseData.reference = reference;
    }

    if (request.requested_data_type === 'profile' || request.requested_data_type === 'full_data') {
      // Fetch user profile
      const { data: user } = await supabaseClient
        .from('users')
        .select('id, email, wallet_address, identity_verified')
        .eq('id', request.target_user_id)
        .single();

      responseData.profile = user;

      // Fetch all references
      const { data: references } = await supabaseClient
        .from('references')
        .select('*')
        .eq('owner_id', request.target_user_id)
        .eq('status', 'active');

      responseData.references = references;
    }

    // Update access tracking
    await supabaseClient
      .from('data_access_requests')
      .update({
        data_accessed: true,
        data_accessed_at: new Date().toISOString(),
        access_count: request.access_count + 1
      })
      .eq('id', requestId);

    // Log audit trail
    await logDataAccessAction(
      userId,
      request.company_id,
      'access_data',
      { requestId, dataType: request.requested_data_type },
      req
    );

    return res.json({
      success: true,
      data: responseData,
      requestId: request.id,
      dataType: request.requested_data_type,
      accessedAt: new Date().toISOString()
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get data by request ID', {
      userId: req.user?.id,
      requestId: req.params?.requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// HELPER FUNCTION: CREATE REVENUE SHARE
// ============================================================================

async function createRevenueShare(request, supabaseClient) {
  try {
    // Calculate split amounts
    const metadata = request.metadata || {};
    const platformPercent = metadata.platform_fee_percent || 40.00;
    const userPercent = metadata.user_fee_percent || 40.00;
    const refCreatorPercent = metadata.ref_creator_fee_percent || 20.00;

    const totalAmount = parseFloat(request.price_amount);
    const platformAmount = (totalAmount * platformPercent / 100).toFixed(2);
    const userAmount = (totalAmount * userPercent / 100).toFixed(2);
    const refCreatorAmount = (totalAmount * refCreatorPercent / 100).toFixed(2);

    // Get reference creator email if reference exists
    let refCreatorEmail = null;
    if (request.reference_id) {
      const { data: reference } = await supabaseClient
        .from('references')
        .select('referrer_email')
        .eq('id', request.reference_id)
        .single();

      refCreatorEmail = reference?.referrer_email || null;
    }

    // Create revenue share record
    const revenueShareData = {
      data_access_request_id: request.id,
      company_id: request.company_id,
      target_user_id: request.target_user_id,
      reference_id: request.reference_id,
      total_amount: totalAmount,
      currency: request.currency,
      platform_amount: parseFloat(platformAmount),
      platform_percent: platformPercent,
      user_amount: parseFloat(userAmount),
      user_percent: userPercent,
      ref_creator_amount: parseFloat(refCreatorAmount),
      ref_creator_percent: refCreatorPercent,
      ref_creator_email: refCreatorEmail,
      status: 'PENDING_PAYOUT',
      created_at: new Date().toISOString()
    };

    const { data: revenueShare, error } = await supabaseClient
      .from('revenue_shares')
      .insert([revenueShareData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create revenue share', {
        requestId: request.id,
        companyId: request.company_id,
        targetUserId: request.target_user_id,
        totalAmount: totalAmount,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: 'Failed to create revenue share' };
    }

    // Update or create user balance ledger entries
    await updateUserBalance(request.target_user_id, userAmount, request.currency, supabaseClient);

    if (refCreatorEmail) {
      await updateCreatorBalance(refCreatorEmail, refCreatorAmount, request.currency, supabaseClient);
    }

    return {
      success: true,
      revenueShareId: revenueShare.id,
      revenueShare
    };
  } catch (error) {
    logger.error('Failed to create revenue share', {
      requestId: request?.id,
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

// Update user balance ledger
async function updateUserBalance(userId, amount, currency, supabaseClient) {
  const { data: existing } = await supabaseClient
    .from('user_balance_ledger')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const amountNum = parseFloat(amount);

  if (existing) {
    await supabaseClient
      .from('user_balance_ledger')
      .update({
        total_earned: parseFloat(existing.total_earned) + amountNum,
        current_balance: parseFloat(existing.current_balance) + amountNum
      })
      .eq('user_id', userId);
  } else {
    const { data: user } = await supabaseClient
      .from('users')
      .select('email, wallet_address')
      .eq('id', userId)
      .single();

    await supabaseClient
      .from('user_balance_ledger')
      .insert([{
        user_id: userId,
        user_email: user.email,
        total_earned: amountNum,
        current_balance: amountNum,
        currency,
        wallet_address: user.wallet_address
      }]);
  }
}

// Update creator balance ledger (by email)
async function updateCreatorBalance(email, amount, currency, supabaseClient) {
  const { data: existing } = await supabaseClient
    .from('user_balance_ledger')
    .select('*')
    .eq('user_email', email)
    .maybeSingle();

  const amountNum = parseFloat(amount);

  if (existing) {
    await supabaseClient
      .from('user_balance_ledger')
      .update({
        total_earned: parseFloat(existing.total_earned) + amountNum,
        current_balance: parseFloat(existing.current_balance) + amountNum
      })
      .eq('user_email', email);
  } else {
    await supabaseClient
      .from('user_balance_ledger')
      .insert([{
        user_email: email,
        total_earned: amountNum,
        current_balance: amountNum,
        currency
      }]);
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  createDataAccessRequest,
  getPendingRequests,
  approveDataAccessRequest,
  rejectDataAccessRequest,
  getDataByRequestId
};
