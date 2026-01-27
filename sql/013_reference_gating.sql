-- ============================================================================
-- Reference Gating Layer - Database Schema
-- ============================================================================
-- Description: Adds free reference tracking and additional_reference product
--
-- DATA MODEL DECISION: Option 1 - users.free_reference_used BOOLEAN
-- Rationale:
--   - Simpler than using user_feature_flags (single column vs. join)
--   - Semantically correct: tracks consumed state, not a granted feature
--   - user_feature_flags is for features GRANTED after payment
--   - free_reference_used tracks if the FREE allocation is CONSUMED
-- ============================================================================

-- ============================================================================
-- 1. ADD free_reference_used TO USERS TABLE
-- ============================================================================
-- Tracks whether user has consumed their one free reference request
-- false = free reference still available
-- true = free reference already used

ALTER TABLE users
ADD COLUMN IF NOT EXISTS free_reference_used BOOLEAN DEFAULT false;

-- Index for quick lookup during gating check
CREATE INDEX IF NOT EXISTS idx_users_free_reference_used
ON users(id) WHERE free_reference_used = false;

-- Comment explaining the column
COMMENT ON COLUMN users.free_reference_used IS
'Tracks if user has used their free reference request. First reference is free, subsequent require payment.';

-- ============================================================================
-- 2. ADD additional_reference PRODUCT
-- ============================================================================
-- Product for purchasing additional reference requests after free one is used

INSERT INTO products (code, name, stripe_price_id)
VALUES (
  'additional_reference',
  'Additional Reference Request',
  'price_placeholder_additional_ref'
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Reference Gating migration completed successfully';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  - users.free_reference_used BOOLEAN DEFAULT false';
  RAISE NOTICE '  - products: additional_reference (Stripe placeholder)';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update Stripe price_id for additional_reference product';
  RAISE NOTICE '  before enabling payments in production.';
END $$;
