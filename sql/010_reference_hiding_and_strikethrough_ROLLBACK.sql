-- ============================================================================
-- ROLLBACK: HRKey Reference Hiding & Strikethrough System
-- ============================================================================
-- Description: Rolls back migration 010_reference_hiding_and_strikethrough.sql
-- Author: HRKey Development Team (Claude Code)
-- Date: 2025-01-23
-- Purpose: Emergency rollback script for reference hiding feature
-- Warning: This will DROP columns with data. Backup before running!
-- ============================================================================

-- ============================================================================
-- BACKUP WARNING
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '⚠️  WARNING: This rollback will PERMANENTLY DELETE data!';
  RAISE NOTICE '⚠️  Columns to be dropped: is_hidden, hidden_at, hidden_by, hide_reason,';
  RAISE NOTICE '⚠️                          reference_type, correction_of, is_correction';
  RAISE NOTICE '';
  RAISE NOTICE '🛡️  RECOMMENDED: Create backup before proceeding:';
  RAISE NOTICE '   pg_dump -h <host> -U <user> -d <database> -t references > backup_references.sql';
  RAISE NOTICE '';
  RAISE NOTICE '⏸️  This script will PAUSE for 10 seconds. Press Ctrl+C to abort.';
END $$;

-- Pause for 10 seconds to allow manual cancellation
SELECT pg_sleep(10);

-- ============================================================================
-- 1. DROP ROW LEVEL SECURITY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Prevent reference deletion" ON references;
DROP POLICY IF EXISTS "Users can hide their own references" ON references;

-- Note: We do NOT disable RLS on the table as other policies may exist

-- ============================================================================
-- 2. DROP TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS validate_hiding ON references;

-- ============================================================================
-- 3. DROP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS hide_reference(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS unhide_reference(UUID, UUID);
DROP FUNCTION IF EXISTS validate_reference_hiding();

-- ============================================================================
-- 4. DROP VIEW
-- ============================================================================

DROP VIEW IF EXISTS reference_strikethrough_metadata;

-- ============================================================================
-- 5. DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_references_correction_of;
DROP INDEX IF EXISTS idx_references_owner_hidden;
DROP INDEX IF EXISTS idx_references_type;
DROP INDEX IF EXISTS idx_references_hidden_at;
DROP INDEX IF EXISTS idx_references_hidden;

-- ============================================================================
-- 6. DROP COLUMNS FROM REFERENCES TABLE
-- ============================================================================

-- Drop columns in reverse dependency order
ALTER TABLE references DROP COLUMN IF EXISTS is_correction;
ALTER TABLE references DROP COLUMN IF EXISTS correction_of;
ALTER TABLE references DROP COLUMN IF EXISTS reference_type;
ALTER TABLE references DROP COLUMN IF EXISTS hide_reason;
ALTER TABLE references DROP COLUMN IF EXISTS hidden_by;
ALTER TABLE references DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE references DROP COLUMN IF EXISTS is_hidden;

-- ============================================================================
-- 7. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  remaining_columns TEXT[];
BEGIN
  -- Check if any strikethrough columns still exist
  SELECT array_agg(column_name)
  INTO remaining_columns
  FROM information_schema.columns
  WHERE table_name = 'references'
    AND column_name IN (
      'is_hidden', 'hidden_at', 'hidden_by', 'hide_reason',
      'reference_type', 'correction_of', 'is_correction'
    );

  IF remaining_columns IS NOT NULL THEN
    RAISE WARNING '⚠️  Some columns were not dropped: %', remaining_columns;
  ELSE
    RAISE NOTICE '✅ All strikethrough columns successfully removed';
  END IF;

  -- Check if functions still exist
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('hide_reference', 'unhide_reference', 'validate_reference_hiding')
  ) THEN
    RAISE WARNING '⚠️  Some functions were not dropped';
  ELSE
    RAISE NOTICE '✅ All strikethrough functions successfully removed';
  END IF;

  -- Check if view still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_name = 'reference_strikethrough_metadata'
  ) THEN
    RAISE WARNING '⚠️  View was not dropped';
  ELSE
    RAISE NOTICE '✅ Strikethrough view successfully removed';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Rollback of migration 010 completed';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Summary of rollback:';
  RAISE NOTICE '  - Dropped 7 columns from references table';
  RAISE NOTICE '  - Dropped 5 indexes';
  RAISE NOTICE '  - Dropped 1 view (reference_strikethrough_metadata)';
  RAISE NOTICE '  - Dropped 3 functions (hide_reference, unhide_reference, validate_reference_hiding)';
  RAISE NOTICE '  - Dropped 1 trigger (validate_hiding)';
  RAISE NOTICE '  - Dropped 2 RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Frontend code referencing these columns will break!';
  RAISE NOTICE '⚠️  Deploy compatible application code before running this rollback.';
END $$;

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================
