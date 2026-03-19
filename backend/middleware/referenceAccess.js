import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { assertRecruiterCanAccessReferencePack } from '../services/referenceAccess.service.js';
import {
  extractCapabilityToken,
  validateCapabilityToken,
  CapabilityActions,
  CapabilityResourceTypes
} from '../services/capabilityToken.service.js';

let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}

function getSupabaseClient() {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const resolvedSupabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  if (process.env.NODE_ENV === 'test' && supabaseClient) {
    return supabaseClient;
  }

  if (process.env.NODE_ENV === 'test') {
    return createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  return supabaseClient;
}

async function defaultDataAccessRequestResolver(req) {
  const requestId = req.params?.requestId;

  if (!requestId) {
    const error = new Error('Request ID is required');
    error.status = 400;
    throw error;
  }

  const client = getSupabaseClient();
  const { data: dataAccessRequest, error } = await client
    .from('data_access_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !dataAccessRequest) {
    const notFoundError = new Error('Request not found');
    notFoundError.status = 404;
    throw notFoundError;
  }

  const needsReferenceAccess = Boolean(
    dataAccessRequest.reference_id ||
      ['reference', 'profile', 'full_data'].includes(dataAccessRequest.requested_data_type)
  );

  return {
    candidateUserId: dataAccessRequest.target_user_id,
    targetId: dataAccessRequest.reference_id || dataAccessRequest.id,
    requiresAccess: needsReferenceAccess,
    dataAccessRequest
  };
}

export function resolveReferenceAccessSubject(resolveSubject) {
  return async function referenceAccessSubjectResolver(req, _res, next) {
    try {
      const resolved = await resolveSubject(req);
      req.referenceAccess = {
        ...(req.referenceAccess || {}),
        ...(typeof resolved === 'string' ? { candidateUserId: resolved } : resolved || {})
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireReferenceAccessPermission({
  resolveSubject,
  allowOwner = true,
  allowSuperadmin = false,
  onError = null,
  allowCapabilityToken = true,
  capabilityAction = CapabilityActions.READ_REFERENCES,
  capabilityResourceType = CapabilityResourceTypes.CANDIDATE_REFERENCE_DATA
} = {}) {
  if (typeof resolveSubject !== 'function') {
    throw new Error('requireReferenceAccessPermission requires a resolveSubject function');
  }

  return async function referenceAccessPermissionMiddleware(req, res, next) {
    try {
      const resolvedSubject = await resolveSubject(req);
      const subject = typeof resolvedSubject === 'string'
        ? { candidateUserId: resolvedSubject }
        : (resolvedSubject || {});

      const candidateUserId = subject.candidateUserId;
      if (!candidateUserId) {
        const error = new Error('Candidate owner could not be resolved');
        error.status = 400;
        throw error;
      }

      req.referenceAccess = {
        ...(req.referenceAccess || {}),
        ...subject,
        candidateUserId
      };

      if (subject.requiresAccess === false) {
        req.referenceAccess.accessLevel = 'not_applicable';
        return next();
      }

      if (allowOwner && req.user?.id === candidateUserId) {
        req.referenceAccess.accessLevel = 'owner';
        return next();
      }

      if (allowSuperadmin && req.user?.role === 'superadmin') {
        req.referenceAccess.accessLevel = 'superadmin';
        return next();
      }

      const capabilityToken = allowCapabilityToken ? extractCapabilityToken(req) : null;
      if (capabilityToken) {
        const validated = await validateCapabilityToken({
          token: capabilityToken,
          action: capabilityAction,
          resourceType: capabilityResourceType,
          resourceId: subject.capabilityResourceId || candidateUserId,
          candidateUserId,
          req
        });

        req.referenceAccess.accessLevel = 'capability_token';
        req.referenceAccess.capability = validated;
        req.referenceAccess.grant = validated.grant;
        return next();
      }

      if (!req.user?.id) {
        const error = new Error('Access denied');
        error.status = 403;
        throw error;
      }

      const grant = await assertRecruiterCanAccessReferencePack({
        candidateUserId,
        recruiterUserId: req.user.id,
        req,
        targetId: subject.targetId || null
      });

      req.referenceAccess.accessLevel = 'explicit_grant';
      req.referenceAccess.grant = grant;
      return next();
    } catch (error) {
      logger.warn('Reference access permission denied', {
        requestId: req.requestId,
        path: req.path,
        requesterUserId: req.user?.id,
        requesterRole: req.user?.role,
        candidateUserId: req.referenceAccess?.candidateUserId,
        error: error.message,
        status: error.status || 500
      });

      if (typeof onError === 'function') {
        return onError(error, req, res, next);
      }

      return res.status(error.status || 403).json({
        error: error.status === 404 ? 'Not found' : 'Access denied',
        message: error.status && error.status < 500 ? error.message : 'Authorization failed'
      });
    }
  };
}

export function requireReferenceAccessForDataAccessRequest(options = {}) {
  return requireReferenceAccessPermission({
    resolveSubject: defaultDataAccessRequestResolver,
    allowOwner: true,
    allowSuperadmin: false,
    ...options
  });
}

