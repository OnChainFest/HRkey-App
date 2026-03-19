import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const ENTITY_TYPES = Object.freeze(['candidate', 'referee', 'company', 'role', 'reference']);
// Human relationship edge types are reserved for canonical actor-based graph population.
// Reference-driven extraction currently persists only REFERENCED evidence edges.
const EDGE_TYPES = Object.freeze([
  'worked_with',
  'managed_by',
  'reviewed_by',
  'reported_to',
  'MANAGER_OF',
  'DIRECT_REPORT_OF',
  'PEER_OF',
  'COLLABORATED_WITH',
  'REFERENCED'
]);

const ENTITY_TABLES = Object.freeze({
  candidate: ['users'],
  referee: ['users', 'company_signers', 'reference_invites'],
  company: ['companies'],
  role: ['roles'],
  reference: ['references']
});

let supabaseClient;

export class ReputationGraphError extends Error {
  constructor(message, status = 400, code = 'REPUTATION_GRAPH_ERROR') {
    super(message);
    this.name = 'ReputationGraphError';
    this.status = status;
    this.code = code;
  }
}

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}

function getSupabaseClient() {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const resolvedSupabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  if (process.env.NODE_ENV === 'test' && supabaseClient) {
    return supabaseClient;
  }

  if (process.env.NODE_ENV === 'test') {
    return createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  return supabaseClient;
}

function assertValidEntityType(entityType) {
  if (!ENTITY_TYPES.includes(entityType)) {
    throw new ReputationGraphError('Invalid entity type', 400, 'INVALID_ENTITY_TYPE');
  }
}

function assertValidEdgeType(edgeType) {
  if (!EDGE_TYPES.includes(edgeType)) {
    throw new ReputationGraphError('Invalid edge type', 400, 'INVALID_EDGE_TYPE');
  }
}

function normalizeEntityId(entityId) {
  if (entityId === null || entityId === undefined) {
    throw new ReputationGraphError('Entity ID is required', 400, 'INVALID_ENTITY_ID');
  }

  const normalized = String(entityId).trim();
  if (!normalized) {
    throw new ReputationGraphError('Entity ID is required', 400, 'INVALID_ENTITY_ID');
  }

  return normalized;
}

async function fetchExistingEntity(entityType, entityId) {
  const client = getSupabaseClient();
  const tables = ENTITY_TABLES[entityType] || [];

  for (const table of tables) {
    const { data, error } = await client
      .from(table)
      .select('id')
      .eq('id', entityId)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to validate reputation graph entity existence', {
        entityType,
        entityId,
        table,
        error: error.message
      });
      continue;
    }

    if (data?.id) {
      return { table, id: data.id };
    }
  }

  return null;
}

async function getNodeRecordById(nodeId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('reputation_graph_nodes')
    .select('*')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    throw new ReputationGraphError('Failed to fetch graph node', 500, 'NODE_FETCH_FAILED');
  }

  return data || null;
}

function sanitizeMetadata(metadata) {
  if (metadata === undefined) return null;
  if (metadata === null) return null;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ReputationGraphError('Metadata must be an object', 400, 'INVALID_METADATA');
  }
  return metadata;
}

export class ReputationGraphService {
  static getEntityTypes() {
    return [...ENTITY_TYPES];
  }

  static getEdgeTypes() {
    return [...EDGE_TYPES];
  }

  static async ensureNode(entityType, entityId) {
    assertValidEntityType(entityType);
    const normalizedEntityId = normalizeEntityId(entityId);

    const existingEntity = await fetchExistingEntity(entityType, normalizedEntityId);
    if (!existingEntity) {
      throw new ReputationGraphError('Entity not found', 404, 'ENTITY_NOT_FOUND');
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reputation_graph_nodes')
      .upsert(
        {
          entity_type: entityType,
          entity_id: normalizedEntityId,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'entity_type,entity_id',
          ignoreDuplicates: false
        }
      )
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to ensure reputation graph node', {
        entityType,
        entityId: normalizedEntityId,
        error: error?.message
      });
      throw new ReputationGraphError('Failed to ensure graph node', 500, 'NODE_UPSERT_FAILED');
    }

    return data;
  }

  static async getNode(entityType, entityId) {
    assertValidEntityType(entityType);
    const normalizedEntityId = normalizeEntityId(entityId);

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reputation_graph_nodes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', normalizedEntityId)
      .maybeSingle();

    if (error) {
      throw new ReputationGraphError('Failed to fetch graph node', 500, 'NODE_FETCH_FAILED');
    }

    return data || null;
  }

  static async getNodeById(nodeId) {
    const normalizedNodeId = normalizeEntityId(nodeId);
    return getNodeRecordById(normalizedNodeId);
  }

  static async createEdge({ source, target, edgeType, metadata = null, weight = null, referenceId = null, confidenceScore = null }) {
    assertValidEdgeType(edgeType);

    const sourceNode = await this.ensureNode(source.entityType, source.entityId);
    const targetNode = await this.ensureNode(target.entityType, target.entityId);

    if (sourceNode.id === targetNode.id) {
      throw new ReputationGraphError('Self-referential edges are not allowed', 400, 'SELF_EDGE_NOT_ALLOWED');
    }

    const safeMetadata = sanitizeMetadata(metadata);
    const client = getSupabaseClient();

    const { data: existingEdge, error: existingEdgeError } = await client
      .from('reputation_graph_edges')
      .select('*')
      .eq('source_node_id', sourceNode.id)
      .eq('target_node_id', targetNode.id)
      .eq('edge_type', edgeType)
      .maybeSingle();

    if (existingEdgeError) {
      throw new ReputationGraphError('Failed to validate duplicate edge', 500, 'EDGE_LOOKUP_FAILED');
    }

    if (existingEdge) {
      throw new ReputationGraphError('Edge already exists', 409, 'DUPLICATE_EDGE');
    }

    const { data, error } = await client
      .from('reputation_graph_edges')
      .insert({
        source_node_id: sourceNode.id,
        target_node_id: targetNode.id,
        edge_type: edgeType,
        weight,
        metadata: safeMetadata,
        reference_id: referenceId,
        confidence_score: confidenceScore,
        active: true
      })
      .select('*')
      .single();

    if (error || !data) {
      logger.error('Failed to create reputation graph edge', {
        edgeType,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        error: error?.message
      });
      throw new ReputationGraphError('Failed to create graph edge', 500, 'EDGE_CREATE_FAILED');
    }

    return data;
  }

  static async upsertEdge({ source, target, edgeType, metadata = null, weight = null, referenceId = null, confidenceScore = null, active = true }) {
    assertValidEdgeType(edgeType);

    const sourceNode = await this.ensureNode(source.entityType, source.entityId);
    const targetNode = await this.ensureNode(target.entityType, target.entityId);

    if (sourceNode.id === targetNode.id) {
      throw new ReputationGraphError('Self-referential edges are not allowed', 400, 'SELF_EDGE_NOT_ALLOWED');
    }

    const safeMetadata = sanitizeMetadata(metadata);
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reputation_graph_edges')
      .upsert(
        {
          source_node_id: sourceNode.id,
          target_node_id: targetNode.id,
          edge_type: edgeType,
          weight,
          metadata: safeMetadata,
          reference_id: referenceId,
          confidence_score: confidenceScore,
          active
        },
        {
          onConflict: 'source_node_id,target_node_id,edge_type',
          ignoreDuplicates: false
        }
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new ReputationGraphError('Failed to upsert graph edge', 500, 'EDGE_UPSERT_FAILED');
    }

    return data;
  }

  static async getOutgoingEdges(nodeId) {
    const normalizedNodeId = normalizeEntityId(nodeId);
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reputation_graph_edges')
      .select('*, source:source_node_id(*), target:target_node_id(*)')
      .eq('source_node_id', normalizedNodeId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ReputationGraphError('Failed to fetch outgoing edges', 500, 'OUTGOING_EDGE_FETCH_FAILED');
    }

    return data || [];
  }

  static async getIncomingEdges(nodeId) {
    const normalizedNodeId = normalizeEntityId(nodeId);
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reputation_graph_edges')
      .select('*, source:source_node_id(*), target:target_node_id(*)')
      .eq('target_node_id', normalizedNodeId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ReputationGraphError('Failed to fetch incoming edges', 500, 'INCOMING_EDGE_FETCH_FAILED');
    }

    return data || [];
  }

  static async getEntityGraph(entityType, entityId) {
    const node = await this.getNode(entityType, entityId) || await this.ensureNode(entityType, entityId);
    const [incomingEdges, outgoingEdges] = await Promise.all([
      this.getIncomingEdges(node.id),
      this.getOutgoingEdges(node.id)
    ]);

    return {
      node,
      incomingEdges,
      outgoingEdges
    };
  }
}
