// ============================================================================
// Company Signers Controller
// ============================================================================
// Handles authorized signers management for companies
// Includes invitations, acceptance, and status management
// ============================================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  logSignerInvitation,
  logSignerAcceptance,
  logSignerStatusChange,
  AuditActionTypes
} from '../utils/auditLogger.js';
import { sendSignerInvitation } from '../utils/emailService.js';
import logger from '../logger.js';
import { logEvent, EventTypes } from '../services/analytics/eventTracker.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// INVITE SIGNER
// ============================================================================

/**
 * POST /api/company/:companyId/signers
 * Invite a new signer to the company
 * Requires: User must be an active signer of this company
 *
 * Body: {
 *   email: string,
 *   role: string (e.g., 'HR Manager', 'Recruiter', etc.)
 * }
 */
export async function inviteSigner(req, res) {
  try {
    const { companyId } = req.params;
    const { email, role } = req.body;

    // Validate required fields
    if (!email || !role) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Please provide email and role'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Please provide a valid email address'
      });
    }

    // Get company details
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('name, domain_email')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    // Optional: Validate email domain matches company domain
    if (company.domain_email) {
      const emailDomain = email.split('@')[1];
      const companyDomain = company.domain_email.replace('@', '');
      if (emailDomain !== companyDomain) {
        const reqLogger = logger.withRequest(req);
        reqLogger.warn('Email domain does not match company domain', {
          userId: req.user?.id,
          companyId: companyId,
          email: email,
          emailDomain: emailDomain,
          companyDomain: companyDomain
        });
        // Don't block - just log warning
      }
    }

    // Check if signer already exists (by email)
    const { data: existingSigner } = await supabaseClient
      .from('company_signers')
      .select('id, is_active, user_id')
      .eq('company_id', companyId)
      .eq('email', email)
      .maybeSingle();

    if (existingSigner) {
      if (existingSigner.is_active) {
        return res.status(400).json({
          error: 'Signer already exists',
          message: 'This email is already registered as an active signer'
        });
      } else {
        // Reactivate inactive signer
        const inviteToken = crypto.randomBytes(32).toString('hex');

        const { data: reactivatedSigner, error: updateError } = await supabaseClient
          .from('company_signers')
          .update({
            is_active: true,
            role,
            invite_token: inviteToken,
            invited_at: new Date().toISOString(),
            invited_by: req.user.id
          })
          .eq('id', existingSigner.id)
          .select()
          .single();

        if (updateError) {
          const reqLogger = logger.withRequest(req);
          reqLogger.error('Failed to reactivate signer', {
            userId: req.user?.id,
            companyId: companyId,
            signerId: existingSigner.id,
            email: email,
            error: updateError.message,
            stack: updateError.stack
          });
          return res.status(500).json({
            error: 'Database error',
            message: 'Failed to reactivate signer'
          });
        }

        // Send invitation email
        await sendSignerInvitation({
          recipientEmail: email,
          recipientName: null,
          companyName: company.name,
          role,
          inviteToken,
          inviterName: req.user.email || 'A team member'
        });

        await logSignerStatusChange(
          req.user.id,
          companyId,
          existingSigner.id,
          true,
          { email, role, action: 'reactivated' },
          req
        );

        // Track analytics event (non-blocking)
        await logEvent({
          userId: req.user.id,
          companyId: companyId,
          eventType: EventTypes.SIGNER_INVITED,
          context: {
            signerId: reactivatedSigner.id,
            signerEmail: email,
            signerRole: role,
            action: 'reactivated'
          },
          req
        });

        return res.json({
          success: true,
          signerId: reactivatedSigner.id,
          inviteToken,
          message: 'Signer reactivated and invitation sent',
          emailSent: true
        });
      }
    }

    // Generate secure invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Create signer record
    const signerData = {
      company_id: companyId,
      user_id: null, // Will be set when they accept
      email,
      role,
      is_active: true,
      invite_token: inviteToken,
      invited_at: new Date().toISOString(),
      invited_by: req.user.id
    };

    const { data: signer, error: createError } = await supabaseClient
      .from('company_signers')
      .insert([signerData])
      .select()
      .single();

    if (createError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to create signer invitation', {
        userId: req.user?.id,
        companyId: companyId,
        email: email,
        role: role,
        error: createError.message,
        stack: createError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to create signer invitation'
      });
    }

    // Send invitation email via Resend
    try {
      await sendSignerInvitation({
        recipientEmail: email,
        recipientName: null,
        companyName: company.name,
        role,
        inviteToken,
        inviterName: req.user.email || 'A team member'
      });
    } catch (emailError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.warn('Failed to send invitation email', {
        userId: req.user?.id,
        companyId: companyId,
        signerId: signer.id,
        email: email,
        error: emailError.message
      });
      // Don't fail the request - signer was created
      return res.json({
        success: true,
        signerId: signer.id,
        inviteToken,
        message: 'Signer created but email failed to send',
        emailSent: false
      });
    }

    // Log audit trail
    await logSignerInvitation(
      req.user.id,
      companyId,
      signer.id,
      { email, role, invitedBy: req.user.email },
      req
    );

    // Track analytics event (non-blocking)
    await logEvent({
      userId: req.user.id,
      companyId: companyId,
      eventType: EventTypes.SIGNER_INVITED,
      context: {
        signerId: signer.id,
        signerEmail: email,
        signerRole: role,
        action: 'new_invitation'
      },
      req
    });

    return res.json({
      success: true,
      signerId: signer.id,
      inviteToken,
      message: 'Signer invitation sent successfully',
      emailSent: true
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to invite signer', {
      userId: req.user?.id,
      companyId: req.params?.companyId,
      email: req.body?.email,
      role: req.body?.role,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while inviting the signer'
    });
  }
}

// ============================================================================
// GET SIGNERS
// ============================================================================

/**
 * GET /api/company/:companyId/signers
 * Get all signers for a company
 * Requires: User must be a signer of this company or superadmin
 */
export async function getSigners(req, res) {
  try {
    const { companyId } = req.params;

    const { data: signers, error } = await supabaseClient
      .from('company_signers')
      .select(`
        id,
        email,
        role,
        is_active,
        invited_at,
        accepted_at,
        user_id,
        invited_by
      `)
      .eq('company_id', companyId)
      .order('invited_at', { ascending: false });

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch signers', {
        userId: req.user?.id,
        companyId: companyId,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to fetch signers'
      });
    }

    // Enrich with inviter information
    const enrichedSigners = await Promise.all(
      signers.map(async (signer) => {
        let inviterEmail = null;
        if (signer.invited_by) {
          const { data: inviter } = await supabaseClient
            .from('users')
            .select('email')
            .eq('id', signer.invited_by)
            .single();
          inviterEmail = inviter?.email || null;
        }

        return {
          id: signer.id,
          email: signer.email,
          role: signer.role,
          isActive: signer.is_active,
          invitedAt: signer.invited_at,
          acceptedAt: signer.accepted_at,
          hasAccepted: !!signer.user_id,
          invitedBy: inviterEmail
        };
      })
    );

    return res.json({
      success: true,
      signers: enrichedSigners,
      total: enrichedSigners.length,
      active: enrichedSigners.filter(s => s.isActive).length
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get signers', {
      userId: req.user?.id,
      companyId: req.params?.companyId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// UPDATE SIGNER
// ============================================================================

/**
 * PATCH /api/company/:companyId/signers/:signerId
 * Update signer status or role
 * Requires: User must be an active signer of this company
 *
 * Body: {
 *   isActive?: boolean,
 *   role?: string
 * }
 */
export async function updateSigner(req, res) {
  try {
    const { companyId, signerId } = req.params;
    const { isActive, role } = req.body;

    // Validate at least one field provided
    if (isActive === undefined && !role) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Please provide isActive or role to update'
      });
    }

    // Get current signer info
    const { data: currentSigner, error: fetchError } = await supabaseClient
      .from('company_signers')
      .select('*')
      .eq('id', signerId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !currentSigner) {
      return res.status(404).json({
        error: 'Signer not found'
      });
    }

    // Prevent user from deactivating themselves
    if (isActive === false && currentSigner.user_id === req.user.id) {
      return res.status(400).json({
        error: 'Cannot deactivate yourself',
        message: 'You cannot deactivate your own signer status'
      });
    }

    // Build update object
    const updates = {};
    if (isActive !== undefined) updates.is_active = isActive;
    if (role) updates.role = role;

    // Update signer
    const { data: updatedSigner, error: updateError } = await supabaseClient
      .from('company_signers')
      .update(updates)
      .eq('id', signerId)
      .select()
      .single();

    if (updateError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to update signer', {
        userId: req.user?.id,
        companyId: companyId,
        signerId: signerId,
        updates: updates,
        error: updateError.message,
        stack: updateError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to update signer'
      });
    }

    // Log audit trail
    if (isActive !== undefined) {
      await logSignerStatusChange(
        req.user.id,
        companyId,
        signerId,
        isActive,
        {
          email: currentSigner.email,
          role: role || currentSigner.role,
          previousStatus: currentSigner.is_active
        },
        req
      );
    } else {
      // Log role change
      await supabaseClient.from('audit_logs').insert([{
        user_id: req.user.id,
        company_id: companyId,
        signer_id: signerId,
        action_type: AuditActionTypes.UPDATE_SIGNER,
        resource_type: 'signer',
        resource_id: signerId,
        details: {
          email: currentSigner.email,
          oldRole: currentSigner.role,
          newRole: role
        },
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }]);
    }

    return res.json({
      success: true,
      signer: updatedSigner,
      message: 'Signer updated successfully'
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to update signer', {
      userId: req.user?.id,
      companyId: req.params?.companyId,
      signerId: req.params?.signerId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// ACCEPT SIGNER INVITATION
// ============================================================================

/**
 * POST /api/signers/accept/:token
 * Accept a signer invitation
 * Requires: User must be authenticated
 *
 * Body: {
 *   userId: string (from authenticated session)
 * }
 */
export async function acceptSignerInvitation(req, res) {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        error: 'Missing invitation token'
      });
    }

    // Find signer by invite token
    const { data: signer, error: fetchError } = await supabaseClient
      .from('company_signers')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (fetchError || !signer) {
      return res.status(404).json({
        error: 'Invalid or expired invitation',
        message: 'This invitation token is not valid'
      });
    }

    // Check if already accepted
    if (signer.user_id) {
      return res.status(400).json({
        error: 'Invitation already accepted',
        message: 'This invitation has already been accepted'
      });
    }

    // Check if user email matches invitation email
    const { data: user } = await supabaseClient
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (user?.email && user.email !== signer.email) {
      return res.status(400).json({
        error: 'Email mismatch',
        message: 'Your email does not match the invitation email'
      });
    }

    // Accept invitation
    const { data: updatedSigner, error: updateError } = await supabaseClient
      .from('company_signers')
      .update({
        user_id: userId,
        accepted_at: new Date().toISOString()
      })
      .eq('id', signer.id)
      .select()
      .single();

    if (updateError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to accept invitation', {
        userId: req.user?.id,
        signerId: signer.id,
        companyId: signer.company_id,
        email: signer.email,
        error: updateError.message,
        stack: updateError.stack
      });
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to accept invitation'
      });
    }

    // Get company details
    const { data: company } = await supabaseClient
      .from('companies')
      .select('name')
      .eq('id', signer.company_id)
      .single();

    // Log audit trail
    await logSignerAcceptance(
      userId,
      signer.company_id,
      signer.id,
      {
        email: signer.email,
        role: signer.role,
        companyName: company?.name || 'Unknown'
      },
      req
    );

    return res.json({
      success: true,
      signer: {
        id: updatedSigner.id,
        companyId: updatedSigner.company_id,
        role: updatedSigner.role,
        acceptedAt: updatedSigner.accepted_at
      },
      company: {
        id: signer.company_id,
        name: company?.name || 'Unknown'
      },
      message: `You've been added as ${signer.role} to ${company?.name || 'the company'}`
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to accept invitation', {
      userId: req.user?.id,
      token: req.params?.token,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while accepting the invitation'
    });
  }
}

// ============================================================================
// GET INVITATION BY TOKEN (PUBLIC - NO AUTH)
// ============================================================================

/**
 * GET /api/signers/invite/:token
 * Get invitation details by token (for displaying invitation page)
 * No authentication required
 */
export async function getInvitationByToken(req, res) {
  try {
    const { token } = req.params;

    const { data: signer, error } = await supabaseClient
      .from('company_signers')
      .select(`
        id,
        email,
        role,
        invited_at,
        user_id,
        company_id
      `)
      .eq('invite_token', token)
      .single();

    if (error || !signer) {
      return res.status(404).json({
        error: 'Invalid invitation',
        message: 'This invitation token is not valid'
      });
    }

    // Get company details
    const { data: company } = await supabaseClient
      .from('companies')
      .select('name, logo_url, verified')
      .eq('id', signer.company_id)
      .single();

    // Check if already accepted
    if (signer.user_id) {
      return res.json({
        success: false,
        status: 'already_accepted',
        message: 'This invitation has already been accepted'
      });
    }

    return res.json({
      success: true,
      invitation: {
        email: signer.email,
        role: signer.role,
        invitedAt: signer.invited_at,
        company: {
          name: company?.name || 'Unknown Company',
          logoUrl: company?.logo_url,
          verified: company?.verified || false
        }
      }
    });
  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get invitation', {
      token: req.params?.token,
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
  inviteSigner,
  getSigners,
  updateSigner,
  acceptSignerInvitation,
  getInvitationByToken
};
