/**
 * Dynamic Pricing Engine (DPE)
 * Calculates a normalized score and USD price for candidate data access.
 */

const MIN_PRICE_USD = 10;
const MAX_PRICE_USD = 150;

/**
 * Clamp a numeric value between a minimum and maximum range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * @typedef {Object} DynamicPricingInput
 * @property {number} skillScarcity - 0 = oversupplied, 1 = extremely rare
 * @property {number} recentDemand - 0 = no interest, 1 = very high demand
 * @property {number} hrScorePercentile - 0 = lowest performers, 1 = top performers
 * @property {number} referenceDensity - 0 = few references, 1 = many strong references
 */

/**
 * @typedef {Object} DynamicPricingResult
 * @property {number} normalizedScore - Composite score clamped to [0, 1]
 * @property {number} priceUsd - USD price clamped between MIN_PRICE_USD and MAX_PRICE_USD
 */

/**
 * Calculate a dynamic price for candidate data access based on weighted inputs.
 * @param {DynamicPricingInput} input
 * @returns {DynamicPricingResult}
 */
export function calculateDynamicPrice(input) {
  const skillScarcity = clamp(input.skillScarcity, 0, 1);
  const recentDemand = clamp(input.recentDemand, 0, 1);
  const hrScorePercentile = clamp(input.hrScorePercentile, 0, 1);
  const referenceDensity = clamp(input.referenceDensity, 0, 1);

  let normalizedScore =
    0.35 * skillScarcity +
    0.30 * hrScorePercentile +
    0.20 * recentDemand +
    0.15 * referenceDensity;

  normalizedScore = clamp(normalizedScore, 0, 1);

  const priceUsd = clamp(
    MIN_PRICE_USD + normalizedScore * (MAX_PRICE_USD - MIN_PRICE_USD),
    MIN_PRICE_USD,
    MAX_PRICE_USD
  );

  return {
    normalizedScore,
    priceUsd
  };
}

export default {
  calculateDynamicPrice
};
