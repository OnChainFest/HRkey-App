import { jest } from '@jest/globals';

const mockEvaluateCandidateForUser = jest.fn();

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: mockEvaluateCandidateForUser
}));

const { getTokenomicsPreviewForUser } = await import('../../services/tokenomicsPreview.service.js');

describe('Tokenomics Preview Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes preview from evaluation data', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({
      userId: 'user-1',
      scoring: {
        hrScoreResult: { normalizedScore: 0.8, hrScore: 80 },
        pricingResult: { normalizedScore: 0.7, priceUsd: 100 }
      }
    });

    const result = await getTokenomicsPreviewForUser('user-1');

    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-1');
    expect(result.userId).toBe('user-1');
    expect(result.priceUsd).toBe(100);
    expect(result.hrScore).toBe(80);
    expect(result.hrScoreNormalized).toBe(0.8);
    expect(result.tokens).toBeUndefined();
    expect(result.revenueSplit).toBeUndefined();
    expect(result.stakingPreview).toBeUndefined();
  });

  test('handles zero price by returning zeroed economics', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({
      userId: 'user-zero',
      scoring: {
        hrScoreResult: { normalizedScore: 0, hrScore: 0 },
        pricingResult: { normalizedScore: 0, priceUsd: 0 }
      }
    });

    const result = await getTokenomicsPreviewForUser('user-zero');

    expect(result.priceUsd).toBe(0);
    expect(result.hrScoreNormalized).toBe(0);
  });

  test('throws when userId is missing', async () => {
    await expect(getTokenomicsPreviewForUser('')).rejects.toThrow('userId is required');
    expect(mockEvaluateCandidateForUser).not.toHaveBeenCalled();
  });
});
