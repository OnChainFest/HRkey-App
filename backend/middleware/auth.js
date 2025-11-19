// ============================================================================
// Authentication and Authorization Middleware
// ============================================================================
// Provides middleware for protecting routes and checking user roles/permissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';

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
      console.error('Error fetching user data:', userError);
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
    console.error('Auth middleware error:', error);
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
    console.error('Company signer middleware error:', error);
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
    console.error('Any signer middleware error:', error);
    return res.status(500).json({
      error: 'Authorization error'
    });
  }
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
    console.error('Optional auth error:', error);
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
  optionalAuth
};
