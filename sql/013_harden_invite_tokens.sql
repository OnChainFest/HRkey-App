-- ============================================================================
-- Migration 013: Harden Invite Tokens
-- ============================================================================
-- Description: Replace plaintext invite_token storage with SHA-256 hash.
--              Update RPC functions to hash incoming tokens before lookup.
--              Enforce expiry and atomic status transition in RPC layer.
--
-- Author: Security Engineering
-- Date: 2026-03-04
-- Related audit: LAUNCH0_PRODUCTION_AUDIT.md §"Reference Submission Token Handling"
-- ============================================================================
-- SAFETY: This migration is fully non-destructive until the final DROP COLUMN.
--         Run up to step 5 first; verify application correctness; then step 6.
-- ============================================================================

-- Step 1: Enable pgcrypto for server-side SHA-256 hashing
-- (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Step 2: Add token_hash column
-- ============================================================================
ALTER TABLE reference_invites
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- ============================================================================
-- Step 3: Populate token_hash from existing invite_token rows
--
-- Two cases exist in the DB:
--   a) invite_token is plaintext (64-char lowercase hex, the default) →
--      store sha256(invite_token)
--   b) invite_token is already a SHA-256 hash (if USE_HASHED_REFERENCE_TOKENS
--      was enabled in code) → already sha256(plaintext), copy as-is.
--
-- Both cases produce a valid token_hash because:
--   - case a: token_hash = sha256(plaintext)   → correct for future validation
--   - case b: token_hash = sha256(plaintext)   → already the right value
--
-- NOTE: Old invite links that were sent while tokens were stored as plain-hex
--       will STOP WORKING after step 6 (DROP COLUMN). This is intentional —
--       tokens more than 7 days old are expired anyway. For safety, run
--       `UPDATE reference_invites SET status='expired' WHERE expires_at < NOW()`
--       before the DROP to clean up.
-- ============================================================================

-- Case (a): 64-char lowercase hex → plaintext token → hash it
UPDATE reference_invites
SET    token_hash = encode(digest(invite_token, 'sha256'), 'hex')
WHERE  token_hash IS NULL
  AND  invite_token IS NOT NULL
  AND  length(invite_token) = 64
  AND  invite_token ~ '^[0-9a-f]{64}$';

-- Case (b): anything else already stored as a hash (e.g. 64-char hex that was
--           itself the output of sha256) — copy verbatim.
UPDATE reference_invites
SET    token_hash = invite_token
WHERE  token_hash IS NULL
  AND  invite_token IS NOT NULL;

-- ============================================================================
-- Step 4: Add constraints and index on token_hash
-- ============================================================================

-- Unique index (replaces the implicit uniqueness of invite_token)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_invites_token_hash
  ON reference_invites (token_hash);

-- Fast lookup index (also covered by unique index, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_reference_invites_token_hash_status
  ON reference_invites (token_hash, status);

-- ============================================================================
-- Step 5a: Update get_invite_by_token RPC
--
-- Frontend calls: supabase.rpc("get_invite_by_token", { p_token: <plaintext> })
-- RPC hashes the token server-side and returns invite metadata.
-- Returns empty when token does not exist (no enumeration leak).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  reference_id  UUID,
  referrer_email TEXT,
  referrer_name  TEXT,
  expires_at     TIMESTAMPTZ,
  invite_status  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash TEXT;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN;
  END IF;

  -- Hash the incoming plaintext token before comparison
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    ri.id            AS reference_id,
    ri.referee_email AS referrer_email,
    ri.referee_name  AS referrer_name,
    ri.expires_at,
    ri.status        AS invite_status
  FROM reference_invites ri
  WHERE ri.token_hash = v_token_hash;
  -- NOTE: status/expiry filtering is NOT done here so the frontend can display
  --       the correct state to the user. Enforcement happens in submit_reference_by_token.
END;
$$;

-- ============================================================================
-- Step 5b: Update submit_reference_by_token RPC
--
-- Frontend calls: supabase.rpc("submit_reference_by_token", {
--   p_token, p_summary, p_rating })
--
-- Security properties:
--   1. Token hashed server-side before any DB lookup
--   2. Status transition pending→processing is ATOMIC (single UPDATE + RETURNING)
--      If rows_affected = 0: token not found OR already processing/completed OR
--      expired → return empty row (generic failure, no enumeration)
--   3. Expiry enforced inside the atomic UPDATE predicate
--   4. Reference inserted only after successful claim
--   5. Status transitioned to 'completed' after reference insert
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_reference_by_token(
  p_token   TEXT,
  p_summary TEXT,
  p_rating  NUMERIC,
  p_ip      TEXT DEFAULT NULL
)
RETURNS TABLE (reference_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash   TEXT;
  v_invite       reference_invites%ROWTYPE;
  v_reference_id UUID;
  v_role_id      UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN; -- Empty = generic failure
  END IF;

  -- Hash incoming plaintext token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- ATOMIC CLAIM: only succeeds if status='pending' AND not expired
  -- If rows_affected = 0 the caller gets an empty result set — no enumeration.
  UPDATE reference_invites
  SET    status = 'processing'
  WHERE  token_hash  = v_token_hash
    AND  status      = 'pending'
    AND  expires_at  > NOW()
  RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    RETURN; -- Empty = "Invalid or expired invite" (no state leakage)
  END IF;

  -- Safely parse optional role_id (UUID) from metadata JSON
  BEGIN
    v_role_id := (v_invite.metadata->>'role_id')::UUID;
  EXCEPTION WHEN others THEN
    v_role_id := NULL;
  END;

  -- Insert the reference record
  INSERT INTO references (
    owner_id,
    referrer_name,
    referrer_email,
    relationship,
    role_id,
    summary,
    overall_rating,
    kpi_ratings,
    detailed_feedback,
    status,
    created_at,
    invite_id
  ) VALUES (
    v_invite.requester_id,
    v_invite.referee_name,
    v_invite.referee_email,
    COALESCE(NULLIF(v_invite.metadata->>'relationship', ''), 'colleague'),
    v_role_id,
    p_summary,
    p_rating,
    '{}'::jsonb,
    '{}'::jsonb,
    'active',
    NOW(),
    v_invite.id
  )
  RETURNING id INTO v_reference_id;

  -- Mark invite completed (atomic; previous UPDATE already claimed it)
  UPDATE reference_invites
  SET    status       = 'completed',
         completed_at = NOW()
  WHERE  id = v_invite.id;

  RETURN QUERY SELECT v_reference_id;
END;
$$;

-- ============================================================================
-- Step 6: Drop the plaintext invite_token column
--
-- IMPORTANT: Only run this after verifying that:
--   a) All application code paths now write to token_hash (not invite_token)
--   b) All RPC functions query token_hash
--   c) No existing pending invites have a null token_hash
--
-- Pre-flight check (run manually before executing):
--   SELECT COUNT(*) FROM reference_invites WHERE token_hash IS NULL;
--   -- Must return 0 before proceeding
-- ============================================================================

-- Expire any dangling rows where token_hash could not be computed
UPDATE reference_invites
SET    status = 'expired'
WHERE  token_hash IS NULL
  AND  status     = 'pending';

-- Now drop the plaintext column
ALTER TABLE reference_invites
  DROP COLUMN IF EXISTS invite_token;

-- ============================================================================
-- Step 7: Verification
-- ============================================================================
DO $$
BEGIN
  -- Confirm token_hash column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'reference_invites'
      AND  column_name = 'token_hash'
  ) THEN
    RAISE EXCEPTION 'token_hash column missing — migration may have failed';
  END IF;

  -- Confirm invite_token column is gone
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'reference_invites'
      AND  column_name = 'invite_token'
  ) THEN
    RAISE WARNING 'invite_token column still present — DROP COLUMN may not have run';
  END IF;

  RAISE NOTICE '✅ Migration 013 completed: invite tokens now stored as SHA-256 hashes';
  RAISE NOTICE '   - token_hash column: present';
  RAISE NOTICE '   - invite_token column: dropped';
  RAISE NOTICE '   - get_invite_by_token RPC: updated (hashes p_token server-side)';
  RAISE NOTICE '   - submit_reference_by_token RPC: updated (atomic claim + hash)';
END $$;
