import { createClient } from '@supabase/supabase-js';
import { computeReferenceQualityFromText } from './referenceQuality.service.js';
import { computeCandidateTrustWeights } from './reputationTrustWeighting.service.js';
import { getLatestScore } from './hrscore/scoreHistory.js';

const DEFAULT_WEIGHTS = Object.freeze({
  skillMatch: 0.35,
  experienceAlignment: 0.25,
  evidenceStrength: 0.2,
  careerConsistency: 0.2
});

const BAND_THRESHOLDS = Object.freeze({
  strong: 0.72,
  moderate: 0.45
});

const SENIORITY_LEVELS = Object.freeze({ junior: 1, mid: 2, senior: 3 });
const SENIORITY_TERMS = Object.freeze({
  junior: ['junior', 'associate', 'assistant', 'support', 'coordinator'],
  mid: ['specialist', 'engineer', 'analyst', 'manager', 'consultant', 'owner'],
  senior: ['senior', 'staff', 'principal', 'lead', 'head', 'director', 'vp', 'chief', 'managed', 'owned', 'led', 'mentored']
});
const SKILL_VERB_HINTS = Object.freeze([
  'built', 'created', 'led', 'managed', 'delivered', 'shipped', 'launched', 'implemented',
  'owned', 'designed', 'improved', 'reduced', 'increased', 'trained', 'mentored', 'supported',
  'coordinated', 'resolved', 'organized', 'drove', 'developed', 'executed', 'partnered', 'automated'
]);
const OUTCOME_COMPLEXITY_TERMS = Object.freeze([
  'multi', 'cross-functional', 'migration', 'launch', 'roadmap', 'strategy', 'system', 'program',
  'platform', 'transformation', 'budget', 'forecast', 'scalable', 'architecture', 'rollout'
]);

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

export function clampScore(value) {
  return clamp(value, 0, 1);
}

export function roundTo3(value) {
  const normalized = Number.isFinite(value) ? value : 0;
  return Math.round(normalized * 1000) / 1000;
}

function roundScore(value) {
  return roundTo3(clampScore(value));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value).match(/[a-z0-9+#./-]+/g) || [];
}

function unique(items) {
  const list = (items || []).filter(Boolean);
  return list.filter((item, index) => list.indexOf(item) === index);
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

function normalizeRoleDefinition(roleDefinition = {}) {
  const requiredSkillsRaw = Array.from(roleDefinition.requiredSkills || []).map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
  const preferredSkillsRaw = Array.from(roleDefinition.preferredSkills || []).map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
  const keywordsRaw = Array.from(roleDefinition.keywords || []).map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
  const requiredSkills = unique(requiredSkillsRaw);
  const preferredSkills = unique(preferredSkillsRaw);
  const keywords = unique(keywordsRaw);
  const seniorityLevel = normalizeText(roleDefinition.seniorityLevel || 'mid') || 'mid';

  return {
    requiredSkills,
    preferredSkills,
    keywords,
    seniorityLevel: SENIORITY_LEVELS[seniorityLevel] ? seniorityLevel : 'mid',
    weights: {
      ...DEFAULT_WEIGHTS,
      ...(roleDefinition.weightOverrides || {})
    }
  };
}

function inferCandidateSignals(references = []) {
  const texts = references.map(buildReferenceText).filter(Boolean);
  const combinedText = texts.join(' ');
  const allTokens = texts.flatMap(tokenize);
  const tokenSet = new Set(allTokens);
  const domainTerms = unique(allTokens.filter((token) => token.length > 3));
  const actionVerbs = unique(SKILL_VERB_HINTS.filter((term) => tokenSet.has(term)));
  const roleTerms = unique(allTokens.filter((token) => Object.values(SENIORITY_TERMS).flat().includes(token)));
  const outcomeTerms = unique(allTokens.filter((token) => OUTCOME_COMPLEXITY_TERMS.includes(token) || /%|x|kpi|sla|deadline|revenue/.test(token)));
  const domainsByReference = texts.map((text) => unique(tokenize(text).filter((token) => token.length > 3)));

  return {
    combinedText,
    texts,
    tokenSet,
    domainTerms,
    actionVerbs,
    roleTerms,
    outcomeTerms,
    domainsByReference
  };
}

function matchPhrase(phrase, tokenSet, combinedText) {
  const normalized = normalizeText(phrase);
  if (!normalized) return false;
  if (normalized.includes(' ')) return combinedText.includes(normalized);
  return tokenSet.has(normalized);
}

export function computeSkillMatch({ candidateSignals, roleDefinition }) {
  const requiredMatches = roleDefinition.requiredSkills.filter((skill) => matchPhrase(skill, candidateSignals.tokenSet, candidateSignals.combinedText));
  const preferredMatches = roleDefinition.preferredSkills.filter((skill) => matchPhrase(skill, candidateSignals.tokenSet, candidateSignals.combinedText));
  const keywordMatches = roleDefinition.keywords.filter((keyword) => matchPhrase(keyword, candidateSignals.tokenSet, candidateSignals.combinedText));

  const requiredScore = roleDefinition.requiredSkills.length ? requiredMatches.length / roleDefinition.requiredSkills.length : 1;
  const preferredScore = roleDefinition.preferredSkills.length ? preferredMatches.length / roleDefinition.preferredSkills.length : 0.5;
  const keywordScore = roleDefinition.keywords.length ? keywordMatches.length / roleDefinition.keywords.length : 0.5;
  const verbCoverage = clamp(candidateSignals.actionVerbs.length / 6);

  return {
    score: roundScore(requiredScore * 0.6 + preferredScore * 0.2 + keywordScore * 0.1 + verbCoverage * 0.1),
    detail: { requiredMatches, preferredMatches, keywordMatches, requiredScore: roundScore(requiredScore), preferredScore: roundScore(preferredScore), keywordScore: roundScore(keywordScore) }
  };
}

export function computeExperienceAlignment({ candidateSignals, roleDefinition, references }) {
  const combinedText = candidateSignals.combinedText;
  const senioritySignal = Object.entries(SENIORITY_TERMS).reduce((acc, [level, terms]) => {
    acc[level] = terms.reduce((count, term) => count + (combinedText.includes(term) ? 1 : 0), 0);
    return acc;
  }, {});

  const ownershipSignal = clamp((senioritySignal.senior + candidateSignals.actionVerbs.filter((verb) => ['led', 'owned', 'managed', 'mentored', 'drove'].includes(verb)).length) / 6);
  const complexitySignal = clamp((candidateSignals.outcomeTerms.length + references.filter((reference) => /\d/.test(buildReferenceText(reference))).length) / Math.max(3, references.length + 1));
  const consistencySignal = clamp(references.length ? references.filter((reference) => /lead|manage|own|deliver|launch/i.test(buildReferenceText(reference))).length / references.length : 0);

  const candidateLevel = ownershipSignal >= 0.72 ? 'senior' : ownershipSignal >= 0.38 ? 'mid' : 'junior';
  const targetRank = SENIORITY_LEVELS[roleDefinition.seniorityLevel] || SENIORITY_LEVELS.mid;
  const candidateRank = SENIORITY_LEVELS[candidateLevel];
  const gap = Math.abs(targetRank - candidateRank);
  const rankAlignment = gap === 0 ? 1 : gap === 1 ? 0.68 : 0.35;

  return {
    score: roundScore(rankAlignment * 0.6 + complexitySignal * 0.25 + consistencySignal * 0.15),
    detail: {
      inferredLevel: candidateLevel,
      targetLevel: roleDefinition.seniorityLevel,
      ownershipSignal: roundScore(ownershipSignal),
      complexitySignal: roundScore(complexitySignal),
      consistencySignal: roundScore(consistencySignal)
    }
  };
}

export function computeEvidenceStrength({ references, qualityResults }) {
  if (!references.length) {
    return { score: 0, detail: { meanQualityScore: 0, lowQualityShare: 1, strongQualityShare: 0 } };
  }

  const scores = qualityResults.map((item) => item.qualityScore);
  const meanQualityScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const lowQualityShare = qualityResults.filter((item) => item.qualityScore < 0.45).length / scores.length;
  const strongQualityShare = qualityResults.filter((item) => item.qualityScore >= 0.72).length / scores.length;
  const distributionModifier = clamp(1 - lowQualityShare * 0.55 + strongQualityShare * 0.15);

  return {
    score: roundScore(meanQualityScore * 0.85 + distributionModifier * 0.15),
    detail: {
      meanQualityScore: roundScore(meanQualityScore),
      lowQualityShare: roundScore(lowQualityShare),
      strongQualityShare: roundScore(strongQualityShare)
    }
  };
}

export function computeCareerConsistency({ references, candidateSignals }) {
  if (!references.length) {
    return { score: 0, detail: { repeatedRolePatternShare: 0, domainContinuity: 0, recencyScore: 0 } };
  }

  const referenceTexts = candidateSignals.texts;
  const rolePatternShare = clamp(referenceTexts.filter((text) => /engineer|manager|lead|analyst|director|specialist/i.test(text)).length / references.length);
  const domainOverlapSum = candidateSignals.domainsByReference.slice(1).reduce((sum, domains, index) => {
    const previous = new Set(candidateSignals.domainsByReference[index] || []);
    const overlap = domains.filter((term) => previous.has(term)).length;
    return sum + clamp(overlap / Math.max(5, domains.length || 1));
  }, 0);
  const domainContinuity = candidateSignals.domainsByReference.length > 1
    ? domainOverlapSum / (candidateSignals.domainsByReference.length - 1)
    : 0.55;

  const timestamps = references.map((reference) => reference.created_at || reference.approved_at).filter(Boolean).map((value) => new Date(value)).filter((value) => !Number.isNaN(value.getTime()));
  const latestTimestamp = timestamps.sort((a, b) => b - a)[0] || null;
  const recencyScore = latestTimestamp
    ? clamp(1 - ((Date.now() - latestTimestamp.getTime()) / (1000 * 60 * 60 * 24 * 365 * 3)))
    : 0.45;

  return {
    score: roundScore(rolePatternShare * 0.35 + domainContinuity * 0.35 + recencyScore * 0.3),
    detail: {
      repeatedRolePatternShare: roundScore(rolePatternShare),
      domainContinuity: roundScore(domainContinuity),
      recencyScore: roundScore(recencyScore)
    }
  };
}

export function applyRequiredSkillCeiling(score, requiredScore, requiredSkillsCount) {
  if (!requiredSkillsCount) {
    return {
      score: roundScore(score),
      capApplied: false,
      wasReduced: false,
      capValue: null
    };
  }

  const normalizedRequiredScore = clampScore(requiredScore);
  const ceiling = normalizedRequiredScore <= 0.2
    ? 0.38
    : normalizedRequiredScore <= 0.4
      ? 0.55
      : null;

  if (ceiling == null) {
    return {
      score: roundScore(score),
      capApplied: false,
      wasReduced: false,
      capValue: null
    };
  }

  return {
    score: roundScore(Math.min(score, ceiling)),
    capApplied: true,
    wasReduced: score > ceiling,
    capValue: ceiling
  };
}

function deriveBand(score) {
  if (score >= BAND_THRESHOLDS.strong) return 'strong';
  if (score >= BAND_THRESHOLDS.moderate) return 'moderate';
  return 'limited';
}

function addUnique(target, text) {
  if (text && !target.includes(text)) target.push(text);
}

async function fetchCandidateReferences(candidateId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, owner_id, created_at, approved_at, relationship, summary, answer_text, answer, detailed_feedback, referrer_company, referrer_title')
    .eq('owner_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) {
    const resolvedError = new Error('Failed to load candidate references');
    resolvedError.status = 500;
    throw resolvedError;
  }

  return data || [];
}

async function fetchOptionalHrScore(candidateId) {
  const latestScore = await getLatestScore({ userId: candidateId, roleId: null });
  return latestScore?.score ?? null;
}

export async function computeRoleFitScore(candidateId, roleDefinitionInput = {}) {
  if (!candidateId) throw new Error('candidateId is required');

  const roleDefinition = normalizeRoleDefinition(roleDefinitionInput);
  const references = await fetchCandidateReferences(candidateId);
  const qualityResults = references.map((reference) => computeReferenceQualityFromText(buildReferenceText(reference), { referenceId: reference.id }));
  const candidateSignals = inferCandidateSignals(references);
  const hrScore = await fetchOptionalHrScore(candidateId);

  const skillMatch = computeSkillMatch({ candidateSignals, roleDefinition });
  const experienceAlignment = computeExperienceAlignment({ candidateSignals, roleDefinition, references });
  const evidenceStrength = computeEvidenceStrength({ references, qualityResults });
  const careerConsistency = computeCareerConsistency({ references, candidateSignals });

  const weights = roleDefinition.weights;
  let roleFitScore = (
    skillMatch.score * weights.skillMatch +
    experienceAlignment.score * weights.experienceAlignment +
    evidenceStrength.score * weights.evidenceStrength +
    careerConsistency.score * weights.careerConsistency
  );

  if (skillMatch.detail.requiredScore >= 0.67) {
    roleFitScore += 0.045;
  } else if (skillMatch.detail.requiredScore <= 0.2) {
    roleFitScore -= 0.12;
  }

  if (experienceAlignment.detail.inferredLevel === roleDefinition.seniorityLevel) {
    roleFitScore += 0.02;
  }

  const explanation = [];
  const caveats = [];

  if (skillMatch.detail.requiredScore >= 0.67) addUnique(explanation, 'Strong overlap with required role skills.');
  else if (skillMatch.score >= 0.45) addUnique(explanation, 'Candidate references show partial overlap with the role skill profile.');
  else addUnique(caveats, 'Limited evidence for required domain skills.');

  if (experienceAlignment.detail.inferredLevel === roleDefinition.seniorityLevel || experienceAlignment.score >= 0.72) {
    addUnique(explanation, 'References indicate seniority and ownership signals aligned with the target role.');
  } else {
    addUnique(caveats, 'Experience signals do not fully match the requested seniority level.');
  }

  if (evidenceStrength.detail.meanQualityScore >= 0.72) addUnique(explanation, 'High-quality references support reliability of evidence.');
  if (evidenceStrength.detail.lowQualityShare >= 0.34) addUnique(caveats, 'Reference quality is uneven across submissions.');

  if (careerConsistency.score >= 0.6) addUnique(explanation, 'Career trajectory appears reasonably consistent across references.');
  else addUnique(caveats, 'Career trajectory signals are sparse.');

  let trustAdjustment = null;
  try {
    const trustWeighting = await computeCandidateTrustWeights(candidateId);
    const boundedDelta = clamp((trustWeighting.weightedScore - trustWeighting.baseScore) * 0.15, -0.03, 0.03);
    roleFitScore += boundedDelta;
    trustAdjustment = {
      appliedDelta: roundTo3(Math.abs(boundedDelta)),
      direction: boundedDelta >= 0 ? 'increase' : 'decrease',
      weightedScore: roundScore(trustWeighting.weightedScore),
      baseScore: roundScore(trustWeighting.baseScore)
    };
    if (Math.abs(boundedDelta) > 0.005) {
      addUnique(explanation, 'Trust weighting slightly adjusted the final score without overriding direct fit evidence.');
    }
  } catch {
    addUnique(caveats, 'Trust weighting was unavailable, so no trust adjustment was applied.');
  }

  if (Number.isFinite(hrScore)) {
    addUnique(explanation, 'Existing HRScore was retrieved as supplementary context but did not replace role-fit components.');
  }

  const requiredSkillCeiling = applyRequiredSkillCeiling(
    roleFitScore,
    skillMatch.detail.requiredScore,
    roleDefinition.requiredSkills.length
  );
  roleFitScore = requiredSkillCeiling.score;

  if (requiredSkillCeiling.wasReduced) {
    addUnique(caveats, 'Low overlap with required skills capped the final fit assessment.');
  }

  return {
    candidateId,
    roleFitScore,
    band: deriveBand(roleFitScore),
    components: {
      skillMatch: skillMatch.score,
      experienceAlignment: experienceAlignment.score,
      evidenceStrength: evidenceStrength.score,
      careerConsistency: careerConsistency.score
    },
    explanation,
    caveats,
    diagnostics: {
      inputRoleDefinition: roleDefinitionInput,
      roleDefinition,
      referencesAnalyzed: references.length,
      hrScore,
      skillMatch: skillMatch.detail,
      experienceAlignment: experienceAlignment.detail,
      evidenceStrength: evidenceStrength.detail,
      careerConsistency: careerConsistency.detail,
      trustAdjustment,
      requiredSkillCeiling,
      referenceQuality: qualityResults.map((item) => ({ referenceId: item.referenceId, qualityScore: item.qualityScore, band: item.band }))
    }
  };
}

export default {
  computeRoleFitScore,
  computeSkillMatch,
  computeExperienceAlignment,
  computeEvidenceStrength,
  computeCareerConsistency,
  applyRequiredSkillCeiling,
  clampScore,
  roundTo3,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};
