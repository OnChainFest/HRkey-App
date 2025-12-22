-- Migration: Create hrscore_snapshots table for HRScore history persistence
-- Purpose: Store historical HRScore calculation snapshots for auditing and trend analysis
-- Date: 2025-01-15

-- ============================================================================
-- TABLE CREATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS hrscore_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  score NUMERIC NOT NULL,
  breakdown JSONB NULL,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('reference', 'kpi', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query pattern: fetch user's score history ordered by time
CREATE INDEX IF NOT EXISTS idx_hrscore_snapshots_user_created
ON hrscore_snapshots (user_id, created_at DESC);

-- Secondary index for filtering by trigger source (analytics)
CREATE INDEX IF NOT EXISTS idx_hrscore_snapshots_trigger_source
ON hrscore_snapshots (trigger_source);

-- ============================================================================
-- FOREIGN KEY (optional - depends on users table existence)
-- ============================================================================

-- Uncomment if users table exists with id column:
-- ALTER TABLE hrscore_snapshots
--   ADD CONSTRAINT fk_hrscore_snapshots_user_id
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE hrscore_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own snapshots
CREATE POLICY hrscore_snapshots_user_read_own ON hrscore_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Superadmins can read all snapshots
CREATE POLICY hrscore_snapshots_superadmin_read ON hrscore_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Policy: System/service role can insert (score calculations)
CREATE POLICY hrscore_snapshots_system_insert ON hrscore_snapshots
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE hrscore_snapshots IS 'Historical HRScore calculation snapshots for trend analysis and auditing';
COMMENT ON COLUMN hrscore_snapshots.id IS 'Unique snapshot identifier';
COMMENT ON COLUMN hrscore_snapshots.user_id IS 'User (candidate) whose score was calculated';
COMMENT ON COLUMN hrscore_snapshots.score IS 'Calculated HRScore value (0-100 scale)';
COMMENT ON COLUMN hrscore_snapshots.breakdown IS 'Score breakdown by component (KPI weights, reference contributions, etc.)';
COMMENT ON COLUMN hrscore_snapshots.trigger_source IS 'What triggered this calculation: reference|kpi|manual';
COMMENT ON COLUMN hrscore_snapshots.created_at IS 'When the snapshot was created';
