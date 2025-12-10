import {
  calculateTokenAmount,
  splitRevenue,
  estimateStakingRewards
} from '../../services/tokenomicsPreparation.service.js';

describe('Tokenomics Preparation Service', () => {
  describe('calculateTokenAmount', () => {
    test('converts USD to HRK tokens with default clamping', () => {
      const result = calculateTokenAmount({ priceUsd: 100, fxRateUsdToHrk: 10 });
      expect(result.rawTokens).toBe(1000);
      expect(result.clampedTokens).toBe(1000);
    });

    test('applies clamping for values outside min and max bounds', () => {
      const low = calculateTokenAmount({ priceUsd: 0.01, fxRateUsdToHrk: 10, minTokens: 5 });
      expect(low.rawTokens).toBe(0.1);
      expect(low.clampedTokens).toBe(5);

      const high = calculateTokenAmount({ priceUsd: 10_000, fxRateUsdToHrk: 2, maxTokens: 5000 });
      expect(high.rawTokens).toBe(20_000);
      expect(high.clampedTokens).toBe(5000);
    });

    test('returns zeros when price or fx rate are non-positive', () => {
      expect(calculateTokenAmount({ priceUsd: 0, fxRateUsdToHrk: 10 })).toEqual({ rawTokens: 0, clampedTokens: 0 });
      expect(calculateTokenAmount({ priceUsd: 100, fxRateUsdToHrk: 0 })).toEqual({ rawTokens: 0, clampedTokens: 0 });
      expect(calculateTokenAmount({ priceUsd: -50, fxRateUsdToHrk: -2 })).toEqual({ rawTokens: 0, clampedTokens: 0 });
    });
  });

  describe('splitRevenue', () => {
    test('splits revenue with normalized percentages that sum to 1', () => {
      const result = splitRevenue({ priceUsd: 100, platformSharePct: 0.4, referenceSharePct: 0.4, candidateSharePct: 0.2 });
      expect(result.platformUsd).toBeCloseTo(40);
      expect(result.referencePoolUsd).toBeCloseTo(40);
      expect(result.candidateUsd).toBeCloseTo(20);
      expect(result.normalizedPcts.platform).toBeCloseTo(0.4);
      expect(result.normalizedPcts.referencePool).toBeCloseTo(0.4);
      expect(result.normalizedPcts.candidate).toBeCloseTo(0.2);
    });

    test('normalizes revenue shares that do not sum to 1', () => {
      const result = splitRevenue({ priceUsd: 200, platformSharePct: 0.5, referenceSharePct: 0.5, candidateSharePct: 0.5 });
      expect(result.normalizedPcts.platform).toBeCloseTo(1 / 3);
      expect(result.normalizedPcts.referencePool).toBeCloseTo(1 / 3);
      expect(result.normalizedPcts.candidate).toBeCloseTo(1 / 3);
      expect(result.platformUsd).toBeCloseTo(200 / 3, 2);
      expect(result.referencePoolUsd).toBeCloseTo(200 / 3, 2);
      expect(result.candidateUsd).toBeCloseTo(200 / 3, 2);
      expect(result.totalUsd).toBe(200);
    });

    test('returns zero amounts for non-positive price values', () => {
      const result = splitRevenue({ priceUsd: -10, platformSharePct: 0.4, referenceSharePct: 0.4, candidateSharePct: 0.2 });
      expect(result.platformUsd).toBe(0);
      expect(result.referencePoolUsd).toBe(0);
      expect(result.candidateUsd).toBe(0);
      expect(result.totalUsd).toBe(0);
    });
  });

  describe('estimateStakingRewards', () => {
    test('estimates rewards for a one-year stake without boost', () => {
      const result = estimateStakingRewards({ stakeAmountHrk: 1000, baseApr: 0.12, lockMonths: 12, hrScoreBoost: 0 });
      expect(result.effectiveApr).toBeCloseTo(0.12);
      expect(result.estimatedRewardsHrk).toBeCloseTo(120);
    });

    test('applies HRScore boost to effective APR and rewards', () => {
      const result = estimateStakingRewards({ stakeAmountHrk: 1000, baseApr: 0.12, lockMonths: 12, hrScoreBoost: 0.25 });
      expect(result.effectiveApr).toBeCloseTo(0.15);
      expect(result.estimatedRewardsHrk).toBeCloseTo(150);
    });

    test('scales rewards with shorter lock periods', () => {
      const result = estimateStakingRewards({ stakeAmountHrk: 1000, baseApr: 0.12, lockMonths: 6, hrScoreBoost: 0 });
      expect(result.effectiveApr).toBeCloseTo(0.12);
      expect(result.estimatedRewardsHrk).toBeCloseTo(60);
    });

    test('returns zeros for invalid staking inputs', () => {
      expect(estimateStakingRewards({ stakeAmountHrk: 0, baseApr: 0.1, lockMonths: 12 })).toEqual({ effectiveApr: 0, estimatedRewardsHrk: 0 });
      expect(estimateStakingRewards({ stakeAmountHrk: 1000, baseApr: 0, lockMonths: 12 })).toEqual({ effectiveApr: 0, estimatedRewardsHrk: 0 });
      expect(estimateStakingRewards({ stakeAmountHrk: 1000, baseApr: 0.1, lockMonths: 0 })).toEqual({ effectiveApr: 0, estimatedRewardsHrk: 0 });
    });
  });
});
