-- ============================================================================
-- Candidate-managed recruiter access for reference packs
-- ============================================================================
-- Description: Explicit recruiter grants for candidate reference-pack reads.
-- Issue: #188
-- Epic: #227 Access Control & Capability Tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS reference_pack_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recruiter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reference_pack_access_grants_candidate_recruiter_unique
    UNIQUE (candidate_user_id, recruiter_user_id),
  CONSTRAINT reference_pack_access_grants_not_self
    CHECK (candidate_user_id <> recruiter_user_id),
  CONSTRAINT reference_pack_access_grants_revocation_consistency
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (status IN ('active', 'expired') AND revoked_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_reference_pack_access_candidate
  ON reference_pack_access_grants(candidate_user_id);
CREATE INDEX IF NOT EXISTS idx_reference_pack_access_recruiter
  ON reference_pack_access_grants(recruiter_user_id);
CREATE INDEX IF NOT EXISTS idx_reference_pack_access_status
  ON reference_pack_access_grants(status);
CREATE INDEX IF NOT EXISTS idx_reference_pack_access_expires_at
  ON reference_pack_access_grants(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE reference_pack_access_grants IS
  'Explicit candidate-managed recruiter access grants for canonical reference pack and reference reads. MVP intentionally stores one mutable current-grant row per candidate/recruiter pair instead of append-only grant history.';
COMMENT ON COLUMN reference_pack_access_grants.candidate_user_id IS
  'The candidate who owns the canonical reference pack scope; used as the domain anchor because packs are derived, not persisted as a separate entity.';
COMMENT ON COLUMN reference_pack_access_grants.recruiter_user_id IS
  'Recruiter user granted access; expected to map to an active company_signers user.';
COMMENT ON COLUMN reference_pack_access_grants.metadata IS
  'Optional notes and future extension metadata for capability-token migration.';

DROP TRIGGER IF EXISTS update_reference_pack_access_grants_updated_at ON reference_pack_access_grants;
CREATE TRIGGER update_reference_pack_access_grants_updated_at
  BEFORE UPDATE ON reference_pack_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reference_pack_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can view their reference access grants"
  ON reference_pack_access_grants FOR SELECT
  USING (
    candidate_user_id = auth.uid()
    OR recruiter_user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

CREATE POLICY "Candidates can create their reference access grants"
  ON reference_pack_access_grants FOR INSERT
  WITH CHECK (
    candidate_user_id = auth.uid()
    AND granted_by = auth.uid()
  );

CREATE POLICY "Candidates can update their reference access grants"
  ON reference_pack_access_grants FOR UPDATE
  USING (
    candidate_user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );
