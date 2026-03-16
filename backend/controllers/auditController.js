// ============================================================================
// Audit Controller
// ============================================================================
// Handles audit log queries and retrieval
// Provides endpoints for viewing audit trails
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import {
  getAllAuditLogs,
  getUserAuditLogs,
  getCompanyAuditLogs
} from '../utils/auditLogger.js';
import logger from '../logger.js';

let supabaseClient;

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  if (process.env.NODE_ENV === 'test') {
    return createClient(supabaseUrl, supabaseServiceKey);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }

  return supabaseClient;
}

function createFallbackLogger() {
  return {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {}
  };
}

function getReqLogger(req) {
  try {
    if (logger && typeof logger.withRequest === 'function') {
      const contextualLogger = logger.withRequest(req);
      if (
        contextualLogger &&
        typeof contextualLogger.error === 'function' &&
        typeof contextualLogger.warn === 'function'
      ) {
        return contextualLogger;
      }
    }

    if (
      logger &&
      typeof logger.error === 'function' &&
      typeof logger.warn === 'function'
    ) {
      return logger;
    }

    return createFallbackLogger();
  } catch {
    return createFallbackLogger();
  }
}

// ============================================================================
// GET AUDIT LOGS
// ============================================================================

/**
 * GET /api/audit/logs
 * Get audit logs with filtering
 *
 * Query params:
 *   - userId: Filter by user ID
 *   - companyId: Filter by company ID
 *   - actionType: Filter by action type
 *   - limit: Number of results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 *
 * Access:
 *   - Superadmins: Can view all logs with any filters
 *   - Users: Can only view their own logs (userId filter is enforced)
 *   - Company signers: Can view logs for their companies
 */
export async function getAuditLogs(req, res) {
  try {
    const client = getSupabaseClient();

    const {
      userId,
      companyId,
      actionType,
      limit = 50,
      offset = 0
    } = req.query;

    const parsedLimit = Math.min(Number.parseInt(limit, 10) || 50, 100);
    const parsedOffset = Number.parseInt(offset, 10) || 0;
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin) {
      if (userId && userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only view your own audit logs'
        });
      }

      if (companyId) {
        const signerResult = await client
          .from('company_signers')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', req.user.id)
          .eq('is_active', true)
          .single();

        const signer = signerResult?.data || null;
        const signerError = signerResult?.error || null;

        if (signerError || !signer) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'You must be a signer of this company to view its audit logs'
          });
        }

        const logs = await getCompanyAuditLogs(companyId, parsedLimit, parsedOffset);

        return res.json({
          success: true,
          logs: Array.isArray(logs) ? logs : [],
          total: Array.isArray(logs) ? logs.length : 0,
          limit: parsedLimit,
          offset: parsedOffset
        });
      }

      const effectiveUserId = userId || req.user.id;
      const logs = await getUserAuditLogs(effectiveUserId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    if (companyId && !userId) {
      const logs = await getCompanyAuditLogs(companyId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    if (userId && !companyId) {
      const logs = await getUserAuditLogs(userId, parsedLimit, parsedOffset);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        total: Array.isArray(logs) ? logs.length : 0,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }

    const filters = {};
    if (userId) filters.userId = userId;
    if (companyId) filters.companyId = companyId;
    if (actionType) filters.actionType = actionType;

    const result = await getAllAuditLogs(filters, parsedLimit, parsedOffset);

    return res.json({
      success: true,
      logs: Array.isArray(result?.logs) ? result.logs : [],
      total:
        typeof result?.total === 'number'
          ? result.total
          : Array.isArray(result?.logs)
            ? result.logs.length
            : 0,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get audit logs', {
      userId: req.user?.id,
      queryUserId: req.query?.userId,
      queryCompanyId: req.query?.companyId,
      error: error?.message,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An error occurred while fetching audit logs'
    });
  }
}

// ============================================================================
// GET RECENT ACTIVITY (for dashboards)
// ============================================================================

/**
 * GET /api/audit/recent
 * Get recent audit activity for current user's companies
 * Returns last 10 actions across all companies user is a signer of
 */
export async function getRecentActivity(req, res) {
  try {
    const client = getSupabaseClient();
    const userId = req.user.id;

    const signerResult = await client
      .from('company_signers')
      .select('company_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    const signerRecords = signerResult?.data || [];
    const signerError = signerResult?.error || null;

    if (signerError) {
      const reqLogger = getReqLogger(req);
      reqLogger.error('Failed to fetch signer records for recent activity', {
        userId: req.user?.id,
        error: signerError?.message,
        stack: signerError?.stack
      });

      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!Array.isArray(signerRecords) || signerRecords.length === 0) {
      return res.json({
        success: true,
        activity: []
      });
    }

    const companyIds = signerRecords
      .map((record) => record.company_id)
      .filter(Boolean);

    if (companyIds.length === 0) {
      return res.json({
        success: true,
        activity: []
      });
    }

    const logsResult = await client
      .from('audit_logs')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
      .limit(10);

    const logs = logsResult?.data || [];
    const logsError = logsResult?.error || null;

    if (logsError) {
      const reqLogger = getReqLogger(req);
      reqLogger.error('Failed to fetch recent activity', {
        userId: req.user?.id,
        companyIds,
        error: logsError?.message,
        stack: logsError?.stack
      });

      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    return res.json({
      success: true,
      activity: Array.isArray(logs) ? logs : []
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get recent activity', {
      userId: req.user?.id,
      error: error?.message,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  getAuditLogs,
  getRecentActivity
};
