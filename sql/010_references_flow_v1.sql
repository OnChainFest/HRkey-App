-- ============================================================================
-- HRKey References Flow V1 - Database Schema
-- ============================================================================
-- Description: Complete references invitation and submission flow with security
-- Author: HRKey Development Team
-- Date: 2026-01-08
-- Purpose: Enable consent-based, traceable, tamper-resistant reference flow
-- ============================================================================

-- ============================================================================
-- 0. ENABLE REQUIRED EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. REFERENCE_INVITES TABLE
-- ============================================================================
-- Stores reference invitation requests with secure token hashing
-- Tokens are NEVER stored in plaintext - only SHA256 hash

CREATE TABLE IF NOT EXISTS reference_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Security: Store only hash of token, never plaintext
  token_hash TEXT UNIQUE NOT NULL,
  token_prefix TEXT, -- First 8 chars for debugging (optional)

  -- Invite details
  referrer_email TEXT NOT NULL,
  referrer_name TEXT NOT NULL,
  requester_id UUID REFERENCES users(id), -- Optional: who requested this reference

  -- Expiration and status
  expires_at TIMESTAMPTZ NOT NULL,
  invite_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invite_status IN ('pending', 'submitted', 'expired', 'revoked')),

  -- Metadata
  metadata JSONB, -- For future applicant data or context

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reference_invites_token_hash ON reference_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_reference_invites_status ON reference_invites(invite_status);
CREATE INDEX IF NOT EXISTS idx_reference_invites_expires ON reference_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_reference_invites_requester ON reference_invites(requester_id);

-- Comments
COMMENT ON TABLE reference_invites IS 'Reference invitation requests with secure token hashing (V1)';
COMMENT ON COLUMN reference_invites.token_hash IS 'SHA256 hash of invite token - never store plaintext';
COMMENT ON COLUMN reference_invites.token_prefix IS 'First 8 chars of token for debugging only';
COMMENT ON COLUMN reference_invites.invite_status IS 'pending=active, submitted=used, expired=time limit passed, revoked=cancelled';

-- ============================================================================
-- 2. REFERENCES TABLE (Base Schema)
-- ============================================================================
-- Stores submitted reference responses
-- This table will be extended by other migrations (007_reference_validation_layer.sql)

CREATE TABLE IF NOT EXISTS references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to invite
  invite_id UUID REFERENCES reference_invites(id) ON DELETE SET NULL,

  -- Reference content (V1 minimal fields)
  summary TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),

  -- Optional blockchain fields (for future Web3 integration)
  owner_id UUID REFERENCES users(id), -- Profile owner (candidate)
  address TEXT, -- Blockchain address
  cid TEXT, -- IPFS CID
  tx_hash TEXT, -- Transaction hash

  -- Referee information (denormalized for easy access)
  referrer_email TEXT,
  referrer_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_references_invite_id ON references(invite_id);
CREATE INDEX IF NOT EXISTS idx_references_owner_id ON references(owner_id);
CREATE INDEX IF NOT EXISTS idx_references_created_at ON references(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_references_address ON references(address);

-- Comments
COMMENT ON TABLE references IS 'Submitted reference responses (V1 + future Web3 fields)';
COMMENT ON COLUMN references.invite_id IS 'Links to the invitation that generated this reference';
COMMENT ON COLUMN references.summary IS 'Reference text/feedback from referee';
COMMENT ON COLUMN references.rating IS 'Overall rating 1-5 from referee';

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE reference_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE references ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3.1 RLS POLICIES FOR REFERENCE_INVITES
-- ============================================================================
-- CRITICAL: No direct access to reference_invites
-- All access must go through RPC functions (SECURITY DEFINER)

-- Deny all direct SELECT (force use of RPC)
CREATE POLICY "No direct select on reference_invites"
  ON reference_invites FOR SELECT
  USING (false);

-- Deny all direct INSERT (except service role via API)
CREATE POLICY "Service role can insert reference_invites"
  ON reference_invites FOR INSERT
  WITH CHECK (
    -- Only service role can insert directly
    auth.jwt()->>'role' = 'service_role'
  );

-- Deny all direct UPDATE (except through RPC)
CREATE POLICY "No direct update on reference_invites"
  ON reference_invites FOR UPDATE
  USING (false);

-- Deny all direct DELETE
CREATE POLICY "No direct delete on reference_invites"
  ON reference_invites FOR DELETE
  USING (false);

-- ============================================================================
-- 3.2 RLS POLICIES FOR REFERENCES
-- ============================================================================
-- V1 Decision: Authenticated users can view references
-- (Can be tightened later to owner-only or company-only)

-- Authenticated users can view references
CREATE POLICY "Authenticated users can view references"
  ON references FOR SELECT
  USING (
    auth.role() = 'authenticated'
    OR
    auth.jwt()->>'role' = 'service_role'
  );

-- No direct INSERT from client (must use RPC)
CREATE POLICY "Service role can insert references via RPC"
  ON references FOR INSERT
  WITH CHECK (
    auth.jwt()->>'role' = 'service_role'
    OR
    -- Allow through RPC context (will be service role)
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- No direct UPDATE or DELETE
CREATE POLICY "No direct update on references"
  ON references FOR UPDATE
  USING (false);

CREATE POLICY "No direct delete on references"
  ON references FOR DELETE
  USING (false);

-- ============================================================================
-- 4. RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- ============================================================================
-- 4.1 get_invite_by_token(p_token TEXT)
-- ============================================================================
-- Validates token and returns invite details
-- Automatically expires invites if past expiration time

CREATE OR REPLACE FUNCTION get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  reference_id UUID,
  referrer_email TEXT,
  referrer_name TEXT,
  expires_at TIMESTAMPTZ,
  invite_status TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_token_hash TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  -- Hash the provided token using SHA256
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Find invite by token hash
  SELECT
    ri.id,
    ri.expires_at,
    ri.invite_status
  INTO
    v_invite_id,
    v_expires_at,
    v_status
  FROM reference_invites ri
  WHERE ri.token_hash = v_token_hash;

  -- If not found, return empty
  IF v_invite_id IS NULL THEN
    RETURN;
  END IF;

  -- Check if expired and still pending -> mark as expired
  IF v_expires_at < NOW() AND v_status = 'pending' THEN
    UPDATE reference_invites
    SET invite_status = 'expired', updated_at = NOW()
    WHERE id = v_invite_id;
    v_status := 'expired';
  END IF;

  -- Return invite details (use invite_id as reference_id for UI compatibility)
  RETURN QUERY
  SELECT
    ri.id as reference_id,
    ri.referrer_email,
    ri.referrer_name,
    ri.expires_at,
    CASE
      WHEN ri.expires_at < NOW() AND ri.invite_status = 'pending' THEN 'expired'
      ELSE ri.invite_status
    END as invite_status
  FROM reference_invites ri
  WHERE ri.id = v_invite_id;
END;
$$;

-- Grant execute to authenticated and anon users (they need to access via token link)
GRANT EXECUTE ON FUNCTION get_invite_by_token(TEXT) TO authenticated, anon;

-- Comment
COMMENT ON FUNCTION get_invite_by_token IS 'Retrieves invite details by token (hashes token internally). SECURITY DEFINER.';

-- ============================================================================
-- 4.2 submit_reference_by_token(p_token TEXT, p_summary TEXT, p_rating INT)
-- ============================================================================
-- Validates token, creates reference, marks invite as submitted
-- Prevents reuse of tokens

CREATE OR REPLACE FUNCTION submit_reference_by_token(
  p_token TEXT,
  p_summary TEXT,
  p_rating INT
)
RETURNS TABLE (
  reference_id UUID
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_token_hash TEXT;
  v_invite_id UUID;
  v_invite_status TEXT;
  v_expires_at TIMESTAMPTZ;
  v_referrer_email TEXT;
  v_referrer_name TEXT;
  v_requester_id UUID;
  v_new_reference_id UUID;
BEGIN
  -- Validate inputs
  IF p_summary IS NULL OR trim(p_summary) = '' THEN
    RAISE EXCEPTION 'Summary cannot be empty';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  -- Hash the provided token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Find and lock the invite
  SELECT
    ri.id,
    ri.invite_status,
    ri.expires_at,
    ri.referrer_email,
    ri.referrer_name,
    ri.requester_id
  INTO
    v_invite_id,
    v_invite_status,
    v_expires_at,
    v_referrer_email,
    v_referrer_name,
    v_requester_id
  FROM reference_invites ri
  WHERE ri.token_hash = v_token_hash
  FOR UPDATE; -- Lock row to prevent race conditions

  -- Validate invite exists
  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  -- Check if already submitted
  IF v_invite_status = 'submitted' THEN
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;

  -- Check if expired
  IF v_expires_at < NOW() OR v_invite_status = 'expired' THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  -- Check if revoked
  IF v_invite_status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation has been revoked';
  END IF;

  -- Check status is pending
  IF v_invite_status != 'pending' THEN
    RAISE EXCEPTION 'This invitation is not active (status: %)', v_invite_status;
  END IF;

  -- Create the reference
  INSERT INTO references (
    invite_id,
    summary,
    rating,
    referrer_email,
    referrer_name,
    owner_id,
    created_at
  ) VALUES (
    v_invite_id,
    p_summary,
    p_rating,
    v_referrer_email,
    v_referrer_name,
    v_requester_id, -- Set owner_id to requester (candidate)
    NOW()
  )
  RETURNING id INTO v_new_reference_id;

  -- Mark invite as submitted
  UPDATE reference_invites
  SET
    invite_status = 'submitted',
    submitted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invite_id;

  -- Return the reference_id (using invite_id for UI compatibility)
  RETURN QUERY SELECT v_invite_id as reference_id;
END;
$$;

-- Grant execute to authenticated and anon users (referees don't need accounts)
GRANT EXECUTE ON FUNCTION submit_reference_by_token(TEXT, TEXT, INT) TO authenticated, anon;

-- Comment
COMMENT ON FUNCTION submit_reference_by_token IS 'Submits reference via token. Validates, creates reference, marks invite as submitted. SECURITY DEFINER.';

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reference_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for reference_invites
DROP TRIGGER IF EXISTS update_reference_invites_timestamp ON reference_invites;
CREATE TRIGGER update_reference_invites_timestamp
  BEFORE UPDATE ON reference_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_reference_invites_updated_at();

-- Function to automatically update references updated_at timestamp
CREATE OR REPLACE FUNCTION update_references_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for references
DROP TRIGGER IF EXISTS update_references_timestamp ON references;
CREATE TRIGGER update_references_timestamp
  BEFORE UPDATE ON references
  FOR EACH ROW
  EXECUTE FUNCTION update_references_updated_at();

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ References Flow V1 migration completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - reference_invites (with SHA256 token hashing)';
  RAISE NOTICE '  - references (base schema for V1)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies enabled:';
  RAISE NOTICE '  - reference_invites: No direct access, RPC-only';
  RAISE NOTICE '  - references: Authenticated users can view';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC functions created:';
  RAISE NOTICE '  - get_invite_by_token(p_token TEXT)';
  RAISE NOTICE '  - submit_reference_by_token(p_token TEXT, p_summary TEXT, p_rating INT)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security features:';
  RAISE NOTICE '  ✓ Tokens stored as SHA256 hash only';
  RAISE NOTICE '  ✓ Automatic expiration handling';
  RAISE NOTICE '  ✓ Token reuse prevention';
  RAISE NOTICE '  ✓ SECURITY DEFINER RPCs with safe search_path';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for V1 References Flow!';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
