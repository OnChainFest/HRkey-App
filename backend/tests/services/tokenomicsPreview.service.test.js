import { jest } from '@jest/globals';

const mockEvaluateCandidateForUser = jest.fn();

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: mockEvaluateCandidateForUser
}));

const mockCalculateTokenAmount = jest.fn();
const mockSplitRevenue = jest.fn();
const mockEstimateStakingRewards = jest.fn();

jest.unstable_mockModule('../../services/tokenomicsPreparation.service.js', () => ({
  calculateTokenAmount: mockCalculateTokenAmount,
  splitRevenue: mockSplitRevenue,
  estimateStakingRewards: mockEstimateStakingRewards
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

    mockCalculateTokenAmount.mockReturnValue({ rawTokens: 1000, clampedTokens: 900 });
    mockSplitRevenue.mockReturnValue({ totalUsd: 100, platformUsd: 40, referencePoolUsd: 40, candidateUsd: 20, normalizedPcts: {} });
    mockEstimateStakingRewards.mockReturnValue({ effectiveApr: 0.15, estimatedRewardsHrk: 135 });

    const result = await getTokenomicsPreviewForUser('user-1');

    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-1');
    expect(result.userId).toBe('user-1');
    expect(result.priceUsd).toBe(100);
    expect(result.hrScore).toBe(80);
    expect(result.tokens.clampedTokens).toBe(900);
    expect(result.revenueSplit.totalUsd).toBe(100);
    expect(result.stakingPreview.estimatedRewardsHrk).toBe(135);
    expect(mockEstimateStakingRewards).toHaveBeenCalledWith({
      stakeAmountHrk: 900,
      baseApr: 0.12,
      lockMonths: 12,
      hrScoreBoost: 0.8
    });
  });

  test('handles zero price by returning zeroed economics', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({
      userId: 'user-zero',
      scoring: {
        hrScoreResult: { normalizedScore: 0, hrScore: 0 },
        pricingResult: { normalizedScore: 0, priceUsd: 0 }
      }
    });

    mockCalculateTokenAmount.mockReturnValue({ rawTokens: 0, clampedTokens: 0 });
    mockSplitRevenue.mockReturnValue({ totalUsd: 0, platformUsd: 0, referencePoolUsd: 0, candidateUsd: 0, normalizedPcts: {} });
    mockEstimateStakingRewards.mockReturnValue({ effectiveApr: 0, estimatedRewardsHrk: 0 });

    const result = await getTokenomicsPreviewForUser('user-zero');

    expect(result.priceUsd).toBe(0);
    expect(result.tokens.clampedTokens).toBe(0);
    expect(result.revenueSplit.totalUsd).toBe(0);
    expect(result.stakingPreview.estimatedRewardsHrk).toBe(0);
  });

  test('applies HRScore boost to staking rewards', async () => {
    mockEvaluateCandidateForUser.mockResolvedValue({
      userId: 'user-boost',
      scoring: {
        hrScoreResult: { normalizedScore: 1, hrScore: 100 },
        pricingResult: { normalizedScore: 1, priceUsd: 50 }
      }
    });

    mockCalculateTokenAmount.mockReturnValue({ rawTokens: 500, clampedTokens: 500 });
    mockSplitRevenue.mockReturnValue({ totalUsd: 50, platformUsd: 20, referencePoolUsd: 20, candidateUsd: 10, normalizedPcts: {} });
    mockEstimateStakingRewards.mockReturnValue({ effectiveApr: 0.2, estimatedRewardsHrk: 100 });

    const result = await getTokenomicsPreviewForUser('user-boost');

    expect(result.hrScoreNormalized).toBe(1);
    expect(mockEstimateStakingRewards).toHaveBeenCalledWith({
      stakeAmountHrk: 500,
      baseApr: 0.12,
      lockMonths: 12,
      hrScoreBoost: 1
    });
    expect(result.stakingPreview.effectiveApr).toBe(0.2);
  });

  test('throws when userId is missing', async () => {
    await expect(getTokenomicsPreviewForUser('')).rejects.toThrow('userId is required');
    expect(mockEvaluateCandidateForUser).not.toHaveBeenCalled();
  });
});
