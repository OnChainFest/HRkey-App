-- ============================================================================
-- HRKey Candidate Review Workflow - Database Schema Extension
-- ============================================================================
-- Description: FASE 1 of HRKey MVP - "Candidate controls references before usable"
-- Author: HRKey Development Team
-- Date: 2025-01-27
-- Purpose: Extend reference status to support candidate review workflow
-- ============================================================================

-- ============================================================================
-- 1. REFERENCE STATUS EXTENSION
-- ============================================================================
-- Current status values: 'active', 'inactive'
-- New workflow states:
--   - REQUESTED: Invite sent, awaiting referee submission (tracked in reference_invites)
--   - SUBMITTED: Referee submitted, awaiting candidate review
--   - REVISION_REQUESTED: Candidate asked for changes
--   - ACCEPTED: Candidate approved, reference is usable
--   - OMITTED: Candidate chose to hide (shows strikethrough)
--
-- NOTE: We keep 'active' for backward compatibility with existing references.
--       New references will use the new status values.
-- ============================================================================

-- Add comment documenting valid status values
COMMENT ON COLUMN references.status IS
  'Reference workflow status: active (legacy), SUBMITTED (awaiting review), REVISION_REQUESTED, ACCEPTED (usable), OMITTED (hidden)';

-- ============================================================================
-- 2. ADD REVISION REQUEST TRACKING
-- ============================================================================

-- Track revision requests for audit trail
ALTER TABLE references ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;
ALTER TABLE references ADD COLUMN IF NOT EXISTS revision_request_reason TEXT;
ALTER TABLE references ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- Track when candidate accepted
ALTER TABLE references ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on status for filtering by workflow state
CREATE INDEX IF NOT EXISTS idx_references_workflow_status ON references(status);

-- Composite index for owner + workflow status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_references_owner_workflow ON references(owner_id, status);

-- ============================================================================
-- 4. HELPER FUNCTIONS FOR CANDIDATE REVIEW WORKFLOW
-- ============================================================================

-- Function to accept a reference (candidate approves)
CREATE OR REPLACE FUNCTION accept_reference(
  ref_id UUID,
  user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  ref_owner UUID;
  ref_status TEXT;
BEGIN
  -- Get the reference owner and status
  SELECT owner_id, status INTO ref_owner, ref_status
  FROM references WHERE id = ref_id;

  -- Verify reference exists
  IF ref_owner IS NULL THEN
    RAISE EXCEPTION 'Reference not found';
  END IF;

  -- Verify ownership (only owner can accept)
  IF ref_owner != user_id THEN
    RAISE EXCEPTION 'Only the reference owner can accept a reference';
  END IF;

  -- Verify reference is in SUBMITTED or REVISION_REQUESTED state
  -- Also allow 'active' for backward compatibility with existing refs
  IF ref_status NOT IN ('SUBMITTED', 'REVISION_REQUESTED', 'active') THEN
    RAISE EXCEPTION 'Reference cannot be accepted from current status: %', ref_status;
  END IF;

  -- Accept the reference
  UPDATE references
  SET
    status = 'ACCEPTED',
    accepted_at = NOW()
  WHERE id = ref_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to request revision
CREATE OR REPLACE FUNCTION request_reference_revision(
  ref_id UUID,
  user_id UUID,
  reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  ref_owner UUID;
  ref_status TEXT;
  current_count INTEGER;
BEGIN
  -- Get the reference owner and status
  SELECT owner_id, status, COALESCE(revision_count, 0)
  INTO ref_owner, ref_status, current_count
  FROM references WHERE id = ref_id;

  -- Verify reference exists
  IF ref_owner IS NULL THEN
    RAISE EXCEPTION 'Reference not found';
  END IF;

  -- Verify ownership
  IF ref_owner != user_id THEN
    RAISE EXCEPTION 'Only the reference owner can request revision';
  END IF;

  -- Verify reference is in SUBMITTED state
  -- Also allow 'active' for backward compatibility
  IF ref_status NOT IN ('SUBMITTED', 'active') THEN
    RAISE EXCEPTION 'Revision can only be requested for submitted references';
  END IF;

  -- Request revision
  UPDATE references
  SET
    status = 'REVISION_REQUESTED',
    revision_requested_at = NOW(),
    revision_request_reason = reason,
    revision_count = current_count + 1
  WHERE id = ref_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to omit a reference (candidate hides with strikethrough)
CREATE OR REPLACE FUNCTION omit_reference(
  ref_id UUID,
  user_id UUID,
  reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  ref_owner UUID;
  ref_status TEXT;
BEGIN
  -- Get the reference owner and status
  SELECT owner_id, status INTO ref_owner, ref_status
  FROM references WHERE id = ref_id;

  -- Verify reference exists
  IF ref_owner IS NULL THEN
    RAISE EXCEPTION 'Reference not found';
  END IF;

  -- Verify ownership
  IF ref_owner != user_id THEN
    RAISE EXCEPTION 'Only the reference owner can omit a reference';
  END IF;

  -- Allow omitting from SUBMITTED, REVISION_REQUESTED, active, or ACCEPTED
  IF ref_status NOT IN ('SUBMITTED', 'REVISION_REQUESTED', 'active', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Reference cannot be omitted from current status: %', ref_status;
  END IF;

  -- Omit the reference (set status and is_hidden for strikethrough)
  UPDATE references
  SET
    status = 'OMITTED',
    is_hidden = TRUE,
    hidden_at = NOW(),
    hidden_by = user_id,
    hide_reason = reason
  WHERE id = ref_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. VIEW FOR USABLE REFERENCES (ACCEPTED ONLY)
-- ============================================================================

-- View that returns only accepted/usable references
CREATE OR REPLACE VIEW usable_references AS
SELECT
  r.id,
  r.owner_id,
  r.referrer_name,
  r.relationship,
  r.summary,
  r.overall_rating,
  r.kpi_ratings,
  r.detailed_feedback,
  r.role_id,
  r.reference_type,
  r.validation_status,
  r.fraud_score,
  r.consistency_score,
  r.created_at,
  r.accepted_at
FROM references r
WHERE r.status = 'ACCEPTED'
  AND r.is_hidden = FALSE;

-- ============================================================================
-- 6. VIEW FOR PENDING REVIEW REFERENCES
-- ============================================================================

-- View that returns references awaiting candidate review
CREATE OR REPLACE VIEW pending_review_references AS
SELECT
  r.id,
  r.owner_id,
  r.referrer_name,
  r.relationship,
  r.summary,
  r.overall_rating,
  r.kpi_ratings,
  r.detailed_feedback,
  r.status,
  r.reference_type,
  r.validation_status,
  r.created_at
FROM references r
WHERE r.status IN ('SUBMITTED', 'REVISION_REQUESTED')
  AND r.is_hidden = FALSE;

-- ============================================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN references.revision_requested_at IS 'Timestamp when candidate requested revision';
COMMENT ON COLUMN references.revision_request_reason IS 'Reason provided by candidate for revision request';
COMMENT ON COLUMN references.revision_count IS 'Number of times revision has been requested';
COMMENT ON COLUMN references.accepted_at IS 'Timestamp when candidate accepted the reference';

COMMENT ON FUNCTION accept_reference IS 'Allows reference owner to accept a submitted reference, making it usable';
COMMENT ON FUNCTION request_reference_revision IS 'Allows reference owner to request changes to a submitted reference';
COMMENT ON FUNCTION omit_reference IS 'Allows reference owner to omit/hide a reference with visible strikethrough';

COMMENT ON VIEW usable_references IS 'Returns only ACCEPTED references that are not hidden - these are usable for evaluation';
COMMENT ON VIEW pending_review_references IS 'Returns references awaiting candidate review (SUBMITTED or REVISION_REQUESTED)';

-- ============================================================================
-- 8. MIGRATION NOTICE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 013: Candidate Review Workflow ===';
  RAISE NOTICE 'FASE 1 MVP: Candidate controls references before they become usable';
  RAISE NOTICE '';
  RAISE NOTICE 'New reference statuses:';
  RAISE NOTICE '  - SUBMITTED: Referee submitted, awaiting candidate review';
  RAISE NOTICE '  - REVISION_REQUESTED: Candidate asked for changes';
  RAISE NOTICE '  - ACCEPTED: Candidate approved, reference is usable';
  RAISE NOTICE '  - OMITTED: Candidate chose to hide (strikethrough display)';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns added:';
  RAISE NOTICE '  - revision_requested_at, revision_request_reason, revision_count';
  RAISE NOTICE '  - accepted_at';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - accept_reference(ref_id, user_id)';
  RAISE NOTICE '  - request_reference_revision(ref_id, user_id, reason)';
  RAISE NOTICE '  - omit_reference(ref_id, user_id, reason)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views:';
  RAISE NOTICE '  - usable_references: Only ACCEPTED, non-hidden references';
  RAISE NOTICE '  - pending_review_references: SUBMITTED or REVISION_REQUESTED';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Existing references with status="active" are treated as legacy.';
  RAISE NOTICE '      They can be accepted, have revision requested, or be omitted.';
  RAISE NOTICE '';
  RAISE NOTICE 'TODO - Later phases:';
  RAISE NOTICE '  - Notification system for reference submission';
  RAISE NOTICE '  - Email to candidate when referee submits';
  RAISE NOTICE '  - Email to referee when revision requested';
  RAISE NOTICE '  - Dashboard UI for candidate review workflow';
END $$;
