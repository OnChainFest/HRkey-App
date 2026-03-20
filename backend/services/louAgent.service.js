import logger from '../logger.js';

export const LOU_PROMPT_VERSION = 'v1';

const PHASES = Object.freeze(['context', 'scorecard', 'evidence', 'improvement', 'wrap']);

const PHASE_ORDER = Object.freeze({
  context: 0,
  scorecard: 1,
  evidence: 2,
  improvement: 3,
  wrap: 4
});

const FOLLOW_UP_LIMIT = 2;
const MAX_MESSAGE_LENGTH = 4000;

const QUESTION_FLOW = Object.freeze({
  context: [
    {
      key: 'relationship',
      prompt: 'To start, what was your working relationship with the candidate, and how closely did you work together?'
    },
    {
      key: 'roleContext',
      prompt: 'What role or scope were they responsible for while you worked with them?'
    }
  ],
  scorecard: [
    {
      key: 'expectations',
      prompt: 'What were the two or three most important expectations or outcomes for them in that role?'
    }
  ],
  evidence: [
    {
      key: 'examples',
      prompt: 'Tell me about one specific example that shows how they performed against those expectations. What was the situation, what did they do, and what was the result?'
    },
    {
      key: 'strengths',
      prompt: 'Based on what you observed directly, what are the strongest patterns or strengths they demonstrated?'
    }
  ],
  improvement: [
    {
      key: 'improvements',
      prompt: 'Where would you coach them to improve next? Please share one concrete development area and what better performance would look like.'
    },
    {
      key: 'feedbackResponse',
      prompt: 'How did they typically respond when given candid feedback or coaching?'
    }
  ],
  wrap: [
    {
      key: 'wrap',
      prompt: 'Is there anything important about their performance, judgment, or work style that we have not covered yet?'
    }
  ]
});

const GENERIC_PATTERNS = Object.freeze([
  /\b(great|good|excellent|amazing|strong)\s+(employee|person|worker|candidate|teammate)\b/i,
  /\b(team player|hard worker|great attitude|nice person)\b/i,
  /^yes[.!]?$/i,
  /^no[.!]?$/i,
  /^not sure[.!]?$/i
]);

const UNSAFE_PATTERNS = Object.freeze([
  /\b(ssn|social security|passport|driver'?s license|bank account|credit card)\b/i,
  /\b(race|religion|pregnan|disability|medical condition|sexual orientation|political affiliation)\b/i
]);

const RANKING_PATTERNS = Object.freeze([
  /\btop performer\b/i,
  /\bbest candidate\b/i,
  /\bbetter than others\b/i,
  /\babove average\b/i,
  /\bnumber one\b/i,
  /\boutperform(ed|s|ing)?\b/i
]);

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => normalizeWhitespace(item)).filter(Boolean))];
}

function createEmptyExtracted() {
  return {
    relationship: null,
    roleContext: null,
    expectations: [],
    examples: [],
    strengths: [],
    improvements: [],
    feedbackResponse: null
  };
}

function createMessage(role, content, meta = {}) {
  return {
    role,
    content: normalizeWhitespace(content),
    timestamp: new Date().toISOString(),
    ...meta
  };
}

function getStepConfig(phase, step = 0) {
  return QUESTION_FLOW[phase]?.[step] || null;
}

function getNextPhase(phase) {
  const currentIndex = PHASE_ORDER[phase] ?? 0;
  return PHASES[currentIndex + 1] || 'wrap';
}

function cloneState(state = {}) {
  return {
    phase: PHASES.includes(state.phase) ? state.phase : 'context',
    step: Number.isInteger(state.step) && state.step >= 0 ? state.step : 0,
    messages: Array.isArray(state.messages) ? [...state.messages] : [],
    meta: {
      followUps: { ...(state.meta?.followUps || {}) },
      promptVersion: state.meta?.promptVersion || LOU_PROMPT_VERSION
    },
    extracted: {
      ...createEmptyExtracted(),
      ...(state.extracted || {}),
      expectations: [...(state.extracted?.expectations || [])],
      examples: [...(state.extracted?.examples || [])],
      strengths: [...(state.extracted?.strengths || [])],
      improvements: [...(state.extracted?.improvements || [])]
    }
  };
}

function shouldProbeForSpecificity(userMessage, phase, stepConfig) {
  const normalized = normalizeWhitespace(userMessage);
  if (!normalized) return true;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const genericMatch = GENERIC_PATTERNS.some((pattern) => pattern.test(normalized));

  if (phase === 'evidence' && stepConfig?.key === 'examples') {
    const hasAction = /\b(led|built|improved|delivered|resolved|created|managed|launched|reduced|increased|designed|implemented|supported)\b/i.test(normalized);
    const hasOutcome = /\b(result|impact|outcome|deadline|revenue|quality|customer|team|metric|launch|delivery|transaction|ticket|uptime|retention|conversion|cost)\b/i.test(normalized);
    return wordCount < 25 || !hasAction || !hasOutcome || genericMatch;
  }

  return wordCount < 10 || genericMatch;
}

function buildProbeQuestion(phase, stepConfig) {
  if (phase === 'context' && stepConfig?.key === 'relationship') {
    return 'What was your title relative to the candidate, how long did you work together, and was the relationship direct or dotted-line?';
  }

  if (phase === 'scorecard') {
    return 'Please name the most important outcomes you expected from them—ideally two or three concrete responsibilities or success measures.';
  }

  if (phase === 'evidence' && stepConfig?.key === 'examples') {
    return 'Can you make that more concrete with one situation, the actions they took, and the measurable or observable result?';
  }

  if (phase === 'improvement') {
    return 'What specific behavior or skill would you coach, and what stronger performance would you want to see instead?';
  }

  return 'Can you make that a bit more specific based on what you directly observed?';
}

function appendExtractedValue(extracted, key, value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return extracted;

  if (Array.isArray(extracted[key])) {
    extracted[key] = uniqueStrings([...extracted[key], ...splitListLikeAnswer(normalized)]);
    return extracted;
  }

  extracted[key] = normalized;
  return extracted;
}

function splitListLikeAnswer(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];

  const segments = normalized
    .split(/(?:\s*;\s*|\s*\n\s*|\s*,\s*(?=(?:[^,]{0,60}\b(?:and|or)\b)?))/)
    .map((segment) => normalizeWhitespace(segment.replace(/^[-•\d.)\s]+/, '')))
    .filter(Boolean);

  return segments.length ? segments : [normalized];
}

function detectUnsafeContent(text) {
  const normalized = normalizeWhitespace(text);
  return UNSAFE_PATTERNS.find((pattern) => pattern.test(normalized)) || null;
}

export function buildSystemPrompt() {
  return [
    `You are Lou, the HRKey Structured Feedback Agent (${LOU_PROMPT_VERSION}).`,
    'You are not a chatbot and you are not a casual conversational assistant.',
    'Your job is to run a disciplined professional reference interview that extracts evidence instead of vague opinion.',
    'Use an Adler-inspired, performance-based interviewing philosophy: clarify the scorecard, anchor claims in observable behavior, and separate evidence from interpretation.',
    'Rules:',
    '1. Ask exactly one question at a time.',
    '2. Move through the phases in order: context, scorecard, evidence, improvement, wrap.',
    '3. Prefer direct observation, concrete examples, behaviors, and outcomes.',
    '4. If the user is vague, ask a short follow-up that requests specifics.',
    '5. Do not ask for protected characteristics, medical details, financial account numbers, government IDs, or unrelated personal data.',
    '6. Keep the tone constructive, mature, non-evaluative, and professionally neutral.',
    '7. Never produce rankings, league-table comparisons, or absolute judgments.',
    '8. Ground adjectives like great, strong, or weak into examples, behaviors, and outcomes.',
    '9. Balance feedback by covering both strengths and improvement areas before closing.',
    '10. Do not generate a final summary unless the wrap phase is complete.',
    '11. If prior answers already cover a question, acknowledge briefly and advance instead of repeating.'
  ].join('\n');
}

export function startConversation() {
  const state = {
    phase: 'context',
    step: 0,
    messages: [],
    meta: {
      followUps: {},
      promptVersion: LOU_PROMPT_VERSION
    },
    extracted: createEmptyExtracted()
  };

  const openingQuestion = getNextQuestion(state);
  state.messages.push(createMessage('system', buildSystemPrompt(), {
    type: 'system_prompt',
    version: LOU_PROMPT_VERSION
  }));
  state.messages.push(createMessage('assistant', openingQuestion, { phase: state.phase, step: state.step }));

  return state;
}

export function getNextQuestion(conversationState) {
  const state = cloneState(conversationState);
  const stepConfig = getStepConfig(state.phase, state.step);

  if (stepConfig) {
    return stepConfig.prompt;
  }

  if (state.phase !== 'wrap') {
    const nextPhase = getNextPhase(state.phase);
    const nextConfig = getStepConfig(nextPhase, 0);
    return nextConfig?.prompt || QUESTION_FLOW.wrap[0].prompt;
  }

  return 'Thank you. That gives us a structured, evidence-based reference.';
}

export function applyGuardrails(response) {
  const normalized = normalizeWhitespace(response);
  if (!normalized) {
    return 'Could you share a specific example you observed?';
  }

  let guarded = normalized
    .replace(/\b(as an ai|i am an ai|i cannot help with that as an ai)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (guarded.split('?').length - 1 > 1) {
    guarded = `${guarded.split('?')[0].trim()}?`;
  }

  const unsafeMatch = detectUnsafeContent(guarded);
  if (unsafeMatch) {
    return 'Please focus on job-related behaviors, performance, and outcomes rather than sensitive personal information.';
  }

  const rankingMatch = RANKING_PATTERNS.find((pattern) => pattern.test(guarded));
  if (rankingMatch) {
    return 'Please focus on observable behaviors and outcomes rather than comparative or ranking language.';
  }

  if (guarded.length > 500) {
    guarded = `${guarded.slice(0, 497).trim()}...`;
  }

  return guarded || 'Could you share a specific example you observed?';
}

export function processUserMessage(conversationState, userMessage) {
  const state = cloneState(conversationState);
  const normalizedUserMessage = normalizeWhitespace(userMessage).slice(0, MAX_MESSAGE_LENGTH);
  const stepConfig = getStepConfig(state.phase, state.step);
  const followUpKey = `${state.phase}:${state.step}`;
  const followUpCount = Number.isInteger(state.meta?.followUps?.[followUpKey])
    ? state.meta.followUps[followUpKey]
    : 0;

  state.messages.push(createMessage('user', normalizedUserMessage, { phase: state.phase, step: state.step }));

  const unsafeMatch = detectUnsafeContent(normalizedUserMessage);
  if (unsafeMatch) {
    const safeResponse = applyGuardrails('Please focus on job-related behaviors, performance, and outcomes rather than sensitive personal information.');
    state.messages.push(createMessage('assistant', safeResponse, {
      phase: state.phase,
      step: state.step,
      type: 'guardrail'
    }));

    return {
      conversationState: state,
      response: safeResponse,
      meta: { phaseAdvanced: false, reason: 'unsafe_content' }
    };
  }

  if (stepConfig?.key && stepConfig.key !== 'wrap') {
    appendExtractedValue(state.extracted, stepConfig.key, normalizedUserMessage);
  }

  if (
    state.phase === 'improvement' &&
    state.extracted.strengths.length === 0 &&
    stepConfig?.key !== 'strengths'
  ) {
    state.phase = 'evidence';
    state.step = 1;

    const strengthsRedirect = applyGuardrails(
      'Before we move forward, what strengths did you directly observe in their performance?'
    );
    state.messages.push(createMessage('assistant', strengthsRedirect, {
      phase: state.phase,
      step: state.step,
      type: 'balance_redirect'
    }));

    return {
      conversationState: state,
      response: strengthsRedirect,
      meta: { phaseAdvanced: false, reason: 'missing_strengths', phase: state.phase, step: state.step }
    };
  }

  if (shouldProbeForSpecificity(normalizedUserMessage, state.phase, stepConfig) && followUpCount < FOLLOW_UP_LIMIT) {
    const followUp = applyGuardrails(buildProbeQuestion(state.phase, stepConfig));
    state.meta.followUps[followUpKey] = followUpCount + 1;
    state.messages.push(createMessage('assistant', followUp, {
      phase: state.phase,
      step: state.step,
      type: 'follow_up'
    }));

    return {
      conversationState: state,
      response: followUp,
      meta: { phaseAdvanced: false, reason: 'needs_specificity' }
    };
  }

  if (stepConfig?.key === 'wrap') {
    const closingMessage = applyGuardrails('Thank you. That gives us a structured, evidence-based reference.');
    state.messages.push(createMessage('assistant', closingMessage, {
      phase: state.phase,
      step: state.step,
      type: 'closing'
    }));

    return {
      conversationState: state,
      response: closingMessage,
      meta: { phaseAdvanced: false, completed: true }
    };
  }

  const currentPhaseSteps = QUESTION_FLOW[state.phase] || [];
  state.meta.followUps[followUpKey] = 0;
  if (state.step < currentPhaseSteps.length - 1) {
    state.step += 1;
  } else {
    state.phase = getNextPhase(state.phase);
    state.step = 0;
  }

  if (
    state.phase === 'wrap' &&
    state.extracted.examples.length > 0 &&
    state.extracted.improvements.length === 0
  ) {
    state.phase = 'improvement';
    state.step = 0;
  }

  const nextQuestion = applyGuardrails(getNextQuestion(state));
  state.messages.push(createMessage('assistant', nextQuestion, {
    phase: state.phase,
    step: state.step,
    type: 'question'
  }));

  logger.debug('Lou agent advanced conversation', {
    phase: state.phase,
    step: state.step,
    extractedKeys: Object.entries(state.extracted)
      .filter(([, value]) => Array.isArray(value) ? value.length > 0 : !!value)
      .map(([key]) => key)
  });

  return {
    conversationState: state,
    response: nextQuestion,
    meta: { phaseAdvanced: true, phase: state.phase, step: state.step }
  };
}

export default {
  startConversation,
  processUserMessage,
  getNextQuestion,
  buildSystemPrompt,
  applyGuardrails
};
