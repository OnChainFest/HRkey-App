-- ============================================================================
-- HRKey Wallet Integration - Database Schema Extension
-- ============================================================================
-- Description: Adds wallet management and notification support to HRKey
-- Author: HRKey Development Team
-- Date: 2026-01-19
-- Purpose: Connect Web3 payment infrastructure to user flows
-- ============================================================================

-- ============================================================================
-- 1. EXTEND USERS TABLE WITH WALLET METADATA
-- ============================================================================
-- Add wallet-related columns to existing users table

-- Wallet type: custodial (managed by HRKey) or non_custodial (user's own wallet)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_type TEXT
  CHECK (wallet_type IN ('custodial', 'non_custodial'));

-- Timestamp when wallet was created/linked
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ;

-- Encrypted private key (ONLY for custodial wallets, NULL for non-custodial)
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

-- Update indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_type ON users(wallet_type);

-- Comments for documentation
COMMENT ON COLUMN users.wallet_address IS 'Ethereum address on Base network (existing column from 001_identity_and_permissions.sql)';
COMMENT ON COLUMN users.wallet_type IS 'Wallet type: custodial (HRKey-managed) or non_custodial (user-connected like MetaMask)';
COMMENT ON COLUMN users.wallet_created_at IS 'Timestamp when wallet was created or linked to account';
COMMENT ON COLUMN users.encrypted_private_key IS 'AES-256-GCM encrypted private key (ONLY for custodial wallets, NULL for non-custodial)';

-- ============================================================================
-- 2. USER_WALLETS TABLE (For multi-wallet support in future)
-- ============================================================================
-- Supports multiple wallets per user (e.g., one for Base, one for Ethereum)

CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Wallet details
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('custodial', 'metamask', 'coinbase', 'walletconnect', 'other')),
  encrypted_private_key TEXT, -- Only for custodial wallets

  -- Network information
  network TEXT NOT NULL DEFAULT 'base' CHECK (network IN ('base', 'base_sepolia', 'ethereum', 'polygon')),

  -- Metadata
  is_primary BOOLEAN DEFAULT true,
  label TEXT, -- User-defined label like "Main Wallet", "Work Wallet"

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_wallet UNIQUE(user_id, wallet_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_primary ON user_wallets(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_user_wallets_network ON user_wallets(network);

-- Comments
COMMENT ON TABLE user_wallets IS 'Supports multiple wallets per user. Currently only one primary wallet used, but ready for future expansion';
COMMENT ON COLUMN user_wallets.wallet_type IS 'Source of wallet: custodial (HRKey), metamask, coinbase, walletconnect, other';
COMMENT ON COLUMN user_wallets.is_primary IS 'Primary wallet for receiving payments (only one per user)';
COMMENT ON COLUMN user_wallets.network IS 'Blockchain network: base (mainnet), base_sepolia (testnet), ethereum, polygon';

-- ============================================================================
-- 3. NOTIFICATIONS TABLE
-- ============================================================================
-- In-app notifications for payments, verifications, and other events

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification content
  type TEXT NOT NULL CHECK (type IN (
    'payment_received',
    'payment_pending',
    'payment_failed',
    'reference_verified',
    'reference_flagged',
    'stake_reward',
    'stake_unlocked',
    'wallet_created',
    'data_access_requested',
    'data_access_approved'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Additional data (reference_id, payment_id, amount, etc.)
  data JSONB,

  -- Delivery status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Email notification sent
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,

  -- Push notification sent (future)
  push_sent BOOLEAN DEFAULT false,
  push_sent_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Archive/soft delete
  archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- GIN index on data JSONB for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_data_gin ON notifications USING GIN (data);

-- Comments
COMMENT ON TABLE notifications IS 'In-app notifications for payments, verifications, and events. Supports email and push delivery';
COMMENT ON COLUMN notifications.type IS 'Notification category for filtering and UI rendering';
COMMENT ON COLUMN notifications.data IS 'Additional context: {payment_id, reference_id, amount, tx_hash, etc.}';
COMMENT ON COLUMN notifications.read IS 'Whether user has viewed the notification';

-- ============================================================================
-- 4. EXTEND REFERENCES TABLE WITH PAYMENT LINKAGE
-- ============================================================================
-- Link references to payment records

-- Foreign key to payments table
ALTER TABLE references ADD COLUMN IF NOT EXISTS payment_id TEXT REFERENCES payments(id);

-- Payment status for quick filtering
ALTER TABLE references ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired'));

-- Timestamp when payment was completed
ALTER TABLE references ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_references_payment_id ON references(payment_id);
CREATE INDEX IF NOT EXISTS idx_references_payment_status ON references(payment_status);

-- Comments
COMMENT ON COLUMN references.payment_id IS 'Links to payment record in payments table (created after referee submits reference)';
COMMENT ON COLUMN references.payment_status IS 'Payment status: pending (awaiting payment), paid (payment received), failed, expired';
COMMENT ON COLUMN references.paid_at IS 'Timestamp when payment was confirmed on-chain';

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USER_WALLETS RLS POLICIES
-- ============================================

-- Users can view their own wallets
CREATE POLICY "Users can view their own wallets"
  ON user_wallets FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own wallets
CREATE POLICY "Users can create their own wallets"
  ON user_wallets FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own wallets (e.g., change primary wallet, add label)
CREATE POLICY "Users can update their own wallets"
  ON user_wallets FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own wallets (except primary)
CREATE POLICY "Users can delete non-primary wallets"
  ON user_wallets FOR DELETE
  USING (user_id = auth.uid() AND is_primary = false);

-- Superadmins can view all wallets
CREATE POLICY "Superadmins can view all wallets"
  ON user_wallets FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- ============================================
-- NOTIFICATIONS RLS POLICIES
-- ============================================

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their notifications as read
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- System can insert notifications (service_role)
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can archive their own notifications
CREATE POLICY "Users can archive their own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- Superadmins can view all notifications
CREATE POLICY "Superadmins can view all notifications"
  ON notifications FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at on user_wallets
CREATE OR REPLACE FUNCTION update_user_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_wallets
DROP TRIGGER IF EXISTS update_user_wallets_timestamp ON user_wallets;
CREATE TRIGGER update_user_wallets_timestamp
  BEFORE UPDATE ON user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_wallets_updated_at();

-- ============================================
-- Function to ensure only one primary wallet per user
-- ============================================
CREATE OR REPLACE FUNCTION ensure_one_primary_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this wallet as primary, unset all other primary wallets for this user
  IF NEW.is_primary = true THEN
    UPDATE user_wallets
    SET is_primary = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain one primary wallet
DROP TRIGGER IF EXISTS enforce_one_primary_wallet ON user_wallets;
CREATE TRIGGER enforce_one_primary_wallet
  BEFORE INSERT OR UPDATE OF is_primary ON user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION ensure_one_primary_wallet();

-- ============================================
-- Function to sync primary wallet to users table
-- ============================================
CREATE OR REPLACE FUNCTION sync_primary_wallet_to_users()
RETURNS TRIGGER AS $$
BEGIN
  -- When a wallet is marked as primary, update users.wallet_address
  IF NEW.is_primary = true THEN
    UPDATE users
    SET
      wallet_address = NEW.wallet_address,
      wallet_type = NEW.wallet_type,
      wallet_created_at = NEW.created_at
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep users.wallet_address in sync
DROP TRIGGER IF EXISTS sync_wallet_to_users ON user_wallets;
CREATE TRIGGER sync_wallet_to_users
  AFTER INSERT OR UPDATE OF is_primary, wallet_address ON user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION sync_primary_wallet_to_users();

-- ============================================
-- Function to get unread notification count
-- ============================================
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM notifications
    WHERE user_id = p_user_id
      AND read = false
      AND archived = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO authenticated;

-- ============================================
-- Function to mark notification as read
-- ============================================
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notifications
  SET
    read = true,
    read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid(); -- RLS: Only user's own notifications

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;

-- ============================================
-- Function to mark all notifications as read
-- ============================================
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE notifications
  SET
    read = true,
    read_at = NOW()
  WHERE user_id = p_user_id
    AND user_id = auth.uid() -- RLS: Only user's own notifications
    AND read = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION mark_all_notifications_read(UUID) TO authenticated;

-- ============================================================================
-- 7. VIEWS FOR EASY QUERYING
-- ============================================================================

-- View for payment summaries with split details
CREATE OR REPLACE VIEW payment_summaries AS
SELECT
  p.id as payment_id,
  p.reference_id,
  p.payer_email,
  p.total_amount_usd,
  p.status,
  p.tx_hash,
  p.created_at,
  p.completed_at,

  -- Payment splits aggregated
  (SELECT amount_usd FROM payment_splits WHERE payment_id = p.id AND recipient_type = 'provider') as provider_amount,
  (SELECT amount_usd FROM payment_splits WHERE payment_id = p.id AND recipient_type = 'candidate') as candidate_amount,
  (SELECT amount_usd FROM payment_splits WHERE payment_id = p.id AND recipient_type = 'treasury') as treasury_amount,
  (SELECT amount_usd FROM payment_splits WHERE payment_id = p.id AND recipient_type = 'staking_pool') as staking_amount,

  -- Reference info
  r.owner_id as candidate_id,
  r.evaluator_id as provider_id,
  r.referrer_name as provider_name,
  r.payment_status as reference_payment_status

FROM payments p
LEFT JOIN references r ON p.reference_id = r.id;

COMMENT ON VIEW payment_summaries IS 'Denormalized view of payments with split breakdown and reference info';

-- View for user notification summary
CREATE OR REPLACE VIEW user_notification_summary AS
SELECT
  user_id,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE read = false) as unread_count,
  COUNT(*) FILTER (WHERE type = 'payment_received') as payment_notifications,
  MAX(created_at) as last_notification_at
FROM notifications
WHERE archived = false
GROUP BY user_id;

COMMENT ON VIEW user_notification_summary IS 'Summary statistics of notifications per user';

-- ============================================================================
-- 8. INITIAL DATA / SEEDS (Optional)
-- ============================================================================

-- Example: Create notification for existing users who already have wallet_address
-- (This is optional - only if you want to notify existing users)

-- INSERT INTO notifications (user_id, type, title, message, data)
-- SELECT
--   id as user_id,
--   'wallet_created' as type,
--   'Wallet Connected' as title,
--   'Your wallet ' || SUBSTRING(wallet_address, 1, 6) || '...' || SUBSTRING(wallet_address, LENGTH(wallet_address) - 3) || ' is connected to HRKey' as message,
--   jsonb_build_object('wallet_address', wallet_address) as data
-- FROM users
-- WHERE wallet_address IS NOT NULL
--   AND id NOT IN (SELECT user_id FROM notifications WHERE type = 'wallet_created');

-- ============================================================================
-- 9. MIGRATION VERIFICATION
-- ============================================================================

DO $$
DECLARE
  wallet_users_count INTEGER;
  notifications_count INTEGER;
  payment_linked_refs INTEGER;
BEGIN
  -- Count users with wallets
  SELECT COUNT(*) INTO wallet_users_count
  FROM users
  WHERE wallet_address IS NOT NULL;

  -- Count notifications
  SELECT COUNT(*) INTO notifications_count
  FROM notifications;

  -- Count references with payment links
  SELECT COUNT(*) INTO payment_linked_refs
  FROM references
  WHERE payment_id IS NOT NULL;

  RAISE NOTICE '✅ Wallet Integration migration completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '=== USERS TABLE EXTENSIONS ===';
  RAISE NOTICE '  - wallet_type (custodial | non_custodial)';
  RAISE NOTICE '  - wallet_created_at (timestamp)';
  RAISE NOTICE '  - encrypted_private_key (for custodial wallets)';
  RAISE NOTICE '  ↳ Current users with wallets: %', wallet_users_count;
  RAISE NOTICE '';
  RAISE NOTICE '=== NEW TABLES CREATED ===';
  RAISE NOTICE '  ✓ user_wallets - Multi-wallet support';
  RAISE NOTICE '  ✓ notifications - In-app notification system';
  RAISE NOTICE '  ↳ Current notifications: %', notifications_count;
  RAISE NOTICE '';
  RAISE NOTICE '=== REFERENCES TABLE EXTENSIONS ===';
  RAISE NOTICE '  - payment_id (FK to payments)';
  RAISE NOTICE '  - payment_status (pending | paid | failed | expired)';
  RAISE NOTICE '  - paid_at (timestamp)';
  RAISE NOTICE '  ↳ References with payment links: %', payment_linked_refs;
  RAISE NOTICE '';
  RAISE NOTICE '=== INDEXES & PERFORMANCE ===';
  RAISE NOTICE '  ✓ Wallet indexes created';
  RAISE NOTICE '  ✓ Notification indexes with GIN for JSONB';
  RAISE NOTICE '  ✓ Payment reference indexes';
  RAISE NOTICE '';
  RAISE NOTICE '=== ROW LEVEL SECURITY ===';
  RAISE NOTICE '  ✓ RLS enabled on user_wallets';
  RAISE NOTICE '  ✓ RLS enabled on notifications';
  RAISE NOTICE '  ✓ Policies enforcing user privacy';
  RAISE NOTICE '';
  RAISE NOTICE '=== HELPER FUNCTIONS ===';
  RAISE NOTICE '  ✓ ensure_one_primary_wallet() - Only one primary wallet per user';
  RAISE NOTICE '  ✓ sync_primary_wallet_to_users() - Keep users table in sync';
  RAISE NOTICE '  ✓ get_unread_notification_count() - Quick notification badge';
  RAISE NOTICE '  ✓ mark_notification_read() - Mark single notification';
  RAISE NOTICE '  ✓ mark_all_notifications_read() - Bulk mark as read';
  RAISE NOTICE '';
  RAISE NOTICE '=== VIEWS ===';
  RAISE NOTICE '  ✓ payment_summaries - Denormalized payment data';
  RAISE NOTICE '  ✓ user_notification_summary - Notification stats per user';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Ready for Web3 wallet integration!';
  RAISE NOTICE '   Next: Deploy backend services and frontend components';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
