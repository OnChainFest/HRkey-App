-- Migration: 013_reference_pack_hash.sql
-- Description: Adds reference_hash column to references table for Reference Pack integrity
--
-- This column stores the SHA256 hash of the canonical Reference Pack object
-- constructed at reference submission time. It is used for:
--   - integrity verification
--   - blockchain anchoring
--   - scoring algorithms
--   - paid reference consultation
--
-- DO NOT execute this file manually. Apply through your Supabase migration workflow.

ALTER TABLE references
  ADD COLUMN IF NOT EXISTS reference_hash TEXT;

-- Index for fast lookup by hash (integrity checks, blockchain anchoring)
CREATE INDEX IF NOT EXISTS idx_references_reference_hash
  ON references (reference_hash);

COMMENT ON COLUMN references.reference_hash IS
  'SHA256 hex digest of the canonical Reference Pack JSON: '
  '{ answers, candidate_id, created_at, referee_email, role_id } '
  'with keys sorted alphabetically at every depth. '
  'Computed at submission time by backend/utils/referencePack.js.';
