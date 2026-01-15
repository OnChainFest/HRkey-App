/**
 * Tokenomics Preparation Layer
 * USDC-only revenue splitting.
 * NOTE: HRK is NOT used for marketplace pricing - it's a utility token for participation rights.
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

export default {
  splitRevenue
};
