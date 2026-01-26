-- ============================================================================
-- HRKey Onboarding Layer - Database Schema
-- ============================================================================
-- Description: Adds wallet identity, in-app notifications, and Stripe billing infrastructure
-- Author: HRKey Development Team
-- Date: 2026-01-26
-- ============================================================================

-- ============================================================================
-- 1. WALLETS TABLE (Identity Only - NO Secrets)
-- ============================================================================
-- Stores connected wallet addresses for identity anchoring
-- NO private keys, NO encrypted secrets, NO balances

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('coinbase_smart_wallet', 'external')),
  chain TEXT NOT NULL DEFAULT 'base',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One active wallet per user
  CONSTRAINT unique_user_wallet UNIQUE (user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
CREATE INDEX IF NOT EXISTS idx_wallets_provider ON wallets(provider);

-- Comments
COMMENT ON TABLE wallets IS 'Connected wallet addresses for identity anchoring. NO secrets stored.';
COMMENT ON COLUMN wallets.provider IS 'coinbase_smart_wallet = custodial via Coinbase SDK, external = user-connected wallet';
COMMENT ON COLUMN wallets.chain IS 'Blockchain network (base by default)';

-- ============================================================================
-- 2. NOTIFICATIONS TABLE (In-App Only)
-- ============================================================================
-- In-app notifications for user events

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Comments
COMMENT ON TABLE notifications IS 'In-app notifications only. No email, no push.';
COMMENT ON COLUMN notifications.type IS 'Notification type: reference_received, wallet_connected, payment_success, etc.';

-- ============================================================================
-- 3. PRODUCTS TABLE (Stripe Catalog)
-- ============================================================================
-- Product catalog for Stripe billing

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);

-- Comments
COMMENT ON TABLE products IS 'Product catalog for Stripe billing. Maps internal codes to Stripe price IDs.';

-- ============================================================================
-- 4. CHECKOUT SESSIONS TABLE (Stripe Checkout Tracking)
-- ============================================================================
-- Tracks Stripe checkout sessions for paid features

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL REFERENCES products(code),
  stripe_session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id ON checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_id ON checkout_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);

-- Comments
COMMENT ON TABLE checkout_sessions IS 'Tracks Stripe checkout sessions for paid features.';

-- ============================================================================
-- 5. USER FEATURE FLAGS TABLE
-- ============================================================================
-- Stores feature flags granted to users after payment

CREATE TABLE IF NOT EXISTS user_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  checkout_session_id UUID REFERENCES checkout_sessions(id),

  CONSTRAINT unique_user_feature UNIQUE (user_id, feature_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_user_id ON user_feature_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_feature ON user_feature_flags(feature_code);

-- Comments
COMMENT ON TABLE user_feature_flags IS 'Feature flags granted to users after payment or promotion.';

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feature_flags ENABLE ROW LEVEL SECURITY;

-- Wallets: Users can only see their own wallet
CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own wallet"
  ON wallets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own wallet"
  ON wallets FOR DELETE
  USING (user_id = auth.uid());

-- Notifications: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- System insert policy for notifications
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Checkout sessions: Users can only see their own sessions
CREATE POLICY "Users can view own checkout sessions"
  ON checkout_sessions FOR SELECT
  USING (user_id = auth.uid());

-- System can manage checkout sessions
CREATE POLICY "System can manage checkout sessions"
  ON checkout_sessions FOR ALL
  USING (true);

-- User feature flags: Users can only see their own flags
CREATE POLICY "Users can view own feature flags"
  ON user_feature_flags FOR SELECT
  USING (user_id = auth.uid());

-- System can manage feature flags
CREATE POLICY "System can manage feature flags"
  ON user_feature_flags FOR ALL
  USING (true);

-- Products: Public read access
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  USING (true);

-- ============================================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Trigger for checkout_sessions
DROP TRIGGER IF EXISTS update_checkout_sessions_updated_at ON checkout_sessions;
CREATE TRIGGER update_checkout_sessions_updated_at
  BEFORE UPDATE ON checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. SEED DEFAULT PRODUCTS
-- ============================================================================

INSERT INTO products (code, name, stripe_price_id)
VALUES
  ('pro_lifetime', 'HRKey PRO - Lifetime Access', 'price_placeholder_pro_lifetime'),
  ('extra_references', 'Additional Reference Pack (5)', 'price_placeholder_extra_refs')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ HRKey Onboarding Layer migration completed successfully';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - wallets (identity anchoring, no secrets)';
  RAISE NOTICE '  - notifications (in-app only)';
  RAISE NOTICE '  - products (Stripe catalog)';
  RAISE NOTICE '  - checkout_sessions (Stripe checkout tracking)';
  RAISE NOTICE '  - user_feature_flags (paid features)';
  RAISE NOTICE 'RLS policies enabled for security';
END $$;
