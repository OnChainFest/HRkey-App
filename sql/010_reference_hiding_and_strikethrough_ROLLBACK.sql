-- ============================================================================
-- ROLLBACK: HRKey Reference Hiding & Strikethrough System
-- ============================================================================
-- Description: Rolls back migration 010_reference_hiding_and_strikethrough.sql
-- Author: HRKey Development Team (Claude Code)
-- Date: 2025-01-23
-- Purpose: Removes strikethrough functions, views, and policies
-- Note: Column drops are OPTIONAL (commented out) to preserve data
-- ============================================================================

-- ============================================================================
-- 1. DROP VIEW
-- ============================================================================

DROP VIEW IF EXISTS reference_strikethrough_metadata;

-- ============================================================================
-- 2. DROP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS hide_reference(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS unhide_reference(UUID, UUID);
DROP FUNCTION IF EXISTS validate_reference_hiding();

-- ============================================================================
-- 3. DROP TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS validate_hiding ON references;

-- ============================================================================
-- 4. DROP RLS POLICIES
-- ============================================================================

-- Policy introduced by migration 010
DROP POLICY IF EXISTS "Users can hide their own references" ON references;

-- Policy introduced by migration 010
DROP POLICY IF EXISTS "Prevent reference deletion" ON references;

-- ============================================================================
-- 5. DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_references_hidden;
DROP INDEX IF EXISTS idx_references_hidden_at;
DROP INDEX IF EXISTS idx_references_type;
DROP INDEX IF EXISTS idx_references_owner_hidden;
DROP INDEX IF EXISTS idx_references_correction_of;

-- ============================================================================
-- 6. DROP COLUMNS (OPTIONAL - COMMENTED OUT BY DEFAULT)
-- ============================================================================
-- WARNING: Uncommenting these will PERMANENTLY DELETE data.
-- Only uncomment if you need to completely remove the strikethrough feature.
-- Recommended: Keep columns in place and disable via feature flag instead.

-- ALTER TABLE references DROP COLUMN IF EXISTS is_hidden;
-- ALTER TABLE references DROP COLUMN IF EXISTS hidden_at;
-- ALTER TABLE references DROP COLUMN IF EXISTS hidden_by;
-- ALTER TABLE references DROP COLUMN IF EXISTS hide_reason;
-- ALTER TABLE references DROP COLUMN IF EXISTS reference_type;
-- ALTER TABLE references DROP COLUMN IF EXISTS correction_of;
-- ALTER TABLE references DROP COLUMN IF EXISTS is_correction;

-- ============================================================================
-- 7. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Rollback of migration 010 completed';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Removed:';
  RAISE NOTICE '  - 1 view (reference_strikethrough_metadata)';
  RAISE NOTICE '  - 3 functions (hide_reference, unhide_reference, validate_reference_hiding)';
  RAISE NOTICE '  - 1 trigger (validate_hiding)';
  RAISE NOTICE '  - 2 RLS policies (hide/unhide, prevent deletion)';
  RAISE NOTICE '  - 5 indexes';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Columns NOT dropped (data preserved):';
  RAISE NOTICE '  - is_hidden, hidden_at, hidden_by, hide_reason';
  RAISE NOTICE '  - reference_type, correction_of, is_correction';
  RAISE NOTICE '';
  RAISE NOTICE '💡 To drop columns, uncomment section 6 and re-run.';
  RAISE NOTICE '💡 Recommended: Use feature flag (ENABLE_REFERENCE_HIDING=false) instead.';
END $$;

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================
