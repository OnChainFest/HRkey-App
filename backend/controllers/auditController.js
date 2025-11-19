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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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
    const {
      userId,
      companyId,
      actionType,
      limit = 50,
      offset = 0
    } = req.query;

    // Parse and validate limit/offset
    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    // Authorization checks
    const isSuperadmin = req.user.role === 'superadmin';

    // If not superadmin, enforce restrictions
    if (!isSuperadmin) {
      // Users can only view their own logs or their companies' logs
      if (userId && userId !== req.user.id) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own audit logs'
        });
      }

      // If filtering by company, verify user is a signer
      if (companyId) {
        const { data: signer } = await supabaseClient
          .from('company_signers')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', req.user.id)
          .eq('is_active', true)
          .single();

        if (!signer) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You must be a signer of this company to view its audit logs'
          });
        }
      } else {
        // If no company filter, enforce user filter
        // Non-superadmins can only see their own logs
        if (!userId) {
          // Default to current user's logs
          const filters = {
            userId: req.user.id,
            actionType
          };
          const result = await getUserAuditLogs(req.user.id, parsedLimit, parsedOffset);
          return res.json({
            success: true,
            logs: result,
            total: result.length,
            limit: parsedLimit,
            offset: parsedOffset
          });
        }
      }
    }

    // Build filters object
    const filters = {};
    if (userId) filters.userId = userId;
    if (companyId) filters.companyId = companyId;
    if (actionType) filters.actionType = actionType;

    // Fetch logs based on filters
    let result;
    if (companyId && !userId) {
      // Company-specific logs
      result = await getCompanyAuditLogs(companyId, parsedLimit, parsedOffset);
      return res.json({
        success: true,
        logs: result,
        total: result.length,
        limit: parsedLimit,
        offset: parsedOffset
      });
    } else if (userId && !companyId) {
      // User-specific logs
      result = await getUserAuditLogs(userId, parsedLimit, parsedOffset);
      return res.json({
        success: true,
        logs: result,
        total: result.length,
        limit: parsedLimit,
        offset: parsedOffset
      });
    } else {
      // General query (superadmin only)
      if (!isSuperadmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Superadmin access required for unfiltered queries'
        });
      }
      result = await getAllAuditLogs(filters, parsedLimit, parsedOffset);
      return res.json({
        success: true,
        logs: result.logs,
        total: result.total,
        limit: parsedLimit,
        offset: parsedOffset
      });
    }
  } catch (error) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({
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
    const userId = req.user.id;

    // Get all companies where user is a signer
    const { data: signerRecords } = await supabaseClient
      .from('company_signers')
      .select('company_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!signerRecords || signerRecords.length === 0) {
      return res.json({
        success: true,
        activity: []
      });
    }

    const companyIds = signerRecords.map(s => s.company_id);

    // Get recent audit logs for these companies
    const { data: logs, error } = await supabaseClient
      .from('audit_logs')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching recent activity:', error);
      return res.status(500).json({
        error: 'Database error'
      });
    }

    return res.json({
      success: true,
      activity: logs
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    return res.status(500).json({
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
