/**
 * REFERENCE REQUEST SERVICE
 *
 * Purpose: Create and manage KPI-driven reference invitations
 *
 * Architecture Principles:
 * - Token-based access control (secure random tokens)
 * - Version locking (KPI set version captured at request time)
 * - Single-use tokens (one reference per request)
 * - Expiration enforcement
 * - SHA-256 hash for secure token storage
 *
 * @module services/kpiReference/referenceRequest.service
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';
import { getActiveKpiSet } from './kpiSets.service.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Valid relationship types
 */
export const RelationshipTypes = {
  MANAGER: 'manager',
  PEER: 'peer',
  REPORT: 'report',
  CLIENT: 'client',
  MENTOR: 'mentor',
  OTHER: 'other'
};

/**
 * Generate a secure random token
 *
 * @returns {string} 64-character hex token
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash token using SHA-256
 *
 * @param {string} token - Plain text token
 * @returns {string} SHA-256 hash
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a reference request (invitation)
 *
 * @param {object} params
 * @param {string} params.candidate_id - UUID of candidate being evaluated
 * @param {string} params.referee_email - Email of referee
 * @param {string} [params.referee_name] - Optional name of referee
 * @param {string} params.relationship_type - Relationship (manager, peer, etc.)
 * @param {string} params.role - Role being evaluated
 * @param {string} params.seniority_level - Seniority level
 * @param {string} [params.created_by] - User ID of request creator (defaults to candidate_id)
 * @param {number} [params.expires_in_days=30] - Days until expiration
 * @returns {Promise<{success: boolean, request_id?: string, token?: string, invite_url?: string, error?: string}>}
 */
export async function createReferenceRequest({
  candidate_id,
  referee_email,
  referee_name,
  relationship_type,
  role,
  seniority_level,
  created_by,
  expires_in_days = 30
}) {
  try {
    // Validate inputs
    if (!candidate_id || !referee_email || !relationship_type || !role || !seniority_level) {
      return {
        success: false,
        error: 'Missing required fields: candidate_id, referee_email, relationship_type, role, seniority_level'
      };
    }

    if (!Object.values(RelationshipTypes).includes(relationship_type)) {
      return {
        success: false,
        error: `Invalid relationship_type. Must be one of: ${Object.values(RelationshipTypes).join(', ')}`
      };
    }

    // Validate candidate exists
    const { data: candidate, error: candidateError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', candidate_id)
      .maybeSingle();

    if (candidateError || !candidate) {
      logger.error('Candidate not found', {
        candidate_id,
        error: candidateError?.message
      });
      return {
        success: false,
        error: 'Candidate not found'
      };
    }

    // Get active KPI set for role + seniority
    const kpiSetResult = await getActiveKpiSet(role, seniority_level);

    if (!kpiSetResult.success) {
      logger.error('No active KPI set found', {
        role,
        seniority_level,
        error: kpiSetResult.error
      });
      return {
        success: false,
        error: kpiSetResult.error
      };
    }

    const { kpiSet } = kpiSetResult;

    // Generate secure token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    // Create reference request
    const requestRow = {
      candidate_id,
      referee_email: referee_email.toLowerCase(),
      referee_name,
      relationship_type,
      role,
      seniority_level,
      kpi_set_id: kpiSet.id,
      kpi_set_version: kpiSet.version,
      token, // Store plain token for email sending
      token_hash: tokenHash, // Store hash for lookup
      expires_at: expiresAt.toISOString(),
      status: 'pending',
      created_by: created_by || candidate_id,
      created_at: new Date().toISOString()
    };

    const { data: request, error: insertError } = await supabase
      .from('reference_requests')
      .insert([requestRow])
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to create reference request', {
        candidate_id,
        referee_email,
        error: insertError.message
      });
      throw insertError;
    }

    // Generate invite URL
    const inviteUrl = `${FRONTEND_URL}/references/submit/${token}`;

    logger.info('Reference request created', {
      request_id: request.id,
      candidate_id,
      referee_email,
      role,
      seniority_level,
      kpi_set_version: kpiSet.version,
      expires_at: expiresAt.toISOString()
    });

    // Send invitation email
    await sendReferenceInviteEmail({
      referee_email,
      referee_name,
      candidate_email: candidate.email,
      role,
      seniority_level,
      invite_url: inviteUrl,
      expires_in_days
    });

    return {
      success: true,
      request_id: request.id,
      token, // Return plain token for testing/debugging
      invite_url: inviteUrl,
      expires_at: expiresAt.toISOString(),
      kpi_set_version: kpiSet.version
    };

  } catch (error) {
    logger.error('Error in createReferenceRequest', {
      candidate_id,
      referee_email,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to create reference request'
    };
  }
}

/**
 * Get reference request by token
 * Validates token, checks expiration, and returns request details with KPI set
 *
 * @param {string} token - Plain text token from URL
 * @returns {Promise<{success: boolean, request?: object, kpiSet?: object, kpis?: array, error?: string, status?: string}>}
 */
export async function getReferenceRequestByToken(token) {
  try {
    if (!token) {
      return { success: false, error: 'Token is required' };
    }

    // Look up request by token hash
    const tokenHash = hashToken(token);

    const { data: request, error: requestError } = await supabase
      .from('reference_requests')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (requestError) {
      logger.error('Failed to fetch reference request', {
        error: requestError.message
      });
      throw requestError;
    }

    if (!request) {
      // Also try plain token lookup (backwards compatibility)
      const { data: requestByPlainToken, error: plainError } = await supabase
        .from('reference_requests')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (plainError || !requestByPlainToken) {
        return {
          success: false,
          error: 'Invalid or expired token',
          status: 'invalid'
        };
      }

      // Use the plain token result
      Object.assign(request, requestByPlainToken);
    }

    // Check if already submitted
    if (request.status === 'submitted') {
      return {
        success: false,
        error: 'This reference has already been submitted',
        status: 'already_submitted'
      };
    }

    // Check if revoked
    if (request.status === 'revoked') {
      return {
        success: false,
        error: 'This reference request has been revoked',
        status: 'revoked'
      };
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(request.expires_at);

    if (now > expiresAt) {
      // Auto-update status to expired
      await supabase
        .from('reference_requests')
        .update({ status: 'expired' })
        .eq('id', request.id);

      return {
        success: false,
        error: 'This invitation has expired',
        status: 'expired',
        expires_at: request.expires_at
      };
    }

    // Fetch candidate info
    const { data: candidate, error: candidateError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', request.candidate_id)
      .maybeSingle();

    if (candidateError || !candidate) {
      logger.error('Failed to fetch candidate', {
        candidate_id: request.candidate_id,
        error: candidateError?.message
      });
    }

    // Fetch KPI set and KPIs (version-locked)
    const { data: kpiSet, error: kpiSetError } = await supabase
      .from('kpi_sets')
      .select('*')
      .eq('id', request.kpi_set_id)
      .maybeSingle();

    if (kpiSetError || !kpiSet) {
      logger.error('Failed to fetch KPI set', {
        kpi_set_id: request.kpi_set_id,
        error: kpiSetError?.message
      });
      return {
        success: false,
        error: 'KPI set not found'
      };
    }

    const { data: kpis, error: kpisError } = await supabase
      .from('kpis')
      .select('*')
      .eq('kpi_set_id', kpiSet.id)
      .order('key', { ascending: true });

    if (kpisError) {
      logger.error('Failed to fetch KPIs', {
        kpi_set_id: kpiSet.id,
        error: kpisError.message
      });
      throw kpisError;
    }

    logger.debug('Reference request retrieved by token', {
      request_id: request.id,
      candidate_id: request.candidate_id,
      referee_email: request.referee_email,
      status: request.status
    });

    return {
      success: true,
      request: {
        id: request.id,
        candidate_id: request.candidate_id,
        candidate_email: candidate?.email,
        referee_email: request.referee_email,
        referee_name: request.referee_name,
        relationship_type: request.relationship_type,
        role: request.role,
        seniority_level: request.seniority_level,
        expires_at: request.expires_at,
        created_at: request.created_at
      },
      kpiSet: {
        id: kpiSet.id,
        role: kpiSet.role,
        seniority_level: kpiSet.seniority_level,
        version: kpiSet.version,
        description: kpiSet.description
      },
      kpis: kpis.map(kpi => ({
        id: kpi.id,
        key: kpi.key,
        name: kpi.name,
        description: kpi.description,
        category: kpi.category,
        required: kpi.required,
        weight: parseFloat(kpi.weight),
        min_evidence_length: kpi.min_evidence_length
      })),
      status: 'valid'
    };

  } catch (error) {
    logger.error('Error in getReferenceRequestByToken', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to retrieve reference request'
    };
  }
}

/**
 * Send reference invitation email
 *
 * @param {object} params
 * @param {string} params.referee_email - Referee email
 * @param {string} [params.referee_name] - Referee name
 * @param {string} params.candidate_email - Candidate email
 * @param {string} params.role - Role
 * @param {string} params.seniority_level - Seniority level
 * @param {string} params.invite_url - Full invitation URL
 * @param {number} params.expires_in_days - Days until expiration
 * @returns {Promise<void>}
 */
async function sendReferenceInviteEmail({
  referee_email,
  referee_name,
  candidate_email,
  role,
  seniority_level,
  invite_url,
  expires_in_days
}) {
  if (!RESEND_API_KEY) {
    logger.warn('Email service not configured', {
      message: 'RESEND_API_KEY environment variable not set',
      action: 'skipping_email'
    });
    return;
  }

  try {
    const roleName = role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const seniorityName = seniority_level.charAt(0).toUpperCase() + seniority_level.slice(1);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HRKey References <noreply@hrkey.com>',
        to: referee_email,
        subject: `Reference Request - ${seniorityName} ${roleName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Professional Reference Request</h1>
            </div>

            <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; margin: 0 0 20px;">Hi ${referee_name || 'there'},</p>

              <p style="font-size: 16px; margin: 0 0 20px;">
                You've been invited to provide a professional reference for <strong>${candidate_email}</strong>.
              </p>

              <div style="background: #f9fafb; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Position Details</p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">${seniorityName} ${roleName}</p>
              </div>

              <p style="font-size: 16px; margin: 0 0 20px;">
                This reference uses HRKey's KPI-driven framework, which means you'll be asked to provide specific evidence and examples for predefined performance indicators. This ensures your feedback is structured, comparable, and maximally useful.
              </p>

              <div style="text-align: center; margin: 35px 0;">
                <a href="${invite_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                  Complete Reference
                </a>
              </div>

              <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 6px; margin: 30px 0;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>⏰ Time Sensitive:</strong> This invitation expires in <strong>${expires_in_days} days</strong>. Please complete it at your earliest convenience.
                </p>
              </div>

              <p style="font-size: 14px; color: #6b7280; margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <strong>Having trouble with the button?</strong><br>
                Copy and paste this link into your browser:<br>
                <a href="${invite_url}" style="color: #667eea; word-break: break-all;">${invite_url}</a>
              </p>

              <p style="font-size: 14px; color: #6b7280; margin: 30px 0 0;">
                Best regards,<br>
                <strong>The HRKey Team</strong>
              </p>
            </div>

            <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0;">This is an automated message from HRKey. Please do not reply to this email.</p>
            </div>
          </div>
        `
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Failed to send reference invitation email', {
        service: 'resend',
        statusCode: res.status,
        error: errorText,
        recipientEmail: referee_email
      });
    } else {
      logger.info('Reference invitation email sent', {
        referee_email,
        candidate_email,
        role,
        seniority_level
      });
    }

  } catch (error) {
    logger.error('Failed to send reference invitation email', {
      service: 'resend',
      error: error.message,
      recipientEmail: referee_email
    });
  }
}

/**
 * Get pending reference requests for a candidate
 *
 * @param {string} candidateId - UUID of candidate
 * @returns {Promise<{success: boolean, requests?: array, error?: string}>}
 */
export async function getPendingRequestsForCandidate(candidateId) {
  try {
    const { data: requests, error } = await supabase
      .from('reference_requests')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch pending requests', {
        candidateId,
        error: error.message
      });
      throw error;
    }

    return {
      success: true,
      requests: requests.map(req => ({
        id: req.id,
        referee_email: req.referee_email,
        referee_name: req.referee_name,
        relationship_type: req.relationship_type,
        role: req.role,
        seniority_level: req.seniority_level,
        status: req.status,
        expires_at: req.expires_at,
        created_at: req.created_at
      }))
    };

  } catch (error) {
    logger.error('Error in getPendingRequestsForCandidate', {
      candidateId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve pending requests'
    };
  }
}
