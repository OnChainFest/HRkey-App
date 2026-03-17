// ============================================================================
// Access Decision Audit Service
// ============================================================================
// Structured observability layer for EPIC #227 access decisions.
// This service is intentionally side-effect-safe: logging failures never throw.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { AccessDecisionReasons } from './accessDecisionReasons.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabaseClient;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClient;
}

const ALLOWED_ACTIONS = new Set(['read', 'write', 'update', 'delete', 'share', 'export']);
const ALLOWED_RESULTS = new Set(['allowed', 'denied']);
const ALLOWED_REASON_CODES = new Set(Object.values(AccessDecisionReasons));

const SENSITIVE_METADATA_KEYS = new Set([
  'token',
  'rawtoken',
  'capabilitytoken',
  'tokenhash',
  'capabilitytokenhash',
  'hashedtoken',
  'authorization',
  'accesstoken',
  'jwt',
  'secret'
]);

function isSensitiveMetadataKey(key) {
  return typeof key === 'string' && SENSITIVE_METADATA_KEYS.has(key.toLowerCase());
}

function sanitizeMetadataDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataDeep(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitizedObject = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) {
      continue;
    }

    sanitizedObject[key] = sanitizeMetadataDeep(nestedValue);
  }

  return sanitizedObject;
}

function normalizeTokenPrefix(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (/\s/.test(normalized)) {
    return null;
  }

  return normalized.slice(0, 12);
}

function getRequestIp(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
}

function getRequestUserAgent(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  if (typeof req.get === 'function') {
    return req.get('user-agent') || null;
  }

  const userAgentHeader = req.headers?.['user-agent'];
  return typeof userAgentHeader === 'string' ? userAgentHeader : null;
}

function validateReason(reason) {
  if (!reason || !ALLOWED_REASON_CODES.has(reason)) {
    return AccessDecisionReasons.INTERNAL_ERROR;
  }

  return reason;
}

function validateAction(action) {
  if (!ALLOWED_ACTIONS.has(action)) {
    return 'read';
  }

  return action;
}

function validateResult(result) {
  if (!ALLOWED_RESULTS.has(result)) {
    return 'denied';
  }

  return result;
}

async function insertAuditEvent(payload) {
  try {
    const { error } = await getSupabaseClient()
      .from('audit_events')
      .insert([payload]);

    if (error) {
      logger.error('Failed to persist access decision audit event', {
        actorUserId: payload.actor_user_id,
        actorCompanyId: payload.actor_company_id,
        action: payload.action,
        targetType: payload.target_type,
        targetOwnerId: payload.target_owner_id,
        result: payload.result,
        reason: payload.reason,
        error: error.message
      });

      return null;
    }

    return { success: true };
  } catch (error) {
    logger.error('Access decision audit logging exception', {
      actorUserId: payload.actor_user_id,
      actorCompanyId: payload.actor_company_id,
      action: payload.action,
      targetType: payload.target_type,
      targetOwnerId: payload.target_owner_id,
      result: payload.result,
      reason: payload.reason,
      error: error.message,
      stack: error.stack
    });

    return null;
  }
}

export async function recordAccessDecision({
  actorUserId = null,
  actorCompanyId = null,
  action = 'read',
  targetType,
  targetId = null,
  targetOwnerId,
  purpose = null,
  result,
  reason,
  metadata = {},
  systemTriggered = false,
  req = null
}) {

  if (!targetType || !targetOwnerId) {
    logger.warn('Skipping access decision audit event due to missing required fields', {
      actorUserId,
      targetType,
      targetOwnerId,
      result,
      reason
    });

    return null;
  }

  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);

  const safeMetadata = sanitizeMetadataDeep(metadata);

  const requestedTimestamp = safeMetadata?.timestamp || null;

  if (safeMetadata && typeof safeMetadata === 'object' && Object.prototype.hasOwnProperty.call(safeMetadata, 'timestamp')) {
    delete safeMetadata.timestamp;
  }

  const normalizedTokenPrefix = normalizeTokenPrefix(safeMetadata?.tokenPrefix);

  if (safeMetadata && typeof safeMetadata === 'object') {
    if (normalizedTokenPrefix) {
      safeMetadata.tokenPrefix = normalizedTokenPrefix;
    } else {
      delete safeMetadata.tokenPrefix;
    }
  }

  if (systemTriggered && !actorUserId && safeMetadata && typeof safeMetadata === 'object') {
    if (!safeMetadata.eventOrigin) {
      safeMetadata.eventOrigin = 'system';
    }

    if (!safeMetadata.actorType) {
      safeMetadata.actorType = 'system';
    }
  }

  const auditEvent = {
    actor_user_id: actorUserId,
    actor_company_id: actorCompanyId,
    action: validateAction(action),
    target_type: targetType,
    target_id: targetId,
    target_owner_id: targetOwnerId,
    purpose,
    result: validateResult(result),
    reason: validateReason(reason),
    consent_id: safeMetadata?.consentId || null,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: safeMetadata,
    created_at: requestedTimestamp || new Date().toISOString()
  };

  return insertAuditEvent(auditEvent);
}

export async function recordCapabilityMint({
  actorUserId = null,
  actorCompanyId = null,
  action = 'share',
  targetType,
  targetId = null,
  targetOwnerId,
  requestedDataType = null,
  tokenId = null,
  tokenPrefix = null,
  consentId = null,
  requestId = null,
  metadata = {},
  systemTriggered = false,
  req = null
}) {

  return recordAccessDecision({
    actorUserId,
    actorCompanyId,
    action,
    targetType,
    targetId,
    targetOwnerId,
    result: 'allowed',
    reason: AccessDecisionReasons.ALLOW,
    metadata: {
      ...metadata,
      requestId,
      tokenId,
      tokenPrefix,
      consentId,
      requestedDataType,
      eventType: 'capability_mint'
    },
    systemTriggered,
    req
  });
}

export async function recordCapabilityRevocation({
  actorUserId = null,
  actorCompanyId = null,
  action = 'update',
  targetType,
  targetId = null,
  targetOwnerId,
  tokenId = null,
  tokenPrefix = null,
  consentId = null,
  requestId = null,
  reason = AccessDecisionReasons.TOKEN_REVOKED,
  metadata = {},
  systemTriggered = false,
  req = null
}) {

  return recordAccessDecision({
    actorUserId,
    actorCompanyId,
    action,
    targetType,
    targetId,
    targetOwnerId,
    result: 'denied',
    reason,
    metadata: {
      ...metadata,
      requestId,
      tokenId,
      tokenPrefix,
      consentId,
      eventType: 'capability_revocation'
    },
    systemTriggered,
    req
  });
}

export default {
  recordAccessDecision,
  recordCapabilityMint,
  recordCapabilityRevocation
};