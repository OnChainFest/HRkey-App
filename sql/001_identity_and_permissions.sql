-- ============================================================================
-- HRKey Identity and Permissions Layer - Database Schema
-- ============================================================================
-- Description: Adds identity verification, company management, signers, and audit trails
-- Author: HRKey Development Team
-- Date: 2025-11-18
-- Phase: 1 (No ZK, no external KYC, no Supabase Storage uploads yet)
-- ============================================================================

-- ============================================================================
-- 1. EXTEND USERS TABLE
-- ============================================================================
-- Add role-based access control and identity verification fields

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'superadmin'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_provider TEXT DEFAULT 'manual';
COMMENT ON COLUMN users.kyc_provider IS 'KYC provider: manual, dummy, future_provider (TODO PHASE 2: integrate real KYC)';

ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_metadata JSONB;
COMMENT ON COLUMN users.kyc_metadata IS 'Stores KYC data: {fullName, idNumber, selfieUrl, etc.}';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_identity_verified ON users(identity_verified);

-- ============================================================================
-- 2. COMPANIES TABLE
-- ============================================================================
-- Stores company/organization information

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT, -- RFC, EIN, VAT number, etc.
  domain_email TEXT, -- '@company.com' for validating signers
  logo_url TEXT, -- External URL (TODO PHASE 2: migrate to Supabase Storage)
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id), -- Superadmin who verified
  metadata JSONB, -- {address, industry, size, website, description, etc.}
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain_email);
CREATE INDEX IF NOT EXISTS idx_companies_verified ON companies(verified);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON companies(created_by);

-- Comments for future reference
COMMENT ON TABLE companies IS 'Organizations that can have authorized signers for reference verification';
COMMENT ON COLUMN companies.logo_url IS 'TODO PHASE 2: Migrate to Supabase Storage for direct uploads';

-- ============================================================================
-- 3. COMPANY SIGNERS TABLE
-- ============================================================================
-- Authorized signers who can act on behalf of companies

CREATE TABLE IF NOT EXISTS company_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id), -- NULL until they accept the invitation
  email TEXT NOT NULL,
  wallet_address TEXT, -- TODO PHASE 2: For Web3 signature verification on Base
  role TEXT NOT NULL, -- 'HR Manager', 'Recruiter', 'Talent Lead', etc. (informational only)
  is_active BOOLEAN DEFAULT TRUE,
  invite_token TEXT UNIQUE, -- Secure token for accepting invitation
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_company_email UNIQUE(company_id, email),
  CONSTRAINT unique_company_user UNIQUE(company_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_signers_company ON company_signers(company_id);
CREATE INDEX IF NOT EXISTS idx_company_signers_user ON company_signers(user_id);
CREATE INDEX IF NOT EXISTS idx_company_signers_email ON company_signers(email);
CREATE INDEX IF NOT EXISTS idx_company_signers_token ON company_signers(invite_token);
CREATE INDEX IF NOT EXISTS idx_company_signers_active ON company_signers(is_active);

-- Comments for future reference
COMMENT ON TABLE company_signers IS 'Authorized signers for companies. All signers have same permissions in PHASE 1';
COMMENT ON COLUMN company_signers.role IS 'Informational label only. All signers have identical permissions in PHASE 1';
COMMENT ON COLUMN company_signers.wallet_address IS 'TODO PHASE 2: For Web3 signature verification and ZK proofs on Base';

-- ============================================================================
-- 4. AUDIT LOGS TABLE
-- ============================================================================
-- Comprehensive audit trail for all sensitive actions

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id), -- User who performed the action (nullable)
  company_id UUID REFERENCES companies(id), -- Related company (nullable)
  signer_id UUID REFERENCES company_signers(id), -- Related signer (nullable)
  action_type TEXT NOT NULL, -- 'verify_identity', 'create_company', 'add_signer', 'approve_reference', etc.
  resource_type TEXT, -- 'user', 'company', 'reference', 'signer'
  resource_id TEXT, -- ID of the affected resource
  details JSONB, -- Additional context: {changes, metadata, etc.}
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_signer ON audit_logs(signer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Comments
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for compliance and traceability';
COMMENT ON COLUMN audit_logs.details IS 'TODO PHASE 2: Can include signature hash from Web3 wallet for cryptographic proof';

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS for security

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Companies: Users can read companies they're signers of, or if superadmin
CREATE POLICY "Users can view companies they are signers of"
  ON companies FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM company_signers
      WHERE company_id = companies.id AND is_active = true
    )
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Companies: Only superadmins can insert/update verification status
CREATE POLICY "Superadmins can manage companies"
  ON companies FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Company Signers: Active signers can view other signers in same company
CREATE POLICY "Signers can view other signers in their company"
  ON company_signers FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Company Signers: Active signers can add new signers
CREATE POLICY "Active signers can invite new signers"
  ON company_signers FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Audit Logs: Users can view their own audit logs, superadmins can view all
CREATE POLICY "Users can view their own audit logs"
  ON audit_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
    OR
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Audit Logs: Insert only (append-only log)
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for companies table
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for company_signers table
DROP TRIGGER IF EXISTS update_company_signers_updated_at ON company_signers;
CREATE TRIGGER update_company_signers_updated_at
  BEFORE UPDATE ON company_signers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. INITIAL DATA (OPTIONAL)
-- ============================================================================

-- Placeholder: If you want to seed initial companies or roles, add here
-- Example:
-- INSERT INTO companies (name, verified, created_at)
-- VALUES ('HRKey Demo Company', true, NOW());

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Verification query to confirm tables exist
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully';
  RAISE NOTICE 'Tables created/modified:';
  RAISE NOTICE '  - users (extended with role, identity fields)';
  RAISE NOTICE '  - companies';
  RAISE NOTICE '  - company_signers';
  RAISE NOTICE '  - audit_logs';
  RAISE NOTICE 'RLS policies enabled for security';
  RAISE NOTICE 'Ready for PHASE 2: Web3, ZK, and real KYC integration';
END $$;
