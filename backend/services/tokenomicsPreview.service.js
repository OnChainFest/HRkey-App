import { evaluateCandidateForUser } from './candidateEvaluation.service.js';
import {
  calculateTokenAmount,
  splitRevenue,
  estimateStakingRewards
} from './tokenomicsPreparation.service.js';

const DEFAULT_CONFIG = {
  fxRateUsdToHrk: 10,
  platformSharePct: 0.4,
  referenceSharePct: 0.4,
  candidateSharePct: 0.2,
  baseStakingApr: 0.12,
  defaultLockMonths: 12
};

/**
 * @typedef {import('./referenceValidation.service.js').ReferenceAnswerInput} ReferenceAnswerInput
 */

/**
 * @typedef {Object} TokenomicsPreviewConfig
 * @property {number} fxRateUsdToHrk
 * @property {number} platformSharePct
 * @property {number} referenceSharePct
 * @property {number} candidateSharePct
 * @property {number} baseStakingApr
 * @property {number} defaultLockMonths
 */

/**
 * @typedef {Object} TokenomicsPreviewResult
 * @property {string} userId
 * @property {number} priceUsd
 * @property {number} hrScore
 * @property {number} hrScoreNormalized
 * @property {{ rawTokens: number, clampedTokens: number }} tokens
 * @property {{
 *   platformUsd: number,
 *   referencePoolUsd: number,
 *   candidateUsd: number,
 *   totalUsd: number,
 *   normalizedPcts: { platform: number, referencePool: number, candidate: number }
 * }} revenueSplit
 * @property {{
 *   effectiveApr: number,
 *   estimatedRewardsHrk: number,
 *   stakeAmountHrk: number,
 *   lockMonths: number
 * }} stakingPreview
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

  const priceUsd = evaluation.scoring?.pricingResult?.priceUsd ?? 0;
  const hrScore = evaluation.scoring?.hrScoreResult?.hrScore ?? 0;
  const hrScoreNormalized = evaluation.scoring?.hrScoreResult?.normalizedScore ?? 0;

  const tokens = calculateTokenAmount({
    priceUsd,
    fxRateUsdToHrk: resolvedConfig.fxRateUsdToHrk
  });

  const revenueSplit = splitRevenue({
    priceUsd,
    platformSharePct: resolvedConfig.platformSharePct,
    referenceSharePct: resolvedConfig.referenceSharePct,
    candidateSharePct: resolvedConfig.candidateSharePct
  });

  const stakingPreview = estimateStakingRewards({
    stakeAmountHrk: tokens.clampedTokens,
    baseApr: resolvedConfig.baseStakingApr,
    lockMonths: resolvedConfig.defaultLockMonths,
    hrScoreBoost: hrScoreNormalized
  });

  return {
    userId: evaluation.userId,
    priceUsd,
    hrScore,
    hrScoreNormalized,
    tokens,
    revenueSplit,
    stakingPreview: {
      ...stakingPreview,
      stakeAmountHrk: tokens.clampedTokens,
      lockMonths: resolvedConfig.defaultLockMonths
    }
  };
}

export default {
  getTokenomicsPreviewForUser
};
