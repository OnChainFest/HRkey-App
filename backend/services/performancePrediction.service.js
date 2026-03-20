import { createClient } from '@supabase/supabase-js';
import { computeReferenceQualityFromText } from './referenceQuality.service.js';
import { computeCandidateTrustWeights } from './reputationTrustWeighting.service.js';
import { computeCandidateRecruiterInsights } from './recruiterGraphInsights.service.js';
import { computeRoleFitScore } from './roleFit.service.js';
import { getLatestScore } from './hrscore/scoreHistory.js';

const PERFORMANCE_WEIGHTS = Object.freeze({
  roleReadiness: 0.35,
  evidenceReliability: 0.2,
  networkConfidence: 0.2,
  careerProgression: 0.15,
  predictionConfidence: 0.1
});

const BAND_THRESHOLDS = Object.freeze({ strong: 0.72, moderate: 0.45 });
const OVERCLAIMING_PATTERN = /(recommended hire|strong hire|must hire|must-hire|safe to hire|top performer|guaranteed success|will definitely succeed|certain high performer|hiring recommendation|employment recommendation)/i;
const OWNERSHIP_TERMS = Object.freeze(['own', 'owned', 'ownership', 'lead', 'led', 'manage', 'managed', 'mentored', 'drove', 'directed', 'headed']);
const COMPLEXITY_TERMS = Object.freeze(['cross-functional', 'platform', 'program', 'roadmap', 'migration', 'strategy', 'system', 'budget', 'forecast', 'scalable', 'architecture', 'transformation']);
const OUTCOME_TERMS = Object.freeze(['delivered', 'launched', 'improved', 'reduced', 'increased', 'grew', 'shipped', 'resolved', 'completed', 'achieved', 'promoted']);
const SENIORITY_TERMS = Object.freeze(['senior', 'staff', 'principal', 'lead', 'head', 'director', 'vp', 'chief', 'manager']);
const ALLOWED_ROLE_FIELDS = new Set(['requiredSkills', 'preferredSkills', 'keywords', 'seniorityLevel', 'weightOverrides']);

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

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function roundTo3(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function roundScore(value) {
  return roundTo3(clamp(value));
}

function deriveBand(score) {
  if (score >= BAND_THRESHOLDS.strong) return 'strong';
  if (score >= BAND_THRESHOLDS.moderate) return 'moderate';
  return 'limited';
}

function addUnique(target, text) {
  if (text && !target.includes(text)) target.push(text);
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#./\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value).match(/[a-z0-9+#./-]+/g) || [];
}

function sanitizeStringArray(values = []) {
  return [...new Set((values || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizePerformanceRoleDefinition(roleDefinitionInput = {}) {
  if (!isPlainObject(roleDefinitionInput)) {
    throw createValidationError('roleDefinition must be a plain object');
  }

  const normalized = {};
  const unexpectedKeys = Object.keys(roleDefinitionInput).filter((key) => !ALLOWED_ROLE_FIELDS.has(key));
  if (unexpectedKeys.length > 12) {
    throw createValidationError('roleDefinition contains too many unsupported fields');
  }

  for (const key of ['requiredSkills', 'preferredSkills', 'keywords']) {
    const value = roleDefinitionInput[key];
    if (value == null) {
      normalized[key] = [];
      continue;
    }
    if (!Array.isArray(value)) {
      throw createValidationError(`${key} must be an array of strings`);
    }
    normalized[key] = sanitizeStringArray(value);
  }

  if (roleDefinitionInput.seniorityLevel == null || roleDefinitionInput.seniorityLevel === '') {
    normalized.seniorityLevel = null;
  } else if (typeof roleDefinitionInput.seniorityLevel === 'string') {
    normalized.seniorityLevel = roleDefinitionInput.seniorityLevel.trim();
  } else {
    throw createValidationError('seniorityLevel must be a string');
  }

  if (roleDefinitionInput.weightOverrides == null) {
    normalized.weightOverrides = null;
  } else if (isPlainObject(roleDefinitionInput.weightOverrides)) {
    normalized.weightOverrides = roleDefinitionInput.weightOverrides;
  } else {
    throw createValidationError('weightOverrides must be an object');
  }

  return normalized;
}

function buildReferenceText(row) {
  const segments = [];
  for (const field of ['summary', 'answer_text', 'answer', 'relationship', 'referrer_company', 'referrer_title']) {
    if (typeof row?.[field] === 'string' && row[field].trim()) segments.push(row[field]);
  }
  if (row?.detailed_feedback && typeof row.detailed_feedback === 'object') {
    for (const value of Object.values(row.detailed_feedback)) {
      if (typeof value === 'string' && value.trim()) segments.push(value);
    }
  }
  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, created_at, approved_at, relationship, summary, answer_text, answer, detailed_feedback, referrer_company, referrer_title, referee_id, referee_resolution_confidence')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    const resolvedError = new Error('Failed to load candidate references');
    resolvedError.status = 500;
    throw resolvedError;
  }

  return data || [];
}

function summarizeReferenceQuality(references) {
  if (!references.length) {
    return {
      score: 0,
      count: 0,
      meanQualityScore: 0,
      strongShare: 0,
      lowShare: 1,
      recentStrongShare: 0,
      items: []
    };
  }

  const items = references.map((reference) => {
    const quality = computeReferenceQualityFromText(buildReferenceText(reference), { referenceId: reference.id });
    return {
      referenceId: reference.id,
      createdAt: reference.created_at || reference.approved_at || null,
      qualityScore: roundScore(quality.qualityScore),
      band: quality.band || 'limited',
      dimensions: quality.dimensions || null
    };
  });

  const count = items.length;
  const meanQualityScore = items.reduce((sum, item) => sum + item.qualityScore, 0) / count;
  const strongShare = items.filter((item) => item.qualityScore >= 0.72).length / count;
  const lowShare = items.filter((item) => item.qualityScore < 0.45).length / count;
  const recentStrongShare = items.slice(0, Math.max(1, Math.ceil(count / 2))).filter((item) => item.qualityScore >= 0.72).length / Math.max(1, Math.ceil(count / 2));

  return {
    score: roundScore(meanQualityScore * 0.75 + strongShare * 0.15 + (1 - lowShare) * 0.1),
    count,
    meanQualityScore: roundScore(meanQualityScore),
    strongShare: roundScore(strongShare),
    lowShare: roundScore(lowShare),
    recentStrongShare: roundScore(recentStrongShare),
    items
  };
}

function countTermHits(tokens, terms) {
  return terms.reduce((sum, term) => sum + (tokens.includes(term) ? 1 : 0), 0);
}

function scoreReferenceProgression(reference) {
  const text = buildReferenceText(reference);
  const tokens = tokenize(text);
  const normalized = normalizeText(text);
  const ownershipHits = countTermHits(tokens, OWNERSHIP_TERMS);
  const complexityHits = COMPLEXITY_TERMS.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
  const outcomeHits = countTermHits(tokens, OUTCOME_TERMS) + ((text.match(/\b\d+(?:%|x| percent| people| teams?)\b/gi) || []).length > 0 ? 1 : 0);
  const seniorityHits = countTermHits(tokens, SENIORITY_TERMS);
  const score = roundScore(
    clamp(ownershipHits / 4) * 0.35 +
    clamp(complexityHits / 3) * 0.25 +
    clamp(outcomeHits / 4) * 0.25 +
    clamp(seniorityHits / 3) * 0.15
  );

  return {
    referenceId: reference.id,
    timestamp: reference.created_at || reference.approved_at || null,
    ownershipHits,
    complexityHits,
    outcomeHits,
    seniorityHits,
    score
  };
}

export function computeCareerProgressionSignal({ references = [] }) {
  if (references.length < 2) {
    return {
      score: roundScore(references.length === 1 ? 0.28 : 0.12),
      detail: {
        evidenceCount: references.length,
        progressionDelta: 0,
        consistencyShare: 0,
        recentStrength: roundScore(references.length === 1 ? 0.28 : 0),
        domainContinuity: 0,
        sparseEvidence: true,
        referenceSignals: references.map(scoreReferenceProgression)
      }
    };
  }

  const ordered = references
    .slice()
    .sort((left, right) => new Date(left.created_at || left.approved_at || 0).getTime() - new Date(right.created_at || right.approved_at || 0).getTime());
  const signals = ordered.map(scoreReferenceProgression);
  const midpoint = Math.max(1, Math.floor(signals.length / 2));
  const older = signals.slice(0, midpoint);
  const newer = signals.slice(midpoint);
  const olderMean = older.reduce((sum, item) => sum + item.score, 0) / older.length;
  const newerMean = newer.reduce((sum, item) => sum + item.score, 0) / newer.length;
  const progressionDelta = clamp((newerMean - olderMean) + 0.35, 0, 1);
  const consistencyShare = signals.filter((item) => item.outcomeHits > 0 || item.ownershipHits > 0).length / signals.length;
  const recentStrength = newer.length ? newer.reduce((sum, item) => sum + item.score, 0) / newer.length : signals[signals.length - 1].score;
  const domainContinuity = (() => {
    const tokenSets = ordered.map((reference) => new Set(tokenize(buildReferenceText(reference)).filter((token) => token.length > 4)));
    if (tokenSets.length < 2) return 0.4;
    let overlapSum = 0;
    for (let index = 1; index < tokenSets.length; index += 1) {
      const current = [...tokenSets[index]];
      const previous = tokenSets[index - 1];
      const overlap = current.filter((token) => previous.has(token)).length;
      overlapSum += clamp(overlap / Math.max(4, current.length));
    }
    return overlapSum / (tokenSets.length - 1);
  })();

  return {
    score: roundScore(progressionDelta * 0.35 + consistencyShare * 0.25 + recentStrength * 0.25 + domainContinuity * 0.15),
    detail: {
      evidenceCount: references.length,
      progressionDelta: roundScore(progressionDelta),
      consistencyShare: roundScore(consistencyShare),
      recentStrength: roundScore(recentStrength),
      domainContinuity: roundScore(domainContinuity),
      sparseEvidence: false,
      referenceSignals: signals
    }
  };
}

function deriveInsightBandValue(band) {
  if (band === 'strong' || band === 'high') return 0.8;
  if (band === 'moderate' || band === 'medium') return 0.58;
  return 0.3;
}

function createNetworkFallback() {
  return {
    score: 0.18,
    meanInsightScore: 0,
    unresolvedShare: 1,
    canonicalCoverage: 0,
    trustDelta: 0,
    isMeaningful: false,
    trustAvailable: false,
    recruiterInsightsAvailable: false,
    trustWeighting: { weightedScore: 0, baseScore: 0 },
    recruiterInsights: {
      summary: { overallGraphReadiness: 'limited' },
      insights: [],
      supportingCounts: { referenceCount: 0, canonicalRefereeCount: 0, unresolvedReferenceCount: 0 }
    },
    caveats: ['Network-backed context was unavailable, so network confidence remained conservative.']
  };
}

function summarizeNetworkSignals({ trustWeighting, recruiterInsights, referencesCount }) {
  if (!trustWeighting || !recruiterInsights) {
    return createNetworkFallback();
  }

  const trustDelta = clamp((trustWeighting.weightedScore || 0) - (trustWeighting.baseScore || 0), -1, 1);
  const insightScores = (recruiterInsights.insights || []).map((item) => clamp(item.score));
  const meanInsightScore = insightScores.length
    ? insightScores.reduce((sum, score) => sum + score, 0) / insightScores.length
    : deriveInsightBandValue(recruiterInsights.summary?.overallGraphReadiness);
  const referenceCount = recruiterInsights.supportingCounts?.referenceCount || referencesCount || 0;
  const unresolvedShare = referenceCount
    ? (recruiterInsights.supportingCounts?.unresolvedReferenceCount || 0) / referenceCount
    : 1;
  const canonicalCoverage = referenceCount
    ? clamp((recruiterInsights.supportingCounts?.canonicalRefereeCount || 0) / referenceCount)
    : 0;
  const score = roundScore(
    clamp(trustWeighting.weightedScore || 0) * 0.4 +
    clamp(meanInsightScore) * 0.35 +
    canonicalCoverage * 0.15 +
    clamp(0.5 + trustDelta, 0, 1) * 0.1 -
    unresolvedShare * 0.08
  );

  return {
    score,
    meanInsightScore: roundScore(meanInsightScore),
    unresolvedShare: roundScore(unresolvedShare),
    canonicalCoverage: roundScore(canonicalCoverage),
    trustDelta: roundTo3(trustDelta),
    isMeaningful: score >= 0.58 && canonicalCoverage >= 0.34,
    trustAvailable: true,
    recruiterInsightsAvailable: true,
    recruiterInsights,
    trustWeighting: {
      weightedScore: roundScore(trustWeighting.weightedScore),
      baseScore: roundScore(trustWeighting.baseScore)
    },
    caveats: []
  };
}

export function computePredictionConfidence({ references = [], referenceQualitySummary, networkSignals, careerProgression, roleFit }) {
  const evidenceCountScore = clamp(references.length / 4);
  const recencyScore = (() => {
    const latest = references
      .map((reference) => reference.created_at || reference.approved_at)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left)[0];
    if (!latest) return 0.32;
    const yearsOld = (Date.now() - latest) / (1000 * 60 * 60 * 24 * 365);
    return clamp(1 - (yearsOld / 3), 0.2, 1);
  })();
  const qualityScore = roundScore(referenceQualitySummary.meanQualityScore);
  const consistencyScore = roundScore(careerProgression.detail?.consistencyShare ?? 0);
  const graphCompleteness = roundScore(clamp(1 - (networkSignals.unresolvedShare || 0)));
  const sparsityPenalty = references.length <= 1 ? 0.18 : references.length === 2 ? 0.08 : 0;
  const signalAvailabilityPenalty = (!networkSignals.trustAvailable || !networkSignals.recruiterInsightsAvailable) ? 0.06 : 0;

  return {
    score: roundScore(
      evidenceCountScore * 0.3 +
      qualityScore * 0.25 +
      recencyScore * 0.2 +
      consistencyScore * 0.15 +
      graphCompleteness * 0.1 -
      sparsityPenalty -
      signalAvailabilityPenalty
    ),
    detail: {
      evidenceCount: references.length,
      evidenceCountScore: roundScore(evidenceCountScore),
      qualityScore,
      recencyScore: roundScore(recencyScore),
      consistencyScore,
      graphCompleteness,
      sparsityPenalty: roundTo3(sparsityPenalty),
      signalAvailabilityPenalty: roundTo3(signalAvailabilityPenalty),
      sparseEvidenceMaterial: references.length <= 2 || referenceQualitySummary.count <= 1,
      roleReadinessBand: roleFit.band || 'limited'
    }
  };
}

export function applyRoleReadinessCeiling(score, roleReadiness, roleFitDiagnostics = {}) {
  const requiredScore = clamp(roleFitDiagnostics?.skillMatch?.requiredScore ?? roleReadiness);
  const readiness = clamp(roleReadiness);
  let ceiling = null;

  if (readiness <= 0.25 || requiredScore <= 0.2) {
    ceiling = 0.42;
  } else if (readiness <= 0.45 || requiredScore <= 0.4) {
    ceiling = 0.64;
  }

  if (ceiling == null) {
    return {
      score: roundScore(score),
      capApplied: false,
      wasReduced: false,
      capValue: null,
      gatingInputs: {
        roleReadiness: roundScore(readiness),
        requiredSkillScore: roundScore(requiredScore)
      }
    };
  }

  return {
    score: roundScore(Math.min(score, ceiling)),
    capApplied: true,
    wasReduced: score > ceiling,
    capValue: ceiling,
    gatingInputs: {
      roleReadiness: roundScore(readiness),
      requiredSkillScore: roundScore(requiredScore)
    }
  };
}

function applyPredictionConfidencePromotionCeiling(score, baseScoreWithoutConfidence) {
  const roundedBase = roundScore(baseScoreWithoutConfidence);
  const capApplied = roundedBase < BAND_THRESHOLDS.strong;
  const capValue = capApplied ? 0.719 : null;

  return {
    score: roundScore(capApplied ? Math.min(score, capValue) : score),
    capApplied,
    wasReduced: Boolean(capApplied && score > capValue),
    capValue,
    baseScoreWithoutConfidence: roundedBase
  };
}

export function assertNoUnsafeLanguage(messages = []) {
  for (const message of messages) {
    if (OVERCLAIMING_PATTERN.test(message || '')) {
      throw new Error(`Unsafe performance prediction language detected: ${message}`);
    }
  }
}

function buildExplanationAndCaveats({ roleFit, referenceQualitySummary, networkSignals, careerProgression, predictionConfidence, appliedCeilings, optionalSignalCaveats }) {
  const explanation = [];
  const caveats = [];

  if (roleFit.roleFitScore >= 0.72) addUnique(explanation, 'Role-fit signals align well with the target role requirements.');
  else if (roleFit.roleFitScore >= 0.45) addUnique(explanation, 'Role-fit signals show partial alignment with the requested role profile.');
  else addUnique(caveats, 'Role mismatch reduced the final prediction despite otherwise positive supporting signals.');

  if (referenceQualitySummary.score >= 0.68) {
    addUnique(explanation, 'Reference quality is mostly moderate-to-strong, increasing evidence reliability.');
  } else if (referenceQualitySummary.lowShare >= 0.34) {
    addUnique(caveats, 'Prediction remains limited by uneven reference quality across the available evidence.');
  }

  if (networkSignals.isMeaningful) {
    addUnique(explanation, 'Network-backed trust signals provide additional confidence, but do not override direct fit evidence.');
  } else if (!networkSignals.trustAvailable || !networkSignals.recruiterInsightsAvailable) {
    for (const caveat of optionalSignalCaveats) addUnique(caveats, caveat);
  } else if (networkSignals.score < 0.4) {
    addUnique(caveats, 'Network-backed trust remained bounded because corroborating graph evidence is limited or sparse.');
  }

  if (careerProgression.score >= 0.58) addUnique(explanation, 'Recent references suggest increasing ownership and delivery scope.');
  if (careerProgression.detail?.sparseEvidence) addUnique(caveats, 'Sparse historical evidence limited the career progression signal.');

  if (predictionConfidence.score >= 0.62) {
    addUnique(explanation, 'Evidence sufficiency and recency support a moderate level of predictive signal strength.');
  } else if (predictionConfidence.detail?.sparseEvidenceMaterial || predictionConfidence.score < 0.5) {
    addUnique(caveats, 'Prediction remains limited by sparse or uneven evidence.');
  }

  if (appliedCeilings.roleReadiness.wasReduced) {
    addUnique(caveats, 'Weak role readiness applied a conservative ceiling so supporting signals could not rescue a role mismatch.');
  }
  if (appliedCeilings.confidencePromotion.wasReduced) {
    addUnique(caveats, 'Prediction confidence did not upgrade the forecast into a strong band without stronger direct performance signals.');
  }

  addUnique(caveats, 'Future-role prediction is supportive context, not an objective guarantee of performance.');

  assertNoUnsafeLanguage([...explanation, ...caveats]);
  return { explanation, caveats };
}

async function fetchOptionalHrScore(candidateId) {
  try {
    const latestScore = await getLatestScore({ userId: candidateId, roleId: null });
    return Number.isFinite(latestScore?.score) ? latestScore.score : null;
  } catch {
    return null;
  }
}

async function resolveOptionalSignal(factory, fallbackValue = null) {
  try {
    return await factory();
  } catch {
    return fallbackValue;
  }
}

function createStableComponents(values = {}) {
  return {
    roleReadiness: roundScore(values.roleReadiness),
    evidenceReliability: roundScore(values.evidenceReliability),
    networkConfidence: roundScore(values.networkConfidence),
    careerProgression: roundScore(values.careerProgression),
    predictionConfidence: roundScore(values.predictionConfidence)
  };
}

function createStableAppliedCeilings(roleReadinessCeiling, confidencePromotionCeiling) {
  return {
    roleReadiness: {
      score: roundScore(roleReadinessCeiling.score),
      capApplied: Boolean(roleReadinessCeiling.capApplied),
      wasReduced: Boolean(roleReadinessCeiling.wasReduced),
      capValue: roleReadinessCeiling.capValue == null ? null : roundScore(roleReadinessCeiling.capValue),
      gatingInputs: {
        roleReadiness: roundScore(roleReadinessCeiling.gatingInputs?.roleReadiness),
        requiredSkillScore: roundScore(roleReadinessCeiling.gatingInputs?.requiredSkillScore)
      }
    },
    confidencePromotion: {
      score: roundScore(confidencePromotionCeiling.score),
      capApplied: Boolean(confidencePromotionCeiling.capApplied),
      wasReduced: Boolean(confidencePromotionCeiling.wasReduced),
      capValue: confidencePromotionCeiling.capValue == null ? null : roundScore(confidencePromotionCeiling.capValue),
      baseScoreWithoutConfidence: roundScore(confidencePromotionCeiling.baseScoreWithoutConfidence)
    }
  };
}

export async function computePerformancePrediction(candidateId, roleDefinitionInput = {}) {
  if (!candidateId) throw createValidationError('candidateId is required');

  const normalizedRoleDefinition = normalizePerformanceRoleDefinition(roleDefinitionInput);
  const references = await fetchCandidateReferences(candidateId);
  const roleFit = await computeRoleFitScore(candidateId, normalizedRoleDefinition);
  const [trustWeighting, recruiterInsights, hrScore] = await Promise.all([
    resolveOptionalSignal(() => computeCandidateTrustWeights(candidateId), null),
    resolveOptionalSignal(() => computeCandidateRecruiterInsights(candidateId), null),
    fetchOptionalHrScore(candidateId)
  ]);

  const referenceQualitySummary = summarizeReferenceQuality(references);
  const networkSignals = summarizeNetworkSignals({ trustWeighting, recruiterInsights, referencesCount: references.length });
  const careerProgression = computeCareerProgressionSignal({ references });
  const predictionConfidence = computePredictionConfidence({ references, referenceQualitySummary, networkSignals, careerProgression, roleFit });
  const components = createStableComponents({
    roleReadiness: roleFit.roleFitScore,
    evidenceReliability: referenceQualitySummary.score,
    networkConfidence: networkSignals.score,
    careerProgression: careerProgression.score,
    predictionConfidence: predictionConfidence.score
  });

  const baseScoreWithoutConfidence = (
    components.roleReadiness * PERFORMANCE_WEIGHTS.roleReadiness +
    components.evidenceReliability * PERFORMANCE_WEIGHTS.evidenceReliability +
    components.networkConfidence * PERFORMANCE_WEIGHTS.networkConfidence +
    components.careerProgression * PERFORMANCE_WEIGHTS.careerProgression
  );

  let performancePredictionScore = baseScoreWithoutConfidence + (components.predictionConfidence * PERFORMANCE_WEIGHTS.predictionConfidence);
  const roleReadinessCeiling = applyRoleReadinessCeiling(performancePredictionScore, components.roleReadiness, roleFit.diagnostics);
  performancePredictionScore = roleReadinessCeiling.score;
  const confidencePromotionCeiling = applyPredictionConfidencePromotionCeiling(performancePredictionScore, baseScoreWithoutConfidence);
  performancePredictionScore = confidencePromotionCeiling.score;

  const appliedCeilings = createStableAppliedCeilings(roleReadinessCeiling, confidencePromotionCeiling);
  const optionalSignalCaveats = [...networkSignals.caveats];
  const { explanation, caveats } = buildExplanationAndCaveats({
    roleFit,
    referenceQualitySummary,
    networkSignals,
    careerProgression,
    predictionConfidence,
    appliedCeilings,
    optionalSignalCaveats
  });

  return {
    candidateId: String(candidateId),
    performancePredictionScore: roundScore(performancePredictionScore),
    band: deriveBand(performancePredictionScore),
    components,
    explanation,
    caveats,
    diagnostics: {
      roleFit: {
        roleFitScore: roundScore(roleFit.roleFitScore),
        band: roleFit.band || 'limited',
        components: roleFit.components || {},
        diagnostics: roleFit.diagnostics || {}
      },
      referenceQualitySummary,
      networkSignals: {
        score: roundScore(networkSignals.score),
        meanInsightScore: roundScore(networkSignals.meanInsightScore),
        unresolvedShare: roundScore(networkSignals.unresolvedShare),
        canonicalCoverage: roundScore(networkSignals.canonicalCoverage),
        trustDelta: roundTo3(networkSignals.trustDelta),
        isMeaningful: Boolean(networkSignals.isMeaningful),
        trustAvailable: Boolean(networkSignals.trustAvailable),
        recruiterInsightsAvailable: Boolean(networkSignals.recruiterInsightsAvailable),
        recruiterSummary: networkSignals.recruiterInsights?.summary || { overallGraphReadiness: 'limited' },
        supportingCounts: networkSignals.recruiterInsights?.supportingCounts || { referenceCount: 0, canonicalRefereeCount: 0, unresolvedReferenceCount: 0 }
      },
      careerProgression: careerProgression.detail,
      confidenceInputs: predictionConfidence.detail,
      appliedCeilings,
      roleDefinitionInput: normalizedRoleDefinition,
      referenceCount: references.length,
      latestHrScore: hrScore,
      modelVersion: 'deterministic-v1'
    }
  };
}

export default {
  computePerformancePrediction,
  normalizePerformanceRoleDefinition,
  computeCareerProgressionSignal,
  computePredictionConfidence,
  applyRoleReadinessCeiling,
  assertNoUnsafeLanguage,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};
