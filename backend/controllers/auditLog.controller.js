// ============================================================================
// Audit Log Controller
// ============================================================================
// Handles audit log retrieval with permission-aware access control.
// Supports:
// - Superadmin access to all logs
// - Regular user access to their own logs only
// - Company signer access to logs for companies they belong to
// - Recent activity feed scoped to signer companies
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import {
  getAllAuditLogs,
  getUserAuditLogs,
  getCompanyAuditLogs
} from '../utils/auditLogger.js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

function getReqLogger(req) {
  return typeof logger?.withRequest === 'function' ? logger.withRequest(req) : logger;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ============================================================================
// GET AUDIT LOGS
// ============================================================================

/**
 * GET /api/audit/logs
 *
 * Query params:
 * - userId?: string
 * - companyId?: string
 * - page?: number
 * - limit?: number
 *
 * Access rules:
 * - superadmin: can query all logs, any user logs, or any company logs
 * - regular user: can only query their own logs
 * - company signer: can query logs for companies they belong to
 */
export async function getAuditLogs(req, res) {
  try {
    const { userId, companyId } = req.query;
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 50);

    const requester = req.user;

    if (!requester) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const isSuperadmin = requester.role === 'superadmin';

    // -----------------------------------------------------------------------
    // Company-scoped logs
    // -----------------------------------------------------------------------
    if (companyId) {
      if (!isSuperadmin) {
        const { data: signer, error: signerError } = await supabaseClient
          .from('company_signers')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', requester.id)
          .single();

        if (signerError || !signer) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have access to this company audit log'
          });
        }
      }

      const logs = await getCompanyAuditLogs(companyId, page, limit);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        page,
        limit
      });
    }

    // -----------------------------------------------------------------------
    // User-scoped logs
    // -----------------------------------------------------------------------
    if (userId) {
      if (!isSuperadmin && userId !== requester.id) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only access your own audit logs'
        });
      }

      const logs = await getUserAuditLogs(userId, page, limit);

      return res.json({
        success: true,
        logs: Array.isArray(logs) ? logs : [],
        page,
        limit
      });
    }

    // -----------------------------------------------------------------------
    // Default behavior
    // -----------------------------------------------------------------------
    if (isSuperadmin) {
      const result = await getAllAuditLogs(page, limit);

      return res.json({
        success: true,
        logs: Array.isArray(result?.logs) ? result.logs : [],
        total: Number.isFinite(result?.total) ? result.total : 0,
        page,
        limit
      });
    }

    const ownLogs = await getUserAuditLogs(requester.id, page, limit);

    return res.json({
      success: true,
      logs: Array.isArray(ownLogs) ? ownLogs : [],
      page,
      limit
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get audit logs', {
      userId: req.user?.id,
      query: req.query,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET RECENT ACTIVITY
// ============================================================================

/**
 * GET /api/audit/recent
 *
 * Recent activity rules:
 * - superadmin: can see recent activity globally
 * - regular user: sees recent activity only for companies they belong to
 * - if user belongs to no companies: returns empty activity list
 */
export async function getRecentAuditActivity(req, res) {
  try {
    const requester = req.user;
    const limit = toPositiveInt(req.query.limit, 20);

    if (!requester) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Superadmin sees global recent activity
    if (requester.role === 'superadmin') {
      const { data, error } = await supabaseClient
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return res.status(500).json({
          error: 'Database error'
        });
      }

      return res.json({
        success: true,
        activity: Array.isArray(data) ? data : []
      });
    }

    // Regular user: fetch companies where user is an active signer
    const { data: signerRows, error: signerError } = await supabaseClient
      .from('company_signers')
      .select('company_id')
      .eq('user_id', requester.id)
      .eq('is_active', true);

    if (signerError) {
      return res.status(500).json({
        error: 'Database error'
      });
    }

    const companyIds = Array.isArray(signerRows)
      ? signerRows.map((row) => row.company_id).filter(Boolean)
      : [];

    if (companyIds.length === 0) {
      return res.json({
        success: true,
        activity: []
      });
    }

    const { data: activity, error: activityError } = await supabaseClient
      .from('audit_logs')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activityError) {
      return res.status(500).json({
        error: 'Database error'
      });
    }

    return res.json({
      success: true,
      activity: Array.isArray(activity) ? activity : []
    });
  } catch (error) {
    const reqLogger = getReqLogger(req);
    reqLogger.error('Failed to get recent audit activity', {
      userId: req.user?.id,
      query: req.query,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

export default {
  getAuditLogs,
  getRecentAuditActivity
};