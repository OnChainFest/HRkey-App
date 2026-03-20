import {
  LOU_PROMPT_VERSION,
  applyGuardrails,
  buildSystemPrompt,
  getNextQuestion,
  processUserMessage,
  startConversation
} from '../../services/louAgent.service.js';

describe('Lou agent core service', () => {
  test('startConversation initializes structured state and asks opening context question', () => {
    const state = startConversation();

    expect(state.phase).toBe('context');
    expect(state.step).toBe(0);
    expect(state.extracted).toEqual({
      relationship: null,
      roleContext: null,
      expectations: [],
      examples: [],
      strengths: [],
      improvements: [],
      feedbackResponse: null
    });
    expect(state.messages[0].type).toBe('system_prompt');
    expect(state.messages[0].version).toBe(LOU_PROMPT_VERSION);
    expect(state.meta.promptVersion).toBe(LOU_PROMPT_VERSION);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toContain('working relationship');
  });

  test('buildSystemPrompt encodes structured interviewer rules', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('You are Lou');
    expect(prompt).toContain('(v1)');
    expect(prompt).toContain('Adler-inspired');
    expect(prompt).toContain('Ask exactly one question at a time');
    expect(prompt).toContain('context, scorecard, evidence, improvement, wrap');
  });

  test('processUserMessage requests specificity for vague answers', () => {
    const state = startConversation();
    const result = processUserMessage(state, 'He was a great employee.');

    expect(result.meta.phaseAdvanced).toBe(false);
    expect(result.meta.reason).toBe('needs_specificity');
    expect(result.response).toContain('title relative to the candidate');
    expect(result.conversationState.phase).toBe('context');
    expect(result.conversationState.step).toBe(0);
  });

  test('processUserMessage advances through phases and stores extracted evidence', () => {
    let state = startConversation();

    state = processUserMessage(
      state,
      'I was her direct manager for two years and worked with her daily on the platform team.'
    ).conversationState;
    expect(state.phase).toBe('context');
    expect(state.step).toBe(1);
    expect(state.extracted.relationship).toContain('direct manager');

    state = processUserMessage(
      state,
      'She was a senior backend engineer responsible for reliability, API delivery, and mentoring two engineers.'
    ).conversationState;
    expect(state.phase).toBe('scorecard');
    expect(state.step).toBe(0);
    expect(state.extracted.roleContext).toContain('senior backend engineer');

    state = processUserMessage(
      state,
      'The most important expectations were 99.95 percent uptime, shipping the partner API by the committed quarter, and coaching two junior engineers to independent delivery.'
    ).conversationState;
    expect(state.phase).toBe('evidence');
    expect(state.extracted.expectations.length).toBeGreaterThan(0);

    const evidenceTurn = processUserMessage(
      state,
      'During a payment migration affecting our highest-volume merchants, she redesigned the retry flow, coordinated rollout across engineering and support, and reduced failed transactions by 28 percent within a single release while keeping support tickets flat.'
    );
    expect(evidenceTurn.meta.phaseAdvanced).toBe(false);
    expect(evidenceTurn.meta.reason).toBe('needs_specificity');
    const evidenceClarificationTurn = processUserMessage(
      evidenceTurn.conversationState,
      'The observable result was a 28 percent reduction in failed transactions, no increase in support load, and a smoother release for our largest merchants.'
    );
    expect(evidenceClarificationTurn.meta.phaseAdvanced).toBe(false);
    state = processUserMessage(
      evidenceClarificationTurn.conversationState,
      'She led the cross-functional rollout, documented the cutover plan, and the result was a 28 percent reduction in failed transactions with no increase in support load.'
    ).conversationState;
    expect(state.phase).toBe('evidence');
    expect(state.step).toBe(1);
    expect(state.extracted.examples.join(' ')).toContain('payment migration');
  });

  test('applyGuardrails removes unsafe or multi-question output', () => {
    expect(applyGuardrails('First question? Second question? Third question?')).toBe('First question?');
    expect(applyGuardrails('Please share their SSN and bank account details.')).toContain('job-related behaviors');
    expect(applyGuardrails('She was a top performer and better than others.')).toContain('observable behaviors');
  });

  test('getNextQuestion returns wrap fallback when prior phase steps are complete', () => {
    const question = getNextQuestion({ phase: 'improvement', step: 99, messages: [], extracted: {} });
    expect(question).toContain('anything important');
  });

  test('processUserMessage enforces balance by collecting strengths before improvements', () => {
    const state = {
      phase: 'improvement',
      step: 0,
      messages: [],
      meta: { promptVersion: LOU_PROMPT_VERSION, followUps: {} },
      extracted: {
        relationship: 'I managed them directly.',
        roleContext: 'Engineering manager.',
        expectations: ['Team delivery'],
        examples: ['Led a major launch'],
        strengths: [],
        improvements: [],
        feedbackResponse: null
      }
    };

    const result = processUserMessage(state, 'They could delegate sooner during planning.');

    expect(result.meta.reason).toBe('missing_strengths');
    expect(result.response).toContain('what strengths did you directly observe');
    expect(result.conversationState.phase).toBe('evidence');
    expect(result.conversationState.step).toBe(1);
  });
});
