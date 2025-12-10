-- ============================================================================
-- HRKey Reference Validation Layer (RVL) - Database Schema Extension
-- ============================================================================
-- Description: Adds validated_data column to references table for RVL output
-- Author: HRKey Development Team
-- Date: 2025-12-10
-- Purpose: Store structured, validated reference data from RVL processing
-- ============================================================================

-- ============================================================================
-- 1. EXTEND REFERENCES TABLE WITH VALIDATED_DATA
-- ============================================================================

-- Add validated_data JSONB column to store RVL output
ALTER TABLE references ADD COLUMN IF NOT EXISTS validated_data JSONB;

-- Add validation_status column for quick filtering
ALTER TABLE references ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'PENDING'
  CHECK (validation_status IN (
    'PENDING',
    'APPROVED',
    'APPROVED_WITH_WARNINGS',
    'REJECTED_HIGH_FRAUD_RISK',
    'REJECTED_CRITICAL_ISSUES',
    'REJECTED_INCONSISTENT'
  ));

-- Add fraud_score column for quick filtering/sorting
ALTER TABLE references ADD COLUMN IF NOT EXISTS fraud_score INTEGER
  CHECK (fraud_score >= 0 AND fraud_score <= 100);

-- Add consistency_score column
ALTER TABLE references ADD COLUMN IF NOT EXISTS consistency_score DECIMAL(5, 4)
  CHECK (consistency_score >= 0 AND consistency_score <= 1);

-- Add validated_at timestamp
ALTER TABLE references ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- Add is_flagged boolean for admin review
ALTER TABLE references ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;

-- Add flag_reason for tracking why reference was flagged
ALTER TABLE references ADD COLUMN IF NOT EXISTS flag_reason TEXT;

-- Add reviewed_by for tracking admin review
ALTER TABLE references ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

-- Add reviewed_at timestamp
ALTER TABLE references ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on validation_status for filtering
CREATE INDEX IF NOT EXISTS idx_references_validation_status ON references(validation_status);

-- Index on fraud_score for sorting/filtering high-risk references
CREATE INDEX IF NOT EXISTS idx_references_fraud_score ON references(fraud_score DESC);

-- Index on consistency_score
CREATE INDEX IF NOT EXISTS idx_references_consistency_score ON references(consistency_score DESC);

-- Index on is_flagged for admin review queue
CREATE INDEX IF NOT EXISTS idx_references_flagged ON references(is_flagged)
  WHERE is_flagged = TRUE;

-- Index on validated_at for recent validations
CREATE INDEX IF NOT EXISTS idx_references_validated_at ON references(validated_at DESC);

-- Composite index for filtering by owner and status
CREATE INDEX IF NOT EXISTS idx_references_owner_validation ON references(owner_id, validation_status);

-- GIN index on validated_data JSONB for efficient querying
CREATE INDEX IF NOT EXISTS idx_references_validated_data_gin ON references USING GIN (validated_data);

-- ============================================================================
-- 3. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN references.validated_data IS 'Structured output from Reference Validation Layer (RVL) - contains standardized text, fraud score, consistency metrics, and embedding vector';
COMMENT ON COLUMN references.validation_status IS 'Validation status from RVL: APPROVED, APPROVED_WITH_WARNINGS, REJECTED_*';
COMMENT ON COLUMN references.fraud_score IS 'Fraud risk score (0-100) where lower is better. 0-20=low, 20-40=medium, 40-70=high, 70+=critical';
COMMENT ON COLUMN references.consistency_score IS 'Consistency score (0-1) measuring alignment with other references for same candidate';
COMMENT ON COLUMN references.validated_at IS 'Timestamp when reference was processed by RVL';
COMMENT ON COLUMN references.is_flagged IS 'Whether reference requires admin review due to high fraud/inconsistency';
COMMENT ON COLUMN references.flag_reason IS 'Reason why reference was flagged for review';
COMMENT ON COLUMN references.reviewed_by IS 'Admin user who reviewed flagged reference';
COMMENT ON COLUMN references.reviewed_at IS 'Timestamp of admin review';

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically flag high-risk references
CREATE OR REPLACE FUNCTION auto_flag_high_risk_references()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-flag if fraud score is high
  IF NEW.fraud_score >= 70 THEN
    NEW.is_flagged := TRUE;
    NEW.flag_reason := 'Automatic flag: High fraud score (' || NEW.fraud_score || ')';
  END IF;

  -- Auto-flag if consistency is very low
  IF NEW.consistency_score < 0.4 THEN
    NEW.is_flagged := TRUE;
    NEW.flag_reason := COALESCE(NEW.flag_reason || '; ', '') || 'Automatic flag: Low consistency score (' || NEW.consistency_score || ')';
  END IF;

  -- Auto-flag if validation status is REJECTED
  IF NEW.validation_status LIKE 'REJECTED%' THEN
    NEW.is_flagged := TRUE;
    NEW.flag_reason := COALESCE(NEW.flag_reason || '; ', '') || 'Automatic flag: ' || NEW.validation_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-flag high-risk references
DROP TRIGGER IF EXISTS auto_flag_references ON references;
CREATE TRIGGER auto_flag_references
  BEFORE INSERT OR UPDATE OF fraud_score, consistency_score, validation_status
  ON references
  FOR EACH ROW
  EXECUTE FUNCTION auto_flag_high_risk_references();

-- ============================================================================
-- 5. VIEWS FOR EASY QUERYING
-- ============================================================================

-- View for flagged references needing admin review
CREATE OR REPLACE VIEW flagged_references_queue AS
SELECT
  r.id,
  r.owner_id,
  u.email as candidate_email,
  r.referrer_name,
  r.referrer_email,
  r.validation_status,
  r.fraud_score,
  r.consistency_score,
  r.flag_reason,
  r.validated_at,
  r.created_at,
  r.reviewed_by,
  r.reviewed_at
FROM references r
LEFT JOIN users u ON r.owner_id = u.id
WHERE r.is_flagged = TRUE
  AND r.reviewed_by IS NULL
ORDER BY r.fraud_score DESC, r.validated_at DESC;

-- View for reference validation statistics
CREATE OR REPLACE VIEW reference_validation_stats AS
SELECT
  COUNT(*) as total_references,
  COUNT(*) FILTER (WHERE validated_data IS NOT NULL) as validated_count,
  COUNT(*) FILTER (WHERE validation_status = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE validation_status = 'APPROVED_WITH_WARNINGS') as approved_with_warnings_count,
  COUNT(*) FILTER (WHERE validation_status LIKE 'REJECTED%') as rejected_count,
  COUNT(*) FILTER (WHERE is_flagged = TRUE) as flagged_count,
  COUNT(*) FILTER (WHERE fraud_score >= 70) as high_fraud_count,
  AVG(fraud_score) as avg_fraud_score,
  AVG(consistency_score) as avg_consistency_score,
  MIN(validated_at) as first_validation,
  MAX(validated_at) as last_validation
FROM references;

-- ============================================================================
-- 6. RLS POLICIES (if needed)
-- ============================================================================

-- Note: References table should already have RLS policies from previous migrations.
-- If not, add them here. For now, we assume existing policies cover validated_data.

-- Users can see validated_data for their own references
-- (This should already be covered by existing "Users can view their own references" policy)

-- Superadmins can see all validation data including flagged references
-- (Should be covered by existing superadmin policies)

-- ============================================================================
-- 7. MIGRATION VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Reference Validation Layer (RVL) migration completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns added to references table:';
  RAISE NOTICE '  - validated_data (JSONB) - Structured RVL output';
  RAISE NOTICE '  - validation_status (TEXT) - Validation status';
  RAISE NOTICE '  - fraud_score (INTEGER) - Fraud risk score (0-100)';
  RAISE NOTICE '  - consistency_score (DECIMAL) - Consistency score (0-1)';
  RAISE NOTICE '  - validated_at (TIMESTAMPTZ) - Validation timestamp';
  RAISE NOTICE '  - is_flagged (BOOLEAN) - Flagged for admin review';
  RAISE NOTICE '  - flag_reason (TEXT) - Reason for flagging';
  RAISE NOTICE '  - reviewed_by (UUID) - Admin reviewer';
  RAISE NOTICE '  - reviewed_at (TIMESTAMPTZ) - Review timestamp';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created for performance optimization';
  RAISE NOTICE 'Auto-flagging trigger enabled for high-risk references';
  RAISE NOTICE 'Views created: flagged_references_queue, reference_validation_stats';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready to process references through RVL!';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
