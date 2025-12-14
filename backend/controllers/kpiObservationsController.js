/**
 * KPI Observations Controller
 *
 * Handles KPI observation data capture for the Proof of Correlation MVP.
 * This controller manages the "data pipeline" that feeds the Python ML correlation engine.
 *
 * Key endpoints:
 * - POST /api/kpi-observations  → Capture new KPI evaluations
 * - GET /api/kpi-observations   → Retrieve KPI observations with filters
 * - GET /api/kpi-observations/summary → Get aggregated summary for analytics
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import logger from '../logger.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * POST /api/kpi-observations
 *
 * Create one or more KPI observations (batch insert).
 *
 * SECURITY: observer_wallet is derived from authenticated user's wallet.
 * Users can only submit KPI observations as themselves (the observer).
 *
 * Request body:
 * {
 *   "subject_wallet": "0xABC...",
 *   "role_id": "uuid-of-role",
 *   "role_name": "Backend Developer",  // Optional, for denormalization
 *   "observations": [
 *     {
 *       "kpi_name": "deployment_frequency",
 *       "rating_value": 4,
 *       "outcome_value": 120,  // Optional
 *       "context_notes": "Deployed 120 times in Q1 2024",  // Optional
 *       "observation_period": "Q1 2024",  // Optional
 *       "observed_at": "2024-03-31T23:59:59Z"  // Optional, defaults to NOW()
 *     },
 *     {
 *       "kpi_name": "code_quality",
 *       "rating_value": 5,
 *       "context_notes": "Excellent code review feedback"
 *     }
 *   ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "inserted": 2,
 *   "observations": [{ id: "...", ... }]
 * }
 */
export async function createKpiObservations(req, res) {
  try {
    const {
      subject_wallet,
      role_id,
      role_name,
      observations
    } = req.body;

    // ========================================
    // 1. SECURITY: Get observer wallet from authenticated user
    // ========================================

    // SECURITY: Fetch the authenticated user's wallet address
    const { data: authUser, error: authError } = await supabase
      .from('users')
      .select('id, wallet_address')
      .eq('id', req.user.id)
      .single();

    if (authError || !authUser) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Unable to verify user identity'
      });
    }

    // SECURITY: User must have a wallet to submit KPI observations
    if (!authUser.wallet_address) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You must have a linked wallet to submit KPI observations'
      });
    }

    // SECURITY: Use authenticated user's wallet as observer (ignore any body value)
    const observer_wallet = authUser.wallet_address;
    const observer_user_id = authUser.id;

    // ========================================
    // 2. VALIDATION
    // ========================================

    // Required fields (observer_wallet no longer required in body)
    if (!subject_wallet || !role_id || !observations) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['subject_wallet', 'role_id', 'observations']
      });
    }

    // Observations must be an array
    if (!Array.isArray(observations) || observations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'observations must be a non-empty array'
      });
    }

    // Validate each observation
    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];

      if (!obs.kpi_name) {
        return res.status(400).json({
          success: false,
          error: `observations[${i}]: missing kpi_name`
        });
      }

      if (typeof obs.rating_value !== 'number') {
        return res.status(400).json({
          success: false,
          error: `observations[${i}]: rating_value must be a number`
        });
      }

      if (obs.rating_value < 1 || obs.rating_value > 5) {
        return res.status(400).json({
          success: false,
          error: `observations[${i}]: rating_value must be between 1 and 5`
        });
      }
    }

    // ========================================
    // 3. RESOLVE SUBJECT USER ID (if available)
    // ========================================

    let subject_user_id = null;

    // Try to find subject by wallet
    const { data: subjectUser } = await supabase
      .from('users')
      .select('id')
      .eq('wallet_address', subject_wallet)
      .maybeSingle();

    if (subjectUser) {
      subject_user_id = subjectUser.id;
    }

    // Note: observer_user_id already set from authenticated user above

    // ========================================
    // 4. PREPARE ROWS FOR INSERTION
    // ========================================

    const rows = observations.map(obs => ({
      subject_wallet,
      subject_user_id,
      observer_wallet,
      observer_user_id,
      role_id,
      role_name: role_name || null,
      kpi_id: obs.kpi_id || null,
      kpi_name: obs.kpi_name,
      rating_value: obs.rating_value,
      outcome_value: obs.outcome_value || null,
      context_notes: obs.context_notes || null,
      observation_period: obs.observation_period || null,
      observed_at: obs.observed_at || new Date().toISOString(),
      source: obs.source || 'manual',
      reference_id: obs.reference_id || null,
      verified: obs.verified || false,
      created_at: new Date().toISOString()
    }));

    // ========================================
    // 5. INSERT INTO DATABASE
    // ========================================

    const { data: insertedData, error: insertError } = await supabase
      .from('kpi_observations')
      .insert(rows)
      .select();

    if (insertError) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to insert KPI observations', {
        subjectWallet: subject_wallet,
        observerWallet: observer_wallet,
        roleId: role_id,
        observationCount: observations.length,
        error: insertError.message,
        stack: insertError.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Database insertion failed',
        details: insertError.message
      });
    }

    // ========================================
    // 6. SUCCESS RESPONSE
    // ========================================

    const reqLogger = logger.withRequest(req);
    reqLogger.info('KPI observations created successfully', {
      subjectWallet: subject_wallet,
      observerWallet: observer_wallet,
      roleId: role_id,
      roleName: role_name || 'N/A',
      inserted: insertedData.length
    });

    return res.status(201).json({
      success: true,
      inserted: insertedData.length,
      observations: insertedData
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to create KPI observations', {
      subjectWallet: req.body?.subject_wallet,
      observerWallet: req.body?.observer_wallet,
      roleId: req.body?.role_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/kpi-observations
 *
 * Retrieve KPI observations with optional filters.
 *
 * SECURITY: Non-superadmin users can only see KPIs where they are
 * the subject (about them) or the observer (they created).
 *
 * Query parameters (all optional):
 * - role_id: Filter by role UUID
 * - kpi_name: Filter by KPI name (exact match)
 * - verified: Filter by verification status (true/false)
 * - limit: Max number of results (default: 200, max: 1000)
 * - offset: Pagination offset (default: 0)
 *
 * Response:
 * {
 *   "success": true,
 *   "count": 42,
 *   "observations": [{ ... }],
 *   "filters": { ... }
 * }
 */
export async function getKpiObservations(req, res) {
  try {
    const {
      role_id,
      kpi_name,
      verified,
      limit = 200,
      offset = 0
    } = req.query;

    // ========================================
    // 1. SECURITY: Authorization check
    // ========================================

    const isSuperadmin = req.user.role === 'superadmin';

    // Fetch authenticated user's wallet address for filtering
    let userWallet = null;
    if (!isSuperadmin) {
      const { data: authUser } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', req.user.id)
        .single();

      userWallet = authUser?.wallet_address;
    }

    // ========================================
    // 2. VALIDATE QUERY PARAMS
    // ========================================

    const parsedLimit = Math.min(parseInt(limit) || 200, 1000);
    const parsedOffset = parseInt(offset) || 0;

    // ========================================
    // 3. BUILD QUERY WITH FILTERS
    // ========================================

    let query = supabase
      .from('kpi_observations')
      .select('*', { count: 'exact' });

    // SECURITY: Non-superadmins can only see their own KPIs
    if (!isSuperadmin) {
      // User can see KPIs where they are subject OR observer
      // Using or() filter for subject_user_id = user.id OR observer_user_id = user.id
      // Also check by wallet if available
      if (userWallet) {
        query = query.or(`subject_user_id.eq.${req.user.id},observer_user_id.eq.${req.user.id},subject_wallet.eq.${userWallet},observer_wallet.eq.${userWallet}`);
      } else {
        query = query.or(`subject_user_id.eq.${req.user.id},observer_user_id.eq.${req.user.id}`);
      }
    }

    // Apply additional filters
    if (role_id) {
      query = query.eq('role_id', role_id);
    }

    if (kpi_name) {
      query = query.eq('kpi_name', kpi_name);
    }

    if (verified !== undefined) {
      const verifiedBool = verified === 'true' || verified === true;
      query = query.eq('verified', verifiedBool);
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    // ========================================
    // 4. EXECUTE QUERY
    // ========================================

    const { data, error, count } = await query;

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch KPI observations', {
        userId: req.user.id,
        roleId: role_id,
        kpiName: kpi_name,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }

    // ========================================
    // 5. SUCCESS RESPONSE
    // ========================================

    return res.json({
      success: true,
      count: count || 0,
      observations: data,
      filters: {
        role_id,
        kpi_name,
        verified,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get KPI observations', {
      queryParams: req.query,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/kpi-observations/summary
 *
 * Get aggregated KPI observation summary (uses the kpi_observations_summary view).
 * This is optimized for analytics/ML consumption.
 *
 * SECURITY: Non-superadmin users can only see summaries for their own wallet.
 * Superadmins can see all summaries.
 *
 * Query parameters (all optional):
 * - role_id: Filter by role
 * - kpi_name: Filter by KPI name
 * - limit: Max results (default: 100, max: 1000)
 *
 * Response:
 * {
 *   "success": true,
 *   "count": 25,
 *   "summary": [
 *     {
 *       "subject_wallet": "0xABC...",
 *       "role_id": "uuid",
 *       "role_name": "Backend Developer",
 *       "kpi_name": "deployment_frequency",
 *       "observation_count": 5,
 *       "avg_rating": 4.2,
 *       "stddev_rating": 0.4,
 *       "min_rating": 4,
 *       "max_rating": 5,
 *       "avg_outcome": 115.0,
 *       "verified_count": 3,
 *       "latest_observation_date": "2024-03-31T..."
 *     }
 *   ]
 * }
 */
export async function getKpiObservationsSummary(req, res) {
  try {
    const {
      role_id,
      kpi_name,
      limit = 100
    } = req.query;

    // ========================================
    // 1. SECURITY: Authorization check
    // ========================================

    const isSuperadmin = req.user.role === 'superadmin';

    // Fetch authenticated user's wallet address for filtering
    let userWallet = null;
    if (!isSuperadmin) {
      const { data: authUser } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', req.user.id)
        .single();

      userWallet = authUser?.wallet_address;

      // Non-superadmin users without a wallet can't see any summary data
      if (!userWallet) {
        return res.json({
          success: true,
          count: 0,
          summary: [],
          filters: { role_id, kpi_name, limit: parseInt(limit) || 100 }
        });
      }
    }

    // ========================================
    // 2. VALIDATE
    // ========================================

    const parsedLimit = Math.min(parseInt(limit) || 100, 1000);

    // ========================================
    // 3. BUILD QUERY
    // ========================================

    let query = supabase
      .from('kpi_observations_summary')
      .select('*', { count: 'exact' });

    // SECURITY: Non-superadmins can only see their own summary data
    if (!isSuperadmin) {
      query = query.eq('subject_wallet', userWallet);
    }

    if (role_id) {
      query = query.eq('role_id', role_id);
    }

    if (kpi_name) {
      query = query.eq('kpi_name', kpi_name);
    }

    query = query
      .order('subject_wallet', { ascending: true })
      .order('role_id', { ascending: true })
      .order('kpi_name', { ascending: true })
      .limit(parsedLimit);

    // ========================================
    // 4. EXECUTE
    // ========================================

    const { data, error, count } = await query;

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch KPI summary', {
        userId: req.user.id,
        roleId: role_id,
        kpiName: kpi_name,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }

    // ========================================
    // 5. SUCCESS
    // ========================================

    return res.json({
      success: true,
      count: count || 0,
      summary: data,
      filters: {
        role_id,
        kpi_name,
        limit: parsedLimit
      }
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get KPI observations summary', {
      queryParams: req.query,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Export all controller functions
 */
export default {
  createKpiObservations,
  getKpiObservations,
  getKpiObservationsSummary
};
