import { evaluateCandidateForUser } from './candidateEvaluation.service.js';
const DEFAULT_CONFIG = {
  pricePrecision: 2
};

/**
 * @typedef {import('./referenceValidation.service.js').ReferenceAnswerInput} ReferenceAnswerInput
 */

/**
 * @typedef {Object} TokenomicsPreviewConfig
 * @property {number} pricePrecision
 */

/**
 * @typedef {Object} TokenomicsPreviewResult
 * @property {string} userId
 * @property {number} priceUsd
 * @property {number} hrScore
 * @property {number} hrScoreNormalized
 */

function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config
  };
}

/**
 * Compute a tokenomics preview for a candidate based on their evaluation.
 *
 * @param {string} userId
 * @param {TokenomicsPreviewConfig} [config]
 * @returns {Promise<TokenomicsPreviewResult>}
 */
export async function getTokenomicsPreviewForUser(userId, config = {}) {
  const trimmedUserId = userId?.trim();
  if (!trimmedUserId) {
    throw new Error('userId is required');
  }

  const resolvedConfig = mergeConfig(config);
  const evaluation = await evaluateCandidateForUser(trimmedUserId);

  const priceUsdRaw = evaluation.scoring?.pricingResult?.priceUsd ?? 0;
  const hrScore = evaluation.scoring?.hrScoreResult?.hrScore ?? 0;
  const hrScoreNormalized = evaluation.scoring?.hrScoreResult?.normalizedScore ?? 0;

  const precision = Number.isFinite(resolvedConfig.pricePrecision)
    ? resolvedConfig.pricePrecision
    : DEFAULT_CONFIG.pricePrecision;
  const priceUsd = Number(priceUsdRaw.toFixed(precision));

  return {
    userId: evaluation.userId,
    priceUsd,
    hrScore,
    hrScoreNormalized
  };
}

export default {
  getTokenomicsPreviewForUser
};
