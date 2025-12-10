/**
 * Structured Output Generation Service
 *
 * Generates the final validated reference output in a structured JSON format
 * consumable by the HRScore engine and other downstream services.
 *
 * @module services/validation/structuredOutputGen
 */

import logger from '../../logger.js';

/**
 * Generates structured, validated reference output.
 *
 * @param {Object} validationData - Aggregated validation data
 * @param {string} validationData.standardized_text - Cleaned narrative text
 * @param {Object} validationData.kpi_ratings - KPI ratings object
 * @param {Object} validationData.detailed_feedback - Detailed comments
 * @param {number} validationData.consistency_score - Consistency score (0-1)
 * @param {number} validationData.fraud_score - Fraud score (0-100)
 * @param {Array<number>|null} validationData.embedding_vector - Embedding vector (optional)
 * @param {Array<Object>} validationData.flags - Validation flags/warnings
 * @returns {Object} Structured validated reference
 *
 * @example
 * const structured = generateStructuredOutput({
 *   standardized_text: "John was excellent...",
 *   kpi_ratings: { teamwork: 5, leadership: 4 },
 *   detailed_feedback: { recommendation: "...", strengths: "..." },
 *   consistency_score: 0.92,
 *   fraud_score: 8,
 *   embedding_vector: [...],
 *   flags: []
 * });
 */
export function generateStructuredOutput(validationData) {
  const {
    standardized_text,
    kpi_ratings,
    detailed_feedback,
    consistency_score,
    fraud_score,
    embedding_vector,
    flags
  } = validationData;

  logger.debug('Generating structured output', {
    has_text: !!standardized_text,
    kpi_count: Object.keys(kpi_ratings || {}).length,
    fraud_score,
    flags_count: flags?.length || 0
  });

  // Build structured dimensions from KPI ratings
  const structuredDimensions = buildStructuredDimensions(kpi_ratings, detailed_feedback);

  // Calculate overall confidence
  const confidence = calculateOverallConfidence(
    consistency_score,
    fraud_score,
    kpi_ratings,
    standardized_text
  );

  // Determine validation status
  const validationStatus = determineValidationStatus(fraud_score, consistency_score, flags);

  // Build the final structured output
  const output = {
    // Core validated data
    standardized_text,
    structured_dimensions: structuredDimensions,

    // Quality metrics
    consistency_score: Number((consistency_score || 1.0).toFixed(4)),
    fraud_score: Number(fraud_score || 0),
    confidence: Number(confidence.toFixed(4)),

    // Validation status
    validation_status: validationStatus,
    flags: flags || [],

    // Optional: embedding vector (for semantic search)
    embedding_vector: embedding_vector || null,

    // Metadata
    metadata: {
      validation_version: '1.0.0',
      validated_at: new Date().toISOString(),
      text_length: standardized_text?.length || 0,
      kpi_count: Object.keys(kpi_ratings || {}).length,
      has_embedding: !!embedding_vector
    }
  };

  logger.debug('Structured output generated', {
    validation_status: validationStatus,
    confidence,
    dimensions_count: Object.keys(structuredDimensions).length
  });

  return output;
}

/**
 * Builds structured dimensions from KPI ratings with confidence scores.
 *
 * @private
 * @param {Object} kpiRatings - KPI ratings object
 * @param {Object} detailedFeedback - Detailed feedback object
 * @returns {Object} Structured dimensions
 */
function buildStructuredDimensions(kpiRatings, detailedFeedback) {
  const dimensions = {};

  if (!kpiRatings || typeof kpiRatings !== 'object') {
    return dimensions;
  }

  // Convert each KPI rating into a structured dimension
  Object.entries(kpiRatings).forEach(([kpiName, rating]) => {
    if (typeof rating !== 'number' || rating < 0 || rating > 5) {
      logger.warn('Invalid KPI rating, skipping', { kpiName, rating });
      return;
    }

    // Calculate confidence for this dimension (based on rating extremity)
    // Ratings near extremes (0-1 or 4-5) often have higher confidence
    const ratingConfidence = calculateRatingConfidence(rating);

    // Extract relevant text from feedback if available
    const relevantFeedback = extractRelevantFeedback(kpiName, detailedFeedback);

    dimensions[kpiName] = {
      rating: Number(rating.toFixed(2)),
      confidence: Number(ratingConfidence.toFixed(2)),
      normalized: Number((rating / 5).toFixed(4)), // 0-1 scale
      feedback: relevantFeedback
    };
  });

  return dimensions;
}

/**
 * Calculates confidence for a single rating.
 *
 * @private
 * @param {number} rating - Rating value (0-5)
 * @returns {number} Confidence (0-1)
 */
function calculateRatingConfidence(rating) {
  // Confidence is higher for ratings near extremes (very good or very bad)
  // and lower for middle ratings (2.5-3.5 range = uncertain)

  if (rating >= 4.5 || rating <= 1.5) {
    return 0.95; // High confidence for extreme ratings
  } else if (rating >= 4.0 || rating <= 2.0) {
    return 0.85; // Good confidence
  } else if (rating >= 3.5 || rating <= 2.5) {
    return 0.75; // Moderate confidence
  } else {
    return 0.60; // Lower confidence for middle ratings
  }
}

/**
 * Extracts feedback text relevant to a specific KPI.
 *
 * @private
 * @param {string} kpiName - KPI name (e.g., 'teamwork', 'leadership')
 * @param {Object} detailedFeedback - Detailed feedback object
 * @returns {string|null} Relevant feedback text
 */
function extractRelevantFeedback(kpiName, detailedFeedback) {
  if (!detailedFeedback || typeof detailedFeedback !== 'object') {
    return null;
  }

  // Direct match (e.g., feedback.teamwork)
  if (detailedFeedback[kpiName]) {
    return detailedFeedback[kpiName];
  }

  // Check if KPI is mentioned in general feedback fields
  const searchFields = ['recommendation', 'strengths', 'improvements', 'summary'];
  const kpiNameLower = kpiName.toLowerCase();

  for (const field of searchFields) {
    const fieldValue = detailedFeedback[field];
    if (typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(kpiNameLower)) {
      return fieldValue;
    }
  }

  return null;
}

/**
 * Calculates overall confidence score for the validated reference.
 *
 * @private
 * @param {number} consistencyScore - Consistency score (0-1)
 * @param {number} fraudScore - Fraud score (0-100)
 * @param {Object} kpiRatings - KPI ratings
 * @param {string} text - Narrative text
 * @returns {number} Overall confidence (0-1)
 */
function calculateOverallConfidence(consistencyScore, fraudScore, kpiRatings, text) {
  // Start with consistency as base
  let confidence = consistencyScore || 1.0;

  // Reduce confidence based on fraud score (higher fraud = lower confidence)
  const fraudPenalty = (fraudScore || 0) / 100;
  confidence *= (1 - fraudPenalty * 0.5); // Max 50% reduction from fraud

  // Boost confidence if we have many KPIs (more data points)
  const kpiCount = Object.keys(kpiRatings || {}).length;
  if (kpiCount >= 5) {
    confidence *= 1.1; // 10% boost
  } else if (kpiCount <= 2) {
    confidence *= 0.9; // 10% penalty
  }

  // Boost confidence for detailed text (shows effort)
  const textLength = text?.length || 0;
  if (textLength > 500) {
    confidence *= 1.05; // 5% boost for detailed references
  } else if (textLength < 100) {
    confidence *= 0.9; // 10% penalty for short text
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Determines validation status based on quality metrics.
 *
 * @private
 * @param {number} fraudScore - Fraud score (0-100)
 * @param {number} consistencyScore - Consistency score (0-1)
 * @param {Array<Object>} flags - Validation flags
 * @returns {string} Validation status
 */
function determineValidationStatus(fraudScore, consistencyScore, flags) {
  const criticalFlags = (flags || []).filter(f => f.severity === 'critical');
  const warningFlags = (flags || []).filter(f => f.severity === 'warning');

  // Critical conditions
  if (fraudScore > 70) {
    return 'REJECTED_HIGH_FRAUD_RISK';
  }

  if (criticalFlags.length > 0) {
    return 'REJECTED_CRITICAL_ISSUES';
  }

  if (consistencyScore < 0.4) {
    return 'REJECTED_INCONSISTENT';
  }

  // Warning conditions
  if (fraudScore > 40 || warningFlags.length > 2) {
    return 'APPROVED_WITH_WARNINGS';
  }

  if (consistencyScore < 0.6) {
    return 'APPROVED_WITH_WARNINGS';
  }

  // All clear
  return 'APPROVED';
}

/**
 * Formats validation output for HRScore engine consumption.
 *
 * Converts structured output to the format expected by HRScore service.
 *
 * @param {Object} structuredOutput - Structured validation output
 * @returns {Object} HRScore-ready format
 */
export function formatForHRScore(structuredOutput) {
  const { structured_dimensions, standardized_text, confidence } = structuredOutput;

  // Extract just the ratings for HRScore engine
  const kpiRatings = {};
  Object.entries(structured_dimensions || {}).forEach(([kpi, data]) => {
    kpiRatings[kpi] = data.rating;
  });

  return {
    kpi_ratings: kpiRatings,
    narrative: standardized_text,
    confidence_score: confidence,
    validation_passed: structuredOutput.validation_status === 'APPROVED' ||
                       structuredOutput.validation_status === 'APPROVED_WITH_WARNINGS'
  };
}

/**
 * Formats validation output for API response.
 *
 * Removes internal details and prepares for public consumption.
 *
 * @param {Object} structuredOutput - Structured validation output
 * @param {boolean} [includeEmbedding=false] - Whether to include embedding vector
 * @returns {Object} API-friendly format
 */
export function formatForAPI(structuredOutput, includeEmbedding = false) {
  const apiOutput = {
    status: structuredOutput.validation_status,
    confidence: structuredOutput.confidence,
    fraud_score: structuredOutput.fraud_score,
    consistency_score: structuredOutput.consistency_score,
    dimensions: structuredOutput.structured_dimensions,
    flags: structuredOutput.flags.map(f => ({
      type: f.type,
      severity: f.severity,
      message: f.message
    })),
    metadata: {
      validated_at: structuredOutput.metadata.validated_at,
      version: structuredOutput.metadata.validation_version
    }
  };

  if (includeEmbedding && structuredOutput.embedding_vector) {
    apiOutput.embedding_available = true;
  }

  return apiOutput;
}

export default {
  generateStructuredOutput,
  formatForHRScore,
  formatForAPI
};
