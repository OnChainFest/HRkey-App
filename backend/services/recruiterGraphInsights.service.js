import { ReputationGraphService } from './reputationGraph.service.js';
import { computeCandidatePropagation } from './reputationPropagation.service.js';
import { computeCandidateTrustWeights, __testables as trustTestables } from './reputationTrustWeighting.service.js';
import { createClient } from '@supabase/supabase-js';

const CONFIRMED_RELATIONSHIP_EDGE_TYPES = Object.freeze(['MANAGER_OF', 'DIRECT_REPORT_OF', 'PEER_OF', 'COLLABORATED_WITH']);
const BAND_THRESHOLDS = Object.freeze({
  // Conservative v1 recruiter insight bands. Sparse or unresolved evidence should remain limited.
  limited: 0.45,
  moderate: 0.72
});
const INSIGHT_DEFAULTS = Object.freeze({
  detailLimit: 4,
  caveatLimit: 6,
  explanationLimit: 4,
  sparseReferenceThreshold: 2,
  sparseCanonicalThreshold: 2,
  sparseConfirmedThreshold: 1,
  unresolvedPenaltyThreshold: 0.34,
  strongUnresolvedPenaltyThreshold: 0.5
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
  const resolvedSupabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  return supabaseClient;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function roundScore(value) {
  return Math.round(clamp(value) * 1000) / 1000;
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function addUniqueText(target, text, limit) {
  if (!text || target.includes(text) || target.length >= limit) return;
  target.push(text);
}

function normalizeOptions(options = {}) {
  return { ...INSIGHT_DEFAULTS, ...options };
}

function buildBand(score) {
  if (score >= BAND_THRESHOLDS.moderate) return 'strong';
  if (score >= BAND_THRESHOLDS.limited) return 'moderate';
  return 'limited';
}

function toCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function containsOverclaimingLanguage(text) {
  return /(recommended hire|strong hire|safe to hire|top performer|hiring recommendation|must-hire)/i.test(text || '');
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, relationship, status, created_at, referee_id, referee_resolution_confidence')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to load candidate references for recruiter insights');
  }

  return data || [];
}

function buildEvidenceSummary({ graph, references }) {
  const incomingEdges = graph?.incomingEdges || [];
  const confirmedEdges = incomingEdges
    .filter((edge) => edge?.source?.entity_type === 'referee' && CONFIRMED_RELATIONSHIP_EDGE_TYPES.includes(edge.edge_type))
    .sort((a, b) => `${a.source?.entity_id || ''}:${a.edge_type}`.localeCompare(`${b.source?.entity_id || ''}:${b.edge_type}`));
  const referenceEdges = incomingEdges
    .filter((edge) => edge?.edge_type === 'REFERENCED')
    .sort((a, b) => `${a.reference_id || a.id || ''}`.localeCompare(`${b.reference_id || b.id || ''}`));
  const confirmedRefereeIds = unique(confirmedEdges.map((edge) => edge?.source?.entity_id));
  const canonicalRefereeIds = unique(references.map((reference) => reference.referee_id));
  const inferredReferenceCount = referenceEdges.filter((edge) => edge?.metadata?.inferred_relationship_type).length;
  const unresolvedReferenceCount = references.filter((reference) => !reference.referee_id).length;
  const resolutionConfidenceCounts = references.reduce((acc, reference) => {
    const key = reference.referee_id ? (reference.referee_resolution_confidence || 'unresolved') : 'unresolved';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const relationshipTypes = unique([
    ...confirmedEdges.map((edge) => edge.edge_type),
    ...referenceEdges.map((edge) => edge?.metadata?.inferred_relationship_type)
  ]);
  const repeatedCanonicalRefereeCount = canonicalRefereeIds.filter((refereeId) => references.filter((reference) => reference.referee_id === refereeId).length > 1).length;

  return {
    confirmedEdges,
    confirmedRelationshipCount: confirmedEdges.length,
    inferredReferenceCount,
    unresolvedReferenceCount,
    canonicalRefereeIds,
    canonicalRefereeCount: canonicalRefereeIds.length,
    confirmedCanonicalRefereeCount: confirmedRefereeIds.length,
    referenceCount: references.length,
    relationshipTypeCount: relationshipTypes.length,
    repeatedCanonicalRefereeCount,
    resolutionConfidenceCounts,
    unresolvedReferenceShare: references.length ? unresolvedReferenceCount / references.length : 1
  };
}

function buildHeadline(prefix, band) {
  const descriptor = band === 'strong' ? 'strong' : band === 'moderate' ? 'moderate' : 'limited';
  return `${prefix} ${descriptor} graph-backed support.`;
}

export function deriveCandidateInfluenceInsight({ propagation, trustWeighting, evidenceSummary, options = {} }) {
  const resolvedOptions = normalizeOptions(options);
  const score = roundScore(clamp(
    propagation.score * 0.45 +
    propagation.directEvidenceScore * 0.2 +
    trustWeighting.weightedScore * 0.2 +
    clamp(evidenceSummary.canonicalRefereeCount / 4) * 0.1 +
    clamp(evidenceSummary.confirmedRelationshipCount / 3) * 0.05 -
    (evidenceSummary.unresolvedReferenceShare >= resolvedOptions.strongUnresolvedPenaltyThreshold ? 0.08 : 0),
    0,
    1
  ));
  const band = buildBand(score);
  const details = [];
  addUniqueText(details, `${toCountLabel(evidenceSummary.canonicalRefereeCount, 'canonical referee')} provide direct graph support.`, resolvedOptions.detailLimit);
  if (evidenceSummary.confirmedRelationshipCount > 0) {
    addUniqueText(details, `${toCountLabel(evidenceSummary.confirmedRelationshipCount, 'confirmed relationship edge')} strengthen the candidate's trusted position.`, resolvedOptions.detailLimit);
  }
  if (propagation.networkPropagationScore > 0.01) {
    addUniqueText(details, `Bounded propagation added ${propagation.networkPropagationScore.toFixed(3)} of limited corroborating support beyond direct references.`, resolvedOptions.detailLimit);
  } else {
    addUniqueText(details, 'Very little corroborating network support exists beyond direct evidence today.', resolvedOptions.detailLimit);
  }
  if (trustWeighting.weights?.finalCompositeWeight) {
    addUniqueText(details, `Trust weighting stayed bounded at ${trustWeighting.weights.finalCompositeWeight.toFixed(3)} and did not override direct evidence.`, resolvedOptions.detailLimit);
  }

  return {
    type: 'candidate_influence',
    score,
    band,
    headline: band === 'strong'
      ? 'Candidate shows strong but bounded graph-backed support.'
      : band === 'moderate'
        ? 'Candidate shows moderate graph-backed support.'
        : 'Candidate shows limited graph-backed support so far.',
    details
  };
}

export function deriveNetworkCredibilityInsight({ propagation, trustWeighting, evidenceSummary, options = {} }) {
  const resolvedOptions = normalizeOptions(options);
  const resolvedShare = evidenceSummary.referenceCount ? (evidenceSummary.referenceCount - evidenceSummary.unresolvedReferenceCount) / evidenceSummary.referenceCount : 0;
  const confirmedShare = evidenceSummary.referenceCount ? evidenceSummary.confirmedRelationshipCount / evidenceSummary.referenceCount : 0;
  const score = roundScore(clamp(
    resolvedShare * 0.28 +
    confirmedShare * 0.24 +
    clamp((trustWeighting.weightedScore + propagation.confidenceScore) / 2) * 0.28 +
    clamp(evidenceSummary.canonicalRefereeCount / 4) * 0.1 +
    clamp((evidenceSummary.resolutionConfidenceCounts.high || 0) / Math.max(1, evidenceSummary.referenceCount)) * 0.1 -
    (evidenceSummary.unresolvedReferenceShare >= resolvedOptions.strongUnresolvedPenaltyThreshold ? 0.14 : evidenceSummary.unresolvedReferenceShare >= resolvedOptions.unresolvedPenaltyThreshold ? 0.07 : 0),
    0,
    1
  ));
  const band = buildBand(score);
  const details = [];
  addUniqueText(details, `${toCountLabel(evidenceSummary.canonicalRefereeCount, 'reference')} are linked to resolved canonical referees.`, resolvedOptions.detailLimit);
  if (evidenceSummary.confirmedRelationshipCount > 0) {
    addUniqueText(details, `${toCountLabel(evidenceSummary.confirmedRelationshipCount, 'confirmed canonical relationship')} outweigh evidence-only support.`, resolvedOptions.detailLimit);
  } else if (evidenceSummary.inferredReferenceCount > 0) {
    addUniqueText(details, 'Most support is inferred from reference evidence rather than confirmed canonical relationship edges.', resolvedOptions.detailLimit);
  }
  if (evidenceSummary.unresolvedReferenceCount > 0) {
    addUniqueText(details, `${toCountLabel(evidenceSummary.unresolvedReferenceCount, 'reference')} remain unresolved and reduce network credibility confidence.`, resolvedOptions.detailLimit);
  }
  addUniqueText(details, `Propagation confidence remained ${propagation.confidenceBand}, which helps keep credibility claims bounded.`, resolvedOptions.detailLimit);

  return {
    type: 'network_credibility',
    score,
    band,
    headline: band === 'strong'
      ? 'Supporting network appears credible and mostly corroborated.'
      : band === 'moderate'
        ? 'Supporting network appears moderately credible.'
        : 'Supporting network credibility remains limited.',
    details
  };
}

export function deriveTrustedCollaboratorInsight({ evidenceSummary, trustWeighting, options = {} }) {
  const resolvedOptions = normalizeOptions(options);
  const confirmedContexts = trustWeighting.supportingCounts?.confirmedRelationshipCount || 0;
  const inferredContexts = trustWeighting.supportingCounts?.inferredRelationshipCount || 0;
  const relationshipDiversity = trustWeighting.scoreContributions?.relationshipDiversityCount || evidenceSummary.relationshipTypeCount || 0;
  const score = roundScore(clamp(
    clamp(confirmedContexts / 3) * 0.42 +
    clamp(inferredContexts / 3) * 0.14 +
    clamp(evidenceSummary.repeatedCanonicalRefereeCount / 2) * 0.16 +
    clamp(relationshipDiversity / 4) * 0.12 +
    clamp((trustWeighting.weights?.relationshipStrength || 0.8) - 0.8, 0, 0.45) * 0.35 -
    (evidenceSummary.unresolvedReferenceShare >= resolvedOptions.strongUnresolvedPenaltyThreshold ? 0.08 : 0),
    0,
    1
  ));
  const band = buildBand(score);
  const details = [];
  if (confirmedContexts > 0) {
    addUniqueText(details, `${toCountLabel(confirmedContexts, 'confirmed relationship signal')} indicate trusted collaboration patterns.`, resolvedOptions.detailLimit);
  } else if (inferredContexts > 0) {
    addUniqueText(details, 'Collaboration evidence is present, but it is inferred rather than confirmed by canonical relationship edges.', resolvedOptions.detailLimit);
  } else {
    addUniqueText(details, 'Trusted collaborator structure is still thin in the current graph.', resolvedOptions.detailLimit);
  }
  if (evidenceSummary.repeatedCanonicalRefereeCount > 0) {
    addUniqueText(details, `${toCountLabel(evidenceSummary.repeatedCanonicalRefereeCount, 'canonical referee')} appear more than once, suggesting repeated working exposure.`, resolvedOptions.detailLimit);
  }
  addUniqueText(details, `${toCountLabel(relationshipDiversity, 'relationship type')} contribute to collaborator pattern diversity.`, resolvedOptions.detailLimit);
  if (evidenceSummary.unresolvedReferenceCount > 0) {
    addUniqueText(details, 'Unresolved references were not treated as confirmed trusted collaborators.', resolvedOptions.detailLimit);
  }

  return {
    type: 'trusted_collaborator_signals',
    score,
    band,
    headline: band === 'strong'
      ? 'Graph suggests repeated trusted collaborator signals.'
      : band === 'moderate'
        ? 'Graph suggests some trusted collaborator signals.'
        : 'Graph suggests limited trusted collaborator signals so far.',
    details
  };
}

export function deriveRiskOrCaveatSignals({ propagation, trustWeighting, evidenceSummary, options = {} }) {
  const resolvedOptions = normalizeOptions(options);
  const caveats = [];

  if (evidenceSummary.referenceCount < resolvedOptions.sparseReferenceThreshold || evidenceSummary.canonicalRefereeCount < resolvedOptions.sparseCanonicalThreshold) {
    addUniqueText(caveats, 'Graph remains sparse; treat these insights as supportive context rather than objective truth.', resolvedOptions.caveatLimit);
  }
  if (evidenceSummary.confirmedRelationshipCount < resolvedOptions.sparseConfirmedThreshold) {
    addUniqueText(caveats, 'Few confirmed canonical relationship edges exist, so collaborator confidence remains limited.', resolvedOptions.caveatLimit);
  }
  if (evidenceSummary.unresolvedReferenceCount > 0) {
    addUniqueText(caveats, `${toCountLabel(evidenceSummary.unresolvedReferenceCount, 'reference')} remain unresolved and were discounted in the insight bands.`, resolvedOptions.caveatLimit);
  }
  for (const item of propagation.caveats || []) {
    addUniqueText(caveats, item, resolvedOptions.caveatLimit);
  }
  for (const item of trustWeighting.caveats || []) {
    addUniqueText(caveats, item, resolvedOptions.caveatLimit);
  }

  return caveats;
}

export function summarizeRecruiterInsights({ candidateId, influenceInsight, networkCredibilityInsight, trustedCollaboratorInsight, evidenceSummary, caveats }) {
  const overallScore = roundScore((influenceInsight.score + networkCredibilityInsight.score + trustedCollaboratorInsight.score) / 3);
  const summary = {
    overallGraphReadiness: buildBand(overallScore),
    networkCredibilityBand: networkCredibilityInsight.band,
    candidateInfluenceBand: influenceInsight.band,
    trustedCollaboratorBand: trustedCollaboratorInsight.band
  };

  const insights = [influenceInsight, networkCredibilityInsight, trustedCollaboratorInsight].map((insight) => {
    if (containsOverclaimingLanguage(insight.headline) || insight.details.some(containsOverclaimingLanguage)) {
      throw new Error(`Unsafe recruiter insight language detected for ${insight.type}`);
    }
    return insight;
  });

  return {
    target: { entityType: 'candidate', entityId: candidateId },
    summary,
    insights,
    supportingCounts: {
      referenceCount: evidenceSummary.referenceCount,
      canonicalRefereeCount: evidenceSummary.canonicalRefereeCount,
      confirmedRelationshipCount: evidenceSummary.confirmedRelationshipCount,
      inferredRelationshipCount: evidenceSummary.inferredReferenceCount,
      unresolvedReferenceCount: evidenceSummary.unresolvedReferenceCount,
      repeatedCanonicalRefereeCount: evidenceSummary.repeatedCanonicalRefereeCount,
      relationshipTypeCount: evidenceSummary.relationshipTypeCount
    },
    caveats
  };
}

export async function computeCandidateRecruiterInsights(candidateId, options = {}) {
  const [graph, references, propagation, trustWeighting] = await Promise.all([
    ReputationGraphService.getEntityGraph('candidate', candidateId),
    fetchCandidateReferences(candidateId),
    computeCandidatePropagation(candidateId),
    computeCandidateTrustWeights(candidateId)
  ]);

  const evidenceSummary = buildEvidenceSummary({ graph, references });
  const influenceInsight = deriveCandidateInfluenceInsight({ propagation, trustWeighting, evidenceSummary, options });
  const networkCredibilityInsight = deriveNetworkCredibilityInsight({ propagation, trustWeighting, evidenceSummary, options });
  const trustedCollaboratorInsight = deriveTrustedCollaboratorInsight({ evidenceSummary, trustWeighting, options });
  const caveats = deriveRiskOrCaveatSignals({ propagation, trustWeighting, evidenceSummary, options });

  return summarizeRecruiterInsights({
    candidateId,
    influenceInsight,
    networkCredibilityInsight,
    trustedCollaboratorInsight,
    evidenceSummary,
    caveats
  });
}

export const __testables = {
  normalizeOptions,
  buildBand,
  buildEvidenceSummary,
  containsOverclaimingLanguage,
  BAND_THRESHOLDS,
  trustTestables
};

export default {
  computeCandidateRecruiterInsights,
  deriveCandidateInfluenceInsight,
  deriveNetworkCredibilityInsight,
  deriveTrustedCollaboratorInsight,
  deriveRiskOrCaveatSignals,
  summarizeRecruiterInsights,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests,
  __testables
};
