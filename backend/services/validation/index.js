/**
 * Reference Validation Layer (RVL) - Main Entry Point
 *
 * The RVL processes raw reference submissions through multiple validation stages:
 * 1. Text standardization (cleaning, normalization)
 * 2. Embedding generation (for semantic analysis)
 * 3. Consistency checking (cross-reference validation)
 * 4. Fraud detection (anti-gaming scoring)
 * 5. Structured output generation (JSON for HRScore engine)
 *
 * @module services/validation
 * @author HRKey Development Team
 * @date 2025-12-10
 */

import { standardizeNarrative } from './narrativeStandardizer.js';
import { generateEmbedding } from './embeddingService.js';
import { checkConsistency } from './consistencyChecker.js';
import { calculateFraudScore } from './fraudDetector.js';
import { generateStructuredOutput } from './structuredOutputGen.js';
import logger from '../../logger.js';

/**
 * Validates a reference submission and returns structured, validated data.
 *
 * @param {Object} rawReference - The raw reference data from submission
 * @param {string} rawReference.summary - Raw narrative text
 * @param {Object} rawReference.kpi_ratings - KPI ratings (e.g., { teamwork: 4.5 })
 * @param {Object} rawReference.detailed_feedback - Detailed comments
 * @param {string} rawReference.owner_id - Candidate UUID
 * @param {string} rawReference.referrer_email - Email of person giving reference
 * @param {Object} [options] - Validation options
 * @param {Array<Object>} [options.previousReferences] - Previous references for consistency checking
 * @param {boolean} [options.skipEmbeddings] - Skip embedding generation (for testing)
 * @param {boolean} [options.skipConsistencyCheck] - Skip consistency check (for first reference)
 *
 * @returns {Promise<Object>} Validated reference data
 *
 * @example
 * const validated = await validateReference({
 *   summary: "John was an excellent team member...",
 *   kpi_ratings: { teamwork: 5, leadership: 4 },
 *   detailed_feedback: { recommendation: "Highly recommend", strengths: "..." },
 *   owner_id: "uuid-123",
 *   referrer_email: "manager@company.com"
 * });
 *
 * // Returns:
 * {
 *   standardized_text: "John was an excellent team member...",
 *   structured_dimensions: {
 *     teamwork: { rating: 5, confidence: 0.95 },
 *     leadership: { rating: 4, confidence: 0.88 }
 *   },
 *   consistency_score: 0.92,
 *   fraud_score: 5,  // 0-100, lower is better
 *   confidence: 0.93,
 *   flags: [],
 *   embedding_vector: [0.123, 0.456, ...], // 1536-dim for OpenAI
 *   metadata: {
 *     validation_version: "1.0.0",
 *     validated_at: "2025-12-10T12:00:00Z"
 *   }
 * }
 */
export async function validateReference(rawReference, options = {}) {
  const startTime = Date.now();

  try {
    logger.info('🔍 RVL: Starting reference validation', {
      owner_id: rawReference.owner_id,
      referrer_email: rawReference.referrer_email,
      has_summary: !!rawReference.summary
    });

    // Stage 1: Standardize narrative text
    logger.debug('RVL: Stage 1 - Standardizing narrative');
    const standardizedText = standardizeNarrative(rawReference.summary);

    if (!standardizedText || standardizedText.length < 20) {
      throw new Error('Narrative text too short after standardization (minimum 20 characters)');
    }

    // Stage 2: Generate embedding (optional, can be disabled for testing)
    logger.debug('RVL: Stage 2 - Generating embedding');
    let embeddingVector = null;
    if (!options.skipEmbeddings) {
      try {
        embeddingVector = await generateEmbedding(standardizedText);
      } catch (embErr) {
        // Non-fatal: log but continue
        logger.warn('RVL: Embedding generation failed, continuing without embedding', {
          error: embErr.message
        });
      }
    }

    // Stage 3: Check consistency with previous references
    logger.debug('RVL: Stage 3 - Checking consistency');
    let consistencyResult = {
      consistency_score: 1.0, // Default: no previous refs = perfect consistency
      flags: []
    };

    if (!options.skipConsistencyCheck && options.previousReferences?.length > 0) {
      consistencyResult = await checkConsistency(
        standardizedText,
        rawReference.kpi_ratings,
        options.previousReferences
      );
    }

    // Stage 4: Calculate fraud score
    logger.debug('RVL: Stage 4 - Calculating fraud score');
    const fraudScore = calculateFraudScore({
      text: standardizedText,
      kpi_ratings: rawReference.kpi_ratings,
      consistency_score: consistencyResult.consistency_score,
      referrer_email: rawReference.referrer_email
    });

    // Stage 5: Generate structured output
    logger.debug('RVL: Stage 5 - Generating structured output');
    const structuredData = generateStructuredOutput({
      standardized_text: standardizedText,
      kpi_ratings: rawReference.kpi_ratings,
      detailed_feedback: rawReference.detailed_feedback,
      consistency_score: consistencyResult.consistency_score,
      fraud_score: fraudScore,
      embedding_vector: embeddingVector,
      flags: consistencyResult.flags
    });

    const processingTime = Date.now() - startTime;

    logger.info('✅ RVL: Validation completed successfully', {
      owner_id: rawReference.owner_id,
      fraud_score: fraudScore,
      consistency_score: consistencyResult.consistency_score,
      processing_time_ms: processingTime
    });

    return {
      ...structuredData,
      metadata: {
        ...structuredData.metadata,
        processing_time_ms: processingTime
      }
    };

  } catch (error) {
    logger.error('❌ RVL: Validation failed', {
      error: error.message,
      stack: error.stack,
      owner_id: rawReference.owner_id
    });

    // Re-throw with context
    throw new Error(`Reference validation failed: ${error.message}`);
  }
}

/**
 * Validates a batch of references (for bulk processing).
 *
 * @param {Array<Object>} references - Array of raw reference objects
 * @param {Object} [options] - Validation options
 * @returns {Promise<Array<Object>>} Array of validated references
 */
export async function validateReferenceBatch(references, options = {}) {
  logger.info('RVL: Starting batch validation', { count: references.length });

  const results = [];
  const errors = [];

  for (const ref of references) {
    try {
      const validated = await validateReference(ref, options);
      results.push({ success: true, data: validated, reference_id: ref.id });
    } catch (error) {
      logger.error('RVL: Batch validation error', {
        reference_id: ref.id,
        error: error.message
      });
      errors.push({ success: false, error: error.message, reference_id: ref.id });
      results.push(null);
    }
  }

  logger.info('RVL: Batch validation complete', {
    total: references.length,
    successful: results.filter(r => r !== null).length,
    failed: errors.length
  });

  return { results, errors };
}

/**
 * Get RVL version and configuration info.
 *
 * @returns {Object} RVL metadata
 */
export function getRVLInfo() {
  return {
    version: '1.0.0',
    enabled_features: {
      text_standardization: true,
      embedding_generation: true,
      consistency_checking: true,
      fraud_detection: true,
      structured_output: true
    },
    thresholds: {
      min_text_length: 20,
      max_fraud_score: 100,
      consistency_threshold: 0.6
    }
  };
}

export default {
  validateReference,
  validateReferenceBatch,
  getRVLInfo
};
