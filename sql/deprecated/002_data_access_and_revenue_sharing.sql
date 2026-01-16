-- ============================================================================
-- HRKey Data Access & Revenue Sharing System - Database Schema
-- ============================================================================
-- Description: Implements "pay per data query with revenue sharing" system
-- Author: HRKey Development Team
-- Date: 2025-11-19
-- Phase: 1 - Web2 ledger with Web3 preparation
-- ============================================================================

-- ============================================================================
-- 1. DATA ACCESS REQUESTS TABLE
-- ============================================================================
-- Stores requests from companies to access user data/references
-- Requires user consent before granting access

CREATE TABLE IF NOT EXISTS data_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request details
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id), -- Company signer who made the request
  target_user_id UUID NOT NULL REFERENCES users(id), -- User whose data is being requested (owner_id)
  reference_id UUID REFERENCES references(id), -- Optional: specific reference requested

  -- Status and workflow
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),

  -- Pricing
  price_amount DECIMAL(10, 2) NOT NULL, -- Amount in USD (or configured currency)
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Request metadata
  requested_data_type TEXT DEFAULT 'reference', -- 'reference', 'profile', 'full_data'
  request_reason TEXT, -- Optional: Why the company wants to access this data
  metadata JSONB, -- Additional context

  -- Consent tracking
  consent_given_at TIMESTAMPTZ,
  consent_wallet_signature TEXT, -- Signature from user's wallet
  consent_message TEXT, -- Message that was signed

  -- Payment tracking
  payment_status TEXT DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED')),
  payment_provider TEXT DEFAULT 'internal_ledger', -- 'stripe', 'internal_ledger', 'blockchain'
  payment_tx_id TEXT, -- Stripe payment intent ID or blockchain tx hash
  payment_completed_at TIMESTAMPTZ,

  -- Access tracking
  data_accessed BOOLEAN DEFAULT FALSE,
  data_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0, -- How many times the data was accessed

  -- Timestamps
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- Request expires after 7 days
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_data_access_company ON data_access_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_data_access_target_user ON data_access_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_reference ON data_access_requests(reference_id);
CREATE INDEX IF NOT EXISTS idx_data_access_status ON data_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_access_payment_status ON data_access_requests(payment_status);
CREATE INDEX IF NOT EXISTS idx_data_access_created ON data_access_requests(created_at DESC);

-- Comments
COMMENT ON TABLE data_access_requests IS 'Requests from companies to access candidate data with consent workflow';
COMMENT ON COLUMN data_access_requests.consent_wallet_signature IS 'User wallet signature authorizing data sharing';
COMMENT ON COLUMN data_access_requests.price_amount IS 'Price per query - configurable per data type';

-- ============================================================================
-- 2. REVENUE SHARES TABLE
-- ============================================================================
-- Tracks revenue distribution from each data access request
-- Splits payment between platform, profile owner, and reference creator

CREATE TABLE IF NOT EXISTS revenue_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked request
  data_access_request_id UUID NOT NULL REFERENCES data_access_requests(id) ON DELETE CASCADE,

  -- Transaction details
  company_id UUID NOT NULL REFERENCES companies(id),
  target_user_id UUID NOT NULL REFERENCES users(id), -- Profile owner
  reference_id UUID REFERENCES references(id),

  -- Total amount
  total_amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Split amounts (should sum to total_amount)
  platform_amount DECIMAL(10, 2) NOT NULL,
  platform_percent DECIMAL(5, 2) NOT NULL, -- e.g., 40.00 for 40%

  user_amount DECIMAL(10, 2) NOT NULL,
  user_percent DECIMAL(5, 2) NOT NULL, -- e.g., 40.00 for 40%

  ref_creator_amount DECIMAL(10, 2) NOT NULL,
  ref_creator_percent DECIMAL(5, 2) NOT NULL, -- e.g., 20.00 for 20%
  ref_creator_email TEXT, -- Email of the reference creator (for payout)

  -- Payout status
  status TEXT NOT NULL DEFAULT 'PENDING_PAYOUT'
    CHECK (status IN ('PENDING_PAYOUT', 'PARTIALLY_PAID', 'PAID', 'FAILED')),

  -- Individual payout tracking
  platform_paid BOOLEAN DEFAULT FALSE,
  platform_paid_at TIMESTAMPTZ,
  platform_payout_method TEXT, -- 'internal', 'stripe', 'blockchain'
  platform_payout_tx_id TEXT,

  user_paid BOOLEAN DEFAULT FALSE,
  user_paid_at TIMESTAMPTZ,
  user_payout_method TEXT,
  user_payout_tx_id TEXT,

  ref_creator_paid BOOLEAN DEFAULT FALSE,
  ref_creator_paid_at TIMESTAMPTZ,
  ref_creator_payout_method TEXT,
  ref_creator_payout_tx_id TEXT,

  -- Metadata
  metadata JSONB, -- Additional payout details

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_revenue_shares_request ON revenue_shares(data_access_request_id);
CREATE INDEX IF NOT EXISTS idx_revenue_shares_company ON revenue_shares(company_id);
CREATE INDEX IF NOT EXISTS idx_revenue_shares_target_user ON revenue_shares(target_user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_shares_reference ON revenue_shares(reference_id);
CREATE INDEX IF NOT EXISTS idx_revenue_shares_status ON revenue_shares(status);
CREATE INDEX IF NOT EXISTS idx_revenue_shares_user_unpaid ON revenue_shares(target_user_id, user_paid)
  WHERE user_paid = FALSE;
CREATE INDEX IF NOT EXISTS idx_revenue_shares_creator_email ON revenue_shares(ref_creator_email);

-- Comments
COMMENT ON TABLE revenue_shares IS 'Revenue distribution ledger for data access payments';
COMMENT ON COLUMN revenue_shares.platform_amount IS 'HRKey platform fee';
COMMENT ON COLUMN revenue_shares.user_amount IS 'Amount owed to profile owner';
COMMENT ON COLUMN revenue_shares.ref_creator_amount IS 'Amount owed to reference creator';

-- ============================================================================
-- 3. USER BALANCE LEDGER TABLE (for internal accounting)
-- ============================================================================
-- Tracks cumulative balance for each user from revenue sharing
-- This is an internal ledger before actual payouts

CREATE TABLE IF NOT EXISTS user_balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User details
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL, -- Can also track by email (for ref creators who aren't users yet)

  -- Balance tracking
  total_earned DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total_paid_out DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  current_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Minimum payout threshold
  min_payout_threshold DECIMAL(10, 2) DEFAULT 50.00, -- e.g., $50 minimum before payout

  -- Payout preferences
  preferred_payout_method TEXT DEFAULT 'wallet', -- 'wallet', 'stripe', 'bank_transfer'
  wallet_address TEXT, -- For blockchain payouts
  stripe_account_id TEXT, -- For Stripe Connect payouts

  -- Metadata
  metadata JSONB,

  -- Timestamps
  last_payout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness
  UNIQUE(user_id),
  UNIQUE(user_email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_balance_user ON user_balance_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balance_email ON user_balance_ledger(user_email);
CREATE INDEX IF NOT EXISTS idx_user_balance_current ON user_balance_ledger(current_balance DESC);

-- Comments
COMMENT ON TABLE user_balance_ledger IS 'Internal accounting ledger for user earnings';
COMMENT ON COLUMN user_balance_ledger.current_balance IS 'Available balance ready for payout';

-- ============================================================================
-- 4. TRANSACTION LOG TABLE (for audit trail)
-- ============================================================================
-- Detailed transaction log for all revenue operations

CREATE TABLE IF NOT EXISTS revenue_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction details
  revenue_share_id UUID REFERENCES revenue_shares(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id),
  user_email TEXT,

  -- Transaction type
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'PAYOUT', 'REFUND', 'ADJUSTMENT')),

  -- Amount
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Description
  description TEXT,

  -- Balance snapshot
  balance_before DECIMAL(10, 2),
  balance_after DECIMAL(10, 2),

  -- Related entities
  company_id UUID REFERENCES companies(id),
  reference_id UUID REFERENCES references(id),

  -- External reference
  external_tx_id TEXT, -- Stripe payment intent, blockchain tx hash, etc.
  payment_provider TEXT,

  -- Metadata
  metadata JSONB,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_revenue_tx_user ON revenue_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tx_email ON revenue_transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_revenue_tx_revenue_share ON revenue_transactions(revenue_share_id);
CREATE INDEX IF NOT EXISTS idx_revenue_tx_type ON revenue_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_revenue_tx_created ON revenue_transactions(created_at DESC);

-- Comments
COMMENT ON TABLE revenue_transactions IS 'Immutable transaction log for all revenue operations';

-- ============================================================================
-- 5. PRICING CONFIGURATION TABLE (for flexible pricing)
-- ============================================================================
-- Allows configuring different prices for different data types

CREATE TABLE IF NOT EXISTS data_access_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pricing details
  data_type TEXT NOT NULL UNIQUE, -- 'reference', 'profile', 'full_data', etc.
  price_amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Revenue split configuration (percentages)
  platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 40.00,
  user_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 40.00,
  ref_creator_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 20.00,

  -- Validation: percentages should sum to 100
  CONSTRAINT valid_percentages CHECK (
    platform_fee_percent + user_fee_percent + ref_creator_fee_percent = 100.00
  ),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Description
  description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pricing_data_type ON data_access_pricing(data_type);
CREATE INDEX IF NOT EXISTS idx_pricing_active ON data_access_pricing(is_active);

-- Comments
COMMENT ON TABLE data_access_pricing IS 'Configurable pricing and revenue split for different data types';

-- Insert default pricing
INSERT INTO data_access_pricing (data_type, price_amount, currency, platform_fee_percent, user_fee_percent, ref_creator_fee_percent, description)
VALUES
  ('reference', 10.00, 'USD', 40.00, 40.00, 20.00, 'Single reference access'),
  ('profile', 25.00, 'USD', 40.00, 50.00, 10.00, 'Full profile access (all references)'),
  ('full_data', 50.00, 'USD', 40.00, 45.00, 15.00, 'Complete data access (profile + references + extra data)')
ON CONFLICT (data_type) DO NOTHING;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE data_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_pricing ENABLE ROW LEVEL SECURITY;

-- Data Access Requests Policies

-- Users can view requests for their own data
CREATE POLICY "Users can view data access requests for their data"
  ON data_access_requests FOR SELECT
  USING (
    target_user_id = auth.uid()
    OR
    requested_by_user_id = auth.uid()
    OR
    requested_by_user_id IN (
      SELECT user_id FROM company_signers
      WHERE company_id = data_access_requests.company_id AND is_active = true
    )
    OR
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- Companies can create requests
CREATE POLICY "Company signers can create data access requests"
  ON data_access_requests FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Users can update (approve/reject) requests for their own data
CREATE POLICY "Users can update their own data access requests"
  ON data_access_requests FOR UPDATE
  USING (target_user_id = auth.uid());

-- Revenue Shares Policies

-- Users can view their own revenue shares
CREATE POLICY "Users can view their own revenue shares"
  ON revenue_shares FOR SELECT
  USING (
    target_user_id = auth.uid()
    OR
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- System can insert revenue shares
CREATE POLICY "System can insert revenue shares"
  ON revenue_shares FOR INSERT
  WITH CHECK (true);

-- User Balance Ledger Policies

-- Users can view their own balance
CREATE POLICY "Users can view their own balance"
  ON user_balance_ledger FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- System can manage balances
CREATE POLICY "System can manage user balances"
  ON user_balance_ledger FOR ALL
  USING (true);

-- Revenue Transactions Policies

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON revenue_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- System can insert transactions (append-only)
CREATE POLICY "System can insert transactions"
  ON revenue_transactions FOR INSERT
  WITH CHECK (true);

-- Pricing Policies (public read)

CREATE POLICY "Everyone can view active pricing"
  ON data_access_pricing FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmins can manage pricing"
  ON data_access_pricing FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- ============================================================================
-- 7. HELPER FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_data_access_requests_updated_at ON data_access_requests;
CREATE TRIGGER update_data_access_requests_updated_at
  BEFORE UPDATE ON data_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_revenue_shares_updated_at ON revenue_shares;
CREATE TRIGGER update_revenue_shares_updated_at
  BEFORE UPDATE ON revenue_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_balance_ledger_updated_at ON user_balance_ledger;
CREATE TRIGGER update_user_balance_ledger_updated_at
  BEFORE UPDATE ON user_balance_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_data_access_pricing_updated_at ON data_access_pricing;
CREATE TRIGGER update_data_access_pricing_updated_at
  BEFORE UPDATE ON data_access_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to check if request has expired
CREATE OR REPLACE FUNCTION check_data_access_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING' AND NEW.expires_at < NOW() THEN
    NEW.status = 'EXPIRED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_expiration_on_read ON data_access_requests;
CREATE TRIGGER check_expiration_on_read
  BEFORE UPDATE ON data_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_data_access_expiration();

-- ============================================================================
-- 8. HELPER VIEWS (for easy querying)
-- ============================================================================

-- View for pending requests by user
CREATE OR REPLACE VIEW user_pending_data_requests AS
SELECT
  dar.id,
  dar.target_user_id,
  dar.company_id,
  c.name as company_name,
  c.verified as company_verified,
  dar.reference_id,
  r.referrer_name,
  dar.price_amount,
  dar.currency,
  dar.status,
  dar.requested_data_type,
  dar.request_reason,
  dar.created_at,
  dar.expires_at
FROM data_access_requests dar
LEFT JOIN companies c ON dar.company_id = c.id
LEFT JOIN references r ON dar.reference_id = r.id
WHERE dar.status = 'PENDING'
  AND dar.expires_at > NOW();

-- View for user earnings summary
CREATE OR REPLACE VIEW user_earnings_summary AS
SELECT
  u.id as user_id,
  u.email,
  COALESCE(ubl.total_earned, 0) as total_earned,
  COALESCE(ubl.total_paid_out, 0) as total_paid_out,
  COALESCE(ubl.current_balance, 0) as current_balance,
  COALESCE(ubl.currency, 'USD') as currency,
  COUNT(DISTINCT rs.id) as total_transactions,
  ubl.last_payout_at,
  ubl.preferred_payout_method,
  ubl.wallet_address
FROM users u
LEFT JOIN user_balance_ledger ubl ON u.id = ubl.user_id
LEFT JOIN revenue_shares rs ON u.id = rs.target_user_id
GROUP BY u.id, u.email, ubl.total_earned, ubl.total_paid_out, ubl.current_balance,
         ubl.currency, ubl.last_payout_at, ubl.preferred_payout_method, ubl.wallet_address;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Data Access & Revenue Sharing migration completed successfully';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - data_access_requests';
  RAISE NOTICE '  - revenue_shares';
  RAISE NOTICE '  - user_balance_ledger';
  RAISE NOTICE '  - revenue_transactions';
  RAISE NOTICE '  - data_access_pricing (with default pricing)';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - user_pending_data_requests';
  RAISE NOTICE '  - user_earnings_summary';
  RAISE NOTICE 'RLS policies enabled for security';
  RAISE NOTICE 'Ready for implementation!';
END $$;
