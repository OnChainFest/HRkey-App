-- ============================================
-- HRKey Payment Rail Database Schema
-- ============================================
--
-- This migration creates all tables needed for the Web3 payment infrastructure:
-- - payments: Track all RLUSD payments for references
-- - payment_splits: Record how each payment was split among recipients
-- - hrk_stakes: Track HRK token staking positions
-- - cross_border_settlements: Record XRP bridge transactions
-- - failed_payments: Log failed payments for retry/investigation
-- - analytics_events: Track payment-related events
--
-- Run this in Supabase SQL Editor or via migration tool
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PAYMENTS TABLE
-- ============================================
-- Main table for tracking all reference payment transactions
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT ('pay_' || encode(gen_random_bytes(16), 'hex')),
  reference_id UUID NOT NULL REFERENCES references(id) ON DELETE CASCADE,
  payer_address TEXT NOT NULL,
  payer_email TEXT,
  provider_address TEXT NOT NULL,
  candidate_address TEXT NOT NULL,

  -- Amounts
  total_amount TEXT NOT NULL, -- Wei amount (RLUSD has 6 decimals)
  total_amount_usd DECIMAL(12, 2) NOT NULL,

  -- Transaction details
  tx_hash TEXT UNIQUE,
  block_number BIGINT,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'expired', 'failed')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Indexes
  CONSTRAINT valid_amount CHECK (total_amount_usd > 0)
);

-- Indexes for performance
CREATE INDEX idx_payments_reference_id ON payments(reference_id);
CREATE INDEX idx_payments_payer_address ON payments(payer_address);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);

-- Comments
COMMENT ON TABLE payments IS 'Tracks all RLUSD payments for professional references';
COMMENT ON COLUMN payments.total_amount IS 'Payment amount in wei (RLUSD has 6 decimals)';
COMMENT ON COLUMN payments.status IS 'Payment status: pending (awaiting confirmation), completed, expired, failed';

-- ============================================
-- PAYMENT_SPLITS TABLE
-- ============================================
-- Records how each payment was distributed among recipients
-- ============================================

CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,

  -- Recipient info
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('provider', 'candidate', 'treasury', 'staking_pool')),
  recipient_address TEXT NOT NULL,

  -- Amount details
  amount TEXT NOT NULL, -- Wei amount
  amount_usd DECIMAL(12, 2) NOT NULL,
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_split_amount CHECK (amount_usd > 0)
);

-- Indexes
CREATE INDEX idx_payment_splits_payment_id ON payment_splits(payment_id);
CREATE INDEX idx_payment_splits_recipient ON payment_splits(recipient_address);
CREATE INDEX idx_payment_splits_type ON payment_splits(recipient_type);

-- Comments
COMMENT ON TABLE payment_splits IS 'Records payment distribution: 60% provider, 20% candidate, 15% treasury, 5% staking';
COMMENT ON COLUMN payment_splits.recipient_type IS 'Type of recipient: provider, candidate, treasury, or staking_pool';
COMMENT ON COLUMN payment_splits.percentage IS 'Percentage of total payment (out of 100)';

-- ============================================
-- HRK_STAKES TABLE
-- ============================================
-- Tracks HRK token staking positions and rewards
-- ============================================

CREATE TABLE IF NOT EXISTS hrk_stakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,

  -- Stake details
  amount TEXT NOT NULL, -- Wei amount (HRK has 18 decimals)
  amount_hrk DECIMAL(18, 4) NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
  lockup_months INTEGER NOT NULL CHECK (lockup_months >= 1 AND lockup_months <= 48),

  -- On-chain references
  stake_tx_hash TEXT,
  unstake_tx_hash TEXT,

  -- Rewards
  rewards_earned_rlusd DECIMAL(12, 2) DEFAULT 0,
  rewards_claimed_rlusd DECIMAL(12, 2) DEFAULT 0,
  last_reward_claim_at TIMESTAMP WITH TIME ZONE,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'unstaking', 'unstaked', 'slashed')),

  -- Timestamps
  staked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unlock_at TIMESTAMP WITH TIME ZONE NOT NULL,
  unstake_requested_at TIMESTAMP WITH TIME ZONE,
  unstaked_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_stake_amount CHECK (amount_hrk > 0),
  CONSTRAINT valid_unlock CHECK (unlock_at > staked_at)
);

-- Indexes
CREATE INDEX idx_hrk_stakes_user_id ON hrk_stakes(user_id);
CREATE INDEX idx_hrk_stakes_wallet ON hrk_stakes(wallet_address);
CREATE INDEX idx_hrk_stakes_status ON hrk_stakes(status);
CREATE INDEX idx_hrk_stakes_tier ON hrk_stakes(tier);

-- Comments
COMMENT ON TABLE hrk_stakes IS 'Tracks HRK token staking positions and RLUSD rewards';
COMMENT ON COLUMN hrk_stakes.tier IS 'Staking tier: Bronze (100 HRK), Silver (500), Gold (2000), Platinum (10000)';
COMMENT ON COLUMN hrk_stakes.rewards_earned_rlusd IS 'Total RLUSD rewards earned from 5% payment pool';

-- ============================================
-- CROSS_BORDER_SETTLEMENTS TABLE
-- ============================================
-- Records XRP bridge transactions for international payments
-- ============================================

CREATE TABLE IF NOT EXISTS cross_border_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id TEXT UNIQUE NOT NULL,
  reference_id UUID REFERENCES references(id) ON DELETE SET NULL,

  -- Location
  from_country TEXT NOT NULL,
  to_country TEXT NOT NULL,

  -- Amounts
  amount_rlusd DECIMAL(12, 2) NOT NULL,
  amount_xrp DECIMAL(18, 6),

  -- Transaction hashes
  lock_tx_hash TEXT,      -- Base: Lock RLUSD
  xrpl_tx_hash TEXT,      -- XRPL: Transfer XRP
  release_tx_hash TEXT,   -- Base: Release RLUSD

  -- Performance metrics
  total_time_seconds INTEGER,
  fee_usd DECIMAL(8, 4),

  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'failed_refunded')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_countries CHECK (from_country != to_country),
  CONSTRAINT valid_settlement_amount CHECK (amount_rlusd > 0)
);

-- Indexes
CREATE INDEX idx_settlements_reference_id ON cross_border_settlements(reference_id);
CREATE INDEX idx_settlements_status ON cross_border_settlements(status);
CREATE INDEX idx_settlements_countries ON cross_border_settlements(from_country, to_country);
CREATE INDEX idx_settlements_created_at ON cross_border_settlements(created_at DESC);

-- Comments
COMMENT ON TABLE cross_border_settlements IS 'XRP bridge transactions for cross-border RLUSD payments';
COMMENT ON COLUMN cross_border_settlements.xrpl_tx_hash IS 'XRP Ledger transaction hash for the XRP transfer';
COMMENT ON COLUMN cross_border_settlements.total_time_seconds IS 'Total settlement time (should be <10 seconds)';

-- ============================================
-- FAILED_PAYMENTS TABLE
-- ============================================
-- Logs payment processing failures for investigation and retry
-- ============================================

CREATE TABLE IF NOT EXISTS failed_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event data (JSONB for flexibility)
  event_data JSONB NOT NULL,

  -- Error details
  error_message TEXT NOT NULL,
  error_stack TEXT,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  max_retries INTEGER DEFAULT 5,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending_retry', 'retrying', 'failed_permanent', 'resolved')),

  -- Resolution
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Indexes
CREATE INDEX idx_failed_payments_status ON failed_payments(status);
CREATE INDEX idx_failed_payments_created_at ON failed_payments(created_at DESC);
CREATE INDEX idx_failed_payments_retry ON failed_payments(retry_count, last_retry_at);

-- Comments
COMMENT ON TABLE failed_payments IS 'Logs failed payment events for investigation and automatic retry';
COMMENT ON COLUMN failed_payments.event_data IS 'Full event data from blockchain for debugging';

-- ============================================
-- ANALYTICS_EVENTS TABLE
-- ============================================
-- Tracks payment-related analytics events
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'payment_processed',
    'payment_created',
    'payment_expired',
    'stake_created',
    'stake_unstaked',
    'rewards_claimed',
    'cross_border_settlement'
  )),

  -- Event data
  event_data JSONB NOT NULL,

  -- User context (optional)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_data ON analytics_events USING GIN (event_data);

-- Comments
COMMENT ON TABLE analytics_events IS 'Payment and staking analytics events for dashboards and reporting';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS for data protection
-- ============================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrk_stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_border_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Payments: Users can view payments they're involved in
CREATE POLICY "Users can view own payments" ON payments
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE wallet_address IN (payer_address, provider_address, candidate_address)
    )
  );

-- Payment Splits: Users can view splits for payments they're involved in
CREATE POLICY "Users can view own payment splits" ON payment_splits
  FOR SELECT
  USING (
    payment_id IN (
      SELECT id FROM payments
      WHERE auth.uid() IN (
        SELECT id FROM users WHERE wallet_address IN (payer_address, provider_address, candidate_address)
      )
    )
  );

-- HRK Stakes: Users can view their own stakes
CREATE POLICY "Users can view own stakes" ON hrk_stakes
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own stakes
CREATE POLICY "Users can create stakes" ON hrk_stakes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Cross-border Settlements: Users can view settlements for their references
CREATE POLICY "Users can view own settlements" ON cross_border_settlements
  FOR SELECT
  USING (
    reference_id IN (
      SELECT id FROM references WHERE candidate_id = auth.uid() OR evaluator_id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate payment split amounts
CREATE OR REPLACE FUNCTION calculate_payment_splits(total_amount DECIMAL)
RETURNS TABLE (
  recipient_type TEXT,
  amount DECIMAL,
  percentage INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'provider'::TEXT, total_amount * 0.60, 60
  UNION ALL
  SELECT 'candidate'::TEXT, total_amount * 0.20, 20
  UNION ALL
  SELECT 'treasury'::TEXT, total_amount * 0.15, 15
  UNION ALL
  SELECT 'staking_pool'::TEXT, total_amount * 0.05, 5;
END;
$$ LANGUAGE plpgsql;

-- Function to get user payment statistics
CREATE OR REPLACE FUNCTION get_user_payment_stats(user_wallet TEXT)
RETURNS TABLE (
  total_received DECIMAL,
  total_paid DECIMAL,
  payment_count BIGINT,
  avg_payment DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(ps.amount_usd), 0) as total_received,
    COALESCE(SUM(p.total_amount_usd) FILTER (WHERE p.payer_address = user_wallet), 0) as total_paid,
    COUNT(DISTINCT p.id) as payment_count,
    COALESCE(AVG(ps.amount_usd), 0) as avg_payment
  FROM payment_splits ps
  JOIN payments p ON ps.payment_id = p.id
  WHERE ps.recipient_address = user_wallet
    AND p.status = 'completed';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS FOR CONVENIENCE
-- ============================================

-- View: Payment summaries with split details
CREATE OR REPLACE VIEW payment_summaries AS
SELECT
  p.id,
  p.reference_id,
  p.payer_address,
  p.total_amount_usd,
  p.tx_hash,
  p.status,
  p.created_at,
  p.completed_at,
  json_agg(
    json_build_object(
      'type', ps.recipient_type,
      'address', ps.recipient_address,
      'amount', ps.amount_usd,
      'percentage', ps.percentage
    )
  ) as splits
FROM payments p
LEFT JOIN payment_splits ps ON p.id = ps.payment_id
GROUP BY p.id;

-- Comments
COMMENT ON VIEW payment_summaries IS 'Convenient view of payments with their split details';

-- ============================================
-- GRANTS
-- ============================================

-- Grant access to authenticated users
GRANT SELECT ON payments TO authenticated;
GRANT SELECT ON payment_splits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrk_stakes TO authenticated;
GRANT SELECT ON cross_border_settlements TO authenticated;
GRANT SELECT ON analytics_events TO authenticated;
GRANT SELECT ON payment_summaries TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION calculate_payment_splits TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_payment_stats TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Payment Rail Tables Created Successfully';
  RAISE NOTICE '✅ payments table';
  RAISE NOTICE '✅ payment_splits table';
  RAISE NOTICE '✅ hrk_stakes table';
  RAISE NOTICE '✅ cross_border_settlements table';
  RAISE NOTICE '✅ failed_payments table';
  RAISE NOTICE '✅ analytics_events table';
  RAISE NOTICE '✅ RLS policies enabled';
  RAISE NOTICE '✅ Helper functions created';
END $$;
