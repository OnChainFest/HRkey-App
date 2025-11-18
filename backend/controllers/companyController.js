// ============================================================================
// Company Controller
// ============================================================================
// Handles company/organization management operations
// Includes creation, verification, and updates
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import {
  logCompanyCreation,
  logCompanyVerification,
  AuditActionTypes
} from '../utils/auditLogger.js';
import { sendCompanyVerificationNotification } from '../utils/emailService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// CREATE COMPANY
// ============================================================================

/**
 * POST /api/company/create
 * Create a new company
 *
 * Body: {
 *   name: string,
 *   taxId?: string,
 *   domainEmail?: string,
 *   logoUrl?: string,
 *   metadata?: object
 * }
 */
export async function createCompany(req, res) {
  try {
    const { name, taxId, domainEmail, logoUrl, metadata } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Company name is required'
      });
    }

    // Check if company with same name already exists for this user
    const { data: existing } = await supabaseClient
      .from('companies')
      .select('id')
      .eq('name', name)
      .eq('created_by', userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: 'Company already exists',
        message: 'You have already created a company with this name'
      });
    }

    // Create company record
    const companyData = {
      name,
      tax_id: taxId || null,
      domain_email: domainEmail || null,
      logo_url: logoUrl || null, // TODO Phase 2: Upload to Supabase Storage
      verified: false, // Requires superadmin verification
      metadata: metadata || {},
      created_by: userId,
      created_at: new Date().toISOString()
    };

    const { data: company, error: createError } = await supabaseClient
      .from('companies')
      .insert([companyData])
      .select()
      .single();

    if (createError) {
      console.error('Error creating company:', createError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to create company'
      });
    }

    // Automatically add creator as first signer (admin role)
    const { error: signerError } = await supabaseClient
      .from('company_signers')
      .insert([{
        company_id: company.id,
        user_id: userId,
        email: req.user.email,
        role: 'Company Admin',
        is_active: true,
        accepted_at: new Date().toISOString(),
        invited_by: userId
      }]);

    if (signerError) {
      console.warn('Warning: Could not add creator as signer:', signerError);
      // Don't fail the request - company was created successfully
    }

    // Log audit trail
    await logCompanyCreation(
      userId,
      company.id,
      {
        companyName: name,
        taxId: taxId || 'not provided',
        domainEmail: domainEmail || 'not provided'
      },
      req
    );

    return res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        taxId: company.tax_id,
        domainEmail: company.domain_email,
        logoUrl: company.logo_url,
        verified: company.verified,
        createdAt: company.created_at
      },
      message: 'Company created successfully. Awaiting verification.'
    });
  } catch (error) {
    console.error('Create company error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating the company'
    });
  }
}

// ============================================================================
// GET COMPANY
// ============================================================================

/**
 * GET /api/company/:companyId
 * Get company details
 * Requires: User must be a signer of this company or superadmin
 */
export async function getCompany(req, res) {
  try {
    const { companyId } = req.params;

    const { data: company, error } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    // Get signers count
    const { count: signersCount } = await supabaseClient
      .from('company_signers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true);

    // Get active signers count
    const { count: activeSignersCount } = await supabaseClient
      .from('company_signers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('user_id', 'is', null); // Accepted invitations

    return res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        taxId: company.tax_id,
        domainEmail: company.domain_email,
        logoUrl: company.logo_url,
        verified: company.verified,
        verifiedAt: company.verified_at,
        verifiedBy: company.verified_by,
        metadata: company.metadata,
        createdBy: company.created_by,
        createdAt: company.created_at,
        updatedAt: company.updated_at
      },
      stats: {
        totalSigners: signersCount || 0,
        activeSigners: activeSignersCount || 0
      }
    });
  } catch (error) {
    console.error('Get company error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// UPDATE COMPANY
// ============================================================================

/**
 * PATCH /api/company/:companyId
 * Update company information
 * Requires: User must be an active signer of this company
 *
 * Body: {
 *   name?: string,
 *   taxId?: string,
 *   domainEmail?: string,
 *   logoUrl?: string,
 *   metadata?: object
 * }
 */
export async function updateCompany(req, res) {
  try {
    const { companyId } = req.params;
    const { name, taxId, domainEmail, logoUrl, metadata } = req.body;

    // Build update object (only include provided fields)
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (taxId !== undefined) updates.tax_id = taxId;
    if (domainEmail !== undefined) updates.domain_email = domainEmail;
    if (logoUrl !== undefined) updates.logo_url = logoUrl; // TODO Phase 2: Upload to Supabase Storage
    if (metadata !== undefined) updates.metadata = metadata;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Please provide at least one field to update'
      });
    }

    // Update company
    const { data: updatedCompany, error: updateError } = await supabaseClient
      .from('companies')
      .update(updates)
      .eq('id', companyId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating company:', updateError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to update company'
      });
    }

    // Log audit trail
    await supabaseClient.from('audit_logs').insert([{
      user_id: req.user.id,
      company_id: companyId,
      signer_id: req.signer?.id || null,
      action_type: AuditActionTypes.UPDATE_COMPANY,
      resource_type: 'company',
      resource_id: companyId,
      details: { updates },
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    }]);

    return res.json({
      success: true,
      company: updatedCompany,
      message: 'Company updated successfully'
    });
  } catch (error) {
    console.error('Update company error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// VERIFY COMPANY (SUPERADMIN ONLY)
// ============================================================================

/**
 * POST /api/company/:companyId/verify
 * Verify or unverify a company
 * Requires: Superadmin role
 *
 * Body: {
 *   verified: boolean,
 *   notes?: string
 * }
 */
export async function verifyCompany(req, res) {
  try {
    const { companyId } = req.params;
    const { verified, notes } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please specify verified as true or false'
      });
    }

    // Get company details
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return res.status(404).json({
        error: 'Company not found'
      });
    }

    // Update verification status
    const { data: updatedCompany, error: updateError } = await supabaseClient
      .from('companies')
      .update({
        verified,
        verified_at: verified ? new Date().toISOString() : null,
        verified_by: verified ? req.user.id : null
      })
      .eq('id', companyId)
      .select()
      .single();

    if (updateError) {
      console.error('Error verifying company:', updateError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to update verification status'
      });
    }

    // Log audit trail
    await logCompanyVerification(
      req.user.id,
      companyId,
      verified,
      {
        companyName: company.name,
        notes: notes || 'No notes provided',
        previousStatus: company.verified
      },
      req
    );

    // Send email notification to company creator if verified
    if (verified && company.created_by) {
      try {
        const { data: creator } = await supabaseClient
          .from('users')
          .select('email')
          .eq('id', company.created_by)
          .single();

        if (creator?.email) {
          await sendCompanyVerificationNotification({
            recipientEmail: creator.email,
            companyName: company.name
          });
        }
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
        // Don't fail the request if email fails
      }
    }

    return res.json({
      success: true,
      company: updatedCompany,
      message: `Company ${verified ? 'verified' : 'unverified'} successfully`
    });
  } catch (error) {
    console.error('Verify company error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// GET USER'S COMPANIES
// ============================================================================

/**
 * GET /api/companies/my
 * Get all companies where user is a signer
 */
export async function getMyCompanies(req, res) {
  try {
    const userId = req.user.id;

    // Get companies where user is an active signer
    const { data: signerRecords, error } = await supabaseClient
      .from('company_signers')
      .select(`
        company_id,
        role,
        is_active,
        accepted_at,
        companies (*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching user companies:', error);
      return res.status(500).json({
        error: 'Database error'
      });
    }

    const companies = signerRecords.map(record => ({
      ...record.companies,
      myRole: record.role,
      joinedAt: record.accepted_at
    }));

    return res.json({
      success: true,
      companies
    });
  } catch (error) {
    console.error('Get my companies error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

// ============================================================================
// EXPORT CONTROLLER METHODS
// ============================================================================

export default {
  createCompany,
  getCompany,
  updateCompany,
  verifyCompany,
  getMyCompanies
};
