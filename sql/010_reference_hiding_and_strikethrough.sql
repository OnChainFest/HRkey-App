-- ============================================================================
-- HRKey Reference Hiding & Strikethrough System - Database Schema
-- ============================================================================
-- Description: Implements "tachón" (visible strikethrough) philosophy
-- Author: HRKey Development Team (Claude Code)
-- Date: 2025-01-06
-- Purpose: Allow users to hide references while maintaining visible evidence
-- Philosophy: "Hidden ≠ erased. The strikethrough must remain visible forever."
-- ============================================================================

-- ============================================================================
-- 1. EXTEND REFERENCES TABLE WITH HIDING METADATA
-- ============================================================================

-- Add is_hidden flag to mark references as hidden by the owner
ALTER TABLE references ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Add timestamp when reference was hidden
ALTER TABLE references ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- Add user who hid the reference (usually owner, but could be admin)
ALTER TABLE references ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id);

-- Add optional reason for hiding (private, only visible to owner)
ALTER TABLE references ADD COLUMN IF NOT EXISTS hide_reason TEXT;

-- Add reference type for better context in strikethrough display
ALTER TABLE references ADD COLUMN IF NOT EXISTS reference_type TEXT DEFAULT 'general'
  CHECK (reference_type IN (
    'general',
    'manager',
    'peer',
    'direct_report',
    'client',
    'mentor',
    'other'
  ));

-- Add correction_of field to track replacement references
ALTER TABLE references ADD COLUMN IF NOT EXISTS correction_of UUID REFERENCES references(id);

-- Add is_correction flag for quick filtering
ALTER TABLE references ADD COLUMN IF NOT EXISTS is_correction BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on is_hidden for filtering
CREATE INDEX IF NOT EXISTS idx_references_hidden ON references(is_hidden);

-- Index on hidden_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_references_hidden_at ON references(hidden_at DESC);

-- Index on reference_type for grouping
CREATE INDEX IF NOT EXISTS idx_references_type ON references(reference_type);

-- Composite index for owner + hidden status
CREATE INDEX IF NOT EXISTS idx_references_owner_hidden ON references(owner_id, is_hidden);

-- Index on correction_of for finding replacement references
CREATE INDEX IF NOT EXISTS idx_references_correction_of ON references(correction_of);

-- ============================================================================
-- 3. STRIKETHROUGH METADATA VIEW
-- ============================================================================

-- View to generate strikethrough metadata for public display
CREATE OR REPLACE VIEW reference_strikethrough_metadata AS
SELECT
  r.id,
  r.owner_id,
  r.is_hidden,
  r.hidden_at,
  r.reference_type,
  r.created_at,
  -- Correcting reference (if this was replaced)
  correcting.id as corrected_by_id,
  correcting.created_at as corrected_at,
  -- Original reference (if this is a correction)
  r.correction_of as corrects_reference_id,
  -- Public-safe metadata
  jsonb_build_object(
    'type', r.reference_type,
    'hiddenAt', r.hidden_at,
    'createdAt', r.created_at,
    'wasReplaced', (correcting.id IS NOT NULL),
    'isReplacement', r.is_correction,
    'referenceId', r.id
  ) as strikethrough_metadata
FROM references r
LEFT JOIN references correcting ON correcting.correction_of = r.id
WHERE r.is_hidden = TRUE;

-- ============================================================================
-- 4. VALIDATION TRIGGERS
-- ============================================================================

-- Function to validate hiding logic
CREATE OR REPLACE FUNCTION validate_reference_hiding()
RETURNS TRIGGER AS $$
BEGIN
  -- If hiding a reference, require hidden_at and hidden_by
  IF NEW.is_hidden = TRUE AND OLD.is_hidden = FALSE THEN
    IF NEW.hidden_at IS NULL THEN
      NEW.hidden_at := NOW();
    END IF;

    -- Ensure hidden_by is set (should be from application, but enforce it)
    IF NEW.hidden_by IS NULL THEN
      RAISE EXCEPTION 'hidden_by must be set when hiding a reference';
    END IF;
  END IF;

  -- If marking as correction, validate correction_of exists
  IF NEW.is_correction = TRUE AND NEW.correction_of IS NOT NULL THEN
    -- Ensure the referenced original exists and belongs to same owner
    IF NOT EXISTS (
      SELECT 1 FROM references
      WHERE id = NEW.correction_of
      AND owner_id = NEW.owner_id
    ) THEN
      RAISE EXCEPTION 'correction_of must reference an existing reference owned by the same user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for validation
DROP TRIGGER IF EXISTS validate_hiding ON references;
CREATE TRIGGER validate_hiding
  BEFORE UPDATE OF is_hidden, correction_of, is_correction
  ON references
  FOR EACH ROW
  EXECUTE FUNCTION validate_reference_hiding();

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to hide a reference (called from application)
CREATE OR REPLACE FUNCTION hide_reference(
  ref_id UUID,
  user_id UUID,
  reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  ref_owner UUID;
BEGIN
  -- Get the reference owner
  SELECT owner_id INTO ref_owner FROM references WHERE id = ref_id;

  -- Verify ownership
  IF ref_owner IS NULL THEN
    RAISE EXCEPTION 'Reference not found';
  END IF;

  IF ref_owner != user_id THEN
    -- Check if user is superadmin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'superadmin') THEN
      RAISE EXCEPTION 'Only the reference owner or superadmin can hide a reference';
    END IF;
  END IF;

  -- Hide the reference
  UPDATE references
  SET
    is_hidden = TRUE,
    hidden_at = NOW(),
    hidden_by = user_id,
    hide_reason = reason
  WHERE id = ref_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to unhide a reference
CREATE OR REPLACE FUNCTION unhide_reference(
  ref_id UUID,
  user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  ref_owner UUID;
BEGIN
  -- Get the reference owner
  SELECT owner_id INTO ref_owner FROM references WHERE id = ref_id;

  -- Verify ownership
  IF ref_owner IS NULL THEN
    RAISE EXCEPTION 'Reference not found';
  END IF;

  IF ref_owner != user_id THEN
    -- Check if user is superadmin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'superadmin') THEN
      RAISE EXCEPTION 'Only the reference owner or superadmin can unhide a reference';
    END IF;
  END IF;

  -- Unhide the reference
  UPDATE references
  SET
    is_hidden = FALSE,
    hidden_at = NULL,
    hidden_by = NULL,
    hide_reason = NULL
  WHERE id = ref_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN references.is_hidden IS 'Whether this reference is hidden by the owner (strikethrough display in public views)';
COMMENT ON COLUMN references.hidden_at IS 'Timestamp when the reference was hidden';
COMMENT ON COLUMN references.hidden_by IS 'User who hid the reference (owner or admin)';
COMMENT ON COLUMN references.hide_reason IS 'Optional private reason for hiding (visible only to owner)';
COMMENT ON COLUMN references.reference_type IS 'Type of reference: manager, peer, client, etc. (shown in strikethrough)';
COMMENT ON COLUMN references.correction_of IS 'If this is a correction/replacement, points to the original reference ID';
COMMENT ON COLUMN references.is_correction IS 'Flag indicating this reference corrects/replaces another';

COMMENT ON VIEW reference_strikethrough_metadata IS 'Public-safe metadata for displaying strikethrough placeholders';

-- ============================================================================
-- 7. SECURITY POLICIES (RLS)
-- ============================================================================

-- Policy: Users can hide their own references
CREATE POLICY "Users can hide their own references"
  ON references FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 010 completed successfully';
  RAISE NOTICE 'Added reference hiding & strikethrough system:';
  RAISE NOTICE '  - is_hidden, hidden_at, hidden_by, hide_reason columns';
  RAISE NOTICE '  - reference_type, correction_of, is_correction columns';
  RAISE NOTICE '  - reference_strikethrough_metadata view';
  RAISE NOTICE '  - hide_reference() and unhide_reference() functions';
  RAISE NOTICE '  - Validation triggers and RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Philosophy: Hidden ≠ erased. Strikethrough remains visible forever.';
END $$;
