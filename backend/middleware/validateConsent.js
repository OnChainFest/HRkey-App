// ============================================================================
// Consent Validation Middleware - P0 Security Enhancement
// ============================================================================
// Server-side enforcement of consent before returning sensitive data
// Logs all access attempts (allowed and denied) to audit_events table
// ============================================================================

import { checkConsent, logAuditEvent } from '../utils/consentManager.js';
import logger from '../logger.js';

// ============================================================================
// CONSENT VALIDATION MIDDLEWARE FACTORY
// ============================================================================

/**
 * Factory function to create consent validation middleware
 *
 * @param {Object} options
 * @param {string} options.resourceType - Type of resource being accessed (references, kpi_observations, etc.)
 * @param {Function} options.getTargetOwnerId - Function to extract target owner ID from request
 * @param {Function} options.getTargetId - Function to extract target resource ID from request (optional)
 * @param {Function} options.getGrantee - Function to extract grantee (company or user) from request
 * @param {string} options.action - Action being performed (default: 'read')
 * @param {boolean} options.allowSuperadmin - Allow superadmin to bypass consent (default: true)
 * @param {boolean} options.allowSelf - Allow user to access their own data without consent (default: true)
 * @returns {Function} Express middleware
 *
 * @example
 * // Protect endpoint that returns a specific reference
 * app.get('/api/references/:referenceId',
 *   requireAuth,
 *   validateConsent({
 *     resourceType: 'references',
 *     getTargetOwnerId: async (req) => {
 *       const { data } = await supabase.from('references').select('owner_id').eq('id', req.params.referenceId).single();
 *       return data?.owner_id;
 *     },
 *     getTargetId: (req) => req.params.referenceId,
 *     getGrantee: (req) => ({ companyId: req.user.companyId, userId: req.user.id })
 *   }),
 *   referencesController.getReference
 * );
 */
export function validateConsent(options = {}) {
  const {
    resourceType,
    getTargetOwnerId,
    getTargetId = null,
    getGrantee,
    action = 'read',
    allowSuperadmin = true,
    allowSelf = true
  } = options;

  // Validate required options
  if (!resourceType) {
    throw new Error('validateConsent: resourceType is required');
  }
  if (!getTargetOwnerId) {
    throw new Error('validateConsent: getTargetOwnerId function is required');
  }
  if (!getGrantee) {
    throw new Error('validateConsent: getGrantee function is required');
  }

  return async (req, res, next) => {
    try {
      const reqLogger = logger.withRequest(req);

      // Extract actor (user making the request)
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be authenticated to access this resource'
        });
      }

      const actorUserId = req.user.id;

      // Superadmin bypass (if allowed)
      if (allowSuperadmin && req.user.role === 'superadmin') {
        reqLogger.info('Consent check bypassed for superadmin', {
          actorUserId,
          resourceType,
          action
        });

        // Log audit event (allowed with superadmin override)
        const targetOwnerId = await getTargetOwnerId(req);
        const targetId = getTargetId ? await getTargetId(req) : null;

        await logAuditEvent({
          actorUserId,
          actorCompanyId: null,
          action,
          targetType: resourceType,
          targetId,
          targetOwnerId: targetOwnerId || actorUserId, // Fallback to actor if owner not found
          purpose: 'superadmin_access',
          result: 'allowed',
          reason: 'superadmin_override',
          consentId: null,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: {
            endpoint: req.path,
            method: req.method
          }
        });

        return next();
      }

      // Extract target owner and grantee
      const targetOwnerId = await getTargetOwnerId(req);
      const targetId = getTargetId ? await getTargetId(req) : null;
      const grantee = await getGrantee(req);

      // Self-access bypass (if allowed)
      if (allowSelf && actorUserId === targetOwnerId) {
        reqLogger.info('Consent check bypassed for self-access', {
          actorUserId,
          resourceType,
          action
        });

        // Log audit event (allowed - self access)
        await logAuditEvent({
          actorUserId,
          actorCompanyId: grantee.companyId || null,
          action,
          targetType: resourceType,
          targetId,
          targetOwnerId,
          purpose: 'self_access',
          result: 'allowed',
          reason: 'self_access',
          consentId: null,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: {
            endpoint: req.path,
            method: req.method
          }
        });

        return next();
      }

      // Check consent
      const consentCheck = await checkConsent({
        subjectUserId: targetOwnerId,
        grantedToOrg: grantee.companyId || null,
        grantedToUser: grantee.companyId ? null : grantee.userId,
        resourceType,
        resourceId: targetId
      });

      // Log audit event
      const auditEventData = {
        actorUserId,
        actorCompanyId: grantee.companyId || null,
        action,
        targetType: resourceType,
        targetId,
        targetOwnerId,
        purpose: consentCheck.consent?.purpose || null,
        result: consentCheck.hasConsent ? 'allowed' : 'denied',
        reason: consentCheck.reason,
        consentId: consentCheck.consent?.id || null,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          endpoint: req.path,
          method: req.method
        }
      };

      await logAuditEvent(auditEventData);

      // Deny if no consent
      if (!consentCheck.hasConsent) {
        reqLogger.warn('Data access denied - no valid consent', {
          actorUserId,
          targetOwnerId,
          resourceType,
          targetId,
          reason: consentCheck.reason
        });

        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have consent to access this resource',
          reason: consentCheck.reason,
          details: {
            resourceType,
            targetOwnerId,
            requiredConsent: `${resourceType} access for user ${targetOwnerId}`
          }
        });
      }

      // Consent valid - allow access
      reqLogger.info('Data access allowed - valid consent', {
        actorUserId,
        targetOwnerId,
        resourceType,
        targetId,
        consentId: consentCheck.consent.id
      });

      // Attach consent to request for downstream use
      req.consent = consentCheck.consent;

      next();
    } catch (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Consent validation middleware error', {
        resourceType,
        action,
        error: error.message,
        stack: error.stack
      });

      // Fail closed - deny access on error
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred validating consent'
      });
    }
  };
}

// ============================================================================
// SIMPLE CONSENT CHECK MIDDLEWARE (for existing data_access_requests flow)
// ============================================================================

/**
 * Simple middleware to check if user has approved data_access_request
 * Compatible with existing system
 *
 * @param {Object} options
 * @param {Function} options.getTargetUserId - Function to extract target user ID
 * @returns {Function} Express middleware
 */
export function requireApprovedDataAccess(options = {}) {
  const { getTargetUserId } = options;

  if (!getTargetUserId) {
    throw new Error('requireApprovedDataAccess: getTargetUserId function is required');
  }

  return async (req, res, next) => {
    try {
      const reqLogger = logger.withRequest(req);

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      // Superadmin bypass
      if (req.user.role === 'superadmin') {
        return next();
      }

      const requesterId = req.user.id;
      const targetUserId = await getTargetUserId(req);

      // Self-access bypass
      if (requesterId === targetUserId) {
        return next();
      }

      // Check existing data_access_requests table (legacy)
      // Note: This uses the existing checkConsent infrastructure
      // For legacy compatibility with data_access_requests table
      const consentCheck = await checkConsent({
        subjectUserId: targetUserId,
        grantedToUser: requesterId,
        resourceType: 'full_data', // Legacy: full data access
        resourceId: null
      });

      if (!consentCheck.hasConsent) {
        reqLogger.warn('Data access denied - no approved request', {
          requesterId,
          targetUserId,
          reason: consentCheck.reason
        });

        return res.status(403).json({
          error: 'Forbidden',
          message: 'You must have an approved data access request to view this information'
        });
      }

      next();
    } catch (error) {
      const reqLogger = logger.withRequest(req);
      reqLogger.error('Data access check middleware error', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  };
}

// ============================================================================
// EXPORT MIDDLEWARE
// ============================================================================

export default {
  validateConsent,
  requireApprovedDataAccess
};
