import { evaluateCandidateFromReferences } from '../../services/scoringPipeline.service.js';

const EMPTY_REFERENCE_PRICE = 24; // derived from neutral demand + zero signals

describe('Scoring Pipeline Service - evaluateCandidateFromReferences', () => {
  test('returns baseline results for empty references', () => {
    const result = evaluateCandidateFromReferences([]);

    expect(result.referenceAnalysis.answers).toHaveLength(0);
    expect(result.referenceAnalysis.aggregatedSignals).toEqual({
      teamImpact: 0,
      reliability: 0,
      communication: 0
    });
    expect(result.hrScoreResult.hrScore).toBe(0);
    expect(result.hrScoreResult.normalizedScore).toBe(0);
    expect(result.pricingResult.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(result.pricingResult.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.pricingResult.priceUsd).toBeCloseTo(EMPTY_REFERENCE_PRICE, 5);
  });

  test('raises HRScore and price for strong positive references', () => {
    const answers = [
      {
        questionId: 'q1',
        answerText:
          'Julia is an excellent leader who delivered strong impact, reliable and clear with clients.'
      },
      {
        questionId: 'q2',
        answerText: 'Outstanding collaborator with great communication and dependable results.'
      }
    ];

    const result = evaluateCandidateFromReferences(answers);

    expect(result.referenceAnalysis.answers.length).toBe(2);
    expect(result.referenceAnalysis.aggregatedSignals.teamImpact).toBeGreaterThan(0.4);
    expect(result.referenceAnalysis.aggregatedSignals.reliability).toBeGreaterThan(0.3);
    expect(result.referenceAnalysis.aggregatedSignals.communication).toBeGreaterThan(0.3);

    expect(result.hrScoreResult.hrScore).toBeGreaterThan(55);
    expect(result.pricingResult.priceUsd).toBeGreaterThan(EMPTY_REFERENCE_PRICE);
    expect(result.pricingResult.priceUsd).toBeLessThanOrEqual(150);
  });

  test('produces mid-range scores for neutral references', () => {
    const answers = [
      { questionId: 'q1', answerText: 'Solid teammate, gets work done.' },
      { questionId: 'q2', answerText: 'Good communication overall.' }
    ];

    const result = evaluateCandidateFromReferences(answers);

    expect(result.referenceAnalysis.answers.length).toBe(2);
    expect(result.hrScoreResult.hrScore).toBeGreaterThanOrEqual(0);
    expect(result.hrScoreResult.hrScore).toBeLessThanOrEqual(100);
    expect(result.pricingResult.priceUsd).toBeGreaterThan(10);
  });

  test('handles exaggerated references without breaking scoring', () => {
    const answers = [
      {
        questionId: 'q1',
        answerText: 'Always perfect and flawless, the best ever performer with world-class results.'
      }
    ];

    const result = evaluateCandidateFromReferences(answers);

    expect(result.referenceAnalysis.answers[0].exaggerationFlag).toBe(true);
    expect(result.hrScoreResult.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(result.hrScoreResult.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.pricingResult.priceUsd).toBeGreaterThanOrEqual(10);
    expect(result.pricingResult.priceUsd).toBeLessThanOrEqual(150);
  });
});
