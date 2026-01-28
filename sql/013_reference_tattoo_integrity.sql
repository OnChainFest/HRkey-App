-- ============================================================================
-- Reference Tattoo & Integrity Layer - Database Schema
-- ============================================================================
-- Description: Adds on-chain tattoo tracking and integrity verification for references
-- Author: HRKey Development Team
-- Date: 2026-01-27
-- ============================================================================

-- ============================================================================
-- 1. ADD TATTOO COLUMNS TO REFERENCES TABLE
-- ============================================================================
-- These columns track the on-chain "tattoo" (immutable hash commitment)
-- and enable integrity verification by comparing local vs on-chain hash

-- Transaction hash of the on-chain tattoo
ALTER TABLE references
ADD COLUMN IF NOT EXISTS tattoo_tx_hash TEXT;

-- Chain ID where the tattoo was recorded (e.g., 84532 for Base Sepolia)
ALTER TABLE references
ADD COLUMN IF NOT EXISTS tattoo_chain_id INTEGER;

-- Timestamp when the reference was tattooed on-chain
ALTER TABLE references
ADD COLUMN IF NOT EXISTS tattooed_at TIMESTAMPTZ;

-- Canonical hash computed at time of tattoo (for comparison)
ALTER TABLE references
ADD COLUMN IF NOT EXISTS canonical_hash TEXT;

-- Cached on-chain hash (optional, for faster reads)
ALTER TABLE references
ADD COLUMN IF NOT EXISTS onchain_hash TEXT;

-- Integrity status: VALID | INVALID | UNKNOWN
-- UNKNOWN = not tattooed
-- VALID = local hash matches on-chain hash
-- INVALID = local hash differs from on-chain hash (content was modified)
ALTER TABLE references
ADD COLUMN IF NOT EXISTS integrity_status TEXT DEFAULT 'UNKNOWN'
CHECK (integrity_status IN ('VALID', 'INVALID', 'UNKNOWN'));

-- ============================================================================
-- 2. INDEXES FOR EFFICIENT QUERIES
-- ============================================================================

-- Index for finding tattooed references
CREATE INDEX IF NOT EXISTS idx_references_tattooed
ON references(tattooed_at)
WHERE tattooed_at IS NOT NULL;

-- Index for integrity status filtering
CREATE INDEX IF NOT EXISTS idx_references_integrity_status
ON references(integrity_status);

-- Index for tx hash lookups
CREATE INDEX IF NOT EXISTS idx_references_tattoo_tx_hash
ON references(tattoo_tx_hash)
WHERE tattoo_tx_hash IS NOT NULL;

-- ============================================================================
-- 3. COLUMN COMMENTS
-- ============================================================================

COMMENT ON COLUMN references.tattoo_tx_hash IS 'On-chain transaction hash where the reference hash was recorded';
COMMENT ON COLUMN references.tattoo_chain_id IS 'Blockchain chain ID (e.g., 84532 for Base Sepolia, 8453 for Base Mainnet)';
COMMENT ON COLUMN references.tattooed_at IS 'Timestamp when the reference was tattooed on-chain';
COMMENT ON COLUMN references.canonical_hash IS 'Keccak256 hash of canonical reference data at time of tattoo';
COMMENT ON COLUMN references.onchain_hash IS 'Cached copy of the on-chain hash for faster integrity checks';
COMMENT ON COLUMN references.integrity_status IS 'VALID=matches on-chain, INVALID=modified after tattoo, UNKNOWN=not tattooed';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '--- Reference Tattoo & Integrity Layer Migration ---';
  RAISE NOTICE 'Columns added to references table:';
  RAISE NOTICE '  - tattoo_tx_hash (TEXT)';
  RAISE NOTICE '  - tattoo_chain_id (INTEGER)';
  RAISE NOTICE '  - tattooed_at (TIMESTAMPTZ)';
  RAISE NOTICE '  - canonical_hash (TEXT)';
  RAISE NOTICE '  - onchain_hash (TEXT)';
  RAISE NOTICE '  - integrity_status (TEXT with CHECK constraint)';
  RAISE NOTICE 'Indexes created for efficient queries';
END $$;
