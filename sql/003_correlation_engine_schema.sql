-- ============================================================================
-- HRKey Correlation Engine - Database Schema
-- ============================================================================
-- Description: Adds tables for roles, KPIs, cognitive scores, job outcomes,
--              and correlation/model results for the ML correlation engine
-- Author: HRKey Data Engineering Team
-- Date: 2025-11-21
-- Phase: 1 - Proof of Correlation (MVP)
-- ============================================================================

-- ============================================================================
-- 1. ROLES TABLE
-- ============================================================================
-- Stores job roles by industry and seniority level

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Role details
  role_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  seniority_level TEXT CHECK (seniority_level IN ('junior', 'mid', 'senior', 'lead', 'executive')),

  -- Role metadata
  description TEXT,
  standard_kpis JSONB, -- List of standard KPI names for this role
  metadata JSONB, -- Additional role attributes

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness
  CONSTRAINT unique_role_industry_seniority UNIQUE(role_name, industry, seniority_level)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(role_name);
CREATE INDEX IF NOT EXISTS idx_roles_industry ON roles(industry);
CREATE INDEX IF NOT EXISTS idx_roles_seniority ON roles(seniority_level);
CREATE INDEX IF NOT EXISTS idx_roles_active ON roles(is_active);

COMMENT ON TABLE roles IS 'Job roles categorized by industry and seniority';
COMMENT ON COLUMN roles.standard_kpis IS 'Standard KPI names expected for this role (JSON array)';

-- ============================================================================
-- 2. EXTEND REFERENCES TABLE (if not fully defined)
-- ============================================================================
-- Add SARA reference fields if they don't exist

DO $$
BEGIN
  -- Add referrer_name if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'referrer_name'
  ) THEN
    ALTER TABLE references ADD COLUMN referrer_name TEXT;
  END IF;

  -- Add referrer_email if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'referrer_email'
  ) THEN
    ALTER TABLE references ADD COLUMN referrer_email TEXT;
  END IF;

  -- Add referrer_company if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'referrer_company'
  ) THEN
    ALTER TABLE references ADD COLUMN referrer_company TEXT;
  END IF;

  -- Add user_id (owner of the reference) if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE references ADD COLUMN user_id UUID REFERENCES users(id);
  END IF;

  -- Add role_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE references ADD COLUMN role_id UUID REFERENCES roles(id);
  END IF;

  -- Add SARA fields (Situation, Action, Result, Accountability)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'sara_data'
  ) THEN
    ALTER TABLE references ADD COLUMN sara_data JSONB;
  END IF;

  -- Add overall rating
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'overall_rating'
  ) THEN
    ALTER TABLE references ADD COLUMN overall_rating NUMERIC CHECK (overall_rating >= 1 AND overall_rating <= 5);
  END IF;

  -- Add verification status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'verified'
  ) THEN
    ALTER TABLE references ADD COLUMN verified BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'references' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE references ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes on new reference columns
CREATE INDEX IF NOT EXISTS idx_references_user ON references(user_id);
CREATE INDEX IF NOT EXISTS idx_references_role ON references(role_id);
CREATE INDEX IF NOT EXISTS idx_references_verified ON references(verified);

COMMENT ON COLUMN references.sara_data IS 'Structured SARA reference data (Situation, Action, Result, Accountability)';
COMMENT ON COLUMN references.overall_rating IS 'Overall rating from referrer (1-5 scale)';

-- ============================================================================
-- 3. USER_KPIS TABLE
-- ============================================================================
-- Stores KPI values for users, normalized by role

CREATE TABLE IF NOT EXISTS user_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and role
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  reference_id UUID REFERENCES references(id), -- Which reference provided these KPIs

  -- KPI data
  kpi_name TEXT NOT NULL, -- e.g., 'lead_time', 'deployment_frequency', 'code_coverage'
  kpi_value NUMERIC NOT NULL, -- Raw value
  kpi_unit TEXT, -- e.g., 'days', 'percentage', 'count'

  -- Normalization (z-scores relative to role/industry)
  normalized_value NUMERIC, -- z-score: (value - mean) / std
  percentile NUMERIC CHECK (percentile >= 0 AND percentile <= 100), -- Percentile within role

  -- Metadata
  source TEXT DEFAULT 'self_reported', -- 'self_reported', 'reference_verified', 'company_verified'
  verification_status TEXT CHECK (verification_status IN ('unverified', 'pending', 'verified', 'disputed')),
  verified_at TIMESTAMPTZ,
  metadata JSONB, -- Additional context

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one KPI value per user-role-kpi combination
  CONSTRAINT unique_user_role_kpi_ref UNIQUE(user_id, role_id, kpi_name, reference_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_kpis_user ON user_kpis(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kpis_role ON user_kpis(role_id);
CREATE INDEX IF NOT EXISTS idx_user_kpis_reference ON user_kpis(reference_id);
CREATE INDEX IF NOT EXISTS idx_user_kpis_name ON user_kpis(kpi_name);
CREATE INDEX IF NOT EXISTS idx_user_kpis_verified ON user_kpis(verification_status);

COMMENT ON TABLE user_kpis IS 'KPI values for users, tied to specific roles and references';
COMMENT ON COLUMN user_kpis.normalized_value IS 'Z-score normalized relative to others in same role/industry';
COMMENT ON COLUMN user_kpis.percentile IS 'Percentile rank within same role (0-100)';

-- ============================================================================
-- 4. COGNITIVE_GAME_SCORES TABLE
-- ============================================================================
-- Stores cognitive assessment results from games

CREATE TABLE IF NOT EXISTS cognitive_game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Game details
  game_type TEXT NOT NULL, -- 'memory', 'attention', 'processing_speed', 'pattern_recognition', etc.
  game_version TEXT, -- Version of the game/test

  -- Scores
  raw_score NUMERIC NOT NULL,
  normalized_score NUMERIC, -- z-score normalized across all users
  percentile NUMERIC CHECK (percentile >= 0 AND percentile <= 100),

  -- Time/performance metrics
  completion_time_seconds INTEGER,
  accuracy_percentage NUMERIC CHECK (accuracy_percentage >= 0 AND accuracy_percentage <= 100),

  -- Detailed results
  game_data JSONB, -- Full game session data (levels, attempts, etc.)

  -- Session info
  session_id UUID, -- To group multiple games in one session
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamps
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cognitive_scores_user ON cognitive_game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_scores_game_type ON cognitive_game_scores(game_type);
CREATE INDEX IF NOT EXISTS idx_cognitive_scores_session ON cognitive_game_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_scores_completed ON cognitive_game_scores(completed_at DESC);

COMMENT ON TABLE cognitive_game_scores IS 'Cognitive assessment scores from gamified tests';
COMMENT ON COLUMN cognitive_game_scores.game_data IS 'Detailed session data including attempts, levels, and patterns';

-- ============================================================================
-- 5. JOB_OUTCOMES TABLE
-- ============================================================================
-- Tracks actual hiring outcomes and job performance

CREATE TABLE IF NOT EXISTS job_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and role
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  company_id UUID REFERENCES companies(id),

  -- Hiring outcome
  hired BOOLEAN NOT NULL, -- Was the candidate hired?
  application_date TIMESTAMPTZ,
  hire_date TIMESTAMPTZ,
  rejection_reason TEXT, -- If not hired

  -- Performance (if hired)
  performance_score NUMERIC CHECK (performance_score >= 1 AND performance_score <= 5), -- 1-5 rating
  months_in_role NUMERIC, -- How long they've been in the role
  promoted BOOLEAN DEFAULT FALSE,
  promotion_date TIMESTAMPTZ,

  -- Exit information
  exit_date TIMESTAMPTZ,
  exit_reason TEXT, -- 'voluntary', 'involuntary', 'layoff', etc.
  would_rehire BOOLEAN, -- Would the company rehire this person?

  -- Performance metadata
  performance_data JSONB, -- Detailed performance reviews, metrics, etc.

  -- Data source
  source TEXT DEFAULT 'company_reported', -- 'company_reported', 'self_reported', 'verified'
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id), -- Admin/company who verified
  verified_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one outcome per user-role-company combination
  CONSTRAINT unique_user_role_company_outcome UNIQUE(user_id, role_id, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_outcomes_user ON job_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_role ON job_outcomes(role_id);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_company ON job_outcomes(company_id);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_hired ON job_outcomes(hired);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_verified ON job_outcomes(verified);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_hire_date ON job_outcomes(hire_date DESC);

COMMENT ON TABLE job_outcomes IS 'Actual hiring outcomes and job performance data';
COMMENT ON COLUMN job_outcomes.performance_score IS 'Overall performance rating (1-5 scale)';
COMMENT ON COLUMN job_outcomes.would_rehire IS 'Would the company hire this person again?';

-- ============================================================================
-- 6. CORRELATION_RESULTS TABLE
-- ============================================================================
-- Stores correlation analysis results

CREATE TABLE IF NOT EXISTS correlation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feature and target
  feature_name TEXT NOT NULL, -- e.g., 'kpi_deployment_frequency', 'cognitive_memory_score'
  target_name TEXT NOT NULL, -- e.g., 'hired', 'performance_score'

  -- Correlation metrics
  metric_type TEXT NOT NULL CHECK (metric_type IN ('pearson', 'spearman', 'kendall')),
  correlation NUMERIC NOT NULL, -- Correlation coefficient
  p_value NUMERIC NOT NULL, -- Statistical significance
  n_samples INTEGER NOT NULL, -- Number of data points used

  -- Segmentation (optional - for role-specific or industry-specific correlations)
  role_id UUID REFERENCES roles(id),
  industry TEXT,
  seniority_level TEXT,

  -- Analysis metadata
  analysis_version TEXT DEFAULT 'v1.0', -- Track which analysis version produced this
  filters_applied JSONB, -- Any filters applied before computing correlation

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_correlation_feature ON correlation_results(feature_name);
CREATE INDEX IF NOT EXISTS idx_correlation_target ON correlation_results(target_name);
CREATE INDEX IF NOT EXISTS idx_correlation_metric ON correlation_results(metric_type);
CREATE INDEX IF NOT EXISTS idx_correlation_role ON correlation_results(role_id);
CREATE INDEX IF NOT EXISTS idx_correlation_computed ON correlation_results(computed_at DESC);

COMMENT ON TABLE correlation_results IS 'Correlation analysis results between features and outcomes';
COMMENT ON COLUMN correlation_results.p_value IS 'Statistical significance (p-value from correlation test)';
COMMENT ON COLUMN correlation_results.filters_applied IS 'Any data filters applied before analysis (for reproducibility)';

-- ============================================================================
-- 7. MODEL_BASELINE_RESULTS TABLE
-- ============================================================================
-- Stores baseline ML model performance metrics

CREATE TABLE IF NOT EXISTS model_baseline_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model details
  target_name TEXT NOT NULL, -- 'hired', 'performance_score'
  model_type TEXT NOT NULL, -- 'logistic_regression', 'random_forest', 'linear_regression', etc.
  model_version TEXT DEFAULT 'v1.0',

  -- Performance metrics
  metric_name TEXT NOT NULL, -- 'accuracy', 'roc_auc', 'r2', 'mae', 'rmse', 'precision', 'recall', 'f1'
  metric_value NUMERIC NOT NULL,

  -- Training details
  used_features JSONB NOT NULL, -- List of features used in the model
  n_train_samples INTEGER NOT NULL,
  n_test_samples INTEGER NOT NULL,
  train_test_split_ratio NUMERIC DEFAULT 0.7,

  -- Feature importance (if available)
  feature_importances JSONB, -- Dict mapping feature names to importance scores

  -- Model parameters
  hyperparameters JSONB, -- Model hyperparameters used

  -- Segmentation (optional)
  role_id UUID REFERENCES roles(id),
  industry TEXT,
  seniority_level TEXT,

  -- Metadata
  cross_validation_score NUMERIC, -- If CV was performed
  metadata JSONB,

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_results_target ON model_baseline_results(target_name);
CREATE INDEX IF NOT EXISTS idx_model_results_model_type ON model_baseline_results(model_type);
CREATE INDEX IF NOT EXISTS idx_model_results_metric ON model_baseline_results(metric_name);
CREATE INDEX IF NOT EXISTS idx_model_results_role ON model_baseline_results(role_id);
CREATE INDEX IF NOT EXISTS idx_model_results_computed ON model_baseline_results(computed_at DESC);

COMMENT ON TABLE model_baseline_results IS 'ML model performance metrics and feature importance';
COMMENT ON COLUMN model_baseline_results.used_features IS 'List of feature names used in model training';
COMMENT ON COLUMN model_baseline_results.feature_importances IS 'Feature importance scores (for tree-based models) or coefficients';

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_baseline_results ENABLE ROW LEVEL SECURITY;

-- Roles: Public read for active roles
CREATE POLICY "Everyone can view active roles"
  ON roles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmins can manage roles"
  ON roles FOR ALL
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin'));

-- User KPIs: Users can view their own KPIs
CREATE POLICY "Users can view their own KPIs"
  ON user_kpis FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

CREATE POLICY "Users can insert their own KPIs"
  ON user_kpis FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Cognitive scores: Users can view their own scores
CREATE POLICY "Users can view their own cognitive scores"
  ON cognitive_game_scores FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

CREATE POLICY "Users can insert their own cognitive scores"
  ON cognitive_game_scores FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Job outcomes: Users can view their own outcomes, companies can view outcomes they created
CREATE POLICY "Users can view their own job outcomes"
  ON job_outcomes FOR SELECT
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

CREATE POLICY "Companies can insert job outcomes"
  ON job_outcomes FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_signers
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Correlation results: Public read (aggregated data, no PII)
CREATE POLICY "Everyone can view correlation results"
  ON correlation_results FOR SELECT
  USING (true);

CREATE POLICY "System can insert correlation results"
  ON correlation_results FOR INSERT
  WITH CHECK (true);

-- Model results: Public read (aggregated metrics, no PII)
CREATE POLICY "Everyone can view model results"
  ON model_baseline_results FOR SELECT
  USING (true);

CREATE POLICY "System can insert model results"
  ON model_baseline_results FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 9. HELPER FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_kpis_updated_at ON user_kpis;
CREATE TRIGGER update_user_kpis_updated_at
  BEFORE UPDATE ON user_kpis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_job_outcomes_updated_at ON job_outcomes;
CREATE TRIGGER update_job_outcomes_updated_at
  BEFORE UPDATE ON job_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 10. SEED DATA (OPTIONAL - Sample roles from KPI JSON)
-- ============================================================================

-- Insert sample roles (you can expand this based on Roles_All_Industries_KPIs.json)
INSERT INTO roles (role_name, industry, seniority_level, standard_kpis, is_active)
VALUES
  ('Backend Developer', 'Tech', 'mid',
   '["lead_time", "deployment_frequency", "mttr", "error_rate", "code_coverage", "api_response_time"]'::jsonb,
   true),
  ('Frontend Developer', 'Tech', 'mid',
   '["page_load_time", "time_to_interactive", "lighthouse_score", "component_reusability", "cross_browser_compatibility"]'::jsonb,
   true),
  ('Full Stack Developer', 'Tech', 'mid',
   '["feature_delivery_time", "code_quality", "technical_debt_ratio", "system_uptime", "user_satisfaction_score"]'::jsonb,
   true),
  ('Data Engineer', 'Tech', 'mid',
   '["data_pipeline_uptime", "data_quality_score", "etl_processing_time", "data_freshness", "cost_per_query"]'::jsonb,
   true),
  ('Data Scientist', 'Tech', 'mid',
   '["model_accuracy", "model_deployment_time", "business_impact", "feature_importance", "prediction_latency"]'::jsonb,
   true),
  ('DevOps Engineer', 'Tech', 'mid',
   '["deployment_frequency", "lead_time_for_changes", "mttr", "change_failure_rate", "infrastructure_cost"]'::jsonb,
   true)
ON CONFLICT (role_name, industry, seniority_level) DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Correlation Engine schema migration completed successfully';
  RAISE NOTICE 'Tables created/extended:';
  RAISE NOTICE '  - roles';
  RAISE NOTICE '  - references (extended with SARA fields)';
  RAISE NOTICE '  - user_kpis';
  RAISE NOTICE '  - cognitive_game_scores';
  RAISE NOTICE '  - job_outcomes';
  RAISE NOTICE '  - correlation_results';
  RAISE NOTICE '  - model_baseline_results';
  RAISE NOTICE 'RLS policies enabled for security';
  RAISE NOTICE 'Ready for correlation engine implementation!';
END $$;
