-- ============================================================================
-- Capability Grants for Candidate-Controlled Reference Access
-- ============================================================================
-- Description: Cryptographically verifiable, revocable capability grants for
--              reference and reference-pack access. Extends EPIC #227.
-- ============================================================================

CREATE TABLE IF NOT EXISTS capability_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('candidate_reference_data')),
  resource_id UUID NOT NULL,
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('recruiter_user', 'link', 'external_reviewer')),
  grantee_id TEXT,
  allowed_actions TEXT[] NOT NULL DEFAULT ARRAY['read_references', 'read_reference_pack'],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL,
  token_hint TEXT,
  token_jti UUID NOT NULL DEFAULT gen_random_uuid(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT capability_grants_owner_candidate_match CHECK (owner_user_id = candidate_user_id),
  CONSTRAINT capability_grants_revocation_consistency CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status IN ('active', 'expired') AND revoked_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_capability_grants_candidate_user_id
  ON capability_grants(candidate_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_grants_resource
  ON capability_grants(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_capability_grants_status
  ON capability_grants(status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_grants_token_hash
  ON capability_grants(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_grants_token_jti
  ON capability_grants(token_jti);

COMMENT ON TABLE capability_grants IS
  'Server-side capability grants for candidate-controlled access to sensitive reference resources.';
COMMENT ON COLUMN capability_grants.token_hash IS
  'SHA-256 hash of the opaque capability secret; reusable plaintext tokens are never stored.';
COMMENT ON COLUMN capability_grants.allowed_actions IS
  'Action scope evaluated server-side for every protected request.';

DROP TRIGGER IF EXISTS update_capability_grants_updated_at ON capability_grants;
CREATE TRIGGER update_capability_grants_updated_at
  BEFORE UPDATE ON capability_grants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE capability_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can view their capability grants"
  ON capability_grants FOR SELECT
  USING (
    candidate_user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

CREATE POLICY "Candidates can create their capability grants"
  ON capability_grants FOR INSERT
  WITH CHECK (
    candidate_user_id = auth.uid()
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "Candidates can update their capability grants"
  ON capability_grants FOR UPDATE
  USING (
    candidate_user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );
