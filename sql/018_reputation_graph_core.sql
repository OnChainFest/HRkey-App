-- ============================================================================
-- HRKey Reputation Graph - Core Relational Data Model
-- ============================================================================
-- Description: Persistable and queryable graph primitives for professional
--              reputation entities and relationships.
-- Author: HRKey Development Team
-- Date: 2026-03-19
-- ============================================================================

CREATE TABLE IF NOT EXISTS reputation_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'referee', 'company', 'role', 'reference')),
  entity_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reputation_graph_nodes_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_reputation_graph_nodes_entity
  ON reputation_graph_nodes(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS reputation_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES reputation_graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES reputation_graph_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('worked_with', 'managed_by', 'reviewed_by', 'reported_to')),
  weight DOUBLE PRECISION,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT reputation_graph_edges_no_self_edge CHECK (source_node_id <> target_node_id),
  CONSTRAINT reputation_graph_edges_unique UNIQUE (source_node_id, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_reputation_graph_edges_source_node
  ON reputation_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_reputation_graph_edges_target_node
  ON reputation_graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_reputation_graph_edges_type
  ON reputation_graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_reputation_graph_edges_active
  ON reputation_graph_edges(active)
  WHERE active = TRUE;

COMMENT ON TABLE reputation_graph_nodes IS 'Canonical graph nodes for professional reputation entities already modeled elsewhere in HRKey.';
COMMENT ON COLUMN reputation_graph_nodes.entity_id IS 'Opaque identifier stored as text to support UUID-backed and string-backed domain entities.';
COMMENT ON TABLE reputation_graph_edges IS 'Directed professional relationship edges between graph nodes.';
COMMENT ON COLUMN reputation_graph_edges.metadata IS 'Auditable edge context such as reference IDs, company IDs, dates, or ingestion provenance.';

DROP TRIGGER IF EXISTS update_reputation_graph_nodes_updated_at ON reputation_graph_nodes;
CREATE TRIGGER update_reputation_graph_nodes_updated_at
  BEFORE UPDATE ON reputation_graph_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
