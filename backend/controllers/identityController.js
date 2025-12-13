// ============================================================================
// Identity Controller
// ============================================================================
// Handles user identity verification operations
// Phase 1: Simple internal verification (no external KYC provider)
// TODO Phase 2: Integrate with real KYC providers (Synaps, Onfido, etc.)
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { logIdentityVerification } from '../utils/auditLogger.js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// VERIFY IDENTITY
// ============================================================================

/**
 * POST /api/identity/verify
 * Verify user's identity (Phase 1: simple internal verification)
 *
 * Body: {
 *   fullName: string,
 *   idNumber: string,
 *   selfieUrl?: string (optional, for future use)
 * }
 *
 * Note: userId is taken from authenticated user (req.user.id).
 * Users can only verify their own identity.
 */
export async function verifyIdentity(req, res) {
  try {
    const { fullName, idNumber, selfieUrl } = req.body;

    // SECURITY: Always use authenticated user's ID - users can only verify themselves
    const userId = req.user.id;

    // Validate required fields
    if (!fullName || !idNumber) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Please provide fullName and idNumber'
      });
    }

    // Check if user exists
    const { data: existingUser, error: userError } = await supabaseClient
      .from('users')
      .select('id, email, identity_verified')
      .eq('id', userId)
      .single();

    if (userError || !existingUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check if already verified
    if (existingUser.identity_verified) {
      return res.status(400).json({
        error: 'Already verified',
        message: 'This user has already been verified'
      });
    }

    // Phase 1: Automatically verify (no external KYC)
    // TODO Phase 2: Call external KYC provider (Synaps, Onfido, etc.)
    const kycMetadata = {
      fullName,
      idNumber,
      selfieUrl: selfieUrl || null,
      verifiedAt: new Date().toISOString(),
      method: 'internal', // Phase 1
      // TODO Phase 2: Add external provider response data
    };

    // Update user record
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from('users')
      .update({
        identity_verified: true,
        kyc_provider: 'manual', // Phase 1: manual/internal
        kyc_verified_at: new Date().toISOString(),
        kyc_metadata: kycMetadata
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to update user verification status', {
        userId: userId,
        error: updateError.message,
        stack: updateError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to update user verification status'
      });
    }

    // Log audit trail
    await logIdentityVerification(
      userId,
      {
        fullName,
        idNumber: idNumber.substring(0, 4) + '****', // Redact for security
        method: 'internal'
      },
      req
    );

    // TODO Phase 2: Send verification confirmation email
    // await sendIdentityVerificationConfirmation({
    //   recipientEmail: existingUser.email,
    //   recipientName: fullName
    // });

    return res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        identity_verified: updatedUser.identity_verified,
        kyc_verified_at: updatedUser.kyc_verified_at
      },
      message: 'Identity verified successfully'
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Identity verification failed', {
      userId: req.body?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during identity verification'
    });
  }
}

// ============================================================================
// GET IDENTITY STATUS
// ============================================================================

/**
 * GET /api/identity/status/:userId
 * Get verification status for a user
 *
 * Authorization: User can only view their own status, or superadmin can view any.
 */
export async function getIdentityStatus(req, res) {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing userId parameter'
      });
    }

    // SECURITY: Only allow users to view their own identity status, or superadmin
    const isOwner = req.user.id === userId;
    const isSuperadmin = req.user.role === 'superadmin';

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own identity status'
      });
    }

    const { data: user, error } = await supabaseClient
      .from('users')
      .select('id, email, identity_verified, kyc_provider, kyc_verified_at, kyc_metadata')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Return verification status
    return res.json({
      success: true,
      userId: user.id,
      verified: user.identity_verified || false,
      provider: user.kyc_provider || null,
      verifiedAt: user.kyc_verified_at || null,
      metadata: user.kyc_metadata ? {
        fullName: user.kyc_metadata.fullName,
        // Don't expose sensitive ID number
        hasIdNumber: !!user.kyc_metadata.idNumber,
        hasSelfie: !!user.kyc_metadata.selfieUrl
      } : null
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get identity status', {
      userId: req.params?.userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  verifyIdentity,
  getIdentityStatus
};
