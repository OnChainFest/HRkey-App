/**
 * Consistency Checker Service
 *
 * Detects contradictions and inconsistencies across multiple references
 * for the same candidate. Uses KPI rating variance and semantic similarity.
 *
 * @module services/validation/consistencyChecker
 */

import { cosineSimilarity } from './embeddingService.js';
import logger from '../../logger.js';

// Thresholds for consistency scoring
const CONSISTENCY_THRESHOLDS = {
  kpi_variance_max: 1.5,        // Max acceptable std dev in KPI ratings
  semantic_similarity_min: 0.6, // Min cosine similarity for consistent narratives
  rating_diff_warning: 2.0      // Flag if any KPI differs by more than this
};

/**
 * Checks consistency between current reference and previous references.
 *
 * @param {string} currentNarrative - Standardized narrative text
 * @param {Object} currentKpiRatings - Current KPI ratings { kpi_name: rating }
 * @param {Array<Object>} previousReferences - Array of previous reference objects
 * @returns {Promise<Object>} Consistency analysis result
 *
 * @example
 * const result = await checkConsistency(
 *   "John was excellent...",
 *   { teamwork: 5, leadership: 4 },
 *   [{ summary: "...", kpi_ratings: {...}, validated_data: {...} }]
 * );
 * // Returns: { consistency_score: 0.85, flags: [], details: {...} }
 */
export async function checkConsistency(currentNarrative, currentKpiRatings, previousReferences) {
  if (!previousReferences || previousReferences.length === 0) {
    return {
      consistency_score: 1.0,
      flags: [],
      details: {
        message: 'No previous references to compare',
        compared_count: 0
      }
    };
  }

  logger.debug('Checking consistency', {
    previous_count: previousReferences.length,
    current_kpis: Object.keys(currentKpiRatings)
  });

  const flags = [];
  const details = {
    compared_count: previousReferences.length,
    kpi_analysis: {},
    semantic_analysis: {}
  };

  // Analysis 1: KPI Rating Consistency
  const kpiConsistencyScore = analyzeKpiConsistency(
    currentKpiRatings,
    previousReferences,
    flags,
    details
  );

  // Analysis 2: Semantic Consistency (using embeddings if available)
  const semanticConsistencyScore = await analyzeSemanticConsistency(
    currentNarrative,
    previousReferences,
    flags,
    details
  );

  // Combined consistency score (weighted average)
  const consistencyScore = (kpiConsistencyScore * 0.6) + (semanticConsistencyScore * 0.4);

  // Add overall flag if consistency is low
  if (consistencyScore < CONSISTENCY_THRESHOLDS.semantic_similarity_min) {
    flags.push({
      type: 'LOW_CONSISTENCY',
      severity: 'warning',
      message: `Overall consistency score is low (${consistencyScore.toFixed(2)})`,
      score: consistencyScore
    });
  }

  logger.debug('Consistency check complete', {
    consistency_score: consistencyScore,
    flags_count: flags.length
  });

  return {
    consistency_score: Number(consistencyScore.toFixed(4)),
    flags,
    details
  };
}

/**
 * Analyzes consistency of KPI ratings across references.
 *
 * @private
 * @param {Object} currentKpiRatings - Current KPI ratings
 * @param {Array<Object>} previousReferences - Previous references
 * @param {Array} flags - Flags array to populate
 * @param {Object} details - Details object to populate
 * @returns {number} KPI consistency score (0-1)
 */
function analyzeKpiConsistency(currentKpiRatings, previousReferences, flags, details) {
  const kpiScores = {};
  const allKpis = new Set(Object.keys(currentKpiRatings));

  // Collect all KPI names from previous references
  previousReferences.forEach(ref => {
    if (ref.kpi_ratings) {
      Object.keys(ref.kpi_ratings).forEach(kpi => allKpis.add(kpi));
    }
  });

  // Calculate variance for each KPI
  allKpis.forEach(kpiName => {
    const ratings = [];

    // Add current rating
    if (currentKpiRatings[kpiName] !== undefined) {
      ratings.push(currentKpiRatings[kpiName]);
    }

    // Add previous ratings
    previousReferences.forEach(ref => {
      if (ref.kpi_ratings && ref.kpi_ratings[kpiName] !== undefined) {
        ratings.push(ref.kpi_ratings[kpiName]);
      }
    });

    if (ratings.length < 2) {
      // Not enough data for this KPI
      kpiScores[kpiName] = { score: 1.0, variance: 0, count: ratings.length };
      return;
    }

    // Calculate mean and variance
    const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
    const stdDev = Math.sqrt(variance);

    // Check for large deviations
    const currentRating = currentKpiRatings[kpiName];
    if (currentRating !== undefined) {
      const deviation = Math.abs(currentRating - mean);

      if (deviation > CONSISTENCY_THRESHOLDS.rating_diff_warning) {
        flags.push({
          type: 'KPI_DEVIATION',
          severity: 'warning',
          message: `KPI "${kpiName}" rating differs significantly from previous references`,
          kpi_name: kpiName,
          current_rating: currentRating,
          average_rating: Number(mean.toFixed(2)),
          deviation: Number(deviation.toFixed(2))
        });
      }
    }

    // Score based on variance (lower variance = higher consistency)
    const consistencyScore = Math.max(0, 1 - (stdDev / CONSISTENCY_THRESHOLDS.kpi_variance_max));

    kpiScores[kpiName] = {
      score: Number(consistencyScore.toFixed(4)),
      variance: Number(variance.toFixed(4)),
      std_dev: Number(stdDev.toFixed(4)),
      mean: Number(mean.toFixed(2)),
      count: ratings.length
    };
  });

  // Overall KPI consistency score (average of individual KPI scores)
  const scores = Object.values(kpiScores).map(s => s.score);
  const overallScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s, 0) / scores.length
    : 1.0;

  details.kpi_analysis = {
    kpi_scores: kpiScores,
    overall_score: Number(overallScore.toFixed(4))
  };

  return overallScore;
}

/**
 * Analyzes semantic consistency of narrative text using embeddings.
 *
 * @private
 * @param {string} currentNarrative - Current narrative text
 * @param {Array<Object>} previousReferences - Previous references
 * @param {Array} flags - Flags array to populate
 * @param {Object} details - Details object to populate
 * @returns {Promise<number>} Semantic consistency score (0-1)
 */
async function analyzeSemanticConsistency(currentNarrative, previousReferences, flags, details) {
  // Check if previous references have embedding vectors
  const refsWithEmbeddings = previousReferences.filter(ref =>
    ref.validated_data?.embedding_vector &&
    Array.isArray(ref.validated_data.embedding_vector)
  );

  if (refsWithEmbeddings.length === 0) {
    logger.debug('No previous embeddings available for semantic consistency check');
    details.semantic_analysis = {
      message: 'No embeddings available for comparison',
      available_embeddings: 0
    };
    return 1.0; // Neutral score if no comparison possible
  }

  // For now, we can't generate embedding for current narrative in this context
  // (would need to call embeddingService, but we want to avoid double-generation)
  // This will be enhanced when embeddings are passed in from the main validation flow

  details.semantic_analysis = {
    message: 'Semantic analysis requires embedding from main validation flow',
    available_embeddings: refsWithEmbeddings.length,
    note: 'TODO: Enhance to accept current embedding as parameter'
  };

  // Return neutral score for now
  return 1.0;
}

/**
 * Detects potential contradictions in narrative text.
 *
 * Uses simple heuristics to find contradictory statements.
 *
 * @param {string} narrative - Narrative text to analyze
 * @returns {Array<Object>} Array of detected contradictions
 *
 * @example
 * detectContradictions("John was always punctual. However, he was often late.")
 * // Returns: [{ type: 'CONTRADICTION', ... }]
 */
export function detectContradictions(narrative) {
  const contradictions = [];

  if (!narrative || narrative.length < 50) {
    return contradictions;
  }

  // Pattern: positive statement followed by negative
  const patterns = [
    {
      positive: /\b(excellent|great|strong|outstanding|always)\b/i,
      negative: /\b(however|but|unfortunately|never|poor|weak|rarely)\b/i,
      proximity: 100 // characters
    }
  ];

  patterns.forEach(pattern => {
    const positiveMatches = [...narrative.matchAll(new RegExp(pattern.positive, 'gi'))];
    const negativeMatches = [...narrative.matchAll(new RegExp(pattern.negative, 'gi'))];

    positiveMatches.forEach(posMatch => {
      negativeMatches.forEach(negMatch => {
        const distance = Math.abs(posMatch.index - negMatch.index);
        if (distance < pattern.proximity && distance > 0) {
          contradictions.push({
            type: 'POTENTIAL_CONTRADICTION',
            severity: 'info',
            message: 'Detected potentially contradictory statements in close proximity',
            details: {
              positive_term: posMatch[0],
              negative_term: negMatch[0],
              distance_chars: distance
            }
          });
        }
      });
    });
  });

  return contradictions;
}

/**
 * Calculates variance of an array of numbers.
 *
 * @private
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Variance
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

  return variance;
}

export default {
  checkConsistency,
  detectContradictions
};
