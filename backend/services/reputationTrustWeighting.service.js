import { createClient } from '@supabase/supabase-js';
import { ReputationGraphError, ReputationGraphService } from './reputationGraph.service.js';
import { computeRefereePropagation } from './reputationPropagation.service.js';

const RELATIONSHIP_WEIGHT_TABLE = Object.freeze({
  MANAGER_OF: 1.18,
  DIRECT_REPORT_OF: 1.12,
  PEER_OF: 1.02,
  COLLABORATED_WITH: 0.96,
  REFERENCED: 0.88,
  unknown: 0.88
});

const RELATIONSHIP_LABELS = Object.freeze({
  MANAGER_OF: 'manager',
  DIRECT_REPORT_OF: 'direct report',
  PEER_OF: 'peer',
  COLLABORATED_WITH: 'collaborator',
  REFERENCED: 'referenced-only'
});

const RESOLUTION_CONFIDENCE_WEIGHTS = Object.freeze({
  high: 1,
  medium: 0.72,
  low: 0.5,
  unresolved: 0.35
});

const WEIGHTING_DEFAULTS = Object.freeze({
  finalWeightClamp: Object.freeze({ min: 0.55, max: 1.35 }),
  weightedScoreClamp: Object.freeze({ min: 0, max: 1 }),
  relationshipWeightClamp: Object.freeze({ min: 0.8, max: 1.25 }),
  credibilityWeightClamp: Object.freeze({ min: 0.85, max: 1.2 }),
  referenceVolumeClamp: Object.freeze({ min: 0.9, max: 1.15 }),
  graphCentralityClamp: Object.freeze({ min: 0.95, max: 1.08 }),
  propagationCredibilityClamp: Object.freeze({ min: 0.96, max: 1.04 }),
  relationshipEvidenceCap: 5,
  explanationLimit: 8,
  caveatLimit: 6,
  includePropagationCredibility: true
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

  if (supabaseClient) {
    return supabaseClient;
  }

  if (process.env.NODE_ENV === 'test') {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
    return supabaseClient;
  }

  supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  return supabaseClient;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function roundScore(value, precision = 1000) {
  return Math.round((Number.isFinite(value) ? value : 0) * precision) / precision;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function sum(items, mapper = (value) => value) {
  return (items || []).reduce((total, item) => total + mapper(item), 0);
}

function addUniqueText(target, message, limit) {
  if (!message || target.includes(message) || target.length >= limit) return;
  target.push(message);
}

function normalizeOptions(options = {}) {
  return {
    ...WEIGHTING_DEFAULTS,
    ...options,
    finalWeightClamp: { ...WEIGHTING_DEFAULTS.finalWeightClamp, ...(options.finalWeightClamp || {}) },
    weightedScoreClamp: { ...WEIGHTING_DEFAULTS.weightedScoreClamp, ...(options.weightedScoreClamp || {}) },
    relationshipWeightClamp: { ...WEIGHTING_DEFAULTS.relationshipWeightClamp, ...(options.relationshipWeightClamp || {}) },
    credibilityWeightClamp: { ...WEIGHTING_DEFAULTS.credibilityWeightClamp, ...(options.credibilityWeightClamp || {}) },
    referenceVolumeClamp: { ...WEIGHTING_DEFAULTS.referenceVolumeClamp, ...(options.referenceVolumeClamp || {}) },
    graphCentralityClamp: { ...WEIGHTING_DEFAULTS.graphCentralityClamp, ...(options.graphCentralityClamp || {}) },
    propagationCredibilityClamp: {
      ...WEIGHTING_DEFAULTS.propagationCredibilityClamp,
      ...(options.propagationCredibilityClamp || {})
    }
  };
}

function resolveCandidateWeightingOptions(options = {}) {
  return {
    ...normalizeOptions(options),
    // Candidate weighting must not reuse referee propagation that includes the target candidate.
    includePropagationCredibility: false
  };
}

function confidenceWeight(value) {
  return RESOLUTION_CONFIDENCE_WEIGHTS[value] || RESOLUTION_CONFIDENCE_WEIGHTS.unresolved;
}

function buildBand(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function pickRelationshipType({ confirmedEdgeType = null, inferredRelationshipType = null }) {
  return confirmedEdgeType || inferredRelationshipType || 'REFERENCED';
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

function buildReferenceEdgeLookup(graph) {
  const referenceEdges = new Map();
  for (const edge of graph?.incomingEdges || []) {
    if (edge?.edge_type !== 'REFERENCED') continue;
    const referenceId = edge.reference_id || edge?.source?.entity_id;
    if (!referenceId) continue;
    referenceEdges.set(referenceId, edge);
  }
  return referenceEdges;
}

function buildCandidateSignalContexts({ graph, references }) {
  const confirmedEdgesByReferee = new Map();
  for (const edge of graph?.incomingEdges || []) {
    if (edge?.source?.entity_type !== 'referee') continue;
    const existing = confirmedEdgesByReferee.get(edge.source.entity_id) || [];
    existing.push(edge);
    confirmedEdgesByReferee.set(edge.source.entity_id, existing);
  }

  const referenceEdges = buildReferenceEdgeLookup(graph);

  return references.map((reference) => {
    const confirmedEdges = reference.referee_id ? confirmedEdgesByReferee.get(reference.referee_id) || [] : [];
    const strongestConfirmedEdge = confirmedEdges
      .slice()
      .sort((left, right) => (right.confidence_score || 0) - (left.confidence_score || 0))[0] || null;
    const evidenceEdge = referenceEdges.get(reference.id) || null;
    const inferredRelationshipType = evidenceEdge?.metadata?.inferred_relationship_type || null;

    return {
      candidateId: reference.owner_id,
      refereeId: reference.referee_id || null,
      referenceId: reference.id,
      referenceStatus: reference.status || null,
      confirmedEdgeType: strongestConfirmedEdge?.edge_type || null,
      confirmedConfidenceScore: strongestConfirmedEdge?.confidence_score || null,
      inferredRelationshipType,
      resolutionConfidence: reference.referee_resolution_confidence || null,
      evidenceMode: strongestConfirmedEdge ? 'confirmed' : evidenceEdge?.metadata?.inferred_relationship_type ? 'inferred' : 'referenced-only'
    };
  });
}

export function computeRelationshipStrengthWeight(signalContext, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const relationshipType = pickRelationshipType(signalContext);
  const baseWeight = RELATIONSHIP_WEIGHT_TABLE[relationshipType] || RELATIONSHIP_WEIGHT_TABLE.unknown;
  const evidenceModeModifier = signalContext.evidenceMode === 'confirmed'
    ? 1.04
    : signalContext.evidenceMode === 'inferred'
      ? 0.98
      : 0.92;
  const confidenceModifier = signalContext.confirmedConfidenceScore
    ? 0.96 + clamp(signalContext.confirmedConfidenceScore, 0, 1) * 0.06
    : 0.95 + confidenceWeight(signalContext.resolutionConfidence) * 0.05;

  return roundScore(
    clamp(
      baseWeight * evidenceModeModifier * confidenceModifier,
      resolvedOptions.relationshipWeightClamp.min,
      resolvedOptions.relationshipWeightClamp.max
    )
  );
}

export async function computeRefereeCredibilityWeight(refereeContext, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const identityConfidence = confidenceWeight(refereeContext.identityConfidence);
  const candidateBreadthBoost = Math.min(0.08, Math.log1p(refereeContext.distinctCandidateCount || 0) * 0.04);
  const corroborationBoost = Math.min(0.05, Math.max(0, (refereeContext.corroboratedCandidateCount || 0) - 1) * 0.025);
  const isolationPenalty = (refereeContext.distinctCandidateCount || 0) <= 1 ? -0.035 : 0;
  const propagationModifier = resolvedOptions.includePropagationCredibility && Number.isFinite(refereeContext.propagationScore)
    ? clamp(0.96 + clamp(refereeContext.propagationScore, 0, 1) * 0.08, resolvedOptions.propagationCredibilityClamp.min, resolvedOptions.propagationCredibilityClamp.max)
    : 1;

  const rawWeight = 0.9 + identityConfidence * 0.17 + candidateBreadthBoost + corroborationBoost + isolationPenalty;

  return roundScore(
    clamp(rawWeight * propagationModifier, resolvedOptions.credibilityWeightClamp.min, resolvedOptions.credibilityWeightClamp.max)
  );
}

export function computeReferenceVolumeWeight(referenceContext, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const referenceCount = Math.max(0, referenceContext.referenceCount || 0);
  const corroboratedCount = Math.max(0, referenceContext.corroboratedRefereeCount || 0);
  const resolvedCount = Math.max(0, referenceContext.resolvedReferenceCount || 0);

  const quantityBoost = Math.min(0.08, Math.log1p(referenceCount) * 0.045);
  const corroborationBoost = Math.min(0.05, Math.max(0, corroboratedCount - 1) * 0.025);
  const resolutionBoost = Math.min(0.03, resolvedCount * 0.01);
  const sparsePenalty = referenceCount <= 1 ? -0.03 : 0;

  return roundScore(
    clamp(
      1 + quantityBoost + corroborationBoost + resolutionBoost + sparsePenalty,
      resolvedOptions.referenceVolumeClamp.min,
      resolvedOptions.referenceVolumeClamp.max
    )
  );
}

export function computeGraphCentralityWeight(centralityContext, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  // Local trust-structure approximation only. This is intentionally not a global prestige metric.
  const connectedReferees = Math.max(0, centralityContext.distinctCanonicalRefereeCount || 0);
  const supportedCandidates = Math.max(0, centralityContext.distinctSupportedCandidateCount || 0);
  const relationshipDiversity = Math.max(0, centralityContext.relationshipDiversityCount || 0);

  const localBreadthBoost = Math.min(0.04, Math.log1p(connectedReferees + supportedCandidates) * 0.018);
  const diversityBoost = Math.min(0.02, relationshipDiversity * 0.0075);
  const sparsityPenalty = connectedReferees + supportedCandidates <= 1 ? -0.015 : 0;

  return roundScore(
    clamp(1 + localBreadthBoost + diversityBoost + sparsityPenalty, resolvedOptions.graphCentralityClamp.min, resolvedOptions.graphCentralityClamp.max)
  );
}

export async function computeSignalWeight(signalContext, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const relationshipStrength = computeRelationshipStrengthWeight(signalContext, resolvedOptions);
  const refereeCredibility = signalContext.refereeContext
    ? await computeRefereeCredibilityWeight(signalContext.refereeContext, resolvedOptions)
    : 0.9;
  const referenceVolume = computeReferenceVolumeWeight(signalContext.referenceContext || {}, resolvedOptions);
  const graphCentrality = computeGraphCentralityWeight(signalContext.centralityContext || {}, resolvedOptions);
  const composite = roundScore(
    clamp(
      relationshipStrength * refereeCredibility * referenceVolume * graphCentrality,
      resolvedOptions.finalWeightClamp.min,
      resolvedOptions.finalWeightClamp.max
    )
  );

  return {
    relationshipStrength,
    refereeCredibility,
    referenceVolume,
    graphCentrality,
    finalCompositeWeight: composite
  };
}

function buildCandidateBaseScore({ references, signalContexts }) {
  const directReferenceContribution = clamp((references.length || 0) * 0.08, 0, 0.32);
  const confirmedContribution = clamp(signalContexts.filter((item) => item.evidenceMode === 'confirmed').length * 0.12, 0, 0.28);
  const inferredContribution = clamp(signalContexts.filter((item) => item.evidenceMode === 'inferred').length * 0.05, 0, 0.12);
  const unresolvedContribution = clamp(signalContexts.filter((item) => !item.refereeId).length * 0.03, 0, 0.08);

  return roundScore(clamp(directReferenceContribution + confirmedContribution + inferredContribution + unresolvedContribution, 0, 0.72));
}

function buildRefereeBaseScore({ identity, references, confirmedCandidateCount }) {
  const identityContribution = identity ? 0.22 * confidenceWeight(identity.confidence) : 0.08;
  const supportedCandidateContribution = clamp((confirmedCandidateCount || 0) * 0.1, 0, 0.28);
  const referenceContribution = clamp((references.length || 0) * 0.05, 0, 0.18);

  return roundScore(clamp(identityContribution + supportedCandidateContribution + referenceContribution, 0, 0.68));
}

async function maybeLoadPropagationScore(refereeId, options) {
  if (!options.includePropagationCredibility) return null;
  try {
    const propagation = await computeRefereePropagation(refereeId, { maxDepth: 1, includeSecondOrder: false });
    return propagation.score;
  } catch {
    return null;
  }
}

function summarizeTrustWeightingResult({ target, baseScore, weights, supportingCounts, explanations, caveats, scoreContributions }) {
  const weightedScore = roundScore(clamp(baseScore * weights.finalCompositeWeight));
  return {
    target,
    baseScore: roundScore(baseScore),
    weightedScore,
    band: buildBand(weightedScore),
    weights,
    supportingCounts,
    scoreContributions,
    explanations,
    caveats
  };
}

export async function computeCandidateTrustWeights(candidateId, options = {}) {
  const resolvedOptions = resolveCandidateWeightingOptions(options);
  const [graph, references] = await Promise.all([
    ReputationGraphService.getEntityGraph('candidate', candidateId),
    fetchCandidateReferences(candidateId)
  ]);

  const signalContexts = buildCandidateSignalContexts({ graph, references });
  const canonicalRefereeIds = unique(signalContexts.map((item) => item.refereeId));
  const refereeContexts = new Map(await Promise.all(canonicalRefereeIds.map(async (refereeId) => {
    const [identity, refereeReferences] = await Promise.all([
      fetchRefereeIdentity(refereeId),
      fetchReferencesForReferee(refereeId)
    ]);

    const distinctCandidateIds = unique(refereeReferences.map((reference) => reference.owner_id));
    const corroboratedCandidateCount = distinctCandidateIds.filter((supportedCandidateId) =>
      refereeReferences.filter((reference) => reference.owner_id === supportedCandidateId).length > 1
    ).length;

    return [refereeId, {
      refereeId,
      identityConfidence: identity?.confidence || 'unresolved',
      resolutionStrategy: identity?.resolution_strategy || null,
      distinctCandidateCount: distinctCandidateIds.length,
      corroboratedCandidateCount,
      propagationScore: null
    }];
  })));

  const strongestSignal = signalContexts
    .slice()
    .sort((left, right) => computeRelationshipStrengthWeight(right, resolvedOptions) - computeRelationshipStrengthWeight(left, resolvedOptions))[0] || null;

  const representativeSignal = strongestSignal || {
    evidenceMode: 'referenced-only',
    confirmedEdgeType: null,
    inferredRelationshipType: null,
    resolutionConfidence: null,
    refereeContext: null,
    referenceContext: { referenceCount: references.length, corroboratedRefereeCount: canonicalRefereeIds.length, resolvedReferenceCount: canonicalRefereeIds.length },
    centralityContext: {
      distinctCanonicalRefereeCount: canonicalRefereeIds.length,
      distinctSupportedCandidateCount: 0,
      relationshipDiversityCount: unique(signalContexts.map((item) => pickRelationshipType(item))).length
    }
  };

  const refereeContext = representativeSignal.refereeId ? refereeContexts.get(representativeSignal.refereeId) : null;
  const weights = await computeSignalWeight({
    ...representativeSignal,
    refereeContext,
    referenceContext: {
      referenceCount: references.length,
      corroboratedRefereeCount: canonicalRefereeIds.length,
      resolvedReferenceCount: signalContexts.filter((item) => item.refereeId).length
    },
    centralityContext: {
      distinctCanonicalRefereeCount: canonicalRefereeIds.length,
      distinctSupportedCandidateCount: 0,
      relationshipDiversityCount: unique(signalContexts.map((item) => pickRelationshipType(item))).length
    }
  }, resolvedOptions);

  const baseScore = buildCandidateBaseScore({ references, signalContexts });
  const explanations = [];
  const caveats = [];

  if (strongestSignal) {
    addUniqueText(explanations, `The strongest direct relationship signal is ${RELATIONSHIP_LABELS[pickRelationshipType(strongestSignal)] || 'referenced-only'}, which anchors the weighting model.`, resolvedOptions.explanationLimit);
  }
  if (signalContexts.some((item) => item.evidenceMode === 'confirmed')) {
    addUniqueText(explanations, 'Confirmed canonical relationships were weighted above inferred-only or referenced-only evidence.', resolvedOptions.explanationLimit);
  }
  if (canonicalRefereeIds.length > 1) {
    addUniqueText(explanations, `${canonicalRefereeIds.length} canonical referees provided corroborating support with diminishing returns.`, resolvedOptions.explanationLimit);
  }
  if (weights.graphCentrality > 1) {
    addUniqueText(explanations, 'Local graph breadth modestly refined trust weight without overpowering direct evidence.', resolvedOptions.explanationLimit);
  }
  if (weights.refereeCredibility > 1 && refereeContext) {
    addUniqueText(explanations, 'Referee credibility increased weight based on identity confidence and repeated supported-candidate history.', resolvedOptions.explanationLimit);
  }
  addUniqueText(caveats, 'Propagation-derived referee credibility was disabled for candidate weighting to avoid target-candidate circular reinforcement.', resolvedOptions.caveatLimit);

  if (references.length <= 1 || canonicalRefereeIds.length <= 1) {
    addUniqueText(caveats, 'Graph remains sparse, so weighting stays conservative and evidence-led.', resolvedOptions.caveatLimit);
  }
  if (!signalContexts.some((item) => item.evidenceMode === 'confirmed')) {
    addUniqueText(caveats, 'No confirmed canonical relationship edges were found; inferred and referenced-only evidence was discounted.', resolvedOptions.caveatLimit);
  }
  if (signalContexts.every((item) => !item.refereeId)) {
    addUniqueText(caveats, 'All support is unresolved, so referee credibility could not materially increase weight.', resolvedOptions.caveatLimit);
  }

  return summarizeTrustWeightingResult({
    target: { entityType: 'candidate', entityId: candidateId },
    baseScore,
    weights,
    supportingCounts: {
      referenceCount: references.length,
      canonicalRefereeCount: canonicalRefereeIds.length,
      confirmedRelationshipCount: signalContexts.filter((item) => item.evidenceMode === 'confirmed').length,
      inferredRelationshipCount: signalContexts.filter((item) => item.evidenceMode === 'inferred').length,
      unresolvedReferenceCount: signalContexts.filter((item) => !item.refereeId).length
    },
    scoreContributions: {
      strongestRelationship: strongestSignal ? pickRelationshipType(strongestSignal) : 'REFERENCED',
      representativeRefereeId: representativeSignal.refereeId || null,
      corroboratedRefereeCount: canonicalRefereeIds.length,
      relationshipDiversityCount: unique(signalContexts.map((item) => pickRelationshipType(item))).length
    },
    explanations,
    caveats
  });
}

export async function computeRefereeTrustWeights(refereeId, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const [identity, references, graph, propagationScore] = await Promise.all([
    fetchRefereeIdentity(refereeId),
    fetchReferencesForReferee(refereeId),
    ReputationGraphService.getEntityGraph('referee', refereeId),
    maybeLoadPropagationScore(refereeId, resolvedOptions)
  ]);

  const distinctCandidateIds = unique(references.map((reference) => reference.owner_id));
  const corroboratedCandidateCount = distinctCandidateIds.filter((candidateId) => references.filter((reference) => reference.owner_id === candidateId).length > 1).length;
  const confirmedEdges = (graph?.outgoingEdges || []).filter((edge) => edge?.target?.entity_type === 'candidate');
  const confirmedRelationshipCount = confirmedEdges.filter((edge) => edge.edge_type !== 'REFERENCED').length;
  const relationshipTypes = unique(confirmedEdges.map((edge) => edge.edge_type));
  const credibilityWeight = await computeRefereeCredibilityWeight({
    refereeId,
    identityConfidence: identity?.confidence || 'unresolved',
    resolutionStrategy: identity?.resolution_strategy || null,
    distinctCandidateCount: distinctCandidateIds.length,
    corroboratedCandidateCount,
    propagationScore
  }, resolvedOptions);
  const referenceVolume = computeReferenceVolumeWeight({
    referenceCount: references.length,
    corroboratedRefereeCount: corroboratedCandidateCount,
    resolvedReferenceCount: references.length
  }, resolvedOptions);
  const graphCentrality = computeGraphCentralityWeight({
    distinctCanonicalRefereeCount: 0,
    distinctSupportedCandidateCount: distinctCandidateIds.length,
    relationshipDiversityCount: relationshipTypes.length
  }, resolvedOptions);
  const relationshipStrength = roundScore(
    clamp(
      0.94 + Math.min(0.18, sum(relationshipTypes, (type) => Math.max(0, (RELATIONSHIP_WEIGHT_TABLE[type] || 0.88) - 0.88)) / Math.max(1, relationshipTypes.length)),
      resolvedOptions.relationshipWeightClamp.min,
      resolvedOptions.relationshipWeightClamp.max
    )
  );
  const weights = {
    relationshipStrength,
    refereeCredibility: credibilityWeight,
    referenceVolume,
    graphCentrality,
    finalCompositeWeight: roundScore(clamp(relationshipStrength * credibilityWeight * referenceVolume * graphCentrality, resolvedOptions.finalWeightClamp.min, resolvedOptions.finalWeightClamp.max))
  };
  const baseScore = buildRefereeBaseScore({ identity, references, confirmedCandidateCount: confirmedRelationshipCount });

  const explanations = [];
  const caveats = [];
  if (identity?.confidence) {
    addUniqueText(explanations, `Canonical referee identity confidence is ${identity.confidence}, which directly informed referee credibility weighting.`, resolvedOptions.explanationLimit);
  }
  if (distinctCandidateIds.length > 1) {
    addUniqueText(explanations, `This referee supports ${distinctCandidateIds.length} distinct candidates, which modestly strengthens local corroboration breadth.`, resolvedOptions.explanationLimit);
  }
  if (graphCentrality > 1) {
    addUniqueText(explanations, 'Local connectedness was applied as a small modifier only; it is not treated as a prestige score.', resolvedOptions.explanationLimit);
  }
  if (distinctCandidateIds.length <= 1) {
    addUniqueText(caveats, 'Referee evidence remains narrow, so credibility weighting stayed close to baseline.', resolvedOptions.caveatLimit);
  }
  if (!identity) {
    addUniqueText(caveats, 'No canonical referee identity record was found, so identity confidence remained unresolved.', resolvedOptions.caveatLimit);
  }

  return summarizeTrustWeightingResult({
    target: { entityType: 'referee', entityId: refereeId },
    baseScore,
    weights,
    supportingCounts: {
      referenceCount: references.length,
      supportedCandidateCount: distinctCandidateIds.length,
      confirmedRelationshipCount,
      corroboratedCandidateCount
    },
    scoreContributions: {
      relationshipDiversityCount: relationshipTypes.length,
      propagationScore: roundScore(propagationScore || 0)
    },
    explanations,
    caveats
  });
}

export const __testables = {
  normalizeOptions,
  resolveCandidateWeightingOptions,
  clamp,
  pickRelationshipType,
  buildCandidateSignalContexts,
  buildCandidateBaseScore
};

export default {
  computeCandidateTrustWeights,
  computeRefereeTrustWeights,
  computeSignalWeight,
  computeRelationshipStrengthWeight,
  computeRefereeCredibilityWeight,
  computeReferenceVolumeWeight,
  computeGraphCentralityWeight,
  summarizeTrustWeightingResult,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests,
  __testables
};
