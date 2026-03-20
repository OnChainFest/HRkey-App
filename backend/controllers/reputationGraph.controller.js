import logger from '../logger.js';
import { ReputationGraphError, ReputationGraphService } from '../services/reputationGraph.service.js';
import { createClient } from '@supabase/supabase-js';

let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
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

  if (!supabaseClient) {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  return supabaseClient;
}

const QUERYABLE_ENTITY_TYPES = Object.freeze(['candidate', 'company', 'reference']);
const CONFIRMED_RELATIONSHIP_EDGE_TYPES = Object.freeze(['MANAGER_OF', 'DIRECT_REPORT_OF', 'PEER_OF', 'COLLABORATED_WITH']);
const EDGE_TYPE_TO_RELATIONSHIP = Object.freeze({
  MANAGER_OF: 'manager',
  DIRECT_REPORT_OF: 'direct report',
  PEER_OF: 'peer',
  COLLABORATED_WITH: 'collaborator',
  REFERENCED: 'referenced'
});
const RELATIONSHIP_PRIORITY = Object.freeze(['manager', 'direct report', 'peer', 'collaborator', 'referenced / unknown']);

function hasNonEmptyIdentifier(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function canAccessEntityGraph(req, entityType, entityId) {
  const user = req.user;
  if (!user?.id) return false;
  if (user.role === 'superadmin') return true;

  if (entityType === 'candidate') {
    return user.id === entityId;
  }

  if (entityType === 'company') {
    const { data, error } = await getSupabaseClient()
      .from('company_signers')
      .select('id')
      .eq('company_id', entityId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to authorize company graph access', {
        requestId: req.requestId,
        userId: user.id,
        companyId: entityId,
        error: error.message
      });
      return false;
    }

    return !!data;
  }

  if (entityType === 'reference') {
    const { data, error } = await getSupabaseClient()
      .from('references')
      .select('id')
      .eq('id', entityId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to authorize reference graph access', {
        requestId: req.requestId,
        userId: user.id,
        referenceId: entityId,
        error: error.message
      });
      return false;
    }

    return !!data;
  }

  return false;
}

function handleGraphError(res, error, fallbackMessage) {
  if (error instanceof ReputationGraphError) {
    return res.status(error.status).json({
      ok: false,
      error: error.code,
      message: error.message
    });
  }

  return res.status(500).json({
    ok: false,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage
  });
}

function normalizeLabel(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeLabel(value);
    if (normalized) return normalized;
  }
  return null;
}

function toRelationshipLabel(value) {
  if (!value) return 'Referenced / unknown';
  const lower = String(value).toLowerCase();
  if (lower === 'direct report') return 'Direct report';
  if (lower === 'referenced / unknown') return 'Referenced / unknown';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function chooseRelationshipType(types) {
  const normalizedTypes = Array.from(new Set((types || []).filter(Boolean)));
  for (const candidate of RELATIONSHIP_PRIORITY) {
    if (normalizedTypes.includes(candidate)) return candidate;
  }
  return 'referenced / unknown';
}

function deriveStrengthBand(refereeCount, referenceCount, diversityCount) {
  const score = refereeCount * 2 + referenceCount + diversityCount;
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

function deriveCoverageBand(confirmedCount, inferredCount, referenceCount) {
  if (referenceCount === 0) return 'limited';
  if (confirmedCount >= 2 || confirmedCount === referenceCount) return 'strong';
  if (confirmedCount > 0 || inferredCount > 0) return 'moderate';
  return 'limited';
}

async function fetchCandidateProfile(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('id, full_name, name, headline')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load candidate profile for graph visualization', {
      candidateId,
      error: error.message
    });
  }

  return data || null;
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, referrer_name, referrer_email, relationship, created_at, status, referee_id, referee_resolution_confidence')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ReputationGraphError('Failed to load candidate references', 500, 'REFERENCE_FETCH_FAILED');
  }

  return data || [];
}

export function buildVisualizationModel({ candidateId, candidateProfile, graph, references }) {
  const confirmedEdgesByRefereeId = new Map();
  const referenceEvidenceByReferenceId = new Map();

  for (const edge of graph.incomingEdges || []) {
    const sourceEntityType = edge?.source?.entity_type;
    const sourceEntityId = edge?.source?.entity_id;

    if (sourceEntityType === 'referee' && CONFIRMED_RELATIONSHIP_EDGE_TYPES.includes(edge.edge_type)) {
      const existing = confirmedEdgesByRefereeId.get(sourceEntityId) || [];
      existing.push(edge);
      confirmedEdgesByRefereeId.set(sourceEntityId, existing);
      continue;
    }

    if (sourceEntityType === 'reference' && edge.edge_type === 'REFERENCED') {
      referenceEvidenceByReferenceId.set(edge.reference_id || sourceEntityId, edge);
    }
  }

  const canonicalReferees = new Map();
  const unresolvedEvidence = [];

  for (const reference of references) {
    const referenceId = reference.id;
    const evidenceEdge = referenceEvidenceByReferenceId.get(referenceId) || null;
    const inferredType = EDGE_TYPE_TO_RELATIONSHIP[evidenceEdge?.metadata?.inferred_relationship_type] || null;
    const fallbackRelationship = normalizeLabel(reference.relationship)?.toLowerCase().replace(/[_-]+/g, ' ');
    const evidenceRelationship = inferredType || fallbackRelationship || 'referenced / unknown';
    const supportingEvidence = {
      referenceId,
      relationshipLabel: toRelationshipLabel(evidenceRelationship),
      relationshipType: evidenceRelationship,
      status: reference.status || null,
      createdAt: reference.created_at || null,
      sourceType: evidenceEdge?.metadata?.inferred_relationship_type ? 'signal' : 'reference'
    };

    if (reference.referee_id) {
      const existing = canonicalReferees.get(reference.referee_id) || {
        refereeId: reference.referee_id,
        displayName: pickFirstNonEmpty(reference.referrer_name, reference.referrer_email, `Referee ${reference.referee_id.slice(-6)}`),
        evidence: [],
        referenceIds: new Set(),
        inferredRelationshipTypes: new Set(),
        relationshipResolutionConfidence: reference.referee_resolution_confidence || null
      };

      existing.displayName = pickFirstNonEmpty(existing.displayName, reference.referrer_name, reference.referrer_email, `Referee ${reference.referee_id.slice(-6)}`);
      existing.relationshipResolutionConfidence = existing.relationshipResolutionConfidence || reference.referee_resolution_confidence || null;
      existing.evidence.push(supportingEvidence);
      existing.referenceIds.add(referenceId);
      if (evidenceRelationship) existing.inferredRelationshipTypes.add(evidenceRelationship);
      canonicalReferees.set(reference.referee_id, existing);
      continue;
    }

    unresolvedEvidence.push({
      referenceId,
      label: pickFirstNonEmpty(reference.referrer_name, reference.referrer_email, `Reference ${referenceId.slice(-6)}`),
      relationshipLabel: toRelationshipLabel(evidenceRelationship),
      relationshipType: evidenceRelationship,
      createdAt: reference.created_at || null,
      sourceType: evidenceEdge?.metadata?.inferred_relationship_type ? 'signal-only' : 'referenced'
    });
  }

  const relationships = Array.from(canonicalReferees.values())
    .map((entry) => {
      const confirmedEdges = confirmedEdgesByRefereeId.get(entry.refereeId) || [];
      const confirmedRelationshipTypes = confirmedEdges
        .map((edge) => EDGE_TYPE_TO_RELATIONSHIP[edge.edge_type])
        .filter(Boolean);
      const inferredRelationshipTypes = Array.from(entry.inferredRelationshipTypes);
      const primaryRelationship = chooseRelationshipType(
        confirmedRelationshipTypes.length > 0 ? confirmedRelationshipTypes : inferredRelationshipTypes
      );
      const relationshipStatus = confirmedRelationshipTypes.length > 0 ? 'confirmed' : inferredRelationshipTypes.length > 0 ? 'inferred' : 'referenced';

      return {
        refereeId: entry.refereeId,
        displayName: entry.displayName,
        relationshipLabel:
          relationshipStatus === 'confirmed'
            ? toRelationshipLabel(primaryRelationship)
            : relationshipStatus === 'inferred'
              ? `Inferred ${toRelationshipLabel(primaryRelationship).toLowerCase()} relationship`
              : 'Referenced / unknown',
        relationshipType: primaryRelationship,
        relationshipStatus,
        supportingReferenceCount: entry.referenceIds.size,
        evidenceCount: entry.evidence.length,
        confirmedRelationshipTypes: confirmedRelationshipTypes.map((type) => toRelationshipLabel(type)),
        inferredRelationshipTypes: inferredRelationshipTypes.map((type) => toRelationshipLabel(type)),
        evidence: entry.evidence.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        resolutionConfidence: entry.relationshipResolutionConfidence,
        evidenceHint:
          relationshipStatus === 'confirmed'
            ? `${entry.referenceIds.size} supporting reference${entry.referenceIds.size === 1 ? '' : 's'}`
            : relationshipStatus === 'inferred'
              ? `Relationship inferred from ${entry.referenceIds.size} reference${entry.referenceIds.size === 1 ? '' : 's'}`
              : `${entry.referenceIds.size} reference${entry.referenceIds.size === 1 ? '' : 's'} linked to this referee`
      };
    })
    .sort((a, b) => {
      if (a.relationshipStatus !== b.relationshipStatus) {
        return ['confirmed', 'inferred', 'referenced'].indexOf(a.relationshipStatus) - ['confirmed', 'inferred', 'referenced'].indexOf(b.relationshipStatus);
      }
      if (b.supportingReferenceCount !== a.supportingReferenceCount) {
        return b.supportingReferenceCount - a.supportingReferenceCount;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  const confirmedRelationshipCount = relationships.filter((item) => item.relationshipStatus === 'confirmed').length;
  const inferredRelationshipCount = relationships.filter((item) => item.relationshipStatus === 'inferred').length;
  const distinctRelationshipTypes = new Set(
    relationships
      .map((item) => item.relationshipType)
      .filter((type) => type && type !== 'referenced / unknown')
  );

  return {
    candidate: {
      id: candidateId,
      label: pickFirstNonEmpty(candidateProfile?.full_name, candidateProfile?.name, 'Candidate'),
      headline: candidateProfile?.headline || null
    },
    summary: {
      refereeCount: relationships.length,
      referenceCount: references.length,
      unresolvedReferenceCount: unresolvedEvidence.length,
      distinctRelationshipTypeCount: distinctRelationshipTypes.size,
      confirmedRelationshipCount,
      inferredRelationshipCount,
      networkStrengthBand: deriveStrengthBand(relationships.length, references.length, distinctRelationshipTypes.size),
      evidenceCoverage: deriveCoverageBand(confirmedRelationshipCount, inferredRelationshipCount, references.length)
    },
    relationships,
    unresolvedEvidence: unresolvedEvidence.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  };
}

export async function getEntityGraph(req, res) {
  try {
    const { entityType, entityId } = req.params;

    if (!QUERYABLE_ENTITY_TYPES.includes(entityType) || !hasNonEmptyIdentifier(entityId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_REQUEST', message: 'Invalid graph entity lookup' });
    }

    const allowed = await canAccessEntityGraph(req, entityType, entityId);
    if (!allowed) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const graph = await ReputationGraphService.getEntityGraph(entityType, entityId);

    return res.status(200).json({
      ok: true,
      ...graph
    });
  } catch (error) {
    logger.error('Failed to fetch entity reputation graph', {
      requestId: req.requestId,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
      userId: req.user?.id,
      error: error.message
    });
    return handleGraphError(res, error, 'Failed to fetch reputation graph');
  }
}

export async function getCandidateVisualization(req, res) {
  try {
    const { candidateId } = req.params;

    if (!hasNonEmptyIdentifier(candidateId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_REQUEST', message: 'Candidate ID is required' });
    }

    const allowed = await canAccessEntityGraph(req, 'candidate', candidateId);
    if (!allowed) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const [candidateProfile, graph, references] = await Promise.all([
      fetchCandidateProfile(candidateId),
      ReputationGraphService.getEntityGraph('candidate', candidateId),
      fetchCandidateReferences(candidateId)
    ]);

    const visualization = buildVisualizationModel({
      candidateId,
      candidateProfile,
      graph,
      references
    });

    return res.status(200).json({
      ok: true,
      ...visualization
    });
  } catch (error) {
    logger.error('Failed to fetch candidate relationship visualization', {
      requestId: req.requestId,
      candidateId: req.params.candidateId,
      userId: req.user?.id,
      error: error.message
    });
    return handleGraphError(res, error, 'Failed to fetch candidate relationship visualization');
  }
}

export async function getNodeEdges(req, res) {
  try {
    const { nodeId } = req.params;
    if (!hasNonEmptyIdentifier(nodeId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_NODE_ID', message: 'Valid node ID is required' });
    }

    const node = await ReputationGraphService.getNodeById(nodeId);
    if (!node) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const allowed = await canAccessEntityGraph(req, node.entity_type, node.entity_id);
    if (!allowed) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const [incomingEdges, outgoingEdges] = await Promise.all([
      ReputationGraphService.getIncomingEdges(nodeId),
      ReputationGraphService.getOutgoingEdges(nodeId)
    ]);

    return res.status(200).json({
      ok: true,
      node,
      incomingEdges,
      outgoingEdges
    });
  } catch (error) {
    logger.error('Failed to fetch reputation graph node edges', {
      requestId: req.requestId,
      nodeId: req.params.nodeId,
      userId: req.user?.id,
      error: error.message
    });
    return handleGraphError(res, error, 'Failed to fetch reputation graph edges');
  }
}
