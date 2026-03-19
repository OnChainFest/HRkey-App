// ============================================================================
// Authentication and Authorization Middleware
// ============================================================================
// Provides middleware for protecting routes and checking user roles/permissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}

const getSupabaseClient = () => {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const resolvedSupabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  // In tests, prefer the explicitly injected mock client.
  if (process.env.NODE_ENV === 'test' && supabaseClient) {
    return supabaseClient;
  }

  // In tests without explicit injection, return a fresh mocked client.
  if (process.env.NODE_ENV === 'test') {
    return createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  return supabaseClient;
};

function hasExplicitTestBypassHeaders(req) {
  return Boolean(
    req.headers['x-test-user-id'] ||
      req.headers['x-test-user-email'] ||
      req.headers['x-test-user-role'] ||
      req.headers['x-test-wallet-address']
  );
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Requires user to be authenticated
 * Extracts user from Authorization header and attaches to req.user
 */
export async function requireAuth(req, res, next) {
  try {
    const allowTestBypass =
      process.env.NODE_ENV === 'test' &&
      process.env.ALLOW_TEST_AUTH_BYPASS === 'true' &&
      hasExplicitTestBypassHeaders(req);

    if (allowTestBypass) {
      const testUserId = req.headers['x-test-user-id'] || 'test-user-id';
      const testEmail = req.headers['x-test-user-email'] || 'test-user@example.com';
      const testWalletAddress = req.headers['x-test-wallet-address'] || null;

      req.user = {
        id: testUserId,
        email: testEmail,
        role: req.headers['x-test-user-role'] || 'user',
        identity_verified: true,
        wallet_address: testWalletAddress
      };

      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide an authorization token'
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const client = getSupabaseClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
    }

    const { data: userData, error: userError } = await client
      .from('users')
      .select('id, email, role, identity_verified, wallet_address, created_at')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      logger.warn('Failed to fetch user data from users table', {
        requestId: req.requestId,
        userId: user.id,
        error: userError?.message
      });

      req.user = {
        id: user.id,
        email: user.email,
        role: 'user',
        identity_verified: false
      };
    } else {
      req.user = userData;
    }

    return next();
  } catch (error) {
    logger.error('Authentication middleware failed', {
      requestId: req.requestId,
      path: req.path,
      hasAuthHeader: !!req.headers.authorization,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
}

// ============================================================================
// ROLE-BASED AUTHORIZATION MIDDLEWARE
// ============================================================================

/**
 * Requires user to be a superadmin
 */
export async function requireSuperadmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Superadmin access required'
    });
  }

  return next();
}

/**
 * Requires user to be an admin or superadmin
 */
export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  return next();
}

// ============================================================================
// COMPANY PERMISSIONS MIDDLEWARE
// ============================================================================

/**
 * Requires user to be an active signer of the specified company
 * Checks company_signers table
 * Superadmins bypass this check
 */
export async function requireCompanySigner(req, res, next) {
  try {
    const companyId = req.params.companyId;

    if (!companyId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Company ID is required'
      });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'superadmin') {
      req.isSuperadmin = true;
      return next();
    }

    const client = getSupabaseClient();

    const { data: signer, error } = await client
      .from('company_signers')
      .select('id, role, is_active, company_id, user_id, created_at')
      .eq('company_id', companyId)
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .single();

    if (error || !signer) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an active signer of this company'
      });
    }

    req.signer = signer;
    return next();
  } catch (error) {
    logger.error('Company signer authorization failed', {
      requestId: req.requestId,
      userId: req.user?.id,
      companyId: req.params?.companyId,
      path: req.path,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Authorization error',
      message: 'An error occurred checking company permissions'
    });
  }
}

/**
 * Requires user to be a signer of ANY company (for company creation, etc.)
 */
export async function requireAnySigner(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    const client = getSupabaseClient();

    const { data: signers, error } = await client
      .from('company_signers')
      .select('id, company_id')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be a company signer to access this resource'
      });
    }

    if (!signers || signers.length === 0) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be a company signer to access this resource'
      });
    }

    return next();
  } catch (error) {
    logger.error('Signer authorization failed', {
      requestId: req.requestId,
      userId: req.user?.id,
      path: req.path,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Authorization error'
    });
  }
}

// ============================================================================
// RESOURCE-SCOPED AUTHORIZATION MIDDLEWARE
// ============================================================================

export function requireSelfOrSuperadmin(paramName = 'userId', options = {}) {
  const errorMessage = options.message || 'You can only access your own resources';

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const targetUserId = req.params[paramName];

    if (!targetUserId) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Missing required parameter: ${paramName}`
      });
    }

    const isOwner = req.user.id === targetUserId;
    const isSuperadmin = req.user.role === 'superadmin';

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: errorMessage
      });
    }

    return next();
  };
}

export function requireWalletLinked(options = {}) {
  const errorMessage = options.message || 'You must have a linked wallet to access this resource';

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.wallet_address) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: errorMessage
      });
    }

    return next();
  };
}

// ============================================================================
// WALLET-SCOPED AUTHORIZATION MIDDLEWARE
// ============================================================================

export function requireOwnWallet(walletField = 'subject_wallet', options = {}) {
  const noWalletMessage = options.noWalletMessage || 'You must have a linked wallet to access this resource';
  const mismatchMessage = options.mismatchMessage || 'You can only access your own wallet resources';

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!req.user.wallet_address) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: noWalletMessage
      });
    }

    const targetWallet = req.body?.[walletField];

    if (targetWallet && req.user.wallet_address.toLowerCase() !== String(targetWallet).toLowerCase()) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: mismatchMessage
      });
    }

    return next();
  };
}

// ============================================================================
// OPTIONAL AUTH (for public/semi-public endpoints)
// ============================================================================

export async function optionalAuth(req, res, next) {
  try {
    const allowTestBypass =
      process.env.NODE_ENV === 'test' &&
      process.env.ALLOW_TEST_AUTH_BYPASS === 'true' &&
      hasExplicitTestBypassHeaders(req);

    if (allowTestBypass) {
      req.user = {
        id: req.headers['x-test-user-id'] || 'test-user-id',
        email: req.headers['x-test-user-email'] || 'test-user@example.com',
        role: req.headers['x-test-user-role'] || 'user',
        identity_verified: true,
        wallet_address: req.headers['x-test-wallet-address'] || null
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const client = getSupabaseClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next();
    }

    const { data: userData, error: userError } = await client
      .from('users')
      .select('id, email, role, identity_verified, wallet_address, created_at')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      req.user = {
        id: user.id,
        email: user.email,
        role: 'user'
      };
    } else {
      req.user = userData;
    }

    return next();
  } catch (error) {
    logger.warn('Optional authentication failed', {
      requestId: req.requestId,
      path: req.path,
      error: error.message
    });

    req.user = null;
    return next();
  }
}

// ============================================================================
// EXPORT ALL MIDDLEWARE
// ============================================================================

export default {
  requireAuth,
  requireSuperadmin,
  requireAdmin,
  requireCompanySigner,
  requireAnySigner,
  requireSelfOrSuperadmin,
  requireWalletLinked,
  requireOwnWallet,
  optionalAuth,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};