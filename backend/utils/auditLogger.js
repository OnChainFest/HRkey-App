// ============================================================================
// Audit Logger Utility
// ============================================================================
// Centralized audit logging for all sensitive actions in the system
// Provides traceability and compliance for identity, company, and signer actions
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// AUDIT ACTION TYPES (Enum-like constants)
// ============================================================================

export const AuditActionTypes = {
  // Identity actions
  VERIFY_IDENTITY: 'verify_identity',
  UPDATE_IDENTITY: 'update_identity',

  // Company actions
  CREATE_COMPANY: 'create_company',
  UPDATE_COMPANY: 'update_company',
  VERIFY_COMPANY: 'verify_company',
  UNVERIFY_COMPANY: 'unverify_company',

  // Signer actions
  INVITE_SIGNER: 'invite_signer',
  ACCEPT_SIGNER_INVITE: 'accept_signer_invite',
  UPDATE_SIGNER: 'update_signer',
  DEACTIVATE_SIGNER: 'deactivate_signer',
  REACTIVATE_SIGNER: 'reactivate_signer',

  // Reference actions (for future integration)
  APPROVE_REFERENCE: 'approve_reference',
  REJECT_REFERENCE: 'reject_reference',
  VIEW_SENSITIVE_DATA: 'view_sensitive_data',

  // Data Access actions
  CREATE_DATA_ACCESS_REQUEST: 'create_data_access_request',
  APPROVE_DATA_ACCESS_REQUEST: 'approve_data_access_request',
  REJECT_DATA_ACCESS_REQUEST: 'reject_data_access_request',
  ACCESS_DATA: 'access_data',
  PROCESS_REVENUE_SHARE: 'process_revenue_share',
  REQUEST_PAYOUT: 'request_payout',

  // Admin actions
  ASSIGN_ROLE: 'assign_role',
  REVOKE_ROLE: 'revoke_role'
};

// ============================================================================
// RESOURCE TYPES (Enum-like constants)
// ============================================================================

export const ResourceTypes = {
  USER: 'user',
  COMPANY: 'company',
  SIGNER: 'signer',
  REFERENCE: 'reference',
  IDENTITY: 'identity',
  DATA_ACCESS_REQUEST: 'data_access_request',
  REVENUE_SHARE: 'revenue_share'
};

// ============================================================================
// MAIN AUDIT LOGGING FUNCTION
// ============================================================================

/**
 * Log an audit event
 *
 * @param {Object} params - Audit log parameters
 * @param {string} params.userId - ID of user performing action
 * @param {string} [params.companyId] - ID of related company (optional)
 * @param {string} [params.signerId] - ID of related signer (optional)
 * @param {string} params.actionType - Type of action (use AuditActionTypes constants)
 * @param {string} [params.resourceType] - Type of resource affected (use ResourceTypes constants)
 * @param {string} [params.resourceId] - ID of affected resource
 * @param {Object} [params.details] - Additional context (will be stored as JSONB)
 * @param {Object} [params.req] - Express request object (for IP and user agent)
 * @returns {Promise<Object>} - Created audit log entry
 */
export async function logAudit({
  userId,
  companyId = null,
  signerId = null,
  actionType,
  resourceType = null,
  resourceId = null,
  details = {},
  req = null
}) {
  try {
    // Validate required fields
    if (!actionType) {
      console.error('Audit log error: actionType is required');
      return null;
    }

    // Extract IP and user agent from request if provided
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress) : null;
    const userAgent = req ? req.get('user-agent') : null;

    // Prepare audit log entry
    const auditEntry = {
      user_id: userId,
      company_id: companyId,
      signer_id: signerId,
      action_type: actionType,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details,
      ip_address: ipAddress,
      user_agent: userAgent
    };

    // Insert into audit_logs table
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .insert(auditEntry)
      .select()
      .single();

    if (error) {
      console.error('Error inserting audit log:', error);
      // Don't throw - audit logging should not break main flow
      return null;
    }

    console.log(`✅ Audit logged: ${actionType} by user ${userId || 'system'}`);
    return data;
  } catch (error) {
    console.error('Audit logging exception:', error);
    // Swallow error - audit failure should not break application flow
    return null;
  }
}

// ============================================================================
// CONVENIENCE METHODS FOR COMMON ACTIONS
// ============================================================================

/**
 * Log identity verification
 */
export async function logIdentityVerification(userId, details = {}, req = null) {
  return logAudit({
    userId,
    actionType: AuditActionTypes.VERIFY_IDENTITY,
    resourceType: ResourceTypes.USER,
    resourceId: userId,
    details,
    req
  });
}

/**
 * Log company creation
 */
export async function logCompanyCreation(userId, companyId, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    actionType: AuditActionTypes.CREATE_COMPANY,
    resourceType: ResourceTypes.COMPANY,
    resourceId: companyId,
    details,
    req
  });
}

/**
 * Log company verification
 */
export async function logCompanyVerification(userId, companyId, verified, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    actionType: verified ? AuditActionTypes.VERIFY_COMPANY : AuditActionTypes.UNVERIFY_COMPANY,
    resourceType: ResourceTypes.COMPANY,
    resourceId: companyId,
    details,
    req
  });
}

/**
 * Log signer invitation
 */
export async function logSignerInvitation(userId, companyId, signerId, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    signerId,
    actionType: AuditActionTypes.INVITE_SIGNER,
    resourceType: ResourceTypes.SIGNER,
    resourceId: signerId,
    details,
    req
  });
}

/**
 * Log signer accepting invitation
 */
export async function logSignerAcceptance(userId, companyId, signerId, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    signerId,
    actionType: AuditActionTypes.ACCEPT_SIGNER_INVITE,
    resourceType: ResourceTypes.SIGNER,
    resourceId: signerId,
    details,
    req
  });
}

/**
 * Log signer status change
 */
export async function logSignerStatusChange(userId, companyId, signerId, isActive, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    signerId,
    actionType: isActive ? AuditActionTypes.REACTIVATE_SIGNER : AuditActionTypes.DEACTIVATE_SIGNER,
    resourceType: ResourceTypes.SIGNER,
    resourceId: signerId,
    details,
    req
  });
}

/**
 * Log data access actions (generic)
 */
export async function logDataAccessAction(userId, companyId, actionType, details = {}, req = null) {
  return logAudit({
    userId,
    companyId,
    actionType,
    resourceType: ResourceTypes.DATA_ACCESS_REQUEST,
    resourceId: details.requestId || null,
    details,
    req
  });
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(userId, limit = 50, offset = 0) {
  const { data, error } = await supabaseClient
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching user audit logs:', error);
    return [];
  }

  return data;
}

/**
 * Get audit logs for a company
 */
export async function getCompanyAuditLogs(companyId, limit = 50, offset = 0) {
  const { data, error } = await supabaseClient
    .from('audit_logs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching company audit logs:', error);
    return [];
  }

  return data;
}

/**
 * Get all audit logs (superadmin only)
 */
export async function getAllAuditLogs(filters = {}, limit = 50, offset = 0) {
  let query = supabaseClient
    .from('audit_logs')
    .select('*', { count: 'exact' });

  // Apply filters
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.companyId) query = query.eq('company_id', filters.companyId);
  if (filters.actionType) query = query.eq('action_type', filters.actionType);
  if (filters.resourceType) query = query.eq('resource_type', filters.resourceType);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching audit logs:', error);
    return { logs: [], total: 0 };
  }

  return { logs: data, total: count };
}

// ============================================================================
// MIDDLEWARE WRAPPER (Optional - for automatic logging)
// ============================================================================

/**
 * Express middleware to automatically log successful operations
 * Usage: app.post('/api/endpoint', auditMiddleware('action_type'), handler)
 */
export function auditMiddleware(actionType, options = {}) {
  return async (req, res, next) => {
    // Store original send to intercept successful responses
    const originalSend = res.send;

    res.send = function (data) {
      // Only log if response is successful (2xx status code)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logAudit({
          userId: req.user?.id,
          companyId: req.body?.companyId || req.params?.companyId,
          signerId: req.signer?.id,
          actionType,
          resourceType: options.resourceType,
          resourceId: options.getResourceId ? options.getResourceId(req, res) : null,
          details: options.getDetails ? options.getDetails(req, res) : {},
          req
        }).catch(err => console.error('Audit middleware error:', err));
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  logAudit,
  logIdentityVerification,
  logCompanyCreation,
  logCompanyVerification,
  logSignerInvitation,
  logSignerAcceptance,
  logSignerStatusChange,
  getUserAuditLogs,
  getCompanyAuditLogs,
  getAllAuditLogs,
  auditMiddleware,
  AuditActionTypes,
  ResourceTypes
};
