/**
 * Scoring Pipeline Service
 * Orchestrates reference validation, HRScore calculation, and dynamic pricing.
 */

import { validateReferences } from './referenceValidation.service.js';
import { calculateHRScore } from './hrScore.service.js';
import { calculateDynamicPrice } from './dynamicPricing.service.js';

/**
 * @typedef {import('./referenceValidation.service.js').ReferenceAnswerInput} ReferenceAnswerInput
 * @typedef {import('./referenceValidation.service.js').ReferenceValidationResult} ReferenceValidationResult
 */

/**
 * @typedef {Object} CandidateEvaluationResult
 * @property {ReferenceValidationResult} referenceAnalysis
 * @property {{ normalizedScore: number, hrScore: number }} hrScoreResult
 * @property {{ normalizedScore: number, priceUsd: number }} pricingResult
 */

/**
 * Derive a simple reference density heuristic based on reference count.
 * @param {number} referenceCount
 * @returns {number}
 */
function referenceDensityFromCount(referenceCount) {
  if (referenceCount <= 0) return 0;
  if (referenceCount === 1) return 0.3;
  if (referenceCount <= 3) return 0.6;
  return 0.9;
}

/**
 * Evaluate a candidate starting from raw reference answers through pricing.
 * @param {ReferenceAnswerInput[]} answers
 * @returns {CandidateEvaluationResult}
 */
export function evaluateCandidateFromReferences(answers) {
  const referenceAnalysis = validateReferences(Array.isArray(answers) ? answers : []);
  const { aggregatedSignals } = referenceAnalysis;
  const teamImpact = aggregatedSignals?.teamImpact ?? 0;
  const reliability = aggregatedSignals?.reliability ?? 0;
  const communication = aggregatedSignals?.communication ?? 0;

  const hrScoreInput = {
    teamImpact,
    reliability,
    leadership: teamImpact,
    adaptability: (reliability + communication) / 2,
    communication
  };

  const hrScoreResult = calculateHRScore(hrScoreInput);

  const referenceCount = referenceAnalysis.answers?.length ?? 0;
  const pricingInput = {
    skillScarcity: teamImpact,
    recentDemand: 0.5,
    hrScorePercentile: hrScoreResult.normalizedScore,
    referenceDensity: referenceDensityFromCount(referenceCount)
  };

  const pricingResult = calculateDynamicPrice(pricingInput);

  return {
    referenceAnalysis,
    hrScoreResult,
    pricingResult
  };
}

export default {
  evaluateCandidateFromReferences
};
