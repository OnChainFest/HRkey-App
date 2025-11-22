-- ============================================================================
-- HRKey KPI Observations - Database Schema
-- ============================================================================
-- Description: Captures structured KPI evaluations (ratings + context)
--              for the Proof of Correlation MVP
-- Author: HRKey Development Team
-- Date: 2025-11-22
-- Phase: 1 - Data Capture Layer for ML Correlation Engine
-- ============================================================================

-- ============================================================================
-- 1. KPI_OBSERVATIONS TABLE
-- ============================================================================
-- Stores individual KPI observations/evaluations with ratings and context
-- Each row represents one KPI evaluation from an observer about a subject

CREATE TABLE IF NOT EXISTS kpi_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO is being evaluated (the subject/candidate/employee)
  subject_wallet TEXT NOT NULL,
  subject_user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- WHO is doing the evaluation (manager/colleague/signer)
  observer_wallet TEXT NOT NULL,
  observer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- WHAT role context
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  role_name TEXT, -- Denormalized for easier queries

  -- WHAT specific KPI is being evaluated
  kpi_id UUID, -- Future: could FK to a kpis master table
  kpi_name TEXT NOT NULL, -- e.g., "deployment_frequency", "code_quality"

  -- THE EVALUATION
  rating_value NUMERIC NOT NULL CHECK (rating_value >= 1 AND rating_value <= 5),
  outcome_value NUMERIC, -- Optional: measurable outcome (e.g., sales numbers, % completion)

  -- CONTEXT
  context_notes TEXT, -- Freeform text: why this rating, specific examples, etc.
  observed_at TIMESTAMPTZ DEFAULT NOW(), -- When the performance being evaluated occurred
  observation_period TEXT, -- e.g., "Q1 2024", "Jan-Mar 2024", for tracking time ranges

  -- METADATA
  source TEXT DEFAULT 'manual', -- 'manual', 'reference', 'self_assessment', 'company_reported'
  reference_id UUID REFERENCES references(id) ON DELETE SET NULL, -- If tied to a reference
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  -- TIMESTAMPS
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
-- Performance indexes for common queries

CREATE INDEX IF NOT EXISTS idx_kpi_observations_subject_wallet ON kpi_observations(subject_wallet);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_subject_user ON kpi_observations(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_observer_wallet ON kpi_observations(observer_wallet);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_observer_user ON kpi_observations(observer_user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_role ON kpi_observations(role_id);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_kpi_name ON kpi_observations(kpi_name);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_observed_at ON kpi_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_verified ON kpi_observations(verified);
CREATE INDEX IF NOT EXISTS idx_kpi_observations_reference ON kpi_observations(reference_id);

-- Composite index for common filtering patterns
CREATE INDEX IF NOT EXISTS idx_kpi_observations_subject_role
  ON kpi_observations(subject_wallet, role_id);

-- ============================================================================
-- 3. COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE kpi_observations IS
  'Stores individual KPI evaluations for correlation analysis. Each row is one KPI observation from an observer about a subject.';

COMMENT ON COLUMN kpi_observations.subject_wallet IS
  'Wallet address of the person being evaluated (candidate/employee)';

COMMENT ON COLUMN kpi_observations.observer_wallet IS
  'Wallet address of the person doing the evaluation (manager/colleague)';

COMMENT ON COLUMN kpi_observations.rating_value IS
  'Rating on 1-5 scale (can be adjusted for different KPI types)';

COMMENT ON COLUMN kpi_observations.outcome_value IS
  'Optional measurable outcome (e.g., sales numbers, error rate %, deployment count)';

COMMENT ON COLUMN kpi_observations.context_notes IS
  'Freeform context: specific examples, why this rating, situational details';

COMMENT ON COLUMN kpi_observations.observed_at IS
  'When the performance being evaluated occurred (not when it was recorded)';

COMMENT ON COLUMN kpi_observations.observation_period IS
  'Time period of observation (e.g., "Q1 2024", "Jan-Mar 2024") for correlation analysis';

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE kpi_observations ENABLE ROW LEVEL SECURITY;

-- Users can view observations about themselves
CREATE POLICY "Users can view KPI observations about themselves"
  ON kpi_observations FOR SELECT
  USING (
    subject_user_id = auth.uid()
    OR observer_user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'superadmin'))
  );

-- Observers can insert observations (authenticated users)
CREATE POLICY "Authenticated users can create KPI observations"
  ON kpi_observations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Observers can update their own observations
CREATE POLICY "Observers can update their own observations"
  ON kpi_observations FOR UPDATE
  USING (observer_user_id = auth.uid());

-- Admins can manage all
CREATE POLICY "Admins can manage all observations"
  ON kpi_observations FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'superadmin'))
  );

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_kpi_observations_updated_at ON kpi_observations;
CREATE TRIGGER update_kpi_observations_updated_at
  BEFORE UPDATE ON kpi_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. HELPER VIEW (Optional - for analytics)
-- ============================================================================

-- View for easy Python/ML consumption: aggregates observations by subject + role + KPI
CREATE OR REPLACE VIEW kpi_observations_summary AS
SELECT
  subject_wallet,
  subject_user_id,
  role_id,
  role_name,
  kpi_name,
  COUNT(*) as observation_count,
  AVG(rating_value) as avg_rating,
  STDDEV(rating_value) as stddev_rating,
  MIN(rating_value) as min_rating,
  MAX(rating_value) as max_rating,
  AVG(outcome_value) as avg_outcome,
  COUNT(CASE WHEN verified = true THEN 1 END) as verified_count,
  MAX(observed_at) as latest_observation_date
FROM kpi_observations
GROUP BY subject_wallet, subject_user_id, role_id, role_name, kpi_name
ORDER BY subject_wallet, role_id, kpi_name;

COMMENT ON VIEW kpi_observations_summary IS
  'Aggregated KPI observations by subject, role, and KPI - ready for ML analysis';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ KPI Observations schema created successfully';
  RAISE NOTICE 'Table: kpi_observations';
  RAISE NOTICE 'View: kpi_observations_summary';
  RAISE NOTICE 'RLS policies enabled';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Ready to capture KPI data for correlation analysis!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Use POST /api/kpi-observations to submit evaluations';
  RAISE NOTICE '2. Use GET /api/kpi-observations to retrieve data';
  RAISE NOTICE '3. Python analytics can query kpi_observations_summary view';
END $$;
