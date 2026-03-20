import request from 'supertest';

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const { default: app } = await import('../../server.js');

const authHeaders = {
  'x-test-user-id': 'lou-test-user',
  'x-test-user-email': 'lou@example.com'
};

describe('Lou agent API integration', () => {
  test('supports end-to-end structured conversation flow via API', async () => {
    const startResponse = await request(app)
      .post('/api/lou-agent/start')
      .set(authHeaders)
      .send({});

    expect(startResponse.status).toBe(200);
    expect(startResponse.body.ok).toBe(true);
    expect(startResponse.body.conversationState.phase).toBe('context');
    expect(startResponse.body.conversationState.meta.promptVersion).toBe('v1');

    let conversationState = startResponse.body.conversationState;

    const steps = [
      {
        message: 'I was her direct manager for two years and worked with her every week on the core platform.',
        expectedPhase: 'context',
        expectedStep: 1
      },
      {
        message: 'She was a senior backend engineer responsible for reliability, API delivery, and mentoring two engineers.',
        expectedPhase: 'scorecard',
        expectedStep: 0
      },
      {
        message: 'The role required 99.95 percent uptime, shipping the partner API by the committed quarter, and coaching two junior engineers to independent delivery.',
        expectedPhase: 'evidence',
        expectedStep: 0
      },
      {
        message: 'During a payment migration for our highest-volume merchants, she led the rollout across engineering and support, documented the cutover plan, and the result was a 28 percent reduction in failed transactions with no increase in support load.',
        expectedPhase: 'evidence',
        expectedStep: 1
      },
      {
        message: 'Her strongest patterns were calm execution under pressure, clear ownership, and strong follow-through across partner teams.',
        expectedPhase: 'improvement',
        expectedStep: 0
      },
      {
        message: 'I would coach her to delegate planning decisions earlier so the team can scale without relying on her for every escalation.',
        expectedPhase: 'improvement',
        expectedStep: 1
      },
      {
        message: 'She responded well to direct feedback, usually asking clarifying questions and applying the coaching quickly in the next sprint.',
        expectedPhase: 'wrap',
        expectedStep: 0
      },
      {
        message: 'One more thing: she built trust with stakeholders because her updates were candid, specific, and consistent.',
        expectedCompleted: true
      }
    ];

    for (const step of steps) {
      const response = await request(app)
        .post('/api/lou-agent/message')
        .set(authHeaders)
        .send({ conversationState, message: step.message });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(typeof response.body.response).toBe('string');
      expect(response.body.response.length).toBeGreaterThan(0);
      expect(response.body.conversationState).toBeTruthy();
      expect(response.body.meta).toBeTruthy();

      conversationState = response.body.conversationState;

      if (step.expectedPhase) {
        expect(conversationState.phase).toBe(step.expectedPhase);
        expect(conversationState.step).toBe(step.expectedStep);
      }

      if (step.expectedCompleted) {
        expect(response.body.meta.completed).toBe(true);
      }
    }

    expect(conversationState.extracted.relationship).toContain('direct manager');
    expect(conversationState.extracted.roleContext).toContain('senior backend engineer');
    expect(conversationState.extracted.expectations.length).toBeGreaterThan(0);
    expect(conversationState.extracted.examples.length).toBeGreaterThan(0);
    expect(conversationState.extracted.strengths.length).toBeGreaterThan(0);
    expect(conversationState.extracted.improvements.length).toBeGreaterThan(0);
    expect(conversationState.extracted.feedbackResponse).toContain('responded well');
  });
});
