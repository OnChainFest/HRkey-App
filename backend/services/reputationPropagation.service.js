import { createClient } from '@supabase/supabase-js';
import { ReputationGraphError, ReputationGraphService } from './reputationGraph.service.js';

const CONFIRMED_RELATIONSHIP_EDGE_TYPES = Object.freeze(['MANAGER_OF', 'DIRECT_REPORT_OF', 'PEER_OF', 'COLLABORATED_WITH']);
const RELATIONSHIP_EDGE_WEIGHTS = Object.freeze({
  MANAGER_OF: 1,
  DIRECT_REPORT_OF: 0.9,
  PEER_OF: 0.72,
  COLLABORATED_WITH: 0.65,
  REFERENCED: 0.45
});
const RESOLUTION_CONFIDENCE_WEIGHTS = Object.freeze({ high: 1, medium: 0.72, low: 0.45, unresolved: 0.3 });
const PROPAGATION_DEFAULTS = Object.freeze({
  maxDepth: 2,
  includeSecondOrder: true,
  hopDecay: Object.freeze({ 1: 0.35, 2: 0.15 }),
  directEvidenceCap: 0.78,
  networkContributionCap: 0.22,
  neighborContributionCap: 0.12,
  secondOrderNeighborCap: 0.06,
  sparseSupportThreshold: 2,
  refereeCandidateSampleCap: 6,
  explanationLimit: 6,
  caveatLimit: 5
});

let supabaseClient;

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

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function roundScore(value) {
  return Math.round(clamp(value) * 1000) / 1000;
}

function confidenceWeight(value) {
  return RESOLUTION_CONFIDENCE_WEIGHTS[value] || RESOLUTION_CONFIDENCE_WEIGHTS.unresolved;
}

function normalizeMaxDepth(value) {
  if (!Number.isFinite(value)) return PROPAGATION_DEFAULTS.maxDepth;
  return Math.min(2, Math.max(0, Math.floor(value)));
}

function createTraversalState(currentDepth = 0) {
  return { currentDepth: Math.max(0, Math.floor(currentDepth)) };
}

function canTraverseHop(options, traversalState, hopDistance = 1) {
  return traversalState.currentDepth + hopDistance <= options.maxDepth;
}

function resolveOptions(options = {}) {
  const maxDepth = normalizeMaxDepth(options.maxDepth);
  return {
    ...PROPAGATION_DEFAULTS,
    ...options,
    maxDepth,
    includeSecondOrder: options.includeSecondOrder ?? PROPAGATION_DEFAULTS.includeSecondOrder,
    hopDecay: {
      ...PROPAGATION_DEFAULTS.hopDecay,
      ...(options.hopDecay || {})
    }
  };
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sum(items, mapper = (value) => value) {
  return (items || []).reduce((total, item) => total + mapper(item), 0);
}

function buildBand(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function buildTrustBand(score, confidenceScore) {
  if (score >= 0.7 && confidenceScore >= 0.65) return 'high';
  if (score >= 0.4 && confidenceScore >= 0.35) return 'medium';
  return 'limited';
}

function addUniqueText(target, message, limit) {
  if (!message || target.includes(message) || target.length >= limit) return;
  target.push(message);
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, relationship, status, created_at, referee_id, referee_resolution_confidence')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ReputationGraphError('Failed to load candidate references', 500, 'REFERENCE_FETCH_FAILED');
  }

  return data || [];
}

async function fetchReferencesForReferee(refereeId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, relationship, status, created_at, referee_id, referee_resolution_confidence')
    .eq('referee_id', refereeId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ReputationGraphError('Failed to load referee-linked references', 500, 'REFERENCE_FETCH_FAILED');
  }

  return data || [];
}

async function fetchRefereeIdentity(refereeId) {
  const { data, error } = await getSupabaseClient()
    .from('referee_identities')
    .select('id, confidence, resolution_strategy, signer_user_id')
    .eq('id', refereeId)
    .maybeSingle();

  if (error) {
    throw new ReputationGraphError('Failed to load referee identity', 500, 'REFEREE_FETCH_FAILED');
  }

  return data || null;
}

function buildCandidateRelationshipSummary(graph, references) {
  const incomingEdges = graph?.incomingEdges || [];
  const confirmedEdges = incomingEdges
    .filter((edge) => edge?.source?.entity_type === 'referee' && CONFIRMED_RELATIONSHIP_EDGE_TYPES.includes(edge.edge_type))
    .sort((a, b) => `${a.source?.entity_id || ''}:${a.edge_type}`.localeCompare(`${b.source?.entity_id || ''}:${b.edge_type}`));

  const canonicalReferenceMap = new Map();
  let unresolvedReferenceCount = 0;

  for (const reference of references) {
    if (reference.referee_id) {
      const existing = canonicalReferenceMap.get(reference.referee_id) || [];
      existing.push(reference);
      canonicalReferenceMap.set(reference.referee_id, existing);
    } else {
      unresolvedReferenceCount += 1;
    }
  }

  return {
    confirmedEdges,
    canonicalRefereeGroups: [...canonicalReferenceMap.entries()].map(([refereeId, linkedReferences]) => ({
      refereeId,
      linkedReferences: [...linkedReferences].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    })),
    unresolvedReferenceCount
  };
}

function calculateCandidateDirectEvidence({ references, relationshipSummary, options }) {
  const directBreakdown = [];
  const canonicalRefereeCount = relationshipSummary.canonicalRefereeGroups.length;
  const totalReferenceCount = references.length;

  const referenceVolumeContribution = clamp(totalReferenceCount * 0.06, 0, 0.24);
  if (referenceVolumeContribution > 0) {
    directBreakdown.push({
      factor: 'direct_reference_volume',
      contribution: roundScore(referenceVolumeContribution),
      detail: `${totalReferenceCount} direct reference${totalReferenceCount === 1 ? '' : 's'} contribute primary evidence.`
    });
  }

  const canonicalContribution = clamp(
    sum(relationshipSummary.canonicalRefereeGroups, (group) => {
      const strongestConfidence = Math.max(...group.linkedReferences.map((reference) => confidenceWeight(reference.referee_resolution_confidence)));
      return 0.12 * strongestConfidence;
    }),
    0,
    0.36
  );
  if (canonicalContribution > 0) {
    directBreakdown.push({
      factor: 'canonical_referee_support',
      contribution: roundScore(canonicalContribution),
      detail: `${canonicalRefereeCount} canonical referee${canonicalRefereeCount === 1 ? '' : 's'} strengthen direct support.`
    });
  }

  const confirmedRelationshipContribution = clamp(
    sum(relationshipSummary.confirmedEdges, (edge) => 0.08 * (RELATIONSHIP_EDGE_WEIGHTS[edge.edge_type] || 0.5) * confidenceWeight(edge.confidence_score >= 0.8 ? 'high' : 'medium')),
    0,
    0.22
  );
  if (confirmedRelationshipContribution > 0) {
    directBreakdown.push({
      factor: 'confirmed_relationship_support',
      contribution: roundScore(confirmedRelationshipContribution),
      detail: `${relationshipSummary.confirmedEdges.length} confirmed canonical relationship edge${relationshipSummary.confirmedEdges.length === 1 ? '' : 's'} increase trust weight.`
    });
  }

  const unresolvedContribution = clamp(relationshipSummary.unresolvedReferenceCount * 0.03, 0, 0.12);
  if (unresolvedContribution > 0) {
    directBreakdown.push({
      factor: 'unresolved_reference_support',
      contribution: roundScore(unresolvedContribution),
      detail: `${relationshipSummary.unresolvedReferenceCount} unresolved reference${relationshipSummary.unresolvedReferenceCount === 1 ? '' : 's'} add limited evidence-only support.`
    });
  }

  const total = roundScore(clamp(sum(directBreakdown, (item) => item.contribution), 0, options.directEvidenceCap));

  return {
    score: total,
    breakdown: directBreakdown,
    canonicalRefereeCount,
    supportingEvidenceCount: totalReferenceCount,
    confirmedRelationshipCount: relationshipSummary.confirmedEdges.length,
    unresolvedReferenceCount: relationshipSummary.unresolvedReferenceCount
  };
}

function calculateRefereeDirectEvidence({ identityRecord, references, confirmedCandidateEdges, options }) {
  const breakdown = [];
  const identityContribution = identityRecord ? clamp(0.18 * confidenceWeight(identityRecord.confidence), 0, 0.18) : 0;
  if (identityContribution > 0) {
    breakdown.push({
      factor: 'identity_resolution_confidence',
      contribution: roundScore(identityContribution),
      detail: `Canonical referee identity resolution contributes ${identityRecord.confidence || 'unresolved'} confidence.`
    });
  }

  const linkedCandidateCount = uniqueBy(references, (reference) => reference.owner_id).length;
  const coverageContribution = clamp(linkedCandidateCount * 0.07, 0, 0.21);
  if (coverageContribution > 0) {
    breakdown.push({
      factor: 'candidate_coverage',
      contribution: roundScore(coverageContribution),
      detail: `${linkedCandidateCount} candidate${linkedCandidateCount === 1 ? '' : 's'} are directly linked to this referee.`
    });
  }

  const confirmedContribution = clamp(
    sum(confirmedCandidateEdges, (edge) => 0.07 * (RELATIONSHIP_EDGE_WEIGHTS[edge.edge_type] || 0.5)),
    0,
    0.21
  );
  if (confirmedContribution > 0) {
    breakdown.push({
      factor: 'confirmed_relationship_support',
      contribution: roundScore(confirmedContribution),
      detail: `${confirmedCandidateEdges.length} confirmed canonical candidate relationship edge${confirmedCandidateEdges.length === 1 ? '' : 's'} support referee credibility.`
    });
  }

  const total = roundScore(clamp(sum(breakdown, (item) => item.contribution), 0, options.directEvidenceCap));

  return {
    score: total,
    breakdown,
    supportingEvidenceCount: references.length,
    linkedCandidateCount,
    confirmedRelationshipCount: confirmedCandidateEdges.length
  };
}

async function computeRefereeCredibilityForCandidate({ refereeId, candidateId, options, visited, traversalState }) {
  if (!options.includeSecondOrder) {
    return {
      score: 0,
      supportingCandidateCount: 0,
      candidateContributions: [],
      caveat: 'Second-order propagation was disabled for this computation.'
    };
  }

  if (!canTraverseHop(options, traversalState, 1)) {
    return {
      score: 0,
      supportingCandidateCount: 0,
      candidateContributions: [],
      caveat: 'Propagation stopped at the configured depth boundary before second-order corroboration.'
    };
  }

  const references = (await fetchReferencesForReferee(refereeId)).filter((reference) => reference.owner_id !== candidateId);
  const uniqueCandidateIds = uniqueBy(references, (reference) => reference.owner_id)
    .map((reference) => reference.owner_id)
    .filter(Boolean)
    .sort();

  if (uniqueCandidateIds.length === 0) {
    return {
      score: 0,
      supportingCandidateCount: 0,
      candidateContributions: [],
      caveat: 'No corroborating candidate history was available for this referee.'
    };
  }

  const candidateContributions = [];
  for (const neighborCandidateId of uniqueCandidateIds.slice(0, options.refereeCandidateSampleCap)) {
    if (visited.has(`candidate:${neighborCandidateId}`)) continue;
    const candidateResult = await computeCandidatePropagation(
      neighborCandidateId,
      {
        ...options,
        includeSecondOrder: false
      },
      new Set([...visited, `candidate:${candidateId}`, `referee:${refereeId}`]),
      createTraversalState(traversalState.currentDepth + 1)
    );

    const contribution = clamp(candidateResult.directEvidenceScore * options.hopDecay[2], 0, options.secondOrderNeighborCap);
    if (contribution <= 0) continue;
    candidateContributions.push({
      candidateId: neighborCandidateId,
      scoreUsed: candidateResult.directEvidenceScore,
      contribution: roundScore(contribution)
    });
  }

  const total = roundScore(clamp(sum(candidateContributions, (item) => item.contribution), 0, options.networkContributionCap));

  return {
    score: total,
    supportingCandidateCount: candidateContributions.length,
    candidateContributions,
    caveat: candidateContributions.length === 0 ? 'This referee lacks external corroboration beyond the target candidate.' : null
  };
}

async function computeCandidatePropagation(candidateId, options = {}, visited = new Set(), traversalState = createTraversalState()) {
  const resolvedOptions = resolveOptions(options);
  const graph = await ReputationGraphService.getEntityGraph('candidate', candidateId);
  const references = await fetchCandidateReferences(candidateId);
  const relationshipSummary = buildCandidateRelationshipSummary(graph, references);
  const direct = calculateCandidateDirectEvidence({ references, relationshipSummary, options: resolvedOptions });

  const networkBreakdown = [];
  const visitedNext = new Set([...visited, `candidate:${candidateId}`]);
  const allowOneHopPropagation = canTraverseHop(resolvedOptions, traversalState, 1);
  const allowSecondOrderPropagation = resolvedOptions.includeSecondOrder && canTraverseHop(resolvedOptions, traversalState, 2);

  if (allowOneHopPropagation) {
    for (const group of relationshipSummary.canonicalRefereeGroups.sort((a, b) => String(a.refereeId).localeCompare(String(b.refereeId)))) {
      if (visitedNext.has(`referee:${group.refereeId}`)) continue;

      const corroboration = allowSecondOrderPropagation
        ? await computeRefereeCredibilityForCandidate({
            refereeId: group.refereeId,
            candidateId,
            options: resolvedOptions,
            visited: visitedNext,
            traversalState: createTraversalState(traversalState.currentDepth + 1)
          })
        : {
            score: 0,
            supportingCandidateCount: 0,
            candidateContributions: [],
            caveat: resolvedOptions.includeSecondOrder
              ? 'Propagation stopped at the configured depth boundary before second-order corroboration.'
              : 'Second-order propagation was disabled for this computation.'
          };

      const strongestConfidence = Math.max(...group.linkedReferences.map((reference) => confidenceWeight(reference.referee_resolution_confidence)));
      const confirmedRelationshipEdge = relationshipSummary.confirmedEdges.find((edge) => edge?.source?.entity_id === group.refereeId);
      const relationshipWeight = confirmedRelationshipEdge
        ? RELATIONSHIP_EDGE_WEIGHTS[confirmedRelationshipEdge.edge_type] || 0.45
        : RELATIONSHIP_EDGE_WEIGHTS.REFERENCED;

      const baseContribution = 0.05 * strongestConfidence * relationshipWeight;
      const propagatedContribution = corroboration.score * strongestConfidence;
      const contribution = roundScore(clamp(baseContribution + propagatedContribution, 0, resolvedOptions.neighborContributionCap));

      if (contribution <= 0) continue;
      networkBreakdown.push({
        sourceType: 'referee',
        sourceId: group.refereeId,
        hopDepth: corroboration.supportingCandidateCount > 0 ? 2 : 1,
        contribution,
        relationshipWeight: roundScore(relationshipWeight),
        resolutionConfidenceWeight: roundScore(strongestConfidence),
        corroboratingCandidateCount: corroboration.supportingCandidateCount,
        supportingReferenceCount: group.linkedReferences.length
      });
    }
  }

  const networkPropagationScore = allowOneHopPropagation
    ? roundScore(clamp(sum(networkBreakdown, (item) => item.contribution), 0, resolvedOptions.networkContributionCap))
    : 0;
  return summarizePropagationResult({
    target: { entityType: 'candidate', entityId: candidateId },
    directEvidenceScore: direct.score,
    networkPropagationScore,
    directBreakdown: direct.breakdown,
    networkBreakdown,
    metrics: {
      supportingEvidenceCount: direct.supportingEvidenceCount,
      supportingRefereeCount: direct.canonicalRefereeCount,
      supportingConfirmedRelationshipCount: direct.confirmedRelationshipCount,
      unresolvedReferenceCount: direct.unresolvedReferenceCount
    },
    options: resolvedOptions
  });
}

async function computeRefereePropagation(refereeId, options = {}, visited = new Set(), traversalState = createTraversalState()) {
  const resolvedOptions = resolveOptions(options);
  const references = await fetchReferencesForReferee(refereeId);
  const uniqueCandidateIds = uniqueBy(references, (reference) => reference.owner_id)
    .map((reference) => reference.owner_id)
    .filter(Boolean)
    .sort();

  const graphNode = await ReputationGraphService.getNode('referee', refereeId);
  const graph = graphNode ? await ReputationGraphService.getEntityGraph('referee', refereeId) : { incomingEdges: [], outgoingEdges: [] };
  const confirmedCandidateEdges = (graph.outgoingEdges || [])
    .filter((edge) => edge?.target?.entity_type === 'candidate' && CONFIRMED_RELATIONSHIP_EDGE_TYPES.includes(edge.edge_type))
    .sort((a, b) => `${a.target?.entity_id || ''}:${a.edge_type}`.localeCompare(`${b.target?.entity_id || ''}:${b.edge_type}`));
  const identityRecord = await fetchRefereeIdentity(refereeId);
  const direct = calculateRefereeDirectEvidence({ identityRecord, references, confirmedCandidateEdges, options: resolvedOptions });

  const networkBreakdown = [];
  const visitedNext = new Set([...visited, `referee:${refereeId}`]);
  if (canTraverseHop(resolvedOptions, traversalState, 1)) {
    for (const candidateId of uniqueCandidateIds.slice(0, resolvedOptions.refereeCandidateSampleCap)) {
      if (visitedNext.has(`candidate:${candidateId}`)) continue;
      const candidateResult = await computeCandidatePropagation(
        candidateId,
        {
          ...resolvedOptions,
          includeSecondOrder: false
        },
        visitedNext,
        createTraversalState(traversalState.currentDepth + 1)
      );

      const contribution = roundScore(clamp(candidateResult.directEvidenceScore * resolvedOptions.hopDecay[1], 0, resolvedOptions.neighborContributionCap));
      if (contribution <= 0) continue;
      networkBreakdown.push({
        sourceType: 'candidate',
        sourceId: candidateId,
        hopDepth: 1,
        contribution,
        scoreUsed: candidateResult.directEvidenceScore
      });
    }
  }

  const networkPropagationScore = canTraverseHop(resolvedOptions, traversalState, 1)
    ? roundScore(clamp(sum(networkBreakdown, (item) => item.contribution), 0, resolvedOptions.networkContributionCap))
    : 0;
  return summarizePropagationResult({
    target: { entityType: 'referee', entityId: refereeId },
    directEvidenceScore: direct.score,
    networkPropagationScore,
    directBreakdown: direct.breakdown,
    networkBreakdown,
    metrics: {
      supportingEvidenceCount: direct.supportingEvidenceCount,
      supportingCandidateCount: direct.linkedCandidateCount,
      supportingConfirmedRelationshipCount: direct.confirmedRelationshipCount
    },
    options: resolvedOptions
  });
}

export function explainPropagationFactors({ target, directBreakdown, networkBreakdown, metrics, options, totalScore }) {
  const explanations = [];
  const caveats = [];

  for (const item of directBreakdown || []) {
    addUniqueText(explanations, item.detail, options.explanationLimit);
  }

  const secondOrderCount = (networkBreakdown || []).filter((item) => item.hopDepth === 2).length;
  if (networkBreakdown?.length) {
    const hopOneCount = networkBreakdown.filter((item) => item.hopDepth === 1).length;
    addUniqueText(
      explanations,
      `${hopOneCount} direct neighbor${hopOneCount === 1 ? '' : 's'} contributed bounded propagation support.`,
      options.explanationLimit
    );
    if (secondOrderCount > 0) {
      addUniqueText(
        explanations,
        `Second-order propagation added limited support through ${secondOrderCount} corroborating path${secondOrderCount === 1 ? '' : 's'}.`,
        options.explanationLimit
      );
    }
  } else {
    addUniqueText(explanations, 'No strong corroborating network connections were found.', options.explanationLimit);
  }

  const primarySupportCount = metrics.supportingRefereeCount ?? metrics.supportingCandidateCount ?? 0;
  if ((metrics.supportingEvidenceCount || 0) < options.sparseSupportThreshold || primarySupportCount < 1) {
    addUniqueText(caveats, 'Graph remains sparse; score is driven mostly by direct evidence.', options.caveatLimit);
  }
  if (options.maxDepth === 0) {
    addUniqueText(caveats, 'Propagation was limited to direct evidence by configuration.', options.caveatLimit);
  } else if (options.maxDepth === 1) {
    addUniqueText(caveats, 'Propagation was limited to one hop by configuration.', options.caveatLimit);
  }
  if (!options.includeSecondOrder) {
    addUniqueText(caveats, 'Second-order propagation was disabled for this computation.', options.caveatLimit);
  }
  if (secondOrderCount === 0) {
    addUniqueText(caveats, 'Network propagation was sharply limited to avoid circular reinforcement.', options.caveatLimit);
  }
  if (totalScore < 0.35) {
    addUniqueText(caveats, `${target.entityType === 'candidate' ? 'Candidate' : 'Referee'} support remains limited and should not be treated as objective truth.`, options.caveatLimit);
  }

  return { explanations, caveats };
}

export function summarizePropagationResult({
  target,
  directEvidenceScore,
  networkPropagationScore,
  directBreakdown,
  networkBreakdown,
  metrics,
  options
}) {
  const score = roundScore(clamp(directEvidenceScore + networkPropagationScore));
  const confidenceInputs = [
    clamp((metrics.supportingEvidenceCount || 0) / 5),
    clamp((metrics.supportingConfirmedRelationshipCount || 0) / 3),
    clamp((networkBreakdown || []).length / 3)
  ];
  const confidenceScore = roundScore(sum(confidenceInputs) / confidenceInputs.length);
  const { explanations, caveats } = explainPropagationFactors({
    target,
    directBreakdown,
    networkBreakdown,
    metrics,
    options,
    totalScore: score
  });

  return {
    target,
    score,
    band: buildBand(score),
    confidenceBand: buildTrustBand(score, confidenceScore),
    confidenceScore,
    directEvidenceScore: roundScore(directEvidenceScore),
    networkPropagationScore: roundScore(networkPropagationScore),
    supportingEvidenceCount: metrics.supportingEvidenceCount || 0,
    supportingRefereeCount: metrics.supportingRefereeCount || 0,
    supportingCandidateCount: metrics.supportingCandidateCount || 0,
    supportingConfirmedRelationshipCount: metrics.supportingConfirmedRelationshipCount || 0,
    unresolvedReferenceCount: metrics.unresolvedReferenceCount || 0,
    formulas: {
      directEvidence: 'direct references + canonical referee support + confirmed relationship support + limited unresolved evidence, capped conservatively',
      propagation: 'bounded neighbor contributions with hop decay (0.35 first-order, 0.15 second-order) and per-neighbor caps',
      safeguards: 'score clamped to [0,1], network capped to 0.22, explicit maxDepth enforcement, no self-node reuse across traversal, second-order only'
    },
    explanations,
    caveats,
    breakdown: {
      direct: directBreakdown || [],
      network: networkBreakdown || []
    }
  };
}

export async function propagateReputationFromNode(nodeId, options = {}) {
  const node = await ReputationGraphService.getNodeById(nodeId);
  if (!node) {
    throw new ReputationGraphError('Graph node not found', 404, 'NODE_NOT_FOUND');
  }

  if (node.entity_type === 'candidate') {
    return computeCandidatePropagation(node.entity_id, options);
  }
  if (node.entity_type === 'referee') {
    return computeRefereePropagation(node.entity_id, options);
  }

  throw new ReputationGraphError('Propagation is only supported for candidate and referee nodes', 400, 'UNSUPPORTED_PROPAGATION_TARGET');
}

export const __testables = {
  resolveOptions,
  createTraversalState,
  canTraverseHop,
  computeRefereeCredibilityForCandidate
};

export { computeCandidatePropagation, computeRefereePropagation };

export default {
  computeCandidatePropagation,
  computeRefereePropagation,
  propagateReputationFromNode,
  summarizePropagationResult,
  explainPropagationFactors,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};
