-- ============================================================================
-- HRScore Persistence & Automation Layer
-- ============================================================================
-- Migration: 009_hrscore_persistence.sql
-- Purpose: Enable historical tracking and automatic calculation of HRKey Scores
-- Author: HRKey Development Team
-- Date: 2025-12-11
--
-- This migration adds:
-- 1. hrkey_scores table - Historical score snapshots per user+role
-- 2. Indexes for fast queries
-- 3. Materialized views for latest scores and evolution tracking
-- 4. RLS policies for secure access
-- ============================================================================

-- ============================================================================
-- 1. HRKEY_SCORES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS hrkey_scores (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,

  -- Score data
  score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_prediction DECIMAL(12,4),
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  n_observations INT CHECK (n_observations >= 0),

  -- KPI breakdown
  used_kpis JSONB DEFAULT '[]'::jsonb,
  kpi_averages JSONB DEFAULT '{}'::jsonb,

  -- Model metadata
  model_info JSONB DEFAULT '{}'::jsonb,

  -- Trigger context
  trigger_source TEXT CHECK (
    trigger_source IN (
      'manual',
      'reference_validated',
      'kpi_observation',
      'scheduled',
      'api_request'
    )
  ),
  trigger_reference_id UUID REFERENCES references(id) ON DELETE SET NULL,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_score_confidence CHECK (
    (confidence IS NULL) OR (confidence BETWEEN 0 AND 1)
  )
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Primary lookups
CREATE INDEX idx_hrkey_scores_user_id ON hrkey_scores(user_id);
CREATE INDEX idx_hrkey_scores_role_id ON hrkey_scores(role_id);
CREATE INDEX idx_hrkey_scores_created_at ON hrkey_scores(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_hrkey_scores_user_created ON hrkey_scores(user_id, created_at DESC);
CREATE INDEX idx_hrkey_scores_user_role_created ON hrkey_scores(user_id, role_id, created_at DESC);

-- Trigger source filtering
CREATE INDEX idx_hrkey_scores_trigger_source ON hrkey_scores(trigger_source);
CREATE INDEX idx_hrkey_scores_trigger_reference ON hrkey_scores(trigger_reference_id) WHERE trigger_reference_id IS NOT NULL;

-- Score range queries
CREATE INDEX idx_hrkey_scores_score ON hrkey_scores(score);

-- JSONB indexes for KPI analysis
CREATE INDEX idx_hrkey_scores_used_kpis_gin ON hrkey_scores USING GIN (used_kpis);

-- ============================================================================
-- 3. MATERIALIZED VIEW: LATEST SCORES
-- ============================================================================

CREATE MATERIALIZED VIEW hrkey_scores_latest AS
SELECT DISTINCT ON (hs.user_id, hs.role_id)
  hs.id,
  hs.user_id,
  hs.role_id,
  hs.score,
  hs.raw_prediction,
  hs.confidence,
  hs.n_observations,
  hs.used_kpis,
  hs.kpi_averages,
  hs.model_info,
  hs.trigger_source,
  hs.created_at,
  u.email as user_email,
  u.wallet_address as user_wallet,
  r.role_name,
  r.industry
FROM hrkey_scores hs
JOIN users u ON hs.user_id = u.id
LEFT JOIN roles r ON hs.role_id = r.id
ORDER BY hs.user_id, hs.role_id, hs.created_at DESC;

-- Index on materialized view
CREATE UNIQUE INDEX idx_hrkey_scores_latest_user_role ON hrkey_scores_latest(user_id, COALESCE(role_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_hrkey_scores_latest_score ON hrkey_scores_latest(score DESC);

-- ============================================================================
-- 4. MATERIALIZED VIEW: SCORE EVOLUTION
-- ============================================================================

CREATE MATERIALIZED VIEW hrkey_score_evolution AS
WITH scored_history AS (
  SELECT
    hs.id,
    hs.user_id,
    hs.role_id,
    hs.score,
    hs.confidence,
    hs.n_observations,
    hs.trigger_source,
    hs.created_at,
    ROW_NUMBER() OVER (PARTITION BY hs.user_id, hs.role_id ORDER BY hs.created_at DESC) as rn,
    LAG(hs.score) OVER (PARTITION BY hs.user_id, hs.role_id ORDER BY hs.created_at) as previous_score,
    LAG(hs.created_at) OVER (PARTITION BY hs.user_id, hs.role_id ORDER BY hs.created_at) as previous_created_at
  FROM hrkey_scores hs
)
SELECT
  sh.id,
  sh.user_id,
  sh.role_id,
  sh.score,
  sh.previous_score,
  sh.score - COALESCE(sh.previous_score, sh.score) as score_delta,
  CASE
    WHEN sh.previous_score IS NULL THEN 'first_score'
    WHEN sh.score > sh.previous_score THEN 'improved'
    WHEN sh.score < sh.previous_score THEN 'declined'
    ELSE 'unchanged'
  END as score_trend,
  sh.confidence,
  sh.n_observations,
  sh.trigger_source,
  sh.created_at,
  sh.previous_created_at,
  EXTRACT(EPOCH FROM (sh.created_at - sh.previous_created_at)) / 86400 as days_since_previous,
  sh.rn as score_sequence,
  u.email as user_email,
  u.wallet_address as user_wallet,
  r.role_name
FROM scored_history sh
JOIN users u ON sh.user_id = u.id
LEFT JOIN roles r ON sh.role_id = r.id
WHERE sh.created_at >= NOW() - INTERVAL '365 days'; -- Last year only

-- Index on materialized view
CREATE INDEX idx_hrkey_score_evolution_user_created ON hrkey_score_evolution(user_id, created_at DESC);
CREATE INDEX idx_hrkey_score_evolution_trend ON hrkey_score_evolution(score_trend);

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function: Get latest score for a user
CREATE OR REPLACE FUNCTION get_latest_hrkey_score(
  p_user_id UUID,
  p_role_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  score DECIMAL(5,2),
  confidence DECIMAL(5,4),
  n_observations INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    hs.id,
    hs.score,
    hs.confidence,
    hs.n_observations,
    hs.created_at
  FROM hrkey_scores hs
  WHERE hs.user_id = p_user_id
    AND (p_role_id IS NULL OR hs.role_id = p_role_id)
  ORDER BY hs.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get score history for a user
CREATE OR REPLACE FUNCTION get_hrkey_score_history(
  p_user_id UUID,
  p_role_id UUID DEFAULT NULL,
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  id UUID,
  score DECIMAL(5,2),
  score_delta DECIMAL(5,2),
  confidence DECIMAL(5,4),
  n_observations INT,
  trigger_source TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    hs.id,
    hs.score,
    hs.score - LAG(hs.score) OVER (ORDER BY hs.created_at) as score_delta,
    hs.confidence,
    hs.n_observations,
    hs.trigger_source,
    hs.created_at
  FROM hrkey_scores hs
  WHERE hs.user_id = p_user_id
    AND (p_role_id IS NULL OR hs.role_id = p_role_id)
    AND hs.created_at >= NOW() - INTERVAL '1 day' * p_days
  ORDER BY hs.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Calculate score improvement percentage
CREATE OR REPLACE FUNCTION get_score_improvement_percentage(
  p_user_id UUID,
  p_role_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_first_score DECIMAL(5,2);
  v_latest_score DECIMAL(5,2);
  v_improvement DECIMAL(5,2);
BEGIN
  -- Get first score in period
  SELECT hs.score INTO v_first_score
  FROM hrkey_scores hs
  WHERE hs.user_id = p_user_id
    AND (p_role_id IS NULL OR hs.role_id = p_role_id)
    AND hs.created_at >= NOW() - INTERVAL '1 day' * p_days
  ORDER BY hs.created_at ASC
  LIMIT 1;

  -- Get latest score
  SELECT hs.score INTO v_latest_score
  FROM hrkey_scores hs
  WHERE hs.user_id = p_user_id
    AND (p_role_id IS NULL OR hs.role_id = p_role_id)
  ORDER BY hs.created_at DESC
  LIMIT 1;

  -- Calculate improvement percentage
  IF v_first_score IS NULL OR v_first_score = 0 THEN
    RETURN 0;
  END IF;

  v_improvement := ((v_latest_score - v_first_score) / v_first_score) * 100;

  RETURN ROUND(v_improvement, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE hrkey_scores ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmins can read all scores
CREATE POLICY "Superadmins can read all hrkey_scores"
  ON hrkey_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = auth.uid()
        AND users.is_superadmin = true
    )
  );

-- Policy: Users can read their own scores
CREATE POLICY "Users can read own hrkey_scores"
  ON hrkey_scores
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: System (service role) can insert scores
CREATE POLICY "System can insert hrkey_scores"
  ON hrkey_scores
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: System can update scores (for corrections)
CREATE POLICY "System can update hrkey_scores"
  ON hrkey_scores
  FOR UPDATE
  TO service_role
  USING (true);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE hrkey_scores IS 'Historical snapshots of HRKey Scores per user and role';
COMMENT ON COLUMN hrkey_scores.score IS 'Normalized HRKey Score (0-100)';
COMMENT ON COLUMN hrkey_scores.raw_prediction IS 'Raw model prediction before normalization';
COMMENT ON COLUMN hrkey_scores.confidence IS 'Confidence level (0-1) based on observation count';
COMMENT ON COLUMN hrkey_scores.n_observations IS 'Number of KPI observations used in calculation';
COMMENT ON COLUMN hrkey_scores.used_kpis IS 'Array of KPI names that contributed to this score';
COMMENT ON COLUMN hrkey_scores.kpi_averages IS 'Map of KPI names to average ratings used';
COMMENT ON COLUMN hrkey_scores.model_info IS 'Metadata about the ML model used (version, metrics, etc.)';
COMMENT ON COLUMN hrkey_scores.trigger_source IS 'What triggered this score calculation';
COMMENT ON COLUMN hrkey_scores.trigger_reference_id IS 'Reference ID if triggered by reference validation';
COMMENT ON COLUMN hrkey_scores.metadata IS 'Additional context (debug info, feature vector, etc.)';

COMMENT ON MATERIALIZED VIEW hrkey_scores_latest IS 'Latest HRKey Score per user and role combination';
COMMENT ON MATERIALIZED VIEW hrkey_score_evolution IS 'Score history with deltas and trends for the last year';

COMMENT ON FUNCTION get_latest_hrkey_score IS 'Get the most recent HRKey Score for a user (optionally filtered by role)';
COMMENT ON FUNCTION get_hrkey_score_history IS 'Get score history for a user over the last N days';
COMMENT ON FUNCTION get_score_improvement_percentage IS 'Calculate percentage improvement in score over a period';

-- ============================================================================
-- 8. REFRESH MATERIALIZED VIEWS (Run manually or via cron)
-- ============================================================================

-- Initial refresh
REFRESH MATERIALIZED VIEW hrkey_scores_latest;
REFRESH MATERIALIZED VIEW hrkey_score_evolution;

-- Note: Set up a cron job to refresh these views periodically:
-- Example (daily at 3 AM):
-- 0 3 * * * psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW CONCURRENTLY hrkey_scores_latest;"
-- 0 3 * * * psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW CONCURRENTLY hrkey_score_evolution;"

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
