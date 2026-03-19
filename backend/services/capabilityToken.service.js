import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { recordAccessDecision } from './accessDecisionAudit.service.js';
import { AccessDecisionReasons } from './accessDecisionReasons.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export const CapabilityResourceTypes = Object.freeze({
  CANDIDATE_REFERENCE_DATA: 'candidate_reference_data'
});

export const CapabilityActions = Object.freeze({
  READ_REFERENCES: 'read_references',
  READ_REFERENCE_PACK: 'read_reference_pack'
});

export const CapabilityGranteeTypes = Object.freeze({
  RECRUITER_USER: 'recruiter_user',
  LINK: 'link',
  EXTERNAL_REVIEWER: 'external_reviewer'
});

const ALLOWED_RESOURCE_TYPES = new Set(Object.values(CapabilityResourceTypes));
const ALLOWED_ACTIONS = new Set(Object.values(CapabilityActions));
const ALLOWED_GRANTEE_TYPES = new Set(Object.values(CapabilityGranteeTypes));

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

function normalizeAllowedActions(actions) {
  const normalized = Array.isArray(actions) && actions.length ? actions : [CapabilityActions.READ_REFERENCES, CapabilityActions.READ_REFERENCE_PACK];
  const unique = [...new Set(normalized.map((value) => String(value || '').trim()).filter(Boolean))];

  if (!unique.length || unique.some((action) => !ALLOWED_ACTIONS.has(action))) {
    const error = new Error('Unsupported capability action');
    error.status = 400;
    throw error;
  }

  return unique;
}

function normalizeResourceType(resourceType) {
  const normalized = String(resourceType || CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA).trim();
  if (!ALLOWED_RESOURCE_TYPES.has(normalized)) {
    const error = new Error('Unsupported capability resource type');
    error.status = 400;
    throw error;
  }
  return normalized;
}

function normalizeGranteeType(granteeType) {
  const normalized = String(granteeType || CapabilityGranteeTypes.LINK).trim();
  if (!ALLOWED_GRANTEE_TYPES.has(normalized)) {
    const error = new Error('Unsupported capability grantee type');
    error.status = 400;
    throw error;
  }
  return normalized;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function secureCompareHex(leftHex, rightHex) {
  if (!leftHex || !rightHex || leftHex.length !== rightHex.length) {
    return false;
  }

  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function base64urlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function parseCapabilityToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    const error = new Error('Capability token is required');
    error.status = 403;
    error.reason = AccessDecisionReasons.TOKEN_MISSING;
    throw error;
  }

  if (!normalized.startsWith('cap_')) {
    const error = new Error('Invalid capability token');
    error.status = 403;
    error.reason = AccessDecisionReasons.TOKEN_NOT_FOUND;
    throw error;
  }

  const body = normalized.slice(4);
  const [encodedPayload, secret] = body.split('.');

  if (!encodedPayload || !secret) {
    const error = new Error('Invalid capability token');
    error.status = 403;
    error.reason = AccessDecisionReasons.TOKEN_NOT_FOUND;
    throw error;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return { payload, secret, tokenPrefix: normalized.slice(0, 16) };
  } catch (_error) {
    const error = new Error('Invalid capability token');
    error.status = 403;
    error.reason = AccessDecisionReasons.TOKEN_NOT_FOUND;
    throw error;
  }
}

async function fetchGrantById(grantId) {
  const { data, error } = await supabase
    .from('capability_grants')
    .select('*')
    .eq('id', grantId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function persistGrantUpdate(id, fields) {
  const { data, error } = await supabase
    .from('capability_grants')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function buildCapabilityError(message, reason, status = 403) {
  const error = new Error(message);
  error.status = status;
  error.reason = reason;
  return error;
}

async function recordCapabilityDecision({ grant, req, result, reason, action, metadata = {} }) {
  await recordAccessDecision({
    actorUserId: req?.user?.id || null,
    action: action === CapabilityActions.READ_REFERENCE_PACK || action === CapabilityActions.READ_REFERENCES ? 'read' : 'read',
    targetType: grant?.resource_type || CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA,
    targetId: grant?.resource_id || metadata.targetId || null,
    targetOwnerId: grant?.candidate_user_id || metadata.targetOwnerId,
    result,
    reason,
    metadata: {
      ...metadata,
      capabilityGrantId: grant?.id || metadata.capabilityGrantId || null,
      capabilityTokenJti: grant?.token_jti || null,
      capabilityTokenPrefix: metadata.tokenPrefix || null,
      capabilityAction: action,
      eventType: `capability_${result}`
    },
    req
  });
}

export async function issueCapabilityGrant({
  candidateUserId,
  ownerUserId,
  resourceType = CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA,
  resourceId,
  granteeType = CapabilityGranteeTypes.LINK,
  granteeId = null,
  allowedActions = [CapabilityActions.READ_REFERENCES, CapabilityActions.READ_REFERENCE_PACK],
  expiresAt = null,
  metadata = null,
  req = null
}) {
  if (!candidateUserId || !ownerUserId) {
    const error = new Error('Candidate owner is required');
    error.status = 400;
    throw error;
  }

  if (candidateUserId !== ownerUserId) {
    const error = new Error('Only the candidate owner can issue capability grants');
    error.status = 403;
    throw error;
  }

  const normalizedResourceType = normalizeResourceType(resourceType);
  const normalizedAllowedActions = normalizeAllowedActions(allowedActions);
  const normalizedGranteeType = normalizeGranteeType(granteeType);
  const normalizedExpiresAt = toIso(expiresAt);

  if (normalizedExpiresAt && new Date(normalizedExpiresAt).getTime() <= now().getTime()) {
    const error = new Error('Expiration must be in the future');
    error.status = 400;
    throw error;
  }

  if (normalizedGranteeType !== CapabilityGranteeTypes.LINK && !granteeId) {
    const error = new Error('Recipient identifier is required for this grantee type');
    error.status = 400;
    throw error;
  }

  const issuedAt = now().toISOString();
  const tokenSecret = crypto.randomBytes(32).toString('base64url');
  const tokenJti = crypto.randomUUID();

  const insertPayload = {
    candidate_user_id: candidateUserId,
    owner_user_id: ownerUserId,
    resource_type: normalizedResourceType,
    resource_id: resourceId || candidateUserId,
    grantee_type: normalizedGranteeType,
    grantee_id: granteeId,
    allowed_actions: normalizedAllowedActions,
    status: 'active',
    expires_at: normalizedExpiresAt,
    revoked_at: null,
    revoked_by: null,
    token_hash: sha256(tokenSecret),
    token_hint: tokenSecret.slice(0, 8),
    token_jti: tokenJti,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    created_at: issuedAt,
    updated_at: issuedAt
  };

  const { data: grant, error } = await supabase
    .from('capability_grants')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) throw error;

  const tokenPayload = {
    v: 1,
    gid: grant.id,
    rid: insertPayload.resource_id,
    rt: insertPayload.resource_type,
    jti: tokenJti,
    exp: normalizedExpiresAt,
    act: normalizedAllowedActions
  };

  const capabilityToken = `cap_${base64urlJson(tokenPayload)}.${tokenSecret}`;

  await recordCapabilityDecision({
    grant,
    req,
    result: 'allowed',
    reason: AccessDecisionReasons.ALLOW,
    action: 'issue',
    metadata: {
      tokenPrefix: capabilityToken.slice(0, 16),
      issuedForGranteeType: normalizedGranteeType,
      issuedForGranteeId: granteeId
    }
  });

  return {
    grant,
    capabilityToken
  };
}

export async function revokeCapabilityGrant({ grantId, candidateUserId, revokedByUserId, req = null }) {
  if (!grantId || !candidateUserId || !revokedByUserId) {
    const error = new Error('Grant ID, candidate owner, and revoking user are required');
    error.status = 400;
    throw error;
  }

  if (candidateUserId !== revokedByUserId) {
    const error = new Error('Only the candidate owner can revoke capability grants');
    error.status = 403;
    throw error;
  }

  const grant = await fetchGrantById(grantId);
  if (!grant || grant.candidate_user_id !== candidateUserId) {
    const error = new Error('Capability grant not found');
    error.status = 404;
    throw error;
  }

  const revokedAt = now().toISOString();
  const updatedGrant = await persistGrantUpdate(grantId, {
    status: 'revoked',
    revoked_at: revokedAt,
    revoked_by: revokedByUserId,
    updated_at: revokedAt
  });

  await recordCapabilityDecision({
    grant: updatedGrant,
    req,
    result: 'denied',
    reason: AccessDecisionReasons.TOKEN_REVOKED,
    action: 'revoke',
    metadata: { tokenPrefix: updatedGrant.token_hint }
  });

  return updatedGrant;
}

export async function listCapabilityGrants({ candidateUserId }) {
  const { data, error } = await supabase
    .from('capability_grants')
    .select('*')
    .eq('candidate_user_id', candidateUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function normalizeExpiredGrant(grant) {
  if (!grant || grant.status !== 'active' || !grant.expires_at) {
    return grant;
  }

  if (new Date(grant.expires_at).getTime() > now().getTime()) {
    return grant;
  }

  try {
    return await persistGrantUpdate(grant.id, {
      status: 'expired',
      updated_at: now().toISOString()
    });
  } catch (error) {
    logger.warn('Failed to normalize expired capability grant', {
      grantId: grant.id,
      error: error.message
    });
    return { ...grant, status: 'expired' };
  }
}

export async function validateCapabilityToken({
  token,
  action,
  resourceType = CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA,
  resourceId,
  candidateUserId,
  req = null
}) {
  const normalizedAction = String(action || '').trim();
  const normalizedResourceType = normalizeResourceType(resourceType);
  const parsed = parseCapabilityToken(token);
  const grant = await normalizeExpiredGrant(await fetchGrantById(parsed.payload?.gid));

  if (!grant) {
    await recordCapabilityDecision({
      grant: {
        candidate_user_id: candidateUserId,
        resource_type: normalizedResourceType,
        resource_id: resourceId || candidateUserId
      },
      req,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_NOT_FOUND,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.TOKEN_NOT_FOUND);
  }

  if (!secureCompareHex(grant.token_hash, sha256(parsed.secret))) {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_NOT_FOUND,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.TOKEN_NOT_FOUND);
  }

  if (grant.status === 'revoked') {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_REVOKED,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.TOKEN_REVOKED);
  }

  if (grant.status === 'expired') {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.TOKEN_EXPIRED,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.TOKEN_EXPIRED);
  }

  if (grant.candidate_user_id !== candidateUserId || grant.resource_type !== normalizedResourceType || String(grant.resource_id) !== String(resourceId || candidateUserId)) {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.SCOPE_MISMATCH,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix, requestedResourceId: resourceId || candidateUserId }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.SCOPE_MISMATCH);
  }

  if (!Array.isArray(grant.allowed_actions) || !grant.allowed_actions.includes(normalizedAction)) {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.SCOPE_MISMATCH,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.SCOPE_MISMATCH);
  }

  if (grant.grantee_type === CapabilityGranteeTypes.RECRUITER_USER && req?.user?.id !== grant.grantee_id) {
    await recordCapabilityDecision({
      grant,
      req,
      result: 'denied',
      reason: AccessDecisionReasons.SCOPE_MISMATCH,
      action: normalizedAction,
      metadata: { tokenPrefix: parsed.tokenPrefix, expectedGranteeId: grant.grantee_id }
    });
    throw buildCapabilityError('Access denied', AccessDecisionReasons.SCOPE_MISMATCH);
  }

  await recordCapabilityDecision({
    grant,
    req,
    result: 'allowed',
    reason: AccessDecisionReasons.ALLOW,
    action: normalizedAction,
    metadata: { tokenPrefix: parsed.tokenPrefix }
  });

  return {
    grant,
    tokenPayload: parsed.payload,
    tokenPrefix: parsed.tokenPrefix
  };
}

export function extractCapabilityToken(req) {
  const explicitHeader = req.headers['x-capability-token'];
  if (typeof explicitHeader === 'string' && explicitHeader.trim()) {
    return explicitHeader.trim();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token.startsWith('cap_') ? token : null;
}

export async function listCapabilityAccessHistory({ candidateUserId, limit = 100 }) {
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, actor_user_id, actor_company_id, action, target_type, target_id, target_owner_id, result, reason, metadata, created_at')
    .eq('target_owner_id', candidateUserId)
    .in('target_type', [CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA, 'reference_pack'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
