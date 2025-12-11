import { validateReferences } from '../../services/referenceValidation.service.js';

describe('Reference Validation Layer - validateReferences', () => {
  test('returns empty signals for empty input', () => {
    const result = validateReferences([]);

    expect(result.answers).toEqual([]);
    expect(result.aggregatedSignals).toEqual({
      teamImpact: 0,
      reliability: 0,
      communication: 0
    });
  });

  test('extracts positive signals from a strong reference', () => {
    const result = validateReferences([
      {
        questionId: 'q1',
        answerText: 'Victor is an excellent, reliable teammate who consistently delivers results on time.'
      }
    ]);

    expect(result.answers).toHaveLength(1);
    const answer = result.answers[0];

    expect(answer.positivityFlag).toBe(true);
    expect(answer.negativityFlag).toBe(false);
    expect(answer.exaggerationFlag).toBe(false);

    expect(answer.impactSignal).toBeGreaterThan(0);
    expect(answer.reliabilitySignal).toBeGreaterThan(0);
    expect(answer.communicationSignal).toBeGreaterThanOrEqual(0);

    expect(result.aggregatedSignals.teamImpact).toBeGreaterThan(0);
    expect(result.aggregatedSignals.reliability).toBeGreaterThan(0);
    expect(result.aggregatedSignals.communication).toBeGreaterThanOrEqual(0);
  });

  test('flags exaggerated language', () => {
    const result = validateReferences([
      {
        questionId: 'q2',
        answerText: 'Always perfect and flawless, the best ever team member.'
      }
    ]);

    expect(result.answers[0].exaggerationFlag).toBe(true);
  });

  test('handles mixed positive and negative signals while clamping outputs', () => {
    const result = validateReferences([
      {
        questionId: 'q3',
        answerText: 'Outstanding work ethic but sometimes late, though overall very reliable and great with clients.'
      }
    ]);

    const answer = result.answers[0];
    expect(answer.positivityFlag).toBe(true);
    expect(answer.negativityFlag).toBe(true);
    expect(answer.impactSignal).toBeGreaterThanOrEqual(0);
    expect(answer.impactSignal).toBeLessThanOrEqual(1);
    expect(answer.reliabilitySignal).toBeGreaterThanOrEqual(0);
    expect(answer.reliabilitySignal).toBeLessThanOrEqual(1);
    expect(answer.communicationSignal).toBeGreaterThanOrEqual(0);
    expect(answer.communicationSignal).toBeLessThanOrEqual(1);
  });

  test('normalizes noisy spacing and boosts communication signal when relevant', () => {
    const result = validateReferences([
      {
        questionId: 'q4',
        answerText: '  Great communicator\n\n  and very clear   with clients   '
      }
    ]);

    const answer = result.answers[0];
    expect(answer.cleanedText).toBe('Great communicator and very clear with clients');
    expect(answer.communicationSignal).toBeGreaterThan(0);
    expect(answer.exaggerationFlag).toBe(false);
  });

  test('clamps signals within valid bounds for out-of-range patterns', () => {
    const result = validateReferences([
      {
        questionId: 'q5',
        answerText: 'Weak communicator but reliable and dependable when needed, delivers results.'
      }
    ]);

    const answer = result.answers[0];
    expect(answer.impactSignal).toBeGreaterThanOrEqual(0);
    expect(answer.impactSignal).toBeLessThanOrEqual(1);
    expect(answer.reliabilitySignal).toBeGreaterThanOrEqual(0);
    expect(answer.reliabilitySignal).toBeLessThanOrEqual(1);
    expect(answer.communicationSignal).toBeGreaterThanOrEqual(0);
    expect(answer.communicationSignal).toBeLessThanOrEqual(1);

    expect(result.aggregatedSignals.teamImpact).toBeGreaterThanOrEqual(0);
    expect(result.aggregatedSignals.teamImpact).toBeLessThanOrEqual(1);
    expect(result.aggregatedSignals.reliability).toBeGreaterThanOrEqual(0);
    expect(result.aggregatedSignals.reliability).toBeLessThanOrEqual(1);
    expect(result.aggregatedSignals.communication).toBeGreaterThanOrEqual(0);
    expect(result.aggregatedSignals.communication).toBeLessThanOrEqual(1);
  });
});
