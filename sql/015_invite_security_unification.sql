-- ============================================================================
-- Migration 015: Invite Security Unification
-- ============================================================================
-- Description:
--   - Make SQL RPCs the authoritative invite verification / consumption layer
--   - Normalize public lookup to avoid token state enumeration
--   - Persist metadata in the authoritative submit path
--   - Preserve detailed ratings/comments in the authoritative submit path
--   - Add replay protection with a unique index on references(invite_id)
--
-- Author: Security Engineering
-- Date: 2026-03-18
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Prevent duplicate references for the same invite even under unexpected retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_references_invite_id_unique
  ON references (invite_id)
  WHERE invite_id IS NOT NULL;

-- ============================================================================
-- Authoritative public lookup RPC
-- Returns invite details ONLY when the invite is still valid for submission.
-- Invalid / expired / completed / malformed inputs all collapse to an empty set.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  reference_id   UUID,
  referrer_email TEXT,
  referrer_name  TEXT,
  expires_at     TIMESTAMPTZ
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

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    ri.id,
    ri.referee_email,
    ri.referee_name,
    ri.expires_at
  FROM reference_invites ri
  WHERE ri.token_hash = v_token_hash
    AND ri.status = 'pending'
    AND ri.expires_at > NOW();
END;
$$;

-- ============================================================================
-- Authoritative submit RPC
-- Only the database claims and completes invites.
-- Invalid / expired / already-used inputs all collapse to an empty result.
-- ============================================================================
DROP FUNCTION IF EXISTS submit_reference_by_token(TEXT, TEXT, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS submit_reference_by_token(TEXT, TEXT, NUMERIC, JSONB, JSONB, TEXT, TEXT);

CREATE FUNCTION submit_reference_by_token(
  p_token             TEXT,
  p_summary           TEXT,
  p_rating            NUMERIC,
  p_kpi_ratings       JSONB DEFAULT '{}'::jsonb,
  p_detailed_feedback JSONB DEFAULT '{}'::jsonb,
  p_ip_hash           TEXT DEFAULT NULL,
  p_user_agent        TEXT DEFAULT NULL
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

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  UPDATE reference_invites
  SET    status = 'processing'
  WHERE  token_hash = v_token_hash
    AND  status     = 'pending'
    AND  expires_at > NOW()
  RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  BEGIN
    v_role_id := (v_invite.metadata->>'role_id')::UUID;
  EXCEPTION WHEN others THEN
    v_role_id := NULL;
  END;

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
    COALESCE(p_summary, ''),
    p_rating,
    COALESCE(p_kpi_ratings, '{}'::jsonb),
    COALESCE(p_detailed_feedback, '{}'::jsonb),
    'active',
    NOW(),
    v_invite.id
  )
  RETURNING id INTO v_reference_id;

  UPDATE reference_invites
  SET    status          = 'completed',
         completed_at    = NOW(),
         used_ip_hash    = p_ip_hash,
         used_user_agent = left(p_user_agent, 512)
  WHERE  id = v_invite.id;

  RETURN QUERY SELECT v_reference_id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_references_invite_id_unique'
  ) THEN
    RAISE EXCEPTION 'idx_references_invite_id_unique missing';
  END IF;

  RAISE NOTICE '✅ Migration 015 completed: invite security unified around SQL RPCs';
END $$;
