import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { makeRefereeLink, getFrontendBaseURL } from '../utils/appUrl.js';
import { validateReference as validateReferenceRVL } from './validation/index.js';
import { logEvent, EventTypes } from './analytics/eventTracker.js';
import { onReferenceValidated as hrscoreAutoTrigger } from './hrscore/autoTrigger.js';
import { buildReferencePack } from '../utils/referencePack.js';
import {
  logReferenceSubmissionAudit,
  AuditActionTypes
} from '../utils/auditLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const isProductionEnv = process.env.NODE_ENV === 'production';

const maskEmailForLogs = (email) => {
  if (!email || typeof email !== 'string') return undefined;
  const [local, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 2)}***`;
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
};

// Tokens are ALWAYS stored as SHA-256 hashes. The plaintext token is only
// held in memory long enough to build the verification URL and send the email.
export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function resolveCandidateId({ candidateId, candidateWallet }) {
  if (candidateId) return candidateId;
  if (!candidateWallet) return null;

  const { data: userByWallet, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', candidateWallet)
    .single();

  if (!userError && userByWallet?.id) return userByWallet.id;

  const { data: walletRow, error: walletError } = await supabase
    .from('user_wallets')
    .select('user_id')
    .eq('address', candidateWallet)
    .eq('is_active', true)
    .single();

  if (!walletError && walletRow?.user_id) return walletRow.user_id;
  return null;
}

export async function getActiveSignerCompanyIds(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('company_signers')
    .select('company_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    logger.warn('Failed to fetch company signer records', {
      userId,
      error: error.message
    });
    return [];
  }

  return (data || []).map((row) => row.company_id).filter(Boolean);
}

export async function hasApprovedReferenceAccess({ candidateId, companyIds }) {
  if (!candidateId || !companyIds?.length) return false;

  const { data, error } = await supabase
    .from('data_access_requests')
    .select('id, status, requested_data_type, company_id')
    .in('company_id', companyIds)
    .eq('target_user_id', candidateId)
    .eq('status', 'APPROVED')
    .in('requested_data_type', ['reference', 'profile', 'full_data'])
    .maybeSingle();

  if (error) {
    logger.warn('Failed to check data access approval', {
      candidateId,
      companyIds,
      error: error.message
    });
    return false;
  }

  return !!data;
}

async function findInviteByTokenHash(tokenHash) {
  return supabase
    .from('reference_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
}

async function fetchReferenceById(referenceId) {
  return supabase
    .from('references')
    .select('*')
    .eq('id', referenceId)
    .single();
}

export async function fetchInviteByToken(token) {
  if (!token) {
    return { data: null, error: null };
  }

  // Always hash the incoming plaintext token before DB lookup.
  return findInviteByTokenHash(hashInviteToken(token));
}

export async function fetchPublicInviteByToken(token) {
  if (!token) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase.rpc('get_invite_by_token', {
    p_token: token
  });

  if (error) {
    return { data: null, error };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error: null };
}

export async function fetchSelfReferences(userId) {
  return supabase
    .from('references')
    .select('id, referrer_name, relationship, summary, overall_rating, kpi_ratings, status, created_at, validation_status, role_id')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
}

export async function fetchCandidateReferences(candidateId) {
  return supabase
    .from('references')
    .select('id, owner_id, referrer_name, referrer_email, relationship, summary, overall_rating, kpi_ratings, status, created_at, validation_status, role_id')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });
}

export class ReferenceService {
  static async createReferenceRequest({ userId, email, name, applicantData, expiresInDays = 7 }) {
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(inviteToken);

    const inviteRow = {
      requester_id: userId,
      referee_email: email,
      referee_name: name,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      metadata: applicantData || null
    };

    const { data: invite, error } = await supabase
      .from('reference_invites')
      .insert([inviteRow])
      .select()
      .single();

    if (error) throw error;

    const verificationUrl = makeRefereeLink(inviteToken);

    logger.debug('Sending referee invitation email', {
      refereeEmail: maskEmailForLogs(email),
      requesterId: userId,
      inviteId: invite.id
    });

    await this.sendRefereeInviteEmail(email, name, applicantData, verificationUrl, expiresInDays);

    return { success: true, reference_id: invite.id, token: inviteToken, verification_url: verificationUrl };
  }

  static async submitReference({
    token,
    ratings,
    comments,
    clientIpHash = null,
    userAgent = null
  }) {
    const tokenHashPrefix = token ? hashInviteToken(token).slice(0, 12) : null;
    const overall = this.calculateOverallRating(ratings);
    const safeRatings = ratings || {};
    const safeComments = comments || {};

    await logReferenceSubmissionAudit({
      actionType: AuditActionTypes.SUBMIT_REFERENCE_ATTEMPT,
      tokenHashPrefix,
      clientIpHash,
      userAgent,
      outcome: 'attempted'
    });

    const { data, error } = await supabase.rpc('submit_reference_by_token', {
      p_token: token,
      p_summary: safeComments.recommendation || '',
      p_rating: overall,
      p_kpi_ratings: safeRatings,
      p_detailed_feedback: safeComments,
      p_ip_hash: clientIpHash,
      p_user_agent: userAgent
    });

    if (error) {
      await logReferenceSubmissionAudit({
        actionType: AuditActionTypes.SUBMIT_REFERENCE_FAILURE,
        tokenHashPrefix,
        clientIpHash,
        userAgent,
        outcome: 'failed',
        errorCode: 'rpc_error'
      });

      logger.error('submit_reference_by_token RPC failed', {
        tokenHashPrefix,
        error: error.message
      });
      const rpcError = new Error('Failed to submit reference');
      rpcError.status = 500;
      throw rpcError;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const referenceId = row?.reference_id;

    if (!referenceId) {
      await logReferenceSubmissionAudit({
        actionType: AuditActionTypes.SUBMIT_REFERENCE_FAILURE,
        tokenHashPrefix,
        clientIpHash,
        userAgent,
        outcome: 'failed',
        errorCode: 'invalid_or_expired_invite'
      });

      const genericError = new Error('Invalid or expired invite');
      genericError.status = 404;
      throw genericError;
    }

    const { data: reference, error: referenceError } = await fetchReferenceById(referenceId);
    if (referenceError || !reference) {
      await logReferenceSubmissionAudit({
        actionType: AuditActionTypes.SUBMIT_REFERENCE_FAILURE,
        referenceId,
        tokenHashPrefix,
        clientIpHash,
        userAgent,
        outcome: 'failed',
        errorCode: 'reference_followup_fetch_failed'
      });

      logger.warn('Reference created via RPC but could not be fetched for follow-up processing', {
        reference_id: referenceId,
        error: referenceError?.message
      });
      return { success: true, reference_id: referenceId };
    }

    await logReferenceSubmissionAudit({
      actionType: AuditActionTypes.SUBMIT_REFERENCE_SUCCESS,
      referenceId: reference.id,
      inviteId: reference.invite_id || null,
      tokenHashPrefix,
      clientIpHash,
      userAgent,
      outcome: 'succeeded',
      ownerId: reference.owner_id
    });

    // Issue #156: Create canonical Reference Pack + deterministic reference_hash
    // Non-blocking: must NOT break invite flow.
    try {
      const { reference_hash } = buildReferencePack(reference);

      const { error: hashErr } = await supabase
        .from('references')
        .update({ reference_hash })
        .eq('id', reference.id);

      if (hashErr) {
        logger.warn('Failed to store reference_hash (non-blocking)', {
          reference_id: reference.id,
          error: hashErr.message || String(hashErr)
        });
      }
    } catch (packErr) {
      logger.warn('buildReferencePack failed (non-blocking)', {
        reference_id: reference?.id,
        error: packErr.message || String(packErr)
      });
    }

    try {
      logger.info('Processing reference through RVL', { reference_id: reference.id });

      const { data: previousRefs } = await supabase
        .from('references')
        .select('summary, kpi_ratings, validated_data')
        .eq('owner_id', reference.owner_id)
        .neq('id', reference.id)
        .eq('status', 'active')
        .limit(10);

      const validatedData = await validateReferenceRVL(
        {
          summary: reference.summary,
          kpi_ratings: reference.kpi_ratings,
          detailed_feedback: reference.detailed_feedback,
          owner_id: reference.owner_id,
          referrer_email: reference.referrer_email
        },
        {
          previousReferences: previousRefs || [],
          skipEmbeddings: process.env.NODE_ENV === 'test'
        }
      );

      await supabase
        .from('references')
        .update({
          validated_data: validatedData,
          validation_status: validatedData.validation_status,
          fraud_score: validatedData.fraud_score,
          consistency_score: validatedData.consistency_score,
          validated_at: new Date().toISOString()
        })
        .eq('id', reference.id);

      logger.info('RVL processing completed', {
        reference_id: reference.id,
        validation_status: validatedData.validation_status,
        fraud_score: validatedData.fraud_score
      });
    } catch (rvlError) {
      logger.error('RVL processing failed, reference submitted without validation', {
        reference_id: reference.id,
        error: rvlError.message,
        stack: isProductionEnv ? undefined : rvlError.stack
      });

      await supabase
        .from('references')
        .update({
          validation_status: 'PENDING',
          validated_at: new Date().toISOString()
        })
        .eq('id', reference.id);
    }

    try {
      logger.info('Triggering HRScore recalculation after reference validation', {
        reference_id: reference.id,
        owner_id: reference.owner_id
      });

      await hrscoreAutoTrigger(reference.id);

      logger.debug('HRScore auto-trigger completed', {
        reference_id: reference.id
      });
    } catch (hrscoreError) {
      logger.warn('HRScore auto-trigger failed (non-blocking)', {
        reference_id: reference.id,
        owner_id: reference.owner_id,
        error: hrscoreError.message,
        stack: isProductionEnv ? undefined : hrscoreError.stack
      });
    }

    try {
      await logEvent({
        userId: reference.owner_id,
        eventType: EventTypes.REFERENCE_SUBMITTED,
        context: {
          referenceId: reference.id,
          overallRating: overall,
          referrerEmail: reference.referrer_email,
          hasDetailedFeedback: !!(safeComments.recommendation || safeComments.strengths || safeComments.improvements)
        }
      });
    } catch (analyticsError) {
      logger.warn('Reference analytics logging failed (non-blocking)', {
        reference_id: reference.id,
        error: analyticsError.message
      });
    }

    try {
      await this.sendReferenceCompletedEmail(reference.owner_id, reference);
    } catch (emailError) {
      logger.warn('Reference completion email failed (non-blocking)', {
        reference_id: reference.id,
        owner_id: reference.owner_id,
        error: emailError.message
      });
    }

    return { success: true, reference_id: reference.id };
  }

  static async getReferenceByToken(token) {
    const { data: invite, error } = await fetchPublicInviteByToken(token);

    if (error || !invite) {
      const err = new Error('Invalid or expired invite');
      err.status = 404;
      throw err;
    }

    return {
      success: true,
      invite: {
        referee_name: invite.referrer_name,
        referee_email: invite.referrer_email,
        expires_at: invite.expires_at
      }
    };
  }

  static calculateOverallRating(ratings) {
    const vals = Object.values(ratings || {});
    if (!vals.length) return 0;
    const sum = vals.reduce((a, b) => a + Number(b || 0), 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  static async sendRefereeInviteEmail(email, name, applicantData, verificationUrl, expiresInDays = 7) {
    if (!RESEND_API_KEY) {
      logger.warn('Email service not configured', {
        message: 'RESEND_API_KEY environment variable not set',
        action: 'skipping_email'
      });
      return;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'HRKey <noreply@hrkey.com>',
          to: email,
          subject: `Reference Request${applicantData?.applicantPosition ? ` - ${applicantData.applicantPosition}` : ''}`,
          html: `
            <div style="font-family:Rubik,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2 style="margin:0 0 8px">You've been asked to provide a professional reference</h2>
              <p>Hi ${name || ''},</p>
              <p>Someone has requested a reference from you${applicantData?.applicantCompany ? ` for their role at ${applicantData.applicantCompany}` : ''}.</p>
              <p><strong>Click here to complete the reference:</strong></p>
              <p>
                <a href="${verificationUrl}" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                  Complete Reference
                </a>
              </p>
              <p>This link will expire in ${expiresInDays} days.</p>
              <p style="font-size:12px;color:#64748b">If the button doesn't work, copy and paste this link:<br>${verificationUrl}</p>
              <p>Best regards,<br/>The HRKey Team</p>
            </div>
          `
        })
      });
      if (!res.ok) {
        const errorText = await res.text();
        logger.error('Failed to send referee invitation email', {
          service: 'resend',
          statusCode: res.status,
          error: errorText,
          recipientEmail: maskEmailForLogs(email)
        });
      }
    } catch (error) {
      logger.error('Failed to send referee invitation email', {
        service: 'resend',
        error: error.message,
        recipientEmail: maskEmailForLogs(email)
      });
    }
  }

  static async sendReferenceCompletedEmail(userId, reference) {
    if (!RESEND_API_KEY) return;
    const { data: userRes } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userRes?.user?.email || userRes?.email;
    if (!userEmail) return;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HRKey <noreply@hrkey.com>',
        to: userEmail,
        subject: 'Your reference has been completed!',
        html: `
          <div style="font-family:Rubik,Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 8px">Great news! Your reference is ready</h2>
            <p>${reference.referrer_name} has completed your professional reference.</p>
            <p><strong>Overall Rating:</strong> ${reference.overall_rating}/5 ⭐</p>
            <p>
              <a href="${getFrontendBaseURL()}/app.html" style="background:#00C4C7;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                View Reference
              </a>
            </p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to send reference completion email', {
        service: 'resend',
        statusCode: response.status,
        error: errorText,
        ownerId: userId,
        recipientEmail: maskEmailForLogs(userEmail),
        referenceId: reference?.id
      });

      throw new Error(`Failed to send reference completion email: ${response.status}`);
    }
  }
}
