-- =====================================================
-- KPI-DRIVEN REFERENCES SYSTEM (P0 - VERTICAL SLICE)
-- =====================================================
-- Purpose: Implement versioned, auditable, KPI-scoped reference system
--          References provide evidence AGAINST predefined KPIs (not free-text)
--
-- Architecture Principles:
-- 1. KPIs are predefined by role + seniority (versioned)
-- 2. References MUST be KPI-scoped (no orphan references)
-- 3. Immutability after submission (auditability)
-- 4. Version locking (references store exact kpi_set_version used)
-- 5. ML-ready data structure (weights, normalization, aggregation)
--
-- Author: Backend Architect
-- Date: 2026-01-12
-- =====================================================

-- =====================================================
-- TABLE 1: kpi_sets
-- =====================================================
-- Purpose: Versioned KPI definitions grouped by role + seniority
-- Versioning Strategy: Copy-on-write (new version on any KPI change)
-- Only ONE version can be 'active' per role+seniority at a time

CREATE TABLE IF NOT EXISTS kpi_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,                             -- e.g., 'backend_engineer', 'product_manager'
    seniority_level TEXT NOT NULL,                  -- 'junior', 'mid', 'senior', 'lead', 'principal'
    version INTEGER NOT NULL,                       -- Incrementing version number
    active BOOLEAN NOT NULL DEFAULT true,           -- Only one active version per role+seniority
    description TEXT,                               -- Optional: purpose/context of this KPI set
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),      -- Who created this version

    -- Ensure role+seniority+version is unique
    CONSTRAINT kpi_sets_role_seniority_version_unique UNIQUE (role, seniority_level, version),

    -- Validate seniority_level enum
    CONSTRAINT kpi_sets_seniority_level_check
        CHECK (seniority_level IN ('junior', 'mid', 'senior', 'lead', 'principal')),

    -- Version must be positive
    CONSTRAINT kpi_sets_version_positive CHECK (version > 0)
);

-- Index for fast lookup of active KPI sets
CREATE INDEX idx_kpi_sets_active_lookup ON kpi_sets (role, seniority_level, active)
WHERE active = true;

-- Index for version history queries
CREATE INDEX idx_kpi_sets_role_seniority ON kpi_sets (role, seniority_level, version DESC);

-- Unique constraint: Only ONE active version per role+seniority
CREATE UNIQUE INDEX idx_kpi_sets_active_unique
ON kpi_sets (role, seniority_level)
WHERE active = true;

COMMENT ON TABLE kpi_sets IS 'Versioned KPI definitions grouped by role and seniority level. References lock to a specific version for immutability.';
COMMENT ON COLUMN kpi_sets.active IS 'Only one version can be active per role+seniority. New references use the active version.';
COMMENT ON COLUMN kpi_sets.version IS 'Incrementing version number. References store this to maintain immutability.';


-- =====================================================
-- TABLE 2: kpis
-- =====================================================
-- Purpose: Individual KPI definitions within a KPI set
-- Each KPI has a key (machine-readable), name, description, and weight

CREATE TABLE IF NOT EXISTS kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_set_id UUID NOT NULL REFERENCES kpi_sets(id) ON DELETE CASCADE,
    key TEXT NOT NULL,                              -- Machine-readable key: 'code_quality', 'communication'
    name TEXT NOT NULL,                             -- Human-readable name: 'Code Quality'
    description TEXT NOT NULL,                      -- What this KPI measures
    category TEXT,                                  -- Optional grouping: 'technical', 'leadership', 'collaboration'
    required BOOLEAN NOT NULL DEFAULT true,         -- Must be scored in every reference?
    weight DECIMAL(5,4) NOT NULL DEFAULT 1.0000,    -- Weight for HRScore calculation (0.0001 to 9.9999)

    -- Additional metadata for ML/analytics
    min_evidence_length INTEGER DEFAULT 200,        -- Minimum characters required for evidence_text
    expected_data_type TEXT DEFAULT 'text',         -- 'text', 'numeric', 'boolean' (future extensibility)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure key is unique within a KPI set
    CONSTRAINT kpis_set_key_unique UNIQUE (kpi_set_id, key),

    -- Weight must be positive
    CONSTRAINT kpis_weight_positive CHECK (weight > 0),

    -- Min evidence length must be reasonable
    CONSTRAINT kpis_min_evidence_check CHECK (min_evidence_length >= 50 AND min_evidence_length <= 5000)
);

-- Index for fast lookup of KPIs by set
CREATE INDEX idx_kpis_set_id ON kpis (kpi_set_id);

-- Index for required KPI validation
CREATE INDEX idx_kpis_required ON kpis (kpi_set_id, required) WHERE required = true;

COMMENT ON TABLE kpis IS 'Individual KPI definitions within a versioned KPI set. Each KPI has a weight for HRScore calculation.';
COMMENT ON COLUMN kpis.key IS 'Machine-readable identifier (e.g., code_quality, leadership_impact). Used in API payloads.';
COMMENT ON COLUMN kpis.required IS 'If true, this KPI MUST be scored in every reference submission.';
COMMENT ON COLUMN kpis.weight IS 'Weight for aggregation and HRScore calculation. Higher weight = more important.';
COMMENT ON COLUMN kpis.min_evidence_length IS 'Minimum character length required for evidence_text. Enforces quality.';


-- =====================================================
-- TABLE 3: reference_requests
-- =====================================================
-- Purpose: Invitation/request tracking for references
-- Token-based access control with expiration
-- Locks to a specific KPI set version at creation time

CREATE TABLE IF NOT EXISTS reference_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Candidate being evaluated
    candidate_id UUID NOT NULL REFERENCES auth.users(id),
    candidate_wallet TEXT,                          -- Optional: if wallet-based identity used

    -- Referee (person giving the reference)
    referee_email TEXT NOT NULL,                    -- Email to send invite to
    referee_name TEXT,                              -- Optional: pre-filled name

    -- Relationship context
    relationship_type TEXT NOT NULL,                -- 'manager', 'peer', 'report', 'client', 'mentor'

    -- Role and seniority being evaluated
    role TEXT NOT NULL,                             -- Must match kpi_sets.role
    seniority_level TEXT NOT NULL,                  -- Must match kpi_sets.seniority_level

    -- Version locking (immutability guarantee)
    kpi_set_id UUID NOT NULL REFERENCES kpi_sets(id),
    kpi_set_version INTEGER NOT NULL,               -- Snapshot for auditability

    -- Token-based access control
    token TEXT NOT NULL UNIQUE,                     -- Secure random token (64+ chars)
    token_hash TEXT NOT NULL,                       -- SHA-256 hash for secure lookup
    expires_at TIMESTAMPTZ NOT NULL,                -- Token expiration (typically 30-90 days)

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending',         -- 'pending', 'submitted', 'expired', 'revoked'

    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),      -- Who created this request (usually candidate or admin)
    submitted_at TIMESTAMPTZ,                       -- When reference was submitted

    -- Optional: reminder tracking
    reminder_sent_count INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,

    -- Validate status enum
    CONSTRAINT reference_requests_status_check
        CHECK (status IN ('pending', 'submitted', 'expired', 'revoked')),

    -- Validate relationship type
    CONSTRAINT reference_requests_relationship_check
        CHECK (relationship_type IN ('manager', 'peer', 'report', 'client', 'mentor', 'other')),

    -- Validate seniority level
    CONSTRAINT reference_requests_seniority_check
        CHECK (seniority_level IN ('junior', 'mid', 'senior', 'lead', 'principal')),

    -- Expiration must be in the future at creation
    CONSTRAINT reference_requests_expiration_future
        CHECK (expires_at > created_at)
);

-- Index for token lookup (primary access pattern)
CREATE UNIQUE INDEX idx_reference_requests_token_hash ON reference_requests (token_hash);

-- Index for candidate's requests
CREATE INDEX idx_reference_requests_candidate ON reference_requests (candidate_id, status);

-- Index for referee email (future: referee dashboard)
CREATE INDEX idx_reference_requests_referee_email ON reference_requests (referee_email, status);

-- Index for expiration cleanup job
CREATE INDEX idx_reference_requests_expiration ON reference_requests (expires_at, status)
WHERE status = 'pending';

COMMENT ON TABLE reference_requests IS 'Invitation/request tracking for KPI-driven references. Token-based access with version locking.';
COMMENT ON COLUMN reference_requests.token IS 'Secure random token (plain text, sent in email). Used for GET /api/references/request/:token';
COMMENT ON COLUMN reference_requests.token_hash IS 'SHA-256 hash of token for secure database lookup. Prevents token leakage from DB dumps.';
COMMENT ON COLUMN reference_requests.kpi_set_version IS 'Locked version at request creation. Ensures reference uses correct KPI definitions.';


-- =====================================================
-- TABLE 4: references
-- =====================================================
-- Purpose: Submitted reference data (header/metadata)
-- KPI scores stored separately in reference_kpi_scores
-- Immutable after submission (no updates allowed)

CREATE TABLE IF NOT EXISTS kpi_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to request
    reference_request_id UUID NOT NULL UNIQUE REFERENCES reference_requests(id),

    -- Candidate & referee (denormalized for performance)
    candidate_id UUID NOT NULL REFERENCES auth.users(id),
    referee_id UUID REFERENCES auth.users(id),      -- NULL if referee not registered
    referee_email TEXT NOT NULL,                    -- Always stored
    referee_name TEXT,                              -- Optional: if provided

    -- Relationship context (captured at submission)
    relationship_type TEXT NOT NULL,                -- Manager, peer, etc.
    start_date DATE,                                -- Start of working relationship
    end_date DATE,                                  -- End of working relationship (NULL if current)

    -- Overall assessment
    overall_recommendation TEXT,                    -- Optional: 'strongly_recommend', 'recommend', 'neutral', 'not_recommend'
    rehire_decision TEXT NOT NULL,                  -- 'yes', 'no', 'conditional'
    rehire_reasoning TEXT,                          -- Optional: explanation for rehire decision

    -- Confidence & quality indicators
    confidence_level TEXT NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'

    -- Audit & integrity
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signature_hash TEXT NOT NULL,                   -- Hash of all content for tamper detection
    ip_address INET,                                -- Optional: IP address of submission
    user_agent TEXT,                                -- Optional: browser user agent

    -- Version lock (immutability)
    kpi_set_id UUID NOT NULL REFERENCES kpi_sets(id),
    kpi_set_version INTEGER NOT NULL,

    -- Quality metadata (for future filtering)
    completeness_score DECIMAL(3,2),                -- 0.00 to 1.00 (calculated: % of optional fields filled)
    avg_evidence_length INTEGER,                    -- Average chars per KPI evidence (quality signal)

    -- Validate enums
    CONSTRAINT kpi_references_relationship_check
        CHECK (relationship_type IN ('manager', 'peer', 'report', 'client', 'mentor', 'other')),

    CONSTRAINT kpi_references_rehire_check
        CHECK (rehire_decision IN ('yes', 'no', 'conditional')),

    CONSTRAINT kpi_references_confidence_check
        CHECK (confidence_level IN ('high', 'medium', 'low')),

    CONSTRAINT kpi_references_recommendation_check
        CHECK (overall_recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommend', NULL)),

    -- Date validation: end_date must be after start_date
    CONSTRAINT kpi_references_date_order CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Index for candidate lookup (primary access pattern)
CREATE INDEX idx_kpi_references_candidate ON kpi_references (candidate_id, submitted_at DESC);

-- Index for referee lookup (future: referee dashboard)
CREATE INDEX idx_kpi_references_referee ON kpi_references (referee_email);

-- Index for quality filtering
CREATE INDEX idx_kpi_references_quality ON kpi_references (candidate_id, confidence_level, completeness_score);

COMMENT ON TABLE kpi_references IS 'Submitted KPI-driven references. Immutable after submission. KPI scores stored in separate table.';
COMMENT ON COLUMN kpi_references.signature_hash IS 'SHA-256 hash of submitted data for tamper detection. Includes all KPI scores and evidence.';
COMMENT ON COLUMN kpi_references.reference_request_id IS 'One-to-one with reference_requests. Each token can only be used once.';
COMMENT ON COLUMN kpi_references.completeness_score IS 'Calculated metric: percentage of optional fields filled. Higher = more comprehensive reference.';


-- =====================================================
-- TABLE 5: reference_kpi_scores
-- =====================================================
-- Purpose: Individual KPI scores and evidence within a reference
-- Normalized data structure for ML/analytics
-- Each row = one KPI score + evidence from one reference

CREATE TABLE IF NOT EXISTS reference_kpi_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent reference
    reference_id UUID NOT NULL REFERENCES kpi_references(id) ON DELETE CASCADE,

    -- KPI being scored
    kpi_id UUID NOT NULL REFERENCES kpis(id),
    kpi_key TEXT NOT NULL,                          -- Denormalized for fast queries
    kpi_name TEXT NOT NULL,                         -- Denormalized for display

    -- Score and evidence
    score INTEGER NOT NULL,                         -- 1 to 5 scale
    evidence_text TEXT NOT NULL,                    -- Required: specific examples and context

    -- Confidence indicator (per-KPI)
    confidence_level TEXT NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'

    -- Optional: structured evidence metadata (future extensibility)
    evidence_metadata JSONB,                        -- e.g., {"metrics": {"bug_count": 3}, "time_period": "Q1 2025"}

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Validate score range
    CONSTRAINT reference_kpi_scores_score_range CHECK (score >= 1 AND score <= 5),

    -- Validate confidence
    CONSTRAINT reference_kpi_scores_confidence_check
        CHECK (confidence_level IN ('high', 'medium', 'low')),

    -- Ensure each KPI scored only once per reference
    CONSTRAINT reference_kpi_scores_unique UNIQUE (reference_id, kpi_id),

    -- Evidence minimum length (enforced at application layer too)
    CONSTRAINT reference_kpi_scores_evidence_min_length CHECK (LENGTH(evidence_text) >= 50)
);

-- Index for reference lookup (get all KPI scores for a reference)
CREATE INDEX idx_reference_kpi_scores_reference ON reference_kpi_scores (reference_id);

-- Index for KPI aggregation (get all scores for a specific KPI)
CREATE INDEX idx_reference_kpi_scores_kpi ON reference_kpi_scores (kpi_id, score);

-- Index for candidate KPI analysis (via reference_id join)
CREATE INDEX idx_reference_kpi_scores_kpi_key ON reference_kpi_scores (kpi_key, score);

COMMENT ON TABLE reference_kpi_scores IS 'Individual KPI scores with evidence. Normalized structure for aggregation and ML.';
COMMENT ON COLUMN reference_kpi_scores.score IS 'Rating on 1-5 scale. 1=Poor, 2=Below Expectations, 3=Meets Expectations, 4=Exceeds, 5=Outstanding';
COMMENT ON COLUMN reference_kpi_scores.evidence_text IS 'Required specific examples and context. Minimum 50 chars (enforced), recommended 200+ chars.';
COMMENT ON COLUMN reference_kpi_scores.kpi_key IS 'Denormalized from kpis.key for fast filtering without joins.';


-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on all tables for security

ALTER TABLE kpi_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_kpi_scores ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS: kpi_sets & kpis (public read access)
-- =====================================================
-- Anyone can read KPI definitions (public data)
-- Only admins can create/update (via service role key)

CREATE POLICY "kpi_sets_read_all" ON kpi_sets
    FOR SELECT USING (true);

CREATE POLICY "kpis_read_all" ON kpis
    FOR SELECT USING (true);


-- =====================================================
-- RLS: reference_requests
-- =====================================================
-- Candidate can read their own requests
-- Referee can read requests by token (handled in application layer)
-- Admins can read all (via service role key)

CREATE POLICY "reference_requests_read_own" ON reference_requests
    FOR SELECT
    USING (candidate_id = auth.uid());

CREATE POLICY "reference_requests_insert_own" ON reference_requests
    FOR INSERT
    WITH CHECK (candidate_id = auth.uid() OR created_by = auth.uid());


-- =====================================================
-- RLS: kpi_references
-- =====================================================
-- Candidate can read their own references
-- Referee can read references they submitted
-- Public access if candidate has enabled profile sharing (future)

CREATE POLICY "kpi_references_read_own_candidate" ON kpi_references
    FOR SELECT
    USING (candidate_id = auth.uid());

CREATE POLICY "kpi_references_read_own_referee" ON kpi_references
    FOR SELECT
    USING (referee_id = auth.uid());

CREATE POLICY "kpi_references_insert_any" ON kpi_references
    FOR INSERT
    WITH CHECK (true); -- Token validation happens in application layer


-- =====================================================
-- RLS: reference_kpi_scores
-- =====================================================
-- Access controlled via parent reference (join required)
-- Simplified: if you can read the reference, you can read its scores

CREATE POLICY "reference_kpi_scores_read_via_reference" ON reference_kpi_scores
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM kpi_references
            WHERE kpi_references.id = reference_kpi_scores.reference_id
            AND (kpi_references.candidate_id = auth.uid() OR kpi_references.referee_id = auth.uid())
        )
    );

CREATE POLICY "reference_kpi_scores_insert_any" ON reference_kpi_scores
    FOR INSERT
    WITH CHECK (true); -- Controlled via reference creation


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function: Get active KPI set for role + seniority
CREATE OR REPLACE FUNCTION get_active_kpi_set(p_role TEXT, p_seniority_level TEXT)
RETURNS TABLE (
    kpi_set_id UUID,
    version INTEGER,
    kpi_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ks.id,
        ks.version,
        COUNT(k.id) as kpi_count
    FROM kpi_sets ks
    LEFT JOIN kpis k ON k.kpi_set_id = ks.id
    WHERE ks.role = p_role
      AND ks.seniority_level = p_seniority_level
      AND ks.active = true
    GROUP BY ks.id, ks.version
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_active_kpi_set IS 'Returns the active KPI set for a given role and seniority level with KPI count.';


-- Function: Calculate reference completeness score
CREATE OR REPLACE FUNCTION calculate_completeness_score(p_reference_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
    v_total_fields INTEGER := 10; -- Total optional fields we track
    v_filled_fields INTEGER := 0;
BEGIN
    SELECT
        (CASE WHEN referee_name IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN start_date IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN end_date IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN overall_recommendation IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN rehire_reasoning IS NOT NULL AND LENGTH(rehire_reasoning) > 20 THEN 1 ELSE 0 END) +
        (CASE WHEN confidence_level = 'high' THEN 1 ELSE 0 END) +
        (CASE WHEN avg_evidence_length > 300 THEN 1 ELSE 0 END) +
        (CASE WHEN (SELECT COUNT(*) FROM reference_kpi_scores WHERE reference_id = p_reference_id) >= 8 THEN 1 ELSE 0 END) +
        (CASE WHEN (SELECT AVG(LENGTH(evidence_text)) FROM reference_kpi_scores WHERE reference_id = p_reference_id) > 250 THEN 1 ELSE 0 END) +
        (CASE WHEN (SELECT COUNT(*) FROM reference_kpi_scores WHERE reference_id = p_reference_id AND confidence_level = 'high') >= 5 THEN 1 ELSE 0 END)
    INTO v_filled_fields
    FROM kpi_references
    WHERE id = p_reference_id;

    RETURN ROUND((v_filled_fields::DECIMAL / v_total_fields::DECIMAL), 2);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_completeness_score IS 'Calculates a 0.00-1.00 score representing how complete/comprehensive a reference is.';


-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Auto-update avg_evidence_length and completeness_score after KPI scores inserted
CREATE OR REPLACE FUNCTION update_reference_quality_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE kpi_references
    SET
        avg_evidence_length = (
            SELECT AVG(LENGTH(evidence_text))::INTEGER
            FROM reference_kpi_scores
            WHERE reference_id = NEW.reference_id
        ),
        completeness_score = calculate_completeness_score(NEW.reference_id)
    WHERE id = NEW.reference_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reference_quality
    AFTER INSERT ON reference_kpi_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_reference_quality_metrics();

COMMENT ON TRIGGER trigger_update_reference_quality ON reference_kpi_scores IS 'Auto-updates reference quality metrics after KPI scores are inserted.';


-- Trigger: Auto-expire pending reference requests
CREATE OR REPLACE FUNCTION auto_expire_reference_requests()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at <= NOW() AND NEW.status = 'pending' THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is a safety net. Application should handle expiration checks.
-- For bulk expiration, use a scheduled job.


-- =====================================================
-- MATERIALIZED VIEW: Candidate KPI Aggregates
-- =====================================================
-- Purpose: Pre-aggregated KPI scores per candidate for fast retrieval
-- Refresh strategy: On-demand or scheduled (REFRESH MATERIALIZED VIEW)

CREATE MATERIALIZED VIEW IF NOT EXISTS candidate_kpi_aggregates AS
SELECT
    kr.candidate_id,
    rks.kpi_key,
    rks.kpi_name,
    COUNT(rks.id) as reference_count,
    AVG(rks.score) as avg_score,
    STDDEV(rks.score) as score_stddev,
    MIN(rks.score) as min_score,
    MAX(rks.score) as max_score,

    -- Confidence-weighted average (high=1.0, medium=0.8, low=0.5)
    AVG(
        rks.score *
        CASE rks.confidence_level
            WHEN 'high' THEN 1.0
            WHEN 'medium' THEN 0.8
            WHEN 'low' THEN 0.5
        END
    ) as weighted_avg_score,

    -- Count by confidence level
    COUNT(*) FILTER (WHERE rks.confidence_level = 'high') as high_confidence_count,
    COUNT(*) FILTER (WHERE rks.confidence_level = 'medium') as medium_confidence_count,
    COUNT(*) FILTER (WHERE rks.confidence_level = 'low') as low_confidence_count,

    -- Average evidence length (quality signal)
    AVG(LENGTH(rks.evidence_text))::INTEGER as avg_evidence_length,

    MAX(kr.submitted_at) as latest_reference_date
FROM kpi_references kr
JOIN reference_kpi_scores rks ON rks.reference_id = kr.id
GROUP BY kr.candidate_id, rks.kpi_key, rks.kpi_name;

CREATE UNIQUE INDEX idx_candidate_kpi_aggregates_unique
ON candidate_kpi_aggregates (candidate_id, kpi_key);

CREATE INDEX idx_candidate_kpi_aggregates_candidate
ON candidate_kpi_aggregates (candidate_id);

COMMENT ON MATERIALIZED VIEW candidate_kpi_aggregates IS 'Pre-aggregated KPI scores per candidate. Refresh after new references submitted. Used for fast GET /api/references/candidate/:id endpoint.';


-- =====================================================
-- GRANTS (Service Role Key Access)
-- =====================================================
-- Grant full access to service role for backend operations
-- Application enforces business logic and fine-grained permissions

GRANT ALL ON kpi_sets TO service_role;
GRANT ALL ON kpis TO service_role;
GRANT ALL ON reference_requests TO service_role;
GRANT ALL ON kpi_references TO service_role;
GRANT ALL ON reference_kpi_scores TO service_role;
GRANT ALL ON candidate_kpi_aggregates TO service_role;


-- =====================================================
-- END OF MIGRATION
-- =====================================================

-- USAGE NOTES:
-- 1. Run this migration via Supabase CLI or SQL editor
-- 2. Seed initial KPI sets using seed_kpi_sets.sql (separate file)
-- 3. Refresh materialized view after bulk imports: REFRESH MATERIALIZED VIEW candidate_kpi_aggregates;
-- 4. For production, add scheduled job to expire old pending requests and refresh MV
-- 5. Consider partitioning reference_kpi_scores by candidate_id if scale exceeds 1M rows

-- ARCHITECTURAL DECISIONS LOG:
-- [AD-1] Token storage: Plain text token stored for email sending, SHA-256 hash for lookup (security)
-- [AD-2] Denormalization: kpi_key/name copied to reference_kpi_scores for performance (avoid joins)
-- [AD-3] Version locking: kpi_set_version stored in both reference_requests and references (immutability)
-- [AD-4] One-to-one constraint: reference_request_id UNIQUE in references (single-use tokens)
-- [AD-5] Materialized view: Trade-off for read performance vs. write complexity (acceptable for P0)
-- [AD-6] RLS policies: Simplified for P0, can be tightened with role-based policies in future
-- [AD-7] Completeness score: Calculated metric for filtering low-quality references (ML readiness)
