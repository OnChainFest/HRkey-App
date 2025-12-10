/**
 * Tokenomics Preparation Layer
 * Converts USD pricing into HRK token amounts, splits revenue, and estimates staking rewards.
 */

/**
 * Clamp a numeric value between a minimum and maximum range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * @typedef {Object} TokenAmountInput
 * @property {number} priceUsd - price to access references in USD
 * @property {number} fxRateUsdToHrk - tokens per 1 USD
 * @property {number} [minTokens] - minimum token clamp (default 1)
 * @property {number} [maxTokens] - maximum token clamp (default 10_000)
 */

/**
 * @typedef {Object} TokenAmountResult
 * @property {number} rawTokens - un-clamped token conversion
 * @property {number} clampedTokens - token amount clamped to bounds
 */

/**
 * Convert USD price to HRK token amount with optional clamping.
 * @param {TokenAmountInput} input
 * @returns {TokenAmountResult}
 */
export function calculateTokenAmount(input) {
  const minTokens = input.minTokens ?? 1;
  const maxTokens = input.maxTokens ?? 10_000;

  if (input.priceUsd <= 0 || input.fxRateUsdToHrk <= 0) {
    return {
      rawTokens: 0,
      clampedTokens: 0
    };
  }

  const rawTokens = input.priceUsd * input.fxRateUsdToHrk;
  const clampedTokens = clamp(rawTokens, minTokens, maxTokens);

  return { rawTokens, clampedTokens };
}

/**
 * @typedef {Object} RevenueSplitInput
 * @property {number} priceUsd
 * @property {number} platformSharePct
 * @property {number} referenceSharePct
 * @property {number} candidateSharePct
 */

/**
 * @typedef {Object} RevenueSplitResult
 * @property {number} platformUsd
 * @property {number} referencePoolUsd
 * @property {number} candidateUsd
 * @property {number} totalUsd
 * @property {{ platform: number; referencePool: number; candidate: number }} normalizedPcts
 */

/**
 * Split priceUsd into platform / reference providers / candidate shares.
 * Percentages are normalized proportionally if they do not sum to 1.
 * @param {RevenueSplitInput} input
 * @returns {RevenueSplitResult}
 */
export function splitRevenue(input) {
  if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
    const normalizedPcts = normalizeShares(input);
    return {
      platformUsd: 0,
      referencePoolUsd: 0,
      candidateUsd: 0,
      totalUsd: 0,
      normalizedPcts
    };
  }

  const normalizedPcts = normalizeShares(input);

  const platformUsd = input.priceUsd * normalizedPcts.platform;
  const referencePoolUsd = input.priceUsd * normalizedPcts.referencePool;
  const candidateUsd = input.priceUsd * normalizedPcts.candidate;

  return {
    platformUsd,
    referencePoolUsd,
    candidateUsd,
    totalUsd: input.priceUsd,
    normalizedPcts
  };
}

function normalizeShares(input) {
  const sum = (input.platformSharePct ?? 0) + (input.referenceSharePct ?? 0) + (input.candidateSharePct ?? 0);

  if (!Number.isFinite(sum) || sum <= 0) {
    return {
      platform: 0.5,
      referencePool: 0.3,
      candidate: 0.2
    };
  }

  return {
    platform: (input.platformSharePct ?? 0) / sum,
    referencePool: (input.referenceSharePct ?? 0) / sum,
    candidate: (input.candidateSharePct ?? 0) / sum
  };
}

/**
 * @typedef {Object} StakingInput
 * @property {number} stakeAmountHrk
 * @property {number} baseApr
 * @property {number} lockMonths
 * @property {number} [hrScoreBoost]
 */

/**
 * @typedef {Object} StakingEstimate
 * @property {number} effectiveApr
 * @property {number} estimatedRewardsHrk
 */

/**
 * Estimate staking rewards based on stake amount, APR, lock duration, and optional HRScore boost.
 * @param {StakingInput} input
 * @returns {StakingEstimate}
 */
export function estimateStakingRewards(input) {
  if (input.stakeAmountHrk <= 0 || input.baseApr <= 0 || input.lockMonths <= 0) {
    return {
      effectiveApr: 0,
      estimatedRewardsHrk: 0
    };
  }

  const monthsInYear = 12;
  const hrScoreBoost = clamp(input.hrScoreBoost ?? 0, 0, 1);
  const effectiveApr = clamp(input.baseApr * (1 + hrScoreBoost), 0, 1);
  const lockYears = input.lockMonths / monthsInYear;
  const estimatedRewardsHrk = input.stakeAmountHrk * effectiveApr * lockYears;

  return {
    effectiveApr,
    estimatedRewardsHrk
  };
}

export default {
  calculateTokenAmount,
  splitRevenue,
  estimateStakingRewards
};
