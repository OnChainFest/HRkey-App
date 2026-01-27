-- ============================================================================
-- HRKey Candidate Review Workflow - Database Schema Extension
-- ============================================================================
-- FASE 1: "Candidate controls references before they become usable"
-- ============================================================================

-- ============================================================================
-- 1. ENSURE STATUS COLUMN EXISTS
-- ============================================================================
-- Status values: REQUESTED, SUBMITTED, REVISION_REQUESTED, ACCEPTED, OMITTED
-- Note: 'active' is legacy and will be migrated to ACCEPTED

-- The status column already exists, so we just add a comment
COMMENT ON COLUMN references.status IS
  'Reference workflow status: SUBMITTED (awaiting review), REVISION_REQUESTED, ACCEPTED (usable), OMITTED (hidden). Legacy value "active" migrated to ACCEPTED.';

-- ============================================================================
-- 2. ENSURE IS_HIDDEN COLUMN EXISTS
-- ============================================================================
-- is_hidden should already exist from migration 010, but ensure it does
ALTER TABLE references ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 3. DATA MIGRATION: MIGRATE LEGACY STATUS
-- ============================================================================
-- Convert existing 'active' references to 'ACCEPTED' status
UPDATE references SET status = 'ACCEPTED' WHERE status = 'active';

-- ============================================================================
-- 4. INDEX FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_references_workflow_status ON references(status);
