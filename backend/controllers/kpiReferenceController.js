/**
 * KPI REFERENCE CONTROLLER
 *
 * Purpose: HTTP request handlers for KPI-driven reference system
 *
 * Endpoints:
 * - GET    /api/kpis/sets                        - Get active KPI set by role + seniority
 * - POST   /api/references/request               - Create reference request
 * - GET    /api/references/request/:token        - Get request by token (for referee)
 * - POST   /api/references/submit/:token         - Submit reference
 * - GET    /api/references/candidate/:candidate_id - Get candidate reference pack
 *
 * @module controllers/kpiReferenceController
 */

import logger from '../logger.js';
import { getActiveKpiSet, listAvailableRoles } from '../services/kpiReference/kpiSets.service.js';
import {
  createReferenceRequest,
  getReferenceRequestByToken,
  getPendingRequestsForCandidate
} from '../services/kpiReference/referenceRequest.service.js';
import { submitReference } from '../services/kpiReference/referenceSubmit.service.js';
import {
  getCandidateReferencePack,
  getCandidateKpiAggregatesFast,
  getCandidateReferenceStats,
  getReferenceById
} from '../services/kpiReference/referencePack.service.js';

/**
 * GET /api/kpis/sets
 * Get active KPI set for a given role and seniority level
 *
 * Query params:
 * - role: string (required)
 * - level: string (required) - 'junior', 'mid', 'senior', 'lead', 'principal'
 *
 * Response:
 * {
 *   success: true,
 *   kpiSet: { id, role, seniority_level, version, description, created_at },
 *   kpis: [{ id, key, name, description, category, required, weight, min_evidence_length }]
 * }
 */
export async function getKpiSets(req, res) {
  try {
    const { role, level } = req.query;

    logger.debug('GET /api/kpis/sets', { role, level });

    const result = await getActiveKpiSet(role, level);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      kpiSet: result.kpiSet,
      kpis: result.kpis
    });

  } catch (error) {
    logger.error('Error in getKpiSets', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/kpis/roles
 * List all available roles
 *
 * Response:
 * {
 *   success: true,
 *   roles: ['backend_engineer', 'frontend_engineer', ...]
 * }
 */
export async function getAvailableRoles(req, res) {
  try {
    logger.debug('GET /api/kpis/roles');

    const result = await listAvailableRoles();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      roles: result.roles
    });

  } catch (error) {
    logger.error('Error in getAvailableRoles', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/references/request
 * Create a new reference request (invitation)
 *
 * Body:
 * {
 *   candidate_id: string (UUID),
 *   referee_email: string,
 *   referee_name?: string,
 *   relationship_type: 'manager' | 'peer' | 'report' | 'client' | 'mentor' | 'other',
 *   role: string,
 *   seniority_level: 'junior' | 'mid' | 'senior' | 'lead' | 'principal',
 *   expires_in_days?: number (default: 30)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   request_id: string,
 *   token: string,
 *   invite_url: string,
 *   expires_at: string (ISO 8601),
 *   kpi_set_version: number
 * }
 */
export async function createReferenceRequestHandler(req, res) {
  try {
    const {
      candidate_id,
      referee_email,
      referee_name,
      relationship_type,
      role,
      seniority_level,
      expires_in_days
    } = req.body;

    // created_by defaults to authenticated user if available, otherwise candidate_id
    const createdBy = req.user?.id || candidate_id;

    logger.info('POST /api/references/request', {
      candidate_id,
      referee_email,
      role,
      seniority_level,
      created_by: createdBy
    });

    const result = await createReferenceRequest({
      candidate_id,
      referee_email,
      referee_name,
      relationship_type,
      role,
      seniority_level,
      created_by: createdBy,
      expires_in_days
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    return res.status(201).json({
      success: true,
      request_id: result.request_id,
      token: result.token,
      invite_url: result.invite_url,
      expires_at: result.expires_at,
      kpi_set_version: result.kpi_set_version
    });

  } catch (error) {
    logger.error('Error in createReferenceRequestHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/request/:token
 * Get reference request by token (for referee to view form)
 *
 * Response:
 * {
 *   success: true,
 *   request: { id, candidate_id, candidate_email, referee_email, relationship_type, role, seniority_level, expires_at },
 *   kpiSet: { id, role, seniority_level, version, description },
 *   kpis: [{ id, key, name, description, category, required, weight, min_evidence_length }],
 *   status: 'valid'
 * }
 *
 * Error responses:
 * - 404: Token invalid
 * - 410: Token expired or already submitted
 */
export async function getReferenceRequestByTokenHandler(req, res) {
  try {
    const { token } = req.params;

    logger.debug('GET /api/references/request/:token', { token: token.substring(0, 8) + '...' });

    const result = await getReferenceRequestByToken(token);

    if (!result.success) {
      // Determine appropriate status code based on error type
      const statusCode = result.status === 'invalid' ? 404 :
                        result.status === 'expired' ? 410 :
                        result.status === 'already_submitted' ? 410 :
                        result.status === 'revoked' ? 410 : 400;

      return res.status(statusCode).json({
        success: false,
        error: result.error,
        status: result.status,
        ...(result.expires_at && { expires_at: result.expires_at })
      });
    }

    return res.status(200).json({
      success: true,
      request: result.request,
      kpiSet: result.kpiSet,
      kpis: result.kpis,
      status: result.status
    });

  } catch (error) {
    logger.error('Error in getReferenceRequestByTokenHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * POST /api/references/submit/:token
 * Submit a completed reference
 *
 * Body:
 * {
 *   relationship_type: 'manager' | 'peer' | 'report' | 'client' | 'mentor' | 'other',
 *   start_date?: string (YYYY-MM-DD),
 *   end_date?: string (YYYY-MM-DD),
 *   confidence_level?: 'high' | 'medium' | 'low',
 *   rehire_decision: 'yes' | 'no' | 'conditional',
 *   rehire_reasoning?: string,
 *   overall_recommendation?: 'strongly_recommend' | 'recommend' | 'neutral' | 'not_recommend',
 *   kpis: [
 *     {
 *       kpi_id: string (UUID),
 *       score: number (1-5),
 *       evidence_text: string (min 50 chars),
 *       confidence_level?: 'high' | 'medium' | 'low'
 *     }
 *   ],
 *   referee_id?: string (UUID),
 *   referee_name?: string
 * }
 *
 * Response:
 * {
 *   success: true,
 *   reference_id: string,
 *   signature_hash: string,
 *   submitted_at: string (ISO 8601)
 * }
 *
 * Error responses:
 * - 400: Validation failed
 * - 404: Invalid token
 * - 410: Token expired or already used
 * - 422: Business logic validation failed
 */
export async function submitReferenceHandler(req, res) {
  try {
    const { token } = req.params;
    const payload = req.body;

    // Capture IP address and user agent for audit
    payload.ip_address = req.ip || req.connection.remoteAddress;
    payload.user_agent = req.headers['user-agent'];

    logger.info('POST /api/references/submit/:token', {
      token: token.substring(0, 8) + '...',
      kpi_count: payload.kpis?.length,
      ip_address: payload.ip_address
    });

    const result = await submitReference(token, payload);

    if (!result.success) {
      // Validation errors
      if (result.validation_errors) {
        return res.status(400).json({
          success: false,
          error: result.error,
          validation_errors: result.validation_errors
        });
      }

      // Determine status code
      const statusCode = result.status === 'invalid' ? 404 :
                        result.status === 'expired' ? 410 :
                        result.status === 'already_submitted' ? 410 :
                        result.status === 'revoked' ? 410 : 422;

      return res.status(statusCode).json({
        success: false,
        error: result.error,
        status: result.status
      });
    }

    return res.status(201).json({
      success: true,
      reference_id: result.reference_id,
      signature_hash: result.signature_hash,
      submitted_at: result.submitted_at
    });

  } catch (error) {
    logger.error('Error in submitReferenceHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/candidate/:candidate_id
 * Get reference pack for a candidate with KPI aggregation
 *
 * Query params:
 * - include_evidence?: 'true' | 'false' (default: 'false')
 * - min_confidence?: 'high' | 'medium' | 'low'
 * - limit?: number
 *
 * Response:
 * {
 *   success: true,
 *   candidateId: string,
 *   references: [{ id, referee_email, relationship_type, kpi_scores: [...], ... }],
 *   kpi_aggregates: [{ kpi_key, kpi_name, reference_count, avg_score, weighted_avg_score, stddev, ... }],
 *   summary: { total_references, avg_overall_score, latest_reference_date, ... }
 * }
 */
export async function getCandidateReferencesHandler(req, res) {
  try {
    const { candidate_id } = req.params;
    const { include_evidence, min_confidence, limit } = req.query;

    logger.debug('GET /api/references/candidate/:candidate_id', {
      candidate_id,
      include_evidence,
      min_confidence,
      limit
    });

    // Permission check: Only candidate themselves or authorized users can access
    // For P0, we allow public access. In production, add permission checks here.
    // if (req.user?.id !== candidate_id && !req.user?.is_admin) {
    //   return res.status(403).json({ success: false, error: 'Access denied' });
    // }

    const result = await getCandidateReferencePack(candidate_id, {
      include_evidence,
      min_confidence,
      limit
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      candidateId: result.candidateId,
      references: result.references,
      kpi_aggregates: result.kpi_aggregates,
      summary: result.summary
    });

  } catch (error) {
    logger.error('Error in getCandidateReferencesHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/candidate/:candidate_id/stats
 * Get lightweight statistics for a candidate
 *
 * Response:
 * {
 *   success: true,
 *   stats: {
 *     total_references: number,
 *     pending_requests: number,
 *     total_kpi_evaluations: number,
 *     latest_reference_date: string,
 *     confidence_distribution: { high, medium, low },
 *     rehire_decision_distribution: { yes, no, conditional }
 *   }
 * }
 */
export async function getCandidateStatsHandler(req, res) {
  try {
    const { candidate_id } = req.params;

    logger.debug('GET /api/references/candidate/:candidate_id/stats', { candidate_id });

    const result = await getCandidateReferenceStats(candidate_id);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      stats: result.stats
    });

  } catch (error) {
    logger.error('Error in getCandidateStatsHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/:id
 * Get single reference by ID (with permission check)
 *
 * Response:
 * {
 *   success: true,
 *   reference: { id, candidate_id, referee_email, kpi_scores: [...], ... }
 * }
 */
export async function getReferenceByIdHandler(req, res) {
  try {
    const { id } = req.params;
    const requestingUserId = req.user?.id;

    logger.debug('GET /api/references/:id', { id, requesting_user: requestingUserId });

    if (!requestingUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await getReferenceById(id, requestingUserId);

    if (!result.success) {
      const statusCode = result.error === 'Access denied' ? 403 : 404;
      return res.status(statusCode).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      reference: result.reference
    });

  } catch (error) {
    logger.error('Error in getReferenceByIdHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/candidate/:candidate_id/aggregates
 * Get KPI aggregates from materialized view (fast)
 *
 * Response:
 * {
 *   success: true,
 *   kpi_aggregates: [{ kpi_key, kpi_name, reference_count, avg_score, weighted_avg_score, ... }]
 * }
 */
export async function getCandidateKpiAggregatesHandler(req, res) {
  try {
    const { candidate_id } = req.params;

    logger.debug('GET /api/references/candidate/:candidate_id/aggregates', { candidate_id });

    const result = await getCandidateKpiAggregatesFast(candidate_id);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      kpi_aggregates: result.kpi_aggregates
    });

  } catch (error) {
    logger.error('Error in getCandidateKpiAggregatesHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/references/requests/pending
 * Get pending reference requests for authenticated user
 *
 * Response:
 * {
 *   success: true,
 *   requests: [{ id, referee_email, role, seniority_level, status, expires_at, ... }]
 * }
 */
export async function getPendingRequestsHandler(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    logger.debug('GET /api/references/requests/pending', { user_id: userId });

    const result = await getPendingRequestsForCandidate(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      requests: result.requests
    });

  } catch (error) {
    logger.error('Error in getPendingRequestsHandler', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
