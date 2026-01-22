-- ============================================================================
-- HRKey Consent & Audit Events Layer - P0 Security Enhancement
-- ============================================================================
-- Description: Implements institutional-grade consent management and audit logging
-- Author: HRKey Security Team
-- Date: 2026-01-22
-- Phase: P0 - Consent as first-class object
-- ============================================================================

-- ============================================================================
-- 1. CONSENTS TABLE
-- ============================================================================
-- Granular consent management for data access
-- Implements GDPR/legal-compliant consent tracking

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject: user whose data is being accessed
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Grantee: organization or user requesting access
  granted_to_org UUID REFERENCES companies(id) ON DELETE CASCADE,
  granted_to_user UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Resource: what is being accessed
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'references',
    'kpi_observations',
    'hrkey_score',
    'profile',
    'full_data'
  )),
  resource_id UUID, -- Optional: specific resource (e.g., specific reference_id)

  -- Scope: what actions are permitted
  scope TEXT[] NOT NULL DEFAULT ARRAY['read'], -- ['read', 'write', 'share']

  -- Purpose: why access is needed (for transparency)
  purpose TEXT NOT NULL, -- 'hiring_decision', 'background_check', 'research', etc.

  -- Status: consent lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'revoked',
    'expired'
  )),

  -- Temporal: expiration and revocation
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = no expiration
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id), -- Who revoked it (subject or admin)

  -- Audit: cryptographic proof (Phase 2: wallet signatures)
  consent_signature TEXT, -- Future: wallet signature for cryptographic proof
  consent_message TEXT, -- Message signed by wallet

  -- Metadata
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT consent_grantee_check CHECK (
    (granted_to_org IS NOT NULL AND granted_to_user IS NULL) OR
    (granted_to_org IS NULL AND granted_to_user IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consents_subject ON consents(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_consents_org ON consents(granted_to_org) WHERE granted_to_org IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(granted_to_user) WHERE granted_to_user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_resource ON consents(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);
CREATE INDEX IF NOT EXISTS idx_consents_active ON consents(subject_user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_consents_expires ON consents(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- Comments
COMMENT ON TABLE consents IS 'Institutional-grade consent management for data access. Implements GDPR/legal requirements.';
COMMENT ON COLUMN consents.subject_user_id IS 'User whose data is being accessed (data owner)';
COMMENT ON COLUMN consents.granted_to_org IS 'Company requesting access (mutually exclusive with granted_to_user)';
COMMENT ON COLUMN consents.granted_to_user IS 'Individual user requesting access (mutually exclusive with granted_to_org)';
COMMENT ON COLUMN consents.resource_type IS 'Type of data: references, kpi_observations, hrkey_score, profile, full_data';
COMMENT ON COLUMN consents.scope IS 'Array of permitted actions: read, write, share';
COMMENT ON COLUMN consents.purpose IS 'Declared purpose for transparency (hiring_decision, background_check, etc.)';
COMMENT ON COLUMN consents.status IS 'Consent lifecycle: active, revoked, expired';

-- ============================================================================
-- 2. AUDIT_EVENTS TABLE
-- ============================================================================
-- Comprehensive audit trail for all data access attempts
-- Records both ALLOWED and DENIED events for compliance

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor: who is attempting access
  actor_user_id UUID REFERENCES users(id), -- User making the request
  actor_company_id UUID REFERENCES companies(id), -- Company on whose behalf (if applicable)

  -- Action: what they're trying to do
  action TEXT NOT NULL CHECK (action IN (
    'read',
    'write',
    'update',
    'delete',
    'share',
    'export'
  )),

  -- Target: what they're trying to access
  target_type TEXT NOT NULL, -- 'reference', 'kpi_observation', 'hrkey_score', 'profile'
  target_id UUID, -- Specific resource ID
  target_owner_id UUID NOT NULL REFERENCES users(id), -- Owner of the data being accessed

  -- Purpose: declared purpose (for transparency)
  purpose TEXT, -- Same as consent.purpose

  -- Result: CRITICAL - was access allowed or denied?
  result TEXT NOT NULL CHECK (result IN ('allowed', 'denied')),

  -- Reason: why was it allowed/denied?
  reason TEXT, -- 'valid_consent', 'no_consent', 'expired_consent', 'revoked_consent', 'superadmin_override'

  -- Context
  consent_id UUID REFERENCES consents(id), -- Which consent was used (if any)
  ip_address TEXT,
  user_agent TEXT,

  -- Metadata
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_company ON audit_events(actor_company_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target_owner ON audit_events(target_owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_result ON audit_events(result);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_consent ON audit_events(consent_id) WHERE consent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_denied ON audit_events(result, created_at DESC) WHERE result = 'denied';

-- Comments
COMMENT ON TABLE audit_events IS 'Immutable audit trail for all data access attempts (both allowed and denied)';
COMMENT ON COLUMN audit_events.result IS 'CRITICAL: allowed or denied - enables compliance reporting';
COMMENT ON COLUMN audit_events.reason IS 'Why was access allowed/denied (valid_consent, no_consent, expired_consent, etc.)';

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Consents: Subject users can view their own consents
CREATE POLICY "Users can view consents for their data"
  ON consents FOR SELECT
  USING (
    subject_user_id = auth.uid()
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Consents: Subject users can create consents (grant access to their data)
CREATE POLICY "Users can grant consent for their data"
  ON consents FOR INSERT
  WITH CHECK (
    subject_user_id = auth.uid()
  );

-- Consents: Subject users can revoke their own consents
CREATE POLICY "Users can revoke their own consents"
  ON consents FOR UPDATE
  USING (
    subject_user_id = auth.uid()
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Audit Events: Users can view audit events for their own data
CREATE POLICY "Users can view audit events for their data"
  ON audit_events FOR SELECT
  USING (
    target_owner_id = auth.uid()
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superadmin'
    )
  );

-- Audit Events: Only service role can insert (server-side only)
-- No INSERT policy = only service_role can insert
COMMENT ON TABLE audit_events IS 'Audit events are append-only. Only backend service can insert.';

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if active consent exists
CREATE OR REPLACE FUNCTION has_active_consent(
  p_subject_user_id UUID,
  p_granted_to_org UUID,
  p_granted_to_user UUID,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  consent_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM consents
    WHERE subject_user_id = p_subject_user_id
      AND (
        (granted_to_org = p_granted_to_org AND granted_to_user IS NULL)
        OR
        (granted_to_user = p_granted_to_user AND granted_to_org IS NULL)
      )
      AND resource_type = p_resource_type
      AND (resource_id IS NULL OR resource_id = p_resource_id)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO consent_exists;

  RETURN consent_exists;
END;
$$;

COMMENT ON FUNCTION has_active_consent IS 'Check if an active, non-expired consent exists for the given parameters';

-- Function: Auto-expire consents (to be called by cron job)
CREATE OR REPLACE FUNCTION expire_consents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE consents
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM updated;

  RETURN expired_count;
END;
$$;

COMMENT ON FUNCTION expire_consents IS 'Auto-expire consents past their expiration date. Call from cron job daily.';

-- ============================================================================
-- 5. TRIGGER: Update updated_at on consents
-- ============================================================================

CREATE OR REPLACE FUNCTION update_consents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_consents_updated_at
  BEFORE UPDATE ON consents
  FOR EACH ROW
  EXECUTE FUNCTION update_consents_updated_at();

-- ============================================================================
-- 6. INITIAL DATA (Optional)
-- ============================================================================

-- No seed data needed for production
-- For testing, create sample consents in test suite

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verification queries (run manually to verify)
-- SELECT COUNT(*) FROM consents;
-- SELECT COUNT(*) FROM audit_events;
-- SELECT has_active_consent('user-uuid', 'company-uuid', NULL, 'references', NULL);
