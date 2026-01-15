import { evaluateCandidateForUser } from './candidateEvaluation.service.js';
import {
  splitRevenue
} from './tokenomicsPreparation.service.js';

// USDC-only marketplace configuration
// HRK is NOT used for pricing - it's a utility token for participation rights
const DEFAULT_CONFIG = {
  platformSharePct: 0.4,
  referenceSharePct: 0.4,
  candidateSharePct: 0.2
};

/**
 * @typedef {import('./referenceValidation.service.js').ReferenceAnswerInput} ReferenceAnswerInput
 */

/**
 * @typedef {Object} TokenomicsPreviewConfig
 * @property {number} platformSharePct
 * @property {number} referenceSharePct
 * @property {number} candidateSharePct
 */

/**
 * @typedef {Object} TokenomicsPreviewResult
 * @property {string} userId
 * @property {number} priceUSDC - Marketplace price in USDC (NOT HRK)
 * @property {number} hrScore
 * @property {number} hrScoreNormalized
 * @property {{
 *   platformUSDC: number,
 *   referencePoolUSDC: number,
 *   candidateUSDC: number,
 *   totalUSDC: number,
 *   normalizedPcts: { platform: number, referencePool: number, candidate: number }
 * }} revenueSplit
 * @property {{
 *   basicTier: { minStakeHRK: number, rateLimit: string },
 *   standardTier: { minStakeHRK: number, rateLimit: string },
 *   premiumTier: { minStakeHRK: number, rateLimit: string }
 * }} stakingCapacity - HRK staking unlocks capacity, NOT rewards
 */

function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config
  };
}

/**
 * Compute a tokenomics preview for a candidate based on their evaluation.
 * USDC-only pricing. HRK is NOT used for marketplace pricing.
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

  // Price is in USDC (stablecoin), NOT HRK
  const priceUSDC = evaluation.scoring?.pricingResult?.priceUsd ?? 0;
  const hrScore = evaluation.scoring?.hrScoreResult?.hrScore ?? 0;
  const hrScoreNormalized = evaluation.scoring?.hrScoreResult?.normalizedScore ?? 0;

  // Revenue split is in USDC
  const revenueSplit = splitRevenue({
    priceUsd: priceUSDC,
    platformSharePct: resolvedConfig.platformSharePct,
    referenceSharePct: resolvedConfig.referenceSharePct,
    candidateSharePct: resolvedConfig.candidateSharePct
  });

  // Staking capacity tiers (NO rewards, just permission/rate limits)
  const stakingCapacity = {
    basicTier: {
      minStakeHRK: 100,
      rateLimit: '10 queries/month',
      description: 'Basic access to protocol'
    },
    standardTier: {
      minStakeHRK: 500,
      rateLimit: '50 queries/month',
      description: 'Standard access + evaluator role'
    },
    premiumTier: {
      minStakeHRK: 2000,
      rateLimit: 'Unlimited queries',
      description: 'Premium access + priority support'
    }
  };

  return {
    userId: evaluation.userId,
    priceUSDC, // USDC pricing, NOT HRK
    hrScore,
    hrScoreNormalized,
    revenueSplit: {
      platformUSDC: revenueSplit.platformUsd,
      referencePoolUSDC: revenueSplit.referencePoolUsd,
      candidateUSDC: revenueSplit.candidateUsd,
      totalUSDC: revenueSplit.totalUsd,
      normalizedPcts: revenueSplit.normalizedPcts
    },
    stakingCapacity, // Staking unlocks capacity, NOT rewards
    note: 'HRK is a utility token for participation rights. Marketplace pricing is USDC-only.'
  };
}

export default {
  getTokenomicsPreviewForUser
};
