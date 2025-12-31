import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { makeRefereeLink, getFrontendBaseURL } from '../utils/appUrl.js';
import { validateReference as validateReferenceRVL } from './validation/index.js';
import { logEvent, EventTypes } from './analytics/eventTracker.js';
import { onReferenceValidated as hrscoreAutoTrigger } from './hrscore/autoTrigger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
function useHashedReferenceTokens() {
  return process.env.USE_HASHED_REFERENCE_TOKENS === 'true';
}

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

async function findInviteByTokenValue(tokenValue) {
  return supabase
    .from('reference_invites')
    .select('*')
    .eq('invite_token', tokenValue)
    .maybeSingle();
}

export async function fetchInviteByToken(token) {
  if (!token) {
    return { data: null, error: null };
  }

  if (useHashedReferenceTokens()) {
    const hashedToken = hashInviteToken(token);
    const hashedResult = await findInviteByTokenValue(hashedToken);
    if (hashedResult.data) {
      return hashedResult;
    }
  }

  return findInviteByTokenValue(token);
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
    const storedToken = useHashedReferenceTokens() ? hashInviteToken(inviteToken) : inviteToken;
    // TODO: Default to hashed tokens once legacy raw tokens are fully migrated.

    const inviteRow = {
      requester_id: userId,
      referee_email: email,
      referee_name: name,
      invite_token: storedToken,
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
      refereeEmail: email,
      requesterId: userId,
      inviteId: invite.id
    });

    await this.sendRefereeInviteEmail(email, name, applicantData, verificationUrl, expiresInDays);

    return { success: true, reference_id: invite.id, token: inviteToken, verification_url: verificationUrl };
  }

  static async submitReference({ token, invite, refereeData, ratings, comments }) {
    let inviteRecord = invite;

    if (!inviteRecord) {
      const { data: inviteData, error: invErr } = await fetchInviteByToken(token);

      if (invErr || !inviteData) {
        const notFoundError = new Error('Invalid invitation token');
        notFoundError.status = 404;
        throw notFoundError;
      }

      inviteRecord = inviteData;
    }

    if (inviteRecord.status === 'completed') {
      const usedError = new Error('This reference has already been submitted');
      usedError.status = 422;
      throw usedError;
    }

    if (inviteRecord.expires_at && new Date(inviteRecord.expires_at) < new Date()) {
      const expiredError = new Error('This invitation has expired');
      expiredError.status = 422;
      throw expiredError;
    }

    const overall = this.calculateOverallRating(ratings);

    const refRow = {
      owner_id: inviteRecord.requester_id,
      referrer_name: inviteRecord.referee_name,
      referrer_email: inviteRecord.referee_email,
      relationship: inviteRecord.metadata?.relationship || 'colleague',
      role_id: inviteRecord.metadata?.role_id || null,
      summary: comments?.recommendation || '',
      overall_rating: overall,
      kpi_ratings: ratings,
      detailed_feedback: comments || {},
      status: 'active',
      created_at: new Date().toISOString(),
      invite_id: inviteRecord.id
    };

    const { data: reference, error: refErr } = await supabase
      .from('references')
      .insert([refRow])
      .select()
      .single();

    if (refErr) throw refErr;

    try {
      logger.info('Processing reference through RVL', { reference_id: reference.id });

      const { data: previousRefs } = await supabase
        .from('references')
        .select('summary, kpi_ratings, validated_data')
        .eq('owner_id', inviteRecord.requester_id)
        .neq('id', reference.id)
        .eq('status', 'active')
        .limit(10);

      const validatedData = await validateReferenceRVL({
        summary: refRow.summary,
        kpi_ratings: refRow.kpi_ratings,
        detailed_feedback: refRow.detailed_feedback,
        owner_id: refRow.owner_id,
        referrer_email: refRow.referrer_email
      }, {
        previousReferences: previousRefs || [],
        skipEmbeddings: process.env.NODE_ENV === 'test'
      });

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
        stack: rvlError.stack
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
        owner_id: inviteRecord.requester_id
      });

      await hrscoreAutoTrigger(reference.id);

      logger.debug('HRScore auto-trigger completed', {
        reference_id: reference.id
      });
    } catch (hrscoreError) {
      logger.warn('HRScore auto-trigger failed (non-blocking)', {
        reference_id: reference.id,
        owner_id: inviteRecord.requester_id,
        error: hrscoreError.message,
        stack: hrscoreError.stack
      });
    }

    await supabase
      .from('reference_invites')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', inviteRecord.id);

    await logEvent({
      userId: inviteRecord.requester_id,
      eventType: EventTypes.REFERENCE_SUBMITTED,
      context: {
        referenceId: reference.id,
        overallRating: overall,
        referrerEmail: inviteRecord.referee_email,
        hasDetailedFeedback: !!(comments?.recommendation || comments?.strengths || comments?.improvements)
      }
    });

    await this.sendReferenceCompletedEmail(inviteRecord.requester_id, reference);

    return { success: true, reference_id: reference.id };
  }

  static async getReferenceByToken(token) {
    const { data: invite, error } = await fetchInviteByToken(token);

    if (error || !invite) throw new Error('Invalid invitation token');

    if (invite.status === 'completed') {
      return { success: false, message: 'This reference has already been completed', status: 'completed' };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return { success: false, message: 'This invitation has expired', status: 'expired' };
    }

    return {
      success: true,
      invite: {
        referee_name: invite.referee_name,
        referee_email: invite.referee_email,
        applicant_data: invite.metadata,
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
          recipientEmail: email
        });
      }
    } catch (error) {
      logger.error('Failed to send referee invitation email', {
        service: 'resend',
        error: error.message,
        recipientEmail: email
      });
    }
  }

  static async sendReferenceCompletedEmail(userId, reference) {
    if (!RESEND_API_KEY) return;
    const { data: userRes } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userRes?.user?.email || userRes?.email;
    if (!userEmail) return;

    await fetch('https://api.resend.com/emails', {
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
  }
}
