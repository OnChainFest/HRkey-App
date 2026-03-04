-- ============================================================================
-- Migration 014: Store IP metadata on invite usage (#158)
-- ============================================================================
-- Description: Adds used_ip_hash and used_user_agent columns to
--              reference_invites. Updates submit_reference_by_token RPC to
--              accept and persist these fields on successful submission.
--
-- Privacy design:
--   - Raw IP is NEVER stored. Only SHA-256(ip || server_salt) is persisted.
--   - user_agent is stored as-is (not PII, standard audit field).
--   - Fields are written only on successful invite consumption (completed).
--
-- Author: Security Engineering
-- Date: 2026-03-04
-- ============================================================================

-- ============================================================================
-- Step 1: Add audit columns to reference_invites
-- ============================================================================

ALTER TABLE reference_invites
  ADD COLUMN IF NOT EXISTS used_ip_hash    TEXT,
  ADD COLUMN IF NOT EXISTS used_user_agent TEXT;

COMMENT ON COLUMN reference_invites.used_ip_hash    IS 'SHA-256(client_ip || INVITE_IP_SALT) recorded on successful invite consumption. Raw IP is never stored.';
COMMENT ON COLUMN reference_invites.used_user_agent IS 'HTTP User-Agent string recorded on successful invite consumption (max 512 chars).';

-- ============================================================================
-- Step 2: Replace submit_reference_by_token RPC
--
-- Adds p_ip_hash and p_user_agent parameters (both optional, default NULL).
-- These are written into the final completed UPDATE so they are captured only
-- on a successful atomic submission, never on failed/rejected attempts.
--
-- The old function signature (from migration 013) had p_ip TEXT which was
-- never stored. Drop it cleanly and replace.
-- ============================================================================

-- Drop old signatures (covers 013 variant with p_ip and any prior variants)
DROP FUNCTION IF EXISTS submit_reference_by_token(TEXT, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS submit_reference_by_token(TEXT, TEXT, NUMERIC);

CREATE FUNCTION submit_reference_by_token(
  p_token      TEXT,
  p_summary    TEXT,
  p_rating     NUMERIC,
  p_ip_hash    TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
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
    RETURN;
  END IF;

  -- Hash the incoming plaintext token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- ATOMIC CLAIM: transition pending → processing
  -- Empty result = invalid/expired/already-used → caller sees generic failure
  UPDATE reference_invites
  SET    status = 'processing'
  WHERE  token_hash = v_token_hash
    AND  status     = 'pending'
    AND  expires_at > NOW()
  RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Safely parse optional role_id from metadata JSON
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

  -- Mark invite completed; write IP metadata here (only on success)
  UPDATE reference_invites
  SET    status          = 'completed',
         completed_at    = NOW(),
         used_ip_hash    = p_ip_hash,
         used_user_agent = left(p_user_agent, 512)   -- cap at 512 chars
  WHERE  id = v_invite.id;

  RETURN QUERY SELECT v_reference_id;
END;
$$;

-- ============================================================================
-- Step 3: Verification
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'reference_invites'
      AND  column_name = 'used_ip_hash'
  ) THEN
    RAISE EXCEPTION 'used_ip_hash column missing — migration may have failed';
  END IF;

  RAISE NOTICE '✅ Migration 014 completed: invite IP metadata columns added';
  RAISE NOTICE '   - used_ip_hash: present (stores SHA-256 hash, never raw IP)';
  RAISE NOTICE '   - used_user_agent: present (capped at 512 chars)';
  RAISE NOTICE '   - submit_reference_by_token RPC: updated (p_ip_hash, p_user_agent)';
END $$;
