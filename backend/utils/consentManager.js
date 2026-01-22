// ============================================================================
// Consent Manager - P0 Security Enhancement
// ============================================================================
// Centralized consent management service
// Handles consent creation, validation, revocation, and audit logging
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabaseClient;

const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClient;
};

// ============================================================================
// CONSENT VALIDATION
// ============================================================================

/**
 * Check if active consent exists for data access
 *
 * @param {Object} params
 * @param {string} params.subjectUserId - User whose data is being accessed
 * @param {string} params.grantedToOrg - Company requesting access (optional)
 * @param {string} params.grantedToUser - User requesting access (optional)
 * @param {string} params.resourceType - Type of resource (references, kpi_observations, etc.)
 * @param {string} params.resourceId - Specific resource ID (optional)
 * @returns {Promise<Object>} { hasConsent: boolean, consent: Object|null, reason: string }
 */
export async function checkConsent({
  subjectUserId,
  grantedToOrg = null,
  grantedToUser = null,
  resourceType,
  resourceId = null
}) {
  try {
    // Validate inputs
    if (!subjectUserId || !resourceType) {
      return {
        hasConsent: false,
        consent: null,
        reason: 'missing_required_params'
      };
    }

    if (!grantedToOrg && !grantedToUser) {
      return {
        hasConsent: false,
        consent: null,
        reason: 'no_grantee_specified'
      };
    }

    // Build query
    let query = getSupabaseClient()
      .from('consents')
      .select('*')
      .eq('subject_user_id', subjectUserId)
      .eq('resource_type', resourceType)
      .eq('status', 'active');

    // Add grantee filter
    if (grantedToOrg) {
      query = query.eq('granted_to_org', grantedToOrg).is('granted_to_user', null);
    } else {
      query = query.eq('granted_to_user', grantedToUser).is('granted_to_org', null);
    }

    // Add resource ID filter if specified
    if (resourceId) {
      query = query.or(`resource_id.eq.${resourceId},resource_id.is.null`);
    } else {
      query = query.is('resource_id', null);
    }

    const { data: consents, error } = await query;

    if (error) {
      logger.error('Failed to check consent', {
        subjectUserId,
        grantedToOrg,
        grantedToUser,
        resourceType,
        resourceId,
        error: error.message
      });
      throw error;
    }

    // No consents found
    if (!consents || consents.length === 0) {
      return {
        hasConsent: false,
        consent: null,
        reason: 'no_consent'
      };
    }

    // Check expiration for all consents
    const now = new Date();
    const activeConsents = consents.filter((consent) => {
      if (consent.expires_at) {
        return new Date(consent.expires_at) > now;
      }
      return true;
    });

    if (activeConsents.length === 0) {
      return {
        hasConsent: false,
        consent: null,
        reason: 'consent_expired'
      };
    }

    // Return the first active consent
    return {
      hasConsent: true,
      consent: activeConsents[0],
      reason: 'valid_consent'
    };
  } catch (error) {
    logger.error('Error checking consent', {
      subjectUserId,
      grantedToOrg,
      grantedToUser,
      resourceType,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ============================================================================
// CONSENT CREATION
// ============================================================================

/**
 * Create a new consent
 *
 * @param {Object} params
 * @param {string} params.subjectUserId - User granting consent
 * @param {string} params.grantedToOrg - Company receiving access (optional)
 * @param {string} params.grantedToUser - User receiving access (optional)
 * @param {string} params.resourceType - Type of resource
 * @param {string} params.resourceId - Specific resource ID (optional)
 * @param {string[]} params.scope - Array of permitted actions (default: ['read'])
 * @param {string} params.purpose - Purpose of access
 * @param {Date} params.expiresAt - Expiration date (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Created consent
 */
export async function createConsent({
  subjectUserId,
  grantedToOrg = null,
  grantedToUser = null,
  resourceType,
  resourceId = null,
  scope = ['read'],
  purpose,
  expiresAt = null,
  metadata = {}
}) {
  try {
    // Validate inputs
    if (!subjectUserId || !purpose || !resourceType) {
      throw new Error('Missing required fields: subjectUserId, purpose, resourceType');
    }

    if (!grantedToOrg && !grantedToUser) {
      throw new Error('Must specify either grantedToOrg or grantedToUser');
    }

    if (grantedToOrg && grantedToUser) {
      throw new Error('Cannot specify both grantedToOrg and grantedToUser');
    }

    const consentData = {
      subject_user_id: subjectUserId,
      granted_to_org: grantedToOrg,
      granted_to_user: grantedToUser,
      resource_type: resourceType,
      resource_id: resourceId,
      scope,
      purpose,
      status: 'active',
      granted_at: new Date().toISOString(),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      metadata
    };

    const { data: consent, error } = await getSupabaseClient()
      .from('consents')
      .insert([consentData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create consent', {
        subjectUserId,
        grantedToOrg,
        grantedToUser,
        resourceType,
        purpose,
        error: error.message
      });
      throw error;
    }

    logger.info('Consent created', {
      consentId: consent.id,
      subjectUserId,
      grantedToOrg,
      grantedToUser,
      resourceType,
      purpose
    });

    return consent;
  } catch (error) {
    logger.error('Error creating consent', {
      subjectUserId,
      grantedToOrg,
      grantedToUser,
      resourceType,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ============================================================================
// CONSENT REVOCATION
// ============================================================================

/**
 * Revoke a consent
 *
 * @param {string} consentId - ID of the consent to revoke
 * @param {string} revokedBy - ID of the user revoking (subject or admin)
 * @returns {Promise<Object>} Updated consent
 */
export async function revokeConsent(consentId, revokedBy) {
  try {
    if (!consentId || !revokedBy) {
      throw new Error('Missing required fields: consentId, revokedBy');
    }

    const { data: consent, error } = await getSupabaseClient()
      .from('consents')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', consentId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to revoke consent', {
        consentId,
        revokedBy,
        error: error.message
      });
      throw error;
    }

    logger.info('Consent revoked', {
      consentId,
      revokedBy,
      subjectUserId: consent.subject_user_id
    });

    return consent;
  } catch (error) {
    logger.error('Error revoking consent', {
      consentId,
      revokedBy,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ============================================================================
// AUDIT EVENT LOGGING
// ============================================================================

/**
 * Log an audit event for data access attempt
 *
 * @param {Object} params
 * @param {string} params.actorUserId - User attempting access
 * @param {string} params.actorCompanyId - Company on whose behalf (optional)
 * @param {string} params.action - Action attempted (read, write, etc.)
 * @param {string} params.targetType - Type of resource
 * @param {string} params.targetId - Specific resource ID (optional)
 * @param {string} params.targetOwnerId - Owner of the data
 * @param {string} params.purpose - Purpose of access (optional)
 * @param {string} params.result - 'allowed' or 'denied'
 * @param {string} params.reason - Why allowed/denied
 * @param {string} params.consentId - Related consent ID (optional)
 * @param {string} params.ipAddress - IP address (optional)
 * @param {string} params.userAgent - User agent (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Created audit event
 */
export async function logAuditEvent({
  actorUserId,
  actorCompanyId = null,
  action,
  targetType,
  targetId = null,
  targetOwnerId,
  purpose = null,
  result,
  reason,
  consentId = null,
  ipAddress = null,
  userAgent = null,
  metadata = {}
}) {
  try {
    // Validate inputs
    if (!actorUserId || !action || !targetType || !targetOwnerId || !result || !reason) {
      throw new Error(
        'Missing required fields: actorUserId, action, targetType, targetOwnerId, result, reason'
      );
    }

    const auditData = {
      actor_user_id: actorUserId,
      actor_company_id: actorCompanyId,
      action,
      target_type: targetType,
      target_id: targetId,
      target_owner_id: targetOwnerId,
      purpose,
      result,
      reason,
      consent_id: consentId,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata,
      created_at: new Date().toISOString()
    };

    const { data: auditEvent, error } = await getSupabaseClient()
      .from('audit_events')
      .insert([auditData])
      .select()
      .single();

    if (error) {
      // Log error but don't fail the request
      logger.error('Failed to log audit event', {
        actorUserId,
        action,
        targetType,
        result,
        error: error.message
      });
      return null;
    }

    // Only log to console if denied (for monitoring)
    if (result === 'denied') {
      logger.warn('Data access denied', {
        auditEventId: auditEvent.id,
        actorUserId,
        actorCompanyId,
        targetType,
        targetId,
        targetOwnerId,
        reason
      });
    }

    return auditEvent;
  } catch (error) {
    logger.error('Error logging audit event', {
      actorUserId,
      action,
      targetType,
      result,
      error: error.message,
      stack: error.stack
    });
    // Don't throw - audit logging should not block requests
    return null;
  }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

export default {
  checkConsent,
  createConsent,
  revokeConsent,
  logAuditEvent
};
