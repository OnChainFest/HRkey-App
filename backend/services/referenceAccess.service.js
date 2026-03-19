import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { recordAccessDecision } from './accessDecisionAudit.service.js';
import { AccessDecisionReasons } from './accessDecisionReasons.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function now() {
  return new Date();
}

function toIso(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('Invalid expiration timestamp');
    error.status = 400;
    throw error;
  }
  return parsed.toISOString();
}

function isExpired(grant, currentTime = now()) {
  if (!grant?.expires_at) return false;
  return new Date(grant.expires_at).getTime() < currentTime.getTime();
}

async function fetchUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to fetch user for reference access', { userId, error: error.message });
    return null;
  }

  return data || null;
}

async function isActiveRecruiter(userId) {
  const { data, error } = await supabase
    .from('company_signers')
    .select('id, company_id, user_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to validate recruiter signer status', { recruiterUserId: userId, error: error.message });
    return { isRecruiter: false, signer: null };
  }

  return { isRecruiter: Boolean(data), signer: data || null };
}

async function fetchGrantRecord(candidateUserId, recruiterUserId) {
  const { data, error } = await supabase
    .from('reference_pack_access_grants')
    .select('*')
    .eq('candidate_user_id', candidateUserId)
    .eq('recruiter_user_id', recruiterUserId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function persistGrantUpdate(id, fields) {
  const { data, error } = await supabase
    .from('reference_pack_access_grants')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function buildStatus(grant, currentTime = now()) {
  if (!grant) {
    return { exists: false, status: 'none', isActive: false, grant: null };
  }

  if (grant.status === 'revoked') {
    return { exists: true, status: 'revoked', isActive: false, grant };
  }

  if (isExpired(grant, currentTime) || grant.status === 'expired') {
    return { exists: true, status: 'expired', isActive: false, grant: { ...grant, status: 'expired' } };
  }

  if (grant.status === 'active') {
    return { exists: true, status: 'active', isActive: true, grant };
  }

  return { exists: true, status: grant.status || 'none', isActive: false, grant };
}

async function normalizeExpiredGrant(grant) {
  if (!grant || grant.status !== 'active' || !isExpired(grant)) {
    return grant;
  }

  try {
    return await persistGrantUpdate(grant.id, {
      status: 'expired',
      updated_at: now().toISOString()
    });
  } catch (error) {
    logger.warn('Failed to normalize expired reference access grant', {
      grantId: grant.id,
      error: error.message
    });
    return { ...grant, status: 'expired' };
  }
}

export async function getReferenceAccessStatus({ candidateUserId, recruiterUserId }) {
  if (!candidateUserId || !recruiterUserId) {
    const error = new Error('Candidate and recruiter are required');
    error.status = 400;
    throw error;
  }

  const grant = await fetchGrantRecord(candidateUserId, recruiterUserId);
  const normalizedGrant = await normalizeExpiredGrant(grant);
  return buildStatus(normalizedGrant);
}

export async function listReferenceAccessGrants({ candidateUserId }) {
  const { data, error } = await supabase
    .from('reference_pack_access_grants')
    .select('id, candidate_user_id, recruiter_user_id, status, granted_at, expires_at, revoked_at, granted_by, metadata, created_at, updated_at')
    .eq('candidate_user_id', candidateUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return Promise.all((data || []).map(async (grant) => normalizeExpiredGrant(grant)));
}

export async function grantReferenceAccess({
  candidateUserId,
  recruiterUserId,
  grantedByUserId,
  expiresAt = null,
  metadata = null,
  req = null
}) {
  if (!candidateUserId || !recruiterUserId || !grantedByUserId) {
    const error = new Error('Candidate, recruiter, and granting user are required');
    error.status = 400;
    throw error;
  }

  if (candidateUserId !== grantedByUserId) {
    const error = new Error('Only the candidate owner can grant reference access');
    error.status = 403;
    throw error;
  }

  if (candidateUserId === recruiterUserId) {
    const error = new Error('Candidate cannot create a recruiter grant for themselves');
    error.status = 400;
    throw error;
  }

  const candidate = await fetchUser(candidateUserId);
  if (!candidate) {
    const error = new Error('Candidate not found');
    error.status = 404;
    throw error;
  }

  const recruiter = await fetchUser(recruiterUserId);
  if (!recruiter) {
    const error = new Error('Recruiter not found');
    error.status = 400;
    throw error;
  }

  const recruiterStatus = await isActiveRecruiter(recruiterUserId);
  if (!recruiterStatus.isRecruiter) {
    const error = new Error('Recruiter must be an active company signer');
    error.status = 400;
    throw error;
  }

  const normalizedExpiresAt = toIso(expiresAt);
  if (normalizedExpiresAt && new Date(normalizedExpiresAt).getTime() <= now().getTime()) {
    const error = new Error('Expiration must be in the future');
    error.status = 400;
    throw error;
  }

  // MVP design: one mutable current-grant row per candidate/recruiter pair.
  // Lifecycle transitions update the same row instead of writing historical grant rows.
  const existingGrant = await fetchGrantRecord(candidateUserId, recruiterUserId);
  const activeMetadata = metadata && typeof metadata === 'object' ? metadata : null;
  const grantedAt = now().toISOString();

  let storedGrant;
  if (existingGrant) {
    storedGrant = await persistGrantUpdate(existingGrant.id, {
      status: 'active',
      granted_at: grantedAt,
      expires_at: normalizedExpiresAt,
      revoked_at: null,
      granted_by: grantedByUserId,
      metadata: activeMetadata,
      updated_at: grantedAt
    });
  } else {
    const { data, error } = await supabase
      .from('reference_pack_access_grants')
      .insert([{ 
        candidate_user_id: candidateUserId,
        recruiter_user_id: recruiterUserId,
        status: 'active',
        granted_at: grantedAt,
        expires_at: normalizedExpiresAt,
        revoked_at: null,
        granted_by: grantedByUserId,
        metadata: activeMetadata,
        created_at: grantedAt,
        updated_at: grantedAt
      }])
      .select('*')
      .single();

    if (error) throw error;
    storedGrant = data;
  }

  await recordAccessDecision({
    actorUserId: grantedByUserId,
    actorCompanyId: recruiterStatus.signer?.company_id || null,
    action: 'share',
    targetType: 'reference_pack',
    targetId: storedGrant.id,
    targetOwnerId: candidateUserId,
    result: 'allowed',
    reason: AccessDecisionReasons.ALLOW,
    metadata: {
      recruiterUserId,
      expiresAt: normalizedExpiresAt,
      eventType: 'reference_access_granted'
    },
    req
  });

  return storedGrant;
}

export async function revokeReferenceAccess({
  candidateUserId,
  recruiterUserId,
  revokedByUserId,
  req = null
}) {
  if (!candidateUserId || !recruiterUserId || !revokedByUserId) {
    const error = new Error('Candidate, recruiter, and revoking user are required');
    error.status = 400;
    throw error;
  }

  if (candidateUserId !== revokedByUserId) {
    const error = new Error('Only the candidate owner can revoke reference access');
    error.status = 403;
    throw error;
  }

  const grant = await fetchGrantRecord(candidateUserId, recruiterUserId);
  if (!grant) {
    const error = new Error('Reference access grant not found');
    error.status = 404;
    throw error;
  }

  const revokedAt = now().toISOString();
  const updatedGrant = await persistGrantUpdate(grant.id, {
    status: 'revoked',
    revoked_at: revokedAt,
    updated_at: revokedAt
  });

  await recordAccessDecision({
    actorUserId: revokedByUserId,
    action: 'update',
    targetType: 'reference_pack',
    targetId: updatedGrant.id,
    targetOwnerId: candidateUserId,
    result: 'denied',
    reason: AccessDecisionReasons.TOKEN_REVOKED,
    metadata: {
      recruiterUserId,
      eventType: 'reference_access_revoked'
    },
    req
  });

  return updatedGrant;
}

export async function assertRecruiterCanAccessReferencePack({
  candidateUserId,
  recruiterUserId,
  req = null,
  targetId = null
}) {
  const recruiterStatus = await isActiveRecruiter(recruiterUserId);

  if (!recruiterStatus.isRecruiter) {
    await recordAccessDecision({
      actorUserId: recruiterUserId,
      action: 'read',
      targetType: 'reference_pack',
      targetId,
      targetOwnerId: candidateUserId,
      result: 'denied',
      reason: AccessDecisionReasons.SIGNER_NOT_ACTIVE,
      metadata: { eventType: 'reference_access_denied' },
      req
    });

    const error = new Error('Explicit reference access is required');
    error.status = 403;
    throw error;
  }

  const status = await getReferenceAccessStatus({ candidateUserId, recruiterUserId });

  if (status.status === 'expired') {
    await recordAccessDecision({
      actorUserId: recruiterUserId,
      actorCompanyId: recruiterStatus.signer?.company_id || null,
      action: 'read',
      targetType: 'reference_pack',
      targetId,
      targetOwnerId: candidateUserId,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_EXPIRED,
      metadata: { eventType: 'reference_access_denied', recruiterUserId },
      req
    });

    const error = new Error('Reference access grant has expired');
    error.status = 403;
    throw error;
  }

  if (status.status === 'revoked') {
    await recordAccessDecision({
      actorUserId: recruiterUserId,
      actorCompanyId: recruiterStatus.signer?.company_id || null,
      action: 'read',
      targetType: 'reference_pack',
      targetId,
      targetOwnerId: candidateUserId,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_REVOKED,
      metadata: { eventType: 'reference_access_denied', recruiterUserId },
      req
    });

    const error = new Error('Reference access grant has been revoked');
    error.status = 403;
    throw error;
  }

  if (!status.isActive) {
    await recordAccessDecision({
      actorUserId: recruiterUserId,
      actorCompanyId: recruiterStatus.signer?.company_id || null,
      action: 'read',
      targetType: 'reference_pack',
      targetId,
      targetOwnerId: candidateUserId,
      result: 'denied',
      reason: AccessDecisionReasons.CONSENT_NOT_ACTIVE,
      metadata: { eventType: 'reference_access_denied', recruiterUserId },
      req
    });

    const error = new Error('Explicit reference access is required');
    error.status = 403;
    throw error;
  }

  await recordAccessDecision({
    actorUserId: recruiterUserId,
    actorCompanyId: recruiterStatus.signer?.company_id || null,
    action: 'read',
    targetType: 'reference_pack',
    targetId: targetId || status.grant?.id || null,
    targetOwnerId: candidateUserId,
    result: 'allowed',
    reason: AccessDecisionReasons.ALLOW,
    metadata: {
      recruiterUserId,
      referenceAccessGrantId: status.grant?.id || null,
      expiresAt: status.grant?.expires_at || null,
      eventType: 'reference_access_allowed'
    },
    req
  });

  return status.grant;
}

export default {
  grantReferenceAccess,
  revokeReferenceAccess,
  getReferenceAccessStatus,
  listReferenceAccessGrants,
  assertRecruiterCanAccessReferencePack
};
