-- ============================================================================
-- HRKey Reputation Graph - Reference Relationship Extraction Support
-- ============================================================================
-- Description: Extends graph edges to persist deterministic relationship edges
--              extracted from finalized references with auditability.
-- Author: HRKey Development Team
-- Date: 2026-03-19
-- ============================================================================

ALTER TABLE reputation_graph_edges
  ADD COLUMN IF NOT EXISTS reference_id UUID REFERENCES references(id) ON DELETE CASCADE;

ALTER TABLE reputation_graph_edges
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3);

ALTER TABLE reputation_graph_edges
  DROP CONSTRAINT IF EXISTS reputation_graph_edges_confidence_score_check;

ALTER TABLE reputation_graph_edges
  ADD CONSTRAINT reputation_graph_edges_confidence_score_check
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

ALTER TABLE reputation_graph_edges
  DROP CONSTRAINT IF EXISTS reputation_graph_edges_edge_type_check;

ALTER TABLE reputation_graph_edges
  ADD CONSTRAINT reputation_graph_edges_edge_type_check
  CHECK (
    edge_type IN (
      'worked_with',
      'managed_by',
      'reviewed_by',
      'reported_to',
      'MANAGER_OF',
      'DIRECT_REPORT_OF',
      'PEER_OF',
      'COLLABORATED_WITH',
      'REFERENCED'
    )
  );

CREATE INDEX IF NOT EXISTS idx_reputation_graph_edges_reference_id
  ON reputation_graph_edges(reference_id)
  WHERE reference_id IS NOT NULL;

COMMENT ON COLUMN reputation_graph_edges.reference_id IS 'Reference record that deterministically produced this edge.';
COMMENT ON COLUMN reputation_graph_edges.confidence_score IS 'Deterministic extraction confidence for auditable relationship edges.';
