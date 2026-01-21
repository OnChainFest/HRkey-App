// ============================================================================
// Authentication and Authorization Middleware
// ============================================================================
// Provides middleware for protecting routes and checking user roles/permissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Requires user to be authenticated
 * Extracts user from Authorization header and attaches to req.user
 */
export async function requireAuth(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'test') {
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

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Your session has expired or is invalid'
      });
    }

    // Fetch additional user data from users table
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('id, email, role, identity_verified, wallet_address')
      .eq('id', user.id)
      .single();

    if (userError) {
      logger.warn('Failed to fetch user data from users table', {
        requestId: req.requestId,
        userId: user.id,
        error: userError.message
      });
      // Use basic user data from auth if custom table query fails
      req.user = {
        id: user.id,
        email: user.email,
        role: 'user',
        identity_verified: false
      };
    } else {
      req.user = userData;
    }

    next();
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

  next();
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

  next();
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

    // Superadmins bypass signer check
    if (req.user.role === 'superadmin') {
      req.isSuperadmin = true;
      return next();
    }

    // Check if user is an active signer for this company
    const { data: signer, error } = await supabaseClient
      .from('company_signers')
      .select('id, role, is_active, company_id')
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

    // Attach signer info to request
    req.signer = signer;
    next();
  } catch (error) {
    logger.error('Company signer authorization failed', {
      requestId: req.requestId,
      userId: req.user?.id,
      companyId: req.params.companyId,
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

    // Superadmins bypass
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Check if user is a signer of any company
    const { data: signers, error } = await supabaseClient
      .from('company_signers')
      .select('id, company_id')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .limit(1);

    if (error || !signers || signers.length === 0) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be a company signer to access this resource'
      });
    }

    next();
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

/**
 * Requires user to be the resource owner or a superadmin
 * Factory function that returns middleware checking req.user.id === req.params[paramName]
 *
 * @param {string} paramName - The route parameter name containing the user ID (default: 'userId')
 * @param {Object} options - Optional configuration
 * @param {string} options.message - Custom error message for 403 response
 * @returns {Function} Express middleware
 *
 * Usage:
 *   app.get('/api/identity/status/:userId', requireAuth, requireSelfOrSuperadmin('userId'), controller)
 *   app.get('/api/user/:id/profile', requireAuth, requireSelfOrSuperadmin('id', { message: 'Custom message' }), controller)
 */
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

    next();
  };
}

/**
 * Factory function that creates middleware requiring a linked wallet address
 * Returns 403 if req.user.wallet_address is missing or null
 *
 * @param {Object} options - Optional configuration
 * @param {string} options.message - Custom error message for 403 response
 * @returns {Function} Express middleware
 *
 * Usage:
 *   app.post('/api/kpi-observations', requireAuth, requireWalletLinked(), controller)
 *   app.post('/api/endpoint', requireAuth, requireWalletLinked({ message: 'Custom message' }), controller)
 */
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

    next();
  };
}

// ============================================================================
// WALLET-SCOPED AUTHORIZATION MIDDLEWARE
// ============================================================================

/**
 * Factory function that creates middleware requiring user's wallet to match a target wallet.
 * Superadmins bypass this check.
 *
 * The target wallet is extracted from the request body using the specified field name.
 *
 * @param {string} walletField - The request body field containing the target wallet (default: 'subject_wallet')
 * @param {Object} options - Optional configuration
 * @param {string} options.noWalletMessage - Error message when user has no wallet
 * @param {string} options.mismatchMessage - Error message when wallets don't match
 * @returns {Function} Express middleware
 *
 * Usage:
 *   app.post('/api/hrkey-score', requireAuth, requireOwnWallet('subject_wallet'), controller)
 */
export function requireOwnWallet(walletField = 'subject_wallet', options = {}) {
  const noWalletMessage = options.noWalletMessage || 'You must have a linked wallet to access this resource';
  const mismatchMessage = options.mismatchMessage || 'You can only access your own wallet resources';

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Superadmins bypass wallet check
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Non-superadmins must have a linked wallet
    if (!req.user.wallet_address) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: noWalletMessage
      });
    }

    // Get target wallet from request body
    const targetWallet = req.body[walletField];

    // If target wallet is provided, it must match user's wallet (case-insensitive)
    if (targetWallet && req.user.wallet_address.toLowerCase() !== targetWallet.toLowerCase()) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: mismatchMessage
      });
    }

    next();
  };
}

// ============================================================================
// OPTIONAL AUTH (for public/semi-public endpoints)
// ============================================================================

/**
 * Optionally extracts user if token provided, but doesn't require it
 * Useful for endpoints that behave differently for authenticated users
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next();
    }

    const { data: userData } = await supabaseClient
      .from('users')
      .select('id, email, role, identity_verified')
      .eq('id', user.id)
      .single();

    req.user = userData || { id: user.id, email: user.email, role: 'user' };
    next();
  } catch (error) {
    logger.warn('Optional authentication failed', {
      requestId: req.requestId,
      path: req.path,
      error: error.message
    });
    req.user = null;
    next();
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
  optionalAuth
};
