import { createClient } from '@supabase/supabase-js';

const BAND_THRESHOLDS = Object.freeze({
  limited: 0.45,
  moderate: 0.72
});

const WEIGHTS = Object.freeze({
  specificity: 0.3,
  examples: 0.25,
  clarity: 0.25,
  constructiveTone: 0.2
});

const SPECIFIC_ACTION_VERBS = Object.freeze([
  'built', 'created', 'led', 'managed', 'delivered', 'shipped', 'launched', 'implemented',
  'owned', 'designed', 'improved', 'reduced', 'increased', 'trained', 'mentored', 'supported',
  'coordinated', 'resolved', 'organized', 'drove', 'developed', 'executed', 'partnered'
]);

const ROLE_TERMS = Object.freeze([
  'manager', 'lead', 'engineer', 'designer', 'analyst', 'director', 'supervisor', 'owner',
  'project', 'team', 'department', 'responsible', 'responsibility', 'scope', 'client', 'product',
  'program', 'initiative', 'roadmap', 'release', 'account'
]);

const OUTCOME_TERMS = Object.freeze([
  'result', 'outcome', 'impact', 'delivered', 'improved', 'reduced', 'increased', 'launched',
  'completed', 'saved', 'grew', 'resolved', 'shipped', 'finished', 'deadline', 'efficiency'
]);

const VAGUE_PRAISE_TERMS = Object.freeze([
  'great person', 'good worker', 'nice person', 'hard worker', 'team player', 'great attitude',
  'very good', 'excellent person', 'good employee', 'strong candidate'
]);

const EXAMPLE_PHRASES = Object.freeze([
  'for example', 'such as', 'for instance', 'during', 'when', 'while', 'on one occasion',
  'in one project', 'for a project', 'for the launch', 'for the migration'
]);

const CONSTRUCTIVE_TERMS = Object.freeze([
  'could improve', 'would benefit', 'needs to', 'need to', 'should focus', 'next step',
  'feedback', 'recommend', 'recommended', 'actionable', 'worked on', 'improve', 'improvement'
]);

const HOSTILE_TERMS = Object.freeze([
  'idiot', 'lazy', 'stupid', 'terrible person', 'worthless', 'incompetent', 'awful person',
  'hate', 'useless', 'garbage'
]);

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'they', 'were', 'have', 'their', 'there', 'about',
  'would', 'could', 'should', 'into', 'while', 'which', 'this', 'very', 'really', 'just',
  'good', 'great', 'nice', 'person', 'worker', 'employee', 'candidate', 'was', 'were', 'been',
  'being', 'them', 'then', 'than', 'also', 'because', 'over', 'under', 'into', 'onto', 'able'
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
  const resolvedSupabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

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

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenize(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]*/g) || [];
}

function countMatches(text, terms) {
  const lower = normalizeWhitespace(text).toLowerCase();
  return terms.reduce((count, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return count + (new RegExp(`\\b${escaped}\\b`, 'i').test(lower) ? 1 : 0);
  }, 0);
}

function countRegexMatches(text, pattern) {
  const matches = normalizeWhitespace(text).match(pattern);
  return matches ? matches.length : 0;
}

function buildReferenceText(row) {
  const segments = [];
  if (typeof row?.summary === 'string') {
    segments.push(row.summary);
  }
  if (row?.detailed_feedback && typeof row.detailed_feedback === 'object') {
    for (const value of Object.values(row.detailed_feedback)) {
      if (typeof value === 'string' && value.trim()) {
        segments.push(value);
      }
    }
  }
  return normalizeWhitespace(segments.join(' '));
}

function extractSurfaceSignals(text, metadata = {}) {
  const normalizedText = normalizeWhitespace(text);
  const tokens = tokenize(normalizedText);
  const meaningfulTokens = tokens.filter((token) => token.length > 2 && !STOPWORDS.has(token));
  const uniqueMeaningfulTokens = unique(meaningfulTokens);
  const sentences = splitSentences(normalizedText);
  const avgSentenceLength = sentences.length
    ? meaningfulTokens.length / sentences.length
    : meaningfulTokens.length;

  return {
    metadata,
    normalizedText,
    tokens,
    meaningfulTokens,
    uniqueMeaningfulTokens,
    sentences,
    wordCount: metadata.length || tokens.length,
    charCount: normalizedText.length,
    avgSentenceLength,
    actionVerbCount: countMatches(normalizedText, SPECIFIC_ACTION_VERBS),
    roleTermCount: countMatches(normalizedText, ROLE_TERMS),
    outcomeTermCount: countMatches(normalizedText, OUTCOME_TERMS),
    vaguePraiseCount: countMatches(normalizedText, VAGUE_PRAISE_TERMS),
    examplePhraseCount: countMatches(normalizedText, EXAMPLE_PHRASES),
    timeframeCount: countRegexMatches(normalizedText, /\b\d{4}\b|\bweek\b|\bmonth\b|\bquarter\b|\byear\b|\bsprint\b|\brelease\b/gi),
    repetitionRatio: meaningfulTokens.length
      ? 1 - (uniqueMeaningfulTokens.length / meaningfulTokens.length)
      : 1,
    constructiveTermCount: countMatches(normalizedText, CONSTRUCTIVE_TERMS),
    hostileTermCount: countMatches(normalizedText, HOSTILE_TERMS),
    exclamationCount: countRegexMatches(normalizedText, /!/g),
    uppercaseBurstCount: countRegexMatches(normalizedText, /\b[A-Z]{4,}\b/g),
    hasBulletStyle: /[:;]\s+[a-z0-9]/i.test(normalizedText)
  };
}

export function deriveSpecificityScore(text, metadata = {}) {
  const signals = typeof text === 'string' ? extractSurfaceSignals(text, metadata) : text;
  const lengthSignal = clamp((signals.wordCount - 20) / 80);
  const actionSignal = clamp(signals.actionVerbCount / 3);
  const contextSignal = clamp((signals.roleTermCount + signals.outcomeTermCount) / 4);
  const vocabularySignal = clamp(signals.uniqueMeaningfulTokens.length / 30);
  const vaguePenalty = Math.min(0.35, signals.vaguePraiseCount * 0.12);

  return roundScore(clamp(
    lengthSignal * 0.25 +
    actionSignal * 0.25 +
    contextSignal * 0.3 +
    vocabularySignal * 0.2 -
    vaguePenalty
  ));
}

export function deriveExamplePresenceScore(text, metadata = {}) {
  const signals = typeof text === 'string' ? extractSurfaceSignals(text, metadata) : text;
  const hasExamplePhrase = signals.examplePhraseCount > 0;
  const hasSituationCue = signals.timeframeCount > 0 || /when [a-z]|during [a-z]|after [a-z]|before [a-z]/i.test(signals.normalizedText);
  const hasConcreteNouns = signals.roleTermCount > 0 && signals.actionVerbCount > 0;

  if (hasExamplePhrase && hasSituationCue) return 1;
  if (hasExamplePhrase || (hasSituationCue && hasConcreteNouns)) return 0.7;
  if (hasConcreteNouns && signals.wordCount >= 45) return 0.35;
  return 0;
}

export function deriveClarityScore(text, metadata = {}) {
  const signals = typeof text === 'string' ? extractSurfaceSignals(text, metadata) : text;
  const lengthBand =
    signals.wordCount < 12 ? 0.2
      : signals.wordCount <= 220 ? 1
        : clamp(1 - ((signals.wordCount - 220) / 220), 0.35, 1);
  const sentenceBand = signals.sentences.length === 0
    ? 0.2
    : clamp(1 - (Math.abs(signals.avgSentenceLength - 18) / 24), 0.35, 1);
  const repetitionBand = clamp(1 - (signals.repetitionRatio * 1.4), 0.15, 1);
  const punctuationBand = /[.!?]$/.test(signals.normalizedText) || signals.sentences.length > 1 ? 1 : 0.65;
  const noisyPenalty = Math.min(0.3, (signals.exclamationCount * 0.04) + (signals.uppercaseBurstCount * 0.08));

  return roundScore(clamp(
    lengthBand * 0.3 +
    sentenceBand * 0.3 +
    repetitionBand * 0.25 +
    punctuationBand * 0.15 -
    noisyPenalty
  ));
}

export function deriveConstructiveToneScore(text, metadata = {}) {
  const signals = typeof text === 'string' ? extractSurfaceSignals(text, metadata) : text;
  const professionalismBase = signals.hostileTermCount > 0 ? 0.2 : 0.8;
  const actionableSignal = clamp(signals.constructiveTermCount / 2);
  const balancedSignal = /but|however|while/i.test(signals.normalizedText) && signals.wordCount >= 20 ? 0.2 : 0;
  const vaguePenalty = Math.min(0.25, signals.vaguePraiseCount * 0.08);
  const noisePenalty = Math.min(0.2, signals.exclamationCount * 0.03 + signals.uppercaseBurstCount * 0.06);

  return roundScore(clamp(
    professionalismBase * 0.65 +
    actionableSignal * 0.2 +
    balancedSignal -
    vaguePenalty -
    noisePenalty
  ));
}

function deriveBand(score) {
  if (score >= BAND_THRESHOLDS.moderate) return 'strong';
  if (score >= BAND_THRESHOLDS.limited) return 'moderate';
  return 'limited';
}

export function summarizeReferenceQuality({ dimensions, signals, referenceId = null }) {
  const explanation = [];
  const caveats = [];

  if (dimensions.specificity >= 0.65) {
    explanation.push('Reference includes specific actions, responsibilities, or outcomes.');
  } else if (signals.actionVerbCount > 0 || signals.roleTermCount > 0) {
    explanation.push('Reference includes some concrete work details.');
  }

  if (dimensions.examples >= 0.7) {
    explanation.push('Includes at least one concrete example or situation cue.');
  } else if (dimensions.examples > 0) {
    explanation.push('Includes limited situational detail.');
  }

  if (dimensions.clarity >= 0.65) {
    explanation.push('Feedback is clear and reasonably well-structured.');
  } else if (signals.wordCount >= 12) {
    explanation.push('Feedback is readable enough to use as evidence.');
  }

  if (dimensions.constructiveTone >= 0.65) {
    explanation.push('Tone remains professional and constructive.');
  } else if (signals.hostileTermCount === 0) {
    explanation.push('Tone is not overtly hostile.');
  }

  if (signals.wordCount < 20) {
    caveats.push('Reference is very short, which limits evidence quality.');
  }
  if (dimensions.examples < 0.35) {
    caveats.push('Reference remains general and lacks specific examples.');
  }
  if (dimensions.specificity < 0.45) {
    caveats.push('Some statements are generic rather than tied to concrete work.');
  }
  if (dimensions.constructiveTone < 0.5) {
    caveats.push('Tone is not consistently professional or actionable.');
  }
  if (dimensions.clarity < 0.5) {
    caveats.push('Structure or readability reduces how usable the feedback is.');
  }

  return {
    referenceId,
    explanation: explanation.slice(0, 4),
    caveats: unique(caveats).slice(0, 4)
  };
}

export function computeReferenceQualityFromText(text, metadata = {}) {
  const signals = extractSurfaceSignals(text, metadata);
  const dimensions = {
    specificity: deriveSpecificityScore(signals),
    examples: deriveExamplePresenceScore(signals),
    clarity: deriveClarityScore(signals),
    constructiveTone: deriveConstructiveToneScore(signals)
  };

  const qualityScore = roundScore(clamp(
    dimensions.specificity * WEIGHTS.specificity +
    dimensions.examples * WEIGHTS.examples +
    dimensions.clarity * WEIGHTS.clarity +
    dimensions.constructiveTone * WEIGHTS.constructiveTone
  ));

  const summary = summarizeReferenceQuality({
    dimensions,
    signals,
    referenceId: metadata.referenceId || null
  });
  const caveats = summary.caveats.length > 0
    ? summary.caveats
    : (qualityScore < BAND_THRESHOLDS.limited || signals.wordCount < 20
      ? ['Reference remains general and lacks specific examples.']
      : []);

  return {
    referenceId: metadata.referenceId || null,
    qualityScore,
    band: deriveBand(qualityScore),
    dimensions,
    explanation: summary.explanation,
    caveats
  };
}

export async function computeReferenceQuality(referenceId) {
  const { data, error } = await getSupabaseClient()
    .from('references')
    .select('id, created_at, updated_at, summary, detailed_feedback')
    .eq('id', referenceId)
    .single();

  if (error || !data) {
    const resolvedError = new Error('Reference not found');
    resolvedError.status = error?.code === 'PGRST116' ? 404 : (error?.status || 404);
    throw resolvedError;
  }

  const text = buildReferenceText(data);

  return computeReferenceQualityFromText(text, {
    referenceId: data.id,
    createdAt: data.created_at || null,
    updatedAt: data.updated_at || null,
    length: tokenize(text).length
  });
}

export default {
  computeReferenceQuality,
  computeReferenceQualityFromText,
  deriveSpecificityScore,
  deriveExamplePresenceScore,
  deriveClarityScore,
  deriveConstructiveToneScore,
  summarizeReferenceQuality,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};
