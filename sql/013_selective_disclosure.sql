-- =============================================================================
-- Migration 013: Selective Disclosure Infrastructure
-- HRKey Grant Architecture Spec v1.0.0
-- =============================================================================
-- Creates tables for:
--   - verifier_requests  (VerifierRequestObject)
--   - consent_objects    (ConsentObject with crypto binding)
--   - disclosure_proofs  (DisclosureProofObject)
--   - reference_field_hashes (per-field hash commitments)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: reference_field_hashes
-- Stores per-field hash commitments for each reference (Merkle leaves).
-- Salts are stored encrypted in the vault (sdl_statements), NOT here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_field_hashes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id          UUID        NOT NULL REFERENCES references(id) ON DELETE CASCADE,
  field_name      TEXT        NOT NULL,  -- e.g. "relationship", "duration_months"
  field_hash      TEXT        NOT NULL,  -- sha256:<hex> — commitment without salt
  leaf_index      SMALLINT    NOT NULL,  -- Position in Merkle tree (0-based, sorted by field_name)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_ref_field UNIQUE (ref_id, field_name)
);

CREATE INDEX idx_rfh_ref_id ON reference_field_hashes (ref_id);

COMMENT ON TABLE reference_field_hashes IS
  'Per-field SHA-256 hash commitments enabling Merkle selective disclosure. '
  'Salts stored only in vault. See HRKey Grant Arch Spec §1.1.';

-- ---------------------------------------------------------------------------
-- TABLE: reference_merkle_roots
-- Stores the computed Merkle root for each reference + Base chain anchor info.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_merkle_roots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id           UUID        NOT NULL UNIQUE REFERENCES references(id) ON DELETE CASCADE,
  root_hash        TEXT        NOT NULL,  -- sha256:<hex> Merkle root of all field_hashes
  field_count      SMALLINT    NOT NULL,  -- Number of fields in this tree
  author_signature TEXT        NOT NULL,  -- EIP-191 sig of root_hash by reviewer wallet
  anchor_tx        TEXT,                  -- 0x<tx_hash> on Base after anchoring
  anchor_block     BIGINT,               -- Block number on Base
  anchor_contract  TEXT,                  -- HRKAnchorRegistry contract address
  chain_id         INTEGER     NOT NULL DEFAULT 8453,
  anchored_at      TIMESTAMPTZ,           -- Timestamp when TX was confirmed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rmr_ref_id   ON reference_merkle_roots (ref_id);
CREATE INDEX idx_rmr_root_hash ON reference_merkle_roots (root_hash);

COMMENT ON TABLE reference_merkle_roots IS
  'Merkle root for each reference and Base chain anchor details. '
  'See HRKey Grant Arch Spec §1.1 and §3 Step 3.';

-- ---------------------------------------------------------------------------
-- TABLE: verifier_requests
-- Stores VerifierRequestObjects — requests from recruiters/verifiers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verifier_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_version        TEXT        NOT NULL DEFAULT '1.0.0',
  verifier_did        TEXT        NOT NULL,   -- did:ethr:base:0x...
  verifier_company_id UUID        REFERENCES companies(id),
  subject_did         TEXT        NOT NULL,   -- Candidate's DID
  subject_user_id     UUID        REFERENCES users(id),
  ref_id              UUID        NOT NULL REFERENCES references(id),
  requested_fields    TEXT[]      NOT NULL,   -- e.g. ARRAY['relationship','duration_months']
  purpose             TEXT        NOT NULL,   -- hiring_decision | background_check | research | verification
  nonce               TEXT        NOT NULL,   -- 32-byte random hex, unique per request
  request_hash        TEXT        NOT NULL,   -- sha256 of canonical request body
  verifier_signature  TEXT        NOT NULL,   -- EIP-191 sig over request_hash
  status              TEXT        NOT NULL DEFAULT 'pending',
    -- pending | consent_granted | proof_generated | verified | expired | denied
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT verifier_requests_status_check CHECK (
    status IN ('pending','consent_granted','proof_generated','verified','expired','denied')
  ),
  CONSTRAINT verifier_requests_purpose_check CHECK (
    purpose IN ('hiring_decision','background_check','research','verification')
  ),
  CONSTRAINT verifier_requests_nonce_unique UNIQUE (nonce)
);

CREATE INDEX idx_vr_subject_user_id ON verifier_requests (subject_user_id);
CREATE INDEX idx_vr_verifier_company ON verifier_requests (verifier_company_id);
CREATE INDEX idx_vr_ref_id          ON verifier_requests (ref_id);
CREATE INDEX idx_vr_status          ON verifier_requests (status);

COMMENT ON TABLE verifier_requests IS
  'VerifierRequestObject storage. Recruiter requests to verify candidate reference fields. '
  'See HRKey Grant Arch Spec §1.4 and §3 Step 4.';

-- ---------------------------------------------------------------------------
-- TABLE: consent_objects
-- Stores ConsentObjects — cryptographically signed consent grants by subjects.
-- Extends the existing `consents` table with crypto-binding fields.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_objects (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_version        TEXT        NOT NULL DEFAULT '1.0.0',
  -- Link to existing consent system
  consent_id          UUID        NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
  -- Crypto fields per spec §1.2
  subject_did         TEXT        NOT NULL,   -- did:ethr:base:0x...
  grantee_did         TEXT        NOT NULL,   -- Verifier's DID
  grantee_company_id  UUID        REFERENCES companies(id),
  ref_id              UUID        NOT NULL REFERENCES references(id),
  verifier_request_id UUID        REFERENCES verifier_requests(id),
  purpose             TEXT        NOT NULL,
  disclosed_fields    TEXT[]      NOT NULL,   -- Fields subject consents to disclose
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to            TIMESTAMPTZ,            -- null = open-ended (discouraged)
  nonce               TEXT        NOT NULL,   -- 32-byte random, unique across all consents
  subject_signature   TEXT        NOT NULL,   -- EIP-191 sig over consent_hash
  consent_hash        TEXT        NOT NULL,   -- sha256 of canonical consent body
  -- On-chain anchor
  anchor_tx           TEXT,                   -- 0x<tx_hash> on Base
  anchor_block        BIGINT,
  anchor_contract     TEXT,
  chain_id            INTEGER     NOT NULL DEFAULT 8453,
  anchored_at         TIMESTAMPTZ,
  -- Lifecycle
  revoked_at          TIMESTAMPTZ,
  revoked_by_did      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT consent_objects_nonce_unique   UNIQUE (nonce),
  CONSTRAINT consent_objects_hash_unique    UNIQUE (consent_hash),
  CONSTRAINT consent_objects_purpose_check  CHECK (
    purpose IN ('hiring_decision','background_check','research','verification')
  )
);

CREATE INDEX idx_co_consent_id          ON consent_objects (consent_id);
CREATE INDEX idx_co_ref_id              ON consent_objects (ref_id);
CREATE INDEX idx_co_verifier_request_id ON consent_objects (verifier_request_id);
CREATE INDEX idx_co_subject_did         ON consent_objects (subject_did);
CREATE INDEX idx_co_grantee_did         ON consent_objects (grantee_did);

COMMENT ON TABLE consent_objects IS
  'ConsentObject with cryptographic binding (DID, signature, on-chain anchor). '
  'Links to existing consents table for backward compatibility. '
  'See HRKey Grant Arch Spec §1.2 and §3 Step 5.';

-- ---------------------------------------------------------------------------
-- TABLE: disclosure_proofs
-- Stores DisclosureProofObjects delivered to verifiers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disclosure_proofs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_version          TEXT        NOT NULL DEFAULT '1.0.0',
  ref_id                UUID        NOT NULL REFERENCES references(id),
  consent_id            UUID        NOT NULL REFERENCES consents(id),
  consent_object_id     UUID        NOT NULL REFERENCES consent_objects(id),
  verifier_request_id   UUID        NOT NULL REFERENCES verifier_requests(id),
  -- Disclosed field data (stored as JSONB for flexibility)
  -- Structure: { field_name: { value, field_hash, merkle_path: [...], merkle_root } }
  disclosed_fields      JSONB       NOT NULL DEFAULT '{}',
  -- Undisclosed field hashes (field_name → sha256 hash only)
  undisclosed_field_hashes JSONB    NOT NULL DEFAULT '{}',
  -- Reference anchor info
  ref_anchor_tx         TEXT,
  ref_anchor_block      BIGINT,
  ref_anchor_contract   TEXT,
  ref_chain_id          INTEGER     NOT NULL DEFAULT 8453,
  -- Consent anchor info
  consent_anchor_tx     TEXT,
  consent_anchor_block  BIGINT,
  consent_anchor_contract TEXT,
  consent_chain_id      INTEGER     NOT NULL DEFAULT 8453,
  -- Proof integrity
  proof_hash            TEXT        NOT NULL,   -- sha256 of canonical proof body
  issuer_signature      TEXT        NOT NULL,   -- EIP-191 sig over proof_hash
  issuer_address        TEXT        NOT NULL,   -- Issuer wallet address that signed
  -- Delivery tracking
  delivered_at          TIMESTAMPTZ,            -- When proof was delivered to verifier
  verified_at           TIMESTAMPTZ,            -- When verifier confirmed verification
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dp_unique_per_request UNIQUE (verifier_request_id)
);

CREATE INDEX idx_dp_ref_id              ON disclosure_proofs (ref_id);
CREATE INDEX idx_dp_consent_id          ON disclosure_proofs (consent_id);
CREATE INDEX idx_dp_verifier_request_id ON disclosure_proofs (verifier_request_id);

COMMENT ON TABLE disclosure_proofs IS
  'DisclosureProofObject storage. Selective disclosure artifacts for verifiers. '
  'Contains Merkle proof paths for disclosed fields only. '
  'See HRKey Grant Arch Spec §1.3 and §3 Steps 6-7.';

-- ---------------------------------------------------------------------------
-- TABLE: verifier_verification_log
-- Tracks verifier-side verification attempts (audit trail).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verifier_verification_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id         UUID        NOT NULL REFERENCES disclosure_proofs(id),
  verifier_did     TEXT        NOT NULL,
  verification_result BOOLEAN  NOT NULL,  -- true = passed all checks
  failure_reason   TEXT,                  -- null if passed
  ref_anchor_valid  BOOLEAN,
  consent_anchor_valid BOOLEAN,
  signature_valid   BOOLEAN,
  fields_verified   TEXT[],               -- Which fields were checked
  verified_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address       TEXT,
  user_agent       TEXT
);

CREATE INDEX idx_vvl_proof_id ON verifier_verification_log (proof_id);

COMMENT ON TABLE verifier_verification_log IS
  'Audit log for verifier-side proof verification attempts. '
  'See HRKey Grant Arch Spec §3 Step 7 and §6 security invariants.';

-- ---------------------------------------------------------------------------
-- HELPER FUNCTION: check active consent object exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_active_consent_object(
  p_ref_id              UUID,
  p_grantee_did         TEXT,
  p_verifier_request_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM consent_objects co
    WHERE co.ref_id              = p_ref_id
      AND co.grantee_did         = p_grantee_did
      AND co.verifier_request_id = p_verifier_request_id
      AND co.revoked_at IS NULL
      AND (co.valid_to IS NULL OR co.valid_to > now())
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-update updated_at on verifier_requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vr_updated_at
  BEFORE UPDATE ON verifier_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_co_updated_at
  BEFORE UPDATE ON consent_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_rmr_updated_at
  BEFORE UPDATE ON reference_merkle_roots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE reference_field_hashes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_merkle_roots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifier_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_objects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosure_proofs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifier_verification_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend uses service key)
CREATE POLICY service_role_all ON reference_field_hashes   FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON reference_merkle_roots   FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON verifier_requests        FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON consent_objects          FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON disclosure_proofs        FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON verifier_verification_log FOR ALL TO service_role USING (true);
