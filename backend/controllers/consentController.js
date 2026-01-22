// ============================================================================
// Consent Controller - P0 Security Enhancement
// ============================================================================
// Handles consent management endpoints (create, list, revoke)
// Integrates with consent system for GDPR/legal compliance
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { createConsent, revokeConsent, checkConsent } from '../utils/consentManager.js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// CREATE CONSENT
// ============================================================================

/**
 * POST /api/consents
 * Create a new consent (typically called when user approves data access)
 *
 * Body: {
 *   grantedToOrg?: UUID,
 *   grantedToUser?: UUID,
 *   resourceType: 'references' | 'kpi_observations' | 'hrkey_score' | 'profile' | 'full_data',
 *   resourceId?: UUID,
 *   scope?: ['read', 'write', 'share'],
 *   purpose: string,
 *   expiresAt?: ISO date string
 * }
 *
 * Authorization: User can only create consents for their own data
 */
export async function createConsentEndpoint(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const {
      grantedToOrg,
      grantedToUser,
      resourceType,
      resourceId,
      scope = ['read'],
      purpose,
      expiresAt
    } = req.body;

    // Validate required fields
    if (!resourceType || !purpose) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'resourceType and purpose are required'
      });
    }

    if (!grantedToOrg && !grantedToUser) {
      return res.status(400).json({
        error: 'Missing grantee',
        message: 'Must specify either grantedToOrg or grantedToUser'
      });
    }

    if (grantedToOrg && grantedToUser) {
      return res.status(400).json({
        error: 'Invalid grantee',
        message: 'Cannot specify both grantedToOrg and grantedToUser'
      });
    }

    // Validate resourceType
    const validResourceTypes = ['references', 'kpi_observations', 'hrkey_score', 'profile', 'full_data'];
    if (!validResourceTypes.includes(resourceType)) {
      return res.status(400).json({
        error: 'Invalid resourceType',
        message: `resourceType must be one of: ${validResourceTypes.join(', ')}`
      });
    }

    // Create consent
    const consent = await createConsent({
      subjectUserId: userId,
      grantedToOrg: grantedToOrg || null,
      grantedToUser: grantedToUser || null,
      resourceType,
      resourceId: resourceId || null,
      scope,
      purpose,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      metadata: {
        created_via: 'api',
        user_agent: req.headers['user-agent']
      }
    });

    logger.info('Consent created via API', {
      consentId: consent.id,
      subjectUserId: userId,
      grantedToOrg,
      grantedToUser,
      resourceType,
      purpose
    });

    return res.status(201).json({
      success: true,
      consent: {
        id: consent.id,
        subjectUserId: consent.subject_user_id,
        grantedToOrg: consent.granted_to_org,
        grantedToUser: consent.granted_to_user,
        resourceType: consent.resource_type,
        resourceId: consent.resource_id,
        scope: consent.scope,
        purpose: consent.purpose,
        status: consent.status,
        grantedAt: consent.granted_at,
        expiresAt: consent.expires_at
      }
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to create consent', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create consent'
    });
  }
}

// ============================================================================
// GET MY CONSENTS (as subject - consents I've granted)
// ============================================================================

/**
 * GET /api/consents/my
 * List all consents granted by the authenticated user
 *
 * Query params:
 * - status: 'active' | 'revoked' | 'expired' (default: 'active')
 * - resourceType: filter by resource type
 * - limit: max results (default: 50, max: 100)
 *
 * Authorization: User can only view consents they granted
 */
export async function getMyConsents(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const {
      status = 'active',
      resourceType,
      limit = '50'
    } = req.query;

    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

    // Build query
    let query = supabase
      .from('consents')
      .select(`
        id,
        granted_to_org,
        granted_to_user,
        resource_type,
        resource_id,
        scope,
        purpose,
        status,
        granted_at,
        expires_at,
        revoked_at,
        companies:granted_to_org (
          id,
          name,
          verified
        )
      `)
      .eq('subject_user_id', userId)
      .order('granted_at', { ascending: false })
      .limit(limitNum);

    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by resource type
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    const { data: consents, error } = await query;

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch my consents', {
        userId,
        error: error.message
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch consents'
      });
    }

    return res.json({
      success: true,
      consents: consents.map((c) => ({
        id: c.id,
        grantedTo: c.granted_to_org
          ? { type: 'company', id: c.granted_to_org, name: c.companies?.name }
          : { type: 'user', id: c.granted_to_user },
        resourceType: c.resource_type,
        resourceId: c.resource_id,
        scope: c.scope,
        purpose: c.purpose,
        status: c.status,
        grantedAt: c.granted_at,
        expiresAt: c.expires_at,
        revokedAt: c.revoked_at
      })),
      count: consents.length
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get my consents', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET CONSENTS GRANTED TO ME (as grantee)
// ============================================================================

/**
 * GET /api/consents/granted
 * List all consents granted to the authenticated user or their company
 *
 * Query params:
 * - status: 'active' | 'revoked' | 'expired' (default: 'active')
 * - resourceType: filter by resource type
 * - limit: max results (default: 50, max: 100)
 *
 * Authorization: User can view consents granted to them or their company
 */
export async function getGrantedConsents(req, res) {
  try {
    const userId = req.user?.id;
    const companyId = req.user?.companyId; // If user is a company signer

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const {
      status = 'active',
      resourceType,
      limit = '50'
    } = req.query;

    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

    // Build query - find consents granted to user OR their company
    let query = supabase
      .from('consents')
      .select(`
        id,
        subject_user_id,
        granted_to_org,
        granted_to_user,
        resource_type,
        resource_id,
        scope,
        purpose,
        status,
        granted_at,
        expires_at,
        revoked_at,
        users:subject_user_id (
          id,
          email
        )
      `)
      .order('granted_at', { ascending: false })
      .limit(limitNum);

    // Filter: granted to me OR my company
    if (companyId) {
      query = query.or(`granted_to_user.eq.${userId},granted_to_org.eq.${companyId}`);
    } else {
      query = query.eq('granted_to_user', userId);
    }

    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by resource type
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    const { data: consents, error } = await query;

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to fetch granted consents', {
        userId,
        companyId,
        error: error.message
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch consents'
      });
    }

    return res.json({
      success: true,
      consents: consents.map((c) => ({
        id: c.id,
        subjectUser: {
          id: c.subject_user_id,
          email: c.users?.email
        },
        grantedTo: c.granted_to_org
          ? { type: 'company', id: c.granted_to_org }
          : { type: 'user', id: c.granted_to_user },
        resourceType: c.resource_type,
        resourceId: c.resource_id,
        scope: c.scope,
        purpose: c.purpose,
        status: c.status,
        grantedAt: c.granted_at,
        expiresAt: c.expires_at,
        revokedAt: c.revoked_at
      })),
      count: consents.length
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to get granted consents', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// REVOKE CONSENT
// ============================================================================

/**
 * POST /api/consents/:consentId/revoke
 * Revoke a consent (immediate effect)
 *
 * Authorization:
 * - Subject user can revoke their own consents
 * - Superadmin can revoke any consent
 */
export async function revokeConsentEndpoint(req, res) {
  try {
    const { consentId } = req.params;
    const userId = req.user?.id;
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Get consent to verify ownership
    const { data: consent, error: fetchError } = await supabase
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .single();

    if (fetchError || !consent) {
      return res.status(404).json({
        error: 'Consent not found'
      });
    }

    // Check authorization
    const isOwner = consent.subject_user_id === userId;

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only revoke your own consents'
      });
    }

    // Check if already revoked
    if (consent.status === 'revoked') {
      return res.status(400).json({
        error: 'Already revoked',
        message: 'This consent has already been revoked'
      });
    }

    // Revoke consent
    const revokedConsent = await revokeConsent(consentId, userId);

    logger.info('Consent revoked', {
      consentId,
      revokedBy: userId,
      isSuperadmin,
      subjectUserId: consent.subject_user_id
    });

    return res.json({
      success: true,
      consent: {
        id: revokedConsent.id,
        status: revokedConsent.status,
        revokedAt: revokedConsent.revoked_at,
        revokedBy: revokedConsent.revoked_by
      },
      message: 'Consent revoked successfully'
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to revoke consent', {
      consentId: req.params?.consentId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to revoke consent'
    });
  }
}

// ============================================================================
// DELETE CONSENT (Superadmin only)
// ============================================================================

/**
 * DELETE /api/consents/:consentId
 * Permanently delete a consent (superadmin only)
 *
 * Authorization: Superadmin only
 */
export async function deleteConsent(req, res) {
  try {
    const { consentId } = req.params;
    const userId = req.user?.id;
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only superadmins can delete consents'
      });
    }

    // Delete consent
    const { error } = await supabase
      .from('consents')
      .delete()
      .eq('id', consentId);

    if (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Failed to delete consent', {
        consentId,
        userId,
        error: error.message
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete consent'
      });
    }

    logger.info('Consent deleted', {
      consentId,
      deletedBy: userId
    });

    return res.json({
      success: true,
      message: 'Consent deleted successfully'
    });

  } catch (error) {
    const reqLogger = logger.withRequest(req);
    reqLogger.error('Failed to delete consent', {
      consentId: req.params?.consentId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  createConsentEndpoint,
  getMyConsents,
  getGrantedConsents,
  revokeConsentEndpoint,
  deleteConsent
};
