import logger from '../logger.js';
import { ReputationGraphService, ReputationGraphError } from './reputationGraph.service.js';

export const GRAPH_RELATIONSHIP_TYPES = Object.freeze({
  MANAGER_OF: 'MANAGER_OF',
  DIRECT_REPORT_OF: 'DIRECT_REPORT_OF',
  PEER_OF: 'PEER_OF',
  COLLABORATED_WITH: 'COLLABORATED_WITH',
  REFERENCED: 'REFERENCED'
});

const RELATIONSHIP_VALUE_TO_EDGE_TYPE = Object.freeze({
  manager: GRAPH_RELATIONSHIP_TYPES.MANAGER_OF,
  supervisor: GRAPH_RELATIONSHIP_TYPES.MANAGER_OF,
  direct_report: GRAPH_RELATIONSHIP_TYPES.DIRECT_REPORT_OF,
  subordinate: GRAPH_RELATIONSHIP_TYPES.DIRECT_REPORT_OF,
  peer: GRAPH_RELATIONSHIP_TYPES.PEER_OF,
  collaborator: GRAPH_RELATIONSHIP_TYPES.COLLABORATED_WITH,
  colleague: GRAPH_RELATIONSHIP_TYPES.COLLABORATED_WITH,
  coworker: GRAPH_RELATIONSHIP_TYPES.COLLABORATED_WITH,
  co_worker: GRAPH_RELATIONSHIP_TYPES.COLLABORATED_WITH
});

const DEFAULT_CONFIDENCE_SCORE = 1;
const EXTRACTION_SOURCE = 'reference_submission';

function normalizeString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeRelationshipValue(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function resolveExtractionContext(referenceRecord) {
  if (!referenceRecord || typeof referenceRecord !== 'object') {
    throw new Error('Reference record is required for relationship extraction');
  }

  const referenceId = normalizeString(referenceRecord.id);
  const candidateId = normalizeString(referenceRecord.owner_id);

  if (!referenceId || !candidateId) {
    throw new Error('Reference record must include id and owner_id');
  }

  const normalizedRelationship = normalizeRelationshipValue(referenceRecord.relationship);
  const inferredRelationshipType = normalizedRelationship
    ? RELATIONSHIP_VALUE_TO_EDGE_TYPE[normalizedRelationship] || null
    : null;
  const extractedAt = new Date().toISOString();

  return {
    referenceId,
    candidateId,
    normalizedRelationship,
    inferredRelationshipType,
    confidenceScore: DEFAULT_CONFIDENCE_SCORE,
    extractedAt
  };
}

function buildInferredRelationshipSignal(referenceRecord, extractionContext) {
  if (!extractionContext.inferredRelationshipType) {
    return null;
  }

  return {
    signalType: 'REFERENCE_RELATIONSHIP_SIGNAL',
    relationshipType: extractionContext.inferredRelationshipType,
    normalizedRelationshipValue: extractionContext.normalizedRelationship,
    referenceId: extractionContext.referenceId,
    candidateId: extractionContext.candidateId,
    extractedAt: extractionContext.extractedAt,
    confidenceScore: extractionContext.confidenceScore,
    source: {
      entityType: 'reference',
      entityId: extractionContext.referenceId,
      semanticRole: 'evidence_artifact'
    },
    target: {
      entityType: 'candidate',
      entityId: extractionContext.candidateId
    },
    materializedAsGraphEdge: false,
    materializationReason: 'canonical_referee_identity_unresolved',
    rawRelationshipValue: normalizeString(referenceRecord.relationship)
  };
}

function buildReferencedEdge(referenceRecord, extractionContext) {
  return {
    source: { entityType: 'reference', entityId: extractionContext.referenceId },
    target: { entityType: 'candidate', entityId: extractionContext.candidateId },
    relationshipType: GRAPH_RELATIONSHIP_TYPES.REFERENCED,
    referenceId: extractionContext.referenceId,
    confidenceScore: extractionContext.confidenceScore,
    metadata: {
      extraction_source: EXTRACTION_SOURCE,
      normalized_relationship_value: extractionContext.normalizedRelationship,
      inferred_relationship_type: extractionContext.inferredRelationshipType,
      reference_id: extractionContext.referenceId,
      candidate_id: extractionContext.candidateId,
      extracted_at: extractionContext.extractedAt,
      confidence_score: extractionContext.confidenceScore
    }
  };
}

export function extractRelationshipsFromReference(referenceRecord) {
  const extractionContext = resolveExtractionContext(referenceRecord);
  const inferredRelationshipSignal = buildInferredRelationshipSignal(referenceRecord, extractionContext);
  const referencedEdge = buildReferencedEdge(referenceRecord, extractionContext);

  return {
    referenceId: extractionContext.referenceId,
    candidateId: extractionContext.candidateId,
    normalizedRelationshipValue: extractionContext.normalizedRelationship,
    inferredRelationshipType: extractionContext.inferredRelationshipType,
    confidenceScore: extractionContext.confidenceScore,
    extractedAt: extractionContext.extractedAt,
    inferredRelationshipSignals: inferredRelationshipSignal ? [inferredRelationshipSignal] : [],
    persistableGraphEdges: [referencedEdge]
  };
}

export async function persistRelationshipsFromReference(referenceRecord) {
  const extractedRelationships = extractRelationshipsFromReference(referenceRecord);
  const persistedEdges = [];

  for (const graphEdge of extractedRelationships.persistableGraphEdges) {
    const edge = await ReputationGraphService.upsertEdge({
      source: graphEdge.source,
      target: graphEdge.target,
      edgeType: graphEdge.relationshipType,
      metadata: graphEdge.metadata,
      referenceId: graphEdge.referenceId,
      confidenceScore: graphEdge.confidenceScore,
      active: true
    });

    persistedEdges.push(edge);
  }

  return {
    referenceId: extractedRelationships.referenceId,
    candidateId: extractedRelationships.candidateId,
    inferredRelationshipSignals: extractedRelationships.inferredRelationshipSignals,
    edges: persistedEdges
  };
}

export async function syncReferenceRelationships(referenceRecord) {
  try {
    return await persistRelationshipsFromReference(referenceRecord);
  } catch (error) {
    if (error instanceof ReputationGraphError) {
      logger.warn('Reference relationship extraction skipped', {
        referenceId: referenceRecord?.id,
        ownerId: referenceRecord?.owner_id,
        code: error.code,
        error: error.message
      });
      throw error;
    }

    logger.error('Reference relationship extraction failed', {
      referenceId: referenceRecord?.id,
      ownerId: referenceRecord?.owner_id,
      error: error.message
    });
    throw error;
  }
}
