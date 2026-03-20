import { createClient } from '@supabase/supabase-js';
import { computeRoleFitScore } from './roleFit.service.js';
import { computePerformancePrediction, normalizePerformanceRoleDefinition } from './performancePrediction.service.js';
import { computeCandidateRecruiterInsights } from './recruiterGraphInsights.service.js';
import { computeCandidateTrustWeights } from './reputationTrustWeighting.service.js';
import { computeCandidatePropagation } from './reputationPropagation.service.js';
import { computeReferenceQuality } from './referenceQuality.service.js';
import { computeCareerTrajectory } from './careerTrajectory.service.js';

const SIGNAL_DIFFERENCE_THRESHOLD = 0.08;
const REFERENCE_SAMPLE_LIMIT = 3;
const BANNED_COPY_PATTERN = /(top performer|above average|better than peers|peer ranking|peer benchmark|top percentile|percentile placement|top\s*\d+%|ranked #?\d+|outperforms other candidates|better than other candidates|better than others|absolute candidate ordering|best candidate)/i;
const SIGNAL_KEYS = Object.freeze(['roleFit', 'performance', 'evidenceQuality', 'networkSupport', 'trajectory']);

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

function clamp01(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function roundScore(value) {
  const normalized = clamp01(value);
  if (normalized == null) return null;
  return Math.round(normalized * 1000) / 1000;
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeStringArray(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    const error = new Error('roleDefinition arrays must be arrays of strings');
    error.status = 400;
    throw error;
  }

  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || normalized.includes(trimmed)) continue;
    normalized.push(trimmed);
  }
  return normalized;
}

function sanitizeTextList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => (BANNED_COPY_PATTERN.test(item)
      ? 'This benchmark remains a bounded comparison across currently available signals for the same candidate.'
      : item));
}

function assertSafeCopy(text) {
  if (!text) return '';
  return BANNED_COPY_PATTERN.test(text)
    ? 'This benchmark remains a bounded comparison across currently available signals for the same candidate.'
    : text;
}

export function parseCandidateBenchmarkRoleDefinition(roleDefinition) {
  if (roleDefinition == null) return null;
  if (typeof roleDefinition === 'string' && !roleDefinition.trim()) return null;

  let parsed = roleDefinition;
  if (typeof roleDefinition === 'string') {
    try {
      parsed = JSON.parse(roleDefinition);
    } catch {
      const error = new Error('roleDefinition must be valid JSON');
      error.status = 400;
      throw error;
    }
  }

  if (!isPlainObject(parsed)) {
    const error = new Error('roleDefinition must be a plain object');
    error.status = 400;
    throw error;
  }

  const normalized = {
    requiredSkills: normalizeStringArray(parsed.requiredSkills),
    preferredSkills: normalizeStringArray(parsed.preferredSkills),
    keywords: normalizeStringArray(parsed.keywords),
    seniorityLevel: typeof parsed.seniorityLevel === 'string' && parsed.seniorityLevel.trim()
      ? parsed.seniorityLevel.trim()
      : null
  };

  const hasValue = normalized.requiredSkills.length || normalized.preferredSkills.length || normalized.keywords.length || normalized.seniorityLevel;
  if (!hasValue) return null;

  const hardened = normalizePerformanceRoleDefinition(normalized);
  return isPlainObject(hardened) ? hardened : normalized;
}

export function normalizeCandidateBenchmarkInput(input = {}) {
  const candidateId = String(input?.candidateId || '').trim();
  if (!candidateId) {
    const error = new Error('candidateId is required');
    error.status = 400;
    throw error;
  }

  return {
    candidateId,
    roleDefinition: parseCandidateBenchmarkRoleDefinition(input?.roleDefinition)
  };
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, referee_id')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to load candidate references for benchmarking');
  }

  return Array.isArray(data) ? data : [];
}

async function computeSampledReferenceQuality(candidateId) {
  const references = await fetchCandidateReferences(candidateId);
  const sampled = references.slice(0, REFERENCE_SAMPLE_LIMIT);
  if (!sampled.length) {
    return {
      score: null,
      sampledCount: 0,
      totalCount: references.length,
      caveats: ['Reference data is currently limited, so evidence quality could not be compared directly.']
    };
  }

  const results = await Promise.all(sampled.map(async (reference) => {
    try {
      return await computeReferenceQuality(reference.id);
    } catch {
      return null;
    }
  }));

  const validScores = results
    .map((result) => (typeof result?.qualityScore === 'number' ? clamp01(result.qualityScore) : null))
    .filter((value) => value != null);

  const caveats = [];
  if (!validScores.length) {
    caveats.push('Reference quality details were unavailable for the sampled references.');
  } else if (references.length > sampled.length) {
    caveats.push(`Evidence quality reflects ${sampled.length} sampled reference${sampled.length === 1 ? '' : 's'} rather than the full reference set.`);
  }
  if (references.length < 2) {
    caveats.push('Reference data is sparse, so evidence-quality comparisons should be read conservatively.');
  }

  const average = validScores.length
    ? validScores.reduce((sum, value) => sum + value, 0) / validScores.length
    : null;

  return {
    score: roundScore(average),
    sampledCount: sampled.length,
    totalCount: references.length,
    caveats: sanitizeTextList(caveats)
  };
}

async function resolveOptionalSource(loader, failureCaveat) {
  try {
    return { ok: true, data: await loader(), caveats: [] };
  } catch {
    return { ok: false, data: null, caveats: failureCaveat ? [failureCaveat] : [] };
  }
}

function getGraphSignalScore(graphInsights) {
  const insights = Array.isArray(graphInsights?.insights) ? graphInsights.insights : [];
  const networkCredibility = insights.find((item) => item?.type === 'network_credibility');
  return typeof networkCredibility?.score === 'number' ? roundScore(networkCredibility.score) : null;
}

function getTrajectorySignalScore(trajectory) {
  const signals = trajectory?.signals && typeof trajectory.signals === 'object' ? Object.values(trajectory.signals) : [];
  const valid = signals
    .map((signal) => (typeof signal?.score === 'number' ? clamp01(signal.score) : null))
    .filter((value) => value != null);

  if (!valid.length) return null;
  return roundScore(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function buildSignalMap({ roleFit, performance, evidenceQuality, networkSupport, trajectory }) {
  return Object.fromEntries(
    Object.entries({ roleFit, performance, evidenceQuality, networkSupport, trajectory })
      .map(([key, value]) => [key, roundScore(value)])
      .filter(([, value]) => value != null)
  );
}

function getSignalLabel(key) {
  return {
    roleFit: 'Role fit',
    performance: 'Performance forecast',
    evidenceQuality: 'Evidence quality',
    networkSupport: 'Graph-backed support',
    trajectory: 'Career trajectory'
  }[key] || key;
}

function getStableSignalEntries(signals) {
  return Object.entries(signals)
    .filter(([, value]) => typeof value === 'number' && !Number.isNaN(value))
    .sort((left, right) => right[1] - left[1]);
}

function buildRelativePositioning(signals) {
  const entries = getStableSignalEntries(signals);
  if (entries.length < 2) {
    return {
      strongestSignal: null,
      weakestSignal: null,
      comparisons: []
    };
  }

  const strongestSignal = entries[0][0];
  const weakestSignal = entries[entries.length - 1][0];
  const strongestGap = entries[0][1] - entries[1][1];
  const weakestGap = entries[entries.length - 2][1] - entries[entries.length - 1][1];
  const comparisons = [];

  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];
    if ((current[1] - next[1]) <= SIGNAL_DIFFERENCE_THRESHOLD) continue;
    comparisons.push(assertSafeCopy(`${getSignalLabel(current[0])} is currently stronger than ${getSignalLabel(next[0]).toLowerCase()}.`));
  }

  return {
    strongestSignal: strongestGap > SIGNAL_DIFFERENCE_THRESHOLD ? strongestSignal : null,
    weakestSignal: weakestGap > SIGNAL_DIFFERENCE_THRESHOLD ? weakestSignal : null,
    comparisons: unique(comparisons).slice(0, 4)
  };
}

function buildBenchmarkSummary({ signalCount, relativePositioning, missingSignals }) {
  if (!signalCount) {
    return 'No relative signal balance is available because no benchmarkable recruiter-intelligence signals are currently available for this candidate.';
  }

  if (signalCount === 1) {
    return 'Only one benchmarkable signal is currently available. At least two signals are required for a bounded within-candidate comparison.';
  }

  const fragments = [
    'This v1 benchmark is a bounded comparison across currently available signals for the same candidate only.',
    'It does not compare this candidate against peers, cohorts, industry populations, or percentiles.'
  ];

  if (relativePositioning.strongestSignal && relativePositioning.weakestSignal) {
    fragments.push(`${getSignalLabel(relativePositioning.strongestSignal)} currently shows more support than ${getSignalLabel(relativePositioning.weakestSignal).toLowerCase()}.`);
  } else if (!relativePositioning.comparisons.length) {
    fragments.push('Available signals are close enough that no meaningful within-candidate comparison crossed the comparison threshold.');
  }

  if (missingSignals.length) {
    fragments.push(`Unavailable signals were left blank: ${missingSignals.map((key) => getSignalLabel(key).toLowerCase()).join(', ')}.`);
  }

  return assertSafeCopy(fragments.join(' '));
}

function buildCaveats({ missingSignals, graphInsights, propagation, referenceQuality, trajectory, sourceCaveats, signalCount }) {
  const caveats = [
    'Comparisons are derived only from currently available signals for this candidate and do not represent peer, population, industry, or percentile benchmarking.'
  ];

  if (missingSignals.length) {
    caveats.push(`Some signals were unavailable and were left blank: ${missingSignals.map((key) => getSignalLabel(key).toLowerCase()).join(', ')}.`);
  }
  if (signalCount < 2) {
    caveats.push('At least two stable signals are required before relative comparisons can be emitted.');
  }

  const unresolvedReferenceCount = graphInsights?.supportingCounts?.unresolvedReferenceCount;
  const referenceCount = graphInsights?.supportingCounts?.referenceCount;
  if ((typeof unresolvedReferenceCount === 'number' && unresolvedReferenceCount > 0) || (typeof referenceCount === 'number' && referenceCount < 2)) {
    caveats.push('Graph support is currently sparse or partially unresolved, so network-backed signals remain limited.');
  }
  if (typeof propagation?.score === 'number' && propagation.score < 0.35) {
    caveats.push('Graph-backed support is currently limited and should be read as bounded supporting evidence only.');
  }
  if ((referenceQuality?.totalCount || 0) < 2) {
    caveats.push('Reference data is limited, so evidence-quality comparisons may change as more verified references become available.');
  }
  if (!trajectory || !Object.keys(trajectory.signals || {}).length) {
    caveats.push('Career trajectory signals are not yet available or remain too sparse for a stable comparison.');
  }

  const sanitized = unique([...caveats, ...sanitizeTextList(sourceCaveats), ...sanitizeTextList(referenceQuality?.caveats)])
    .map(assertSafeCopy)
    .filter(Boolean);

  return sanitized;
}

function buildStableSuccessPayload({ candidateId, signals, relativePositioning, benchmarkSummary, caveats }) {
  return {
    candidateId: String(candidateId),
    signals: signals && typeof signals === 'object' ? signals : {},
    relativePositioning: {
      strongestSignal: relativePositioning?.strongestSignal || null,
      weakestSignal: relativePositioning?.weakestSignal || null,
      comparisons: Array.isArray(relativePositioning?.comparisons) ? relativePositioning.comparisons.filter(Boolean) : []
    },
    benchmarkSummary: assertSafeCopy(String(benchmarkSummary || '').trim()) || 'No relative signal balance is available yet.',
    caveats: Array.isArray(caveats) && caveats.filter(Boolean).length
      ? caveats.filter(Boolean)
      : ['Comparisons are derived only from currently available signals for this candidate and do not represent peer, population, industry, or percentile benchmarking.']
  };
}

export async function computeCandidateBenchmark(candidateId, options = {}) {
  const normalizedInput = normalizeCandidateBenchmarkInput({ candidateId, roleDefinition: options.roleDefinition });
  const { roleDefinition } = normalizedInput;

  const [graphSource, trustSource, propagationSource, trajectorySource, referenceQualitySource, roleFitSource, performanceSource] = await Promise.all([
    resolveOptionalSource(
      () => computeCandidateRecruiterInsights(normalizedInput.candidateId),
      'Recruiter graph insights were unavailable and were omitted from this bounded comparison.'
    ),
    resolveOptionalSource(
      () => computeCandidateTrustWeights(normalizedInput.candidateId),
      'Trust-weighting signals were unavailable and were omitted from this bounded comparison.'
    ),
    resolveOptionalSource(
      () => computeCandidatePropagation(normalizedInput.candidateId),
      'Propagation signals were unavailable and were omitted from this bounded comparison.'
    ),
    resolveOptionalSource(
      () => computeCareerTrajectory(normalizedInput.candidateId),
      'Career trajectory signals were unavailable and were omitted from this bounded comparison.'
    ),
    resolveOptionalSource(
      () => computeSampledReferenceQuality(normalizedInput.candidateId),
      'Reference-quality signals were unavailable and were omitted from this bounded comparison.'
    ),
    roleDefinition
      ? resolveOptionalSource(
        () => computeRoleFitScore(normalizedInput.candidateId, roleDefinition),
        'Role-fit signals were unavailable and were omitted from this bounded comparison.'
      )
      : Promise.resolve({ ok: false, data: null, caveats: ['Role-specific signals require a role definition and were omitted until one is provided.'] }),
    roleDefinition
      ? resolveOptionalSource(
        () => computePerformancePrediction(normalizedInput.candidateId, roleDefinition),
        'Performance-forecast signals were unavailable and were omitted from this bounded comparison.'
      )
      : Promise.resolve({ ok: false, data: null, caveats: ['Role-specific signals require a role definition and were omitted until one is provided.'] })
  ]);

  const roleFitScore = typeof roleFitSource.data?.roleFitScore === 'number' ? roundScore(roleFitSource.data.roleFitScore) : null;
  const performanceScore = typeof performanceSource.data?.performancePredictionScore === 'number' ? roundScore(performanceSource.data.performancePredictionScore) : null;

  const evidenceInputs = [trustSource.data?.weightedScore, referenceQualitySource.data?.score]
    .map((value) => (typeof value === 'number' ? clamp01(value) : null))
    .filter((value) => value != null);
  const evidenceQuality = evidenceInputs.length
    ? roundScore(evidenceInputs.reduce((sum, value) => sum + value, 0) / evidenceInputs.length)
    : null;

  const networkInputs = [getGraphSignalScore(graphSource.data), propagationSource.data?.score]
    .map((value) => (typeof value === 'number' ? clamp01(value) : null))
    .filter((value) => value != null);
  const networkSupport = networkInputs.length
    ? roundScore(networkInputs.reduce((sum, value) => sum + value, 0) / networkInputs.length)
    : null;

  const trajectoryScore = getTrajectorySignalScore(trajectorySource.data);

  const signals = buildSignalMap({
    roleFit: roleFitScore,
    performance: performanceScore,
    evidenceQuality,
    networkSupport,
    trajectory: trajectoryScore
  });

  const relativePositioning = buildRelativePositioning(signals);
  const missingSignals = SIGNAL_KEYS.filter((key) => typeof signals[key] !== 'number');
  const sourceCaveats = [
    ...roleFitSource.caveats,
    ...performanceSource.caveats,
    ...graphSource.caveats,
    ...trustSource.caveats,
    ...propagationSource.caveats,
    ...trajectorySource.caveats,
    ...referenceQualitySource.caveats,
    ...sanitizeTextList(roleFitSource.data?.caveats),
    ...sanitizeTextList(performanceSource.data?.caveats),
    ...sanitizeTextList(graphSource.data?.caveats),
    ...sanitizeTextList(trustSource.data?.caveats),
    ...sanitizeTextList(propagationSource.data?.caveats),
    ...sanitizeTextList(trajectorySource.data?.caveats)
  ];

  const caveats = buildCaveats({
    missingSignals,
    graphInsights: graphSource.data,
    propagation: propagationSource.data,
    referenceQuality: referenceQualitySource.data,
    trajectory: trajectorySource.data,
    sourceCaveats,
    signalCount: Object.keys(signals).length
  });

  return buildStableSuccessPayload({
    candidateId: normalizedInput.candidateId,
    signals,
    relativePositioning,
    benchmarkSummary: buildBenchmarkSummary({
      signalCount: Object.keys(signals).length,
      relativePositioning,
      missingSignals
    }),
    caveats
  });
}

export const __testables = {
  SIGNAL_DIFFERENCE_THRESHOLD,
  REFERENCE_SAMPLE_LIMIT,
  BANNED_COPY_PATTERN,
  clamp01,
  roundScore,
  buildSignalMap,
  buildRelativePositioning,
  buildBenchmarkSummary,
  buildCaveats,
  buildStableSuccessPayload,
  getSignalLabel,
  getGraphSignalScore,
  getTrajectorySignalScore,
  sanitizeTextList,
  assertSafeCopy,
  normalizeStringArray
};

export default {
  computeCandidateBenchmark,
  normalizeCandidateBenchmarkInput,
  parseCandidateBenchmarkRoleDefinition,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests,
  __testables
};
