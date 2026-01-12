/**
 * REFERENCE PACK SERVICE
 *
 * Purpose: Retrieve and aggregate candidate references with KPI-level analysis
 *
 * Architecture Principles:
 * - Aggregation at KPI level (not free-text)
 * - Confidence weighting
 * - Statistical analysis (avg, stddev, min, max)
 * - ML-ready data structure
 * - Performance optimized (materialized views)
 *
 * @module services/kpiReference/referencePack.service
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Confidence level weights for aggregation
 */
const CONFIDENCE_WEIGHTS = {
  high: 1.0,
  medium: 0.8,
  low: 0.5
};

/**
 * Get candidate reference pack with KPI aggregation
 *
 * @param {string} candidateId - Candidate user ID
 * @param {object} [options] - Optional filters
 * @param {boolean} [options.include_evidence=false] - Include evidence text (can be large)
 * @param {string} [options.min_confidence] - Filter by minimum confidence level
 * @param {number} [options.limit] - Limit number of references returned
 * @returns {Promise<{success: boolean, candidateId?: string, references?: array, kpi_aggregates?: array, summary?: object, error?: string}>}
 */
export async function getCandidateReferencePack(candidateId, options = {}) {
  try {
    const {
      include_evidence = false,
      min_confidence = null,
      limit = null
    } = options;

    // 1. Fetch all references for candidate
    let referencesQuery = supabase
      .from('kpi_references')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('submitted_at', { ascending: false });

    if (min_confidence) {
      // Filter by confidence: high > medium > low
      const confidenceLevels = {
        high: ['high'],
        medium: ['high', 'medium'],
        low: ['high', 'medium', 'low']
      };
      referencesQuery = referencesQuery.in('confidence_level', confidenceLevels[min_confidence] || ['high', 'medium', 'low']);
    }

    if (limit) {
      referencesQuery = referencesQuery.limit(limit);
    }

    const { data: references, error: refError } = await referencesQuery;

    if (refError) {
      logger.error('Failed to fetch references', {
        candidateId,
        error: refError.message
      });
      throw refError;
    }

    if (!references || references.length === 0) {
      return {
        success: true,
        candidateId,
        references: [],
        kpi_aggregates: [],
        summary: {
          total_references: 0,
          avg_overall_score: null,
          latest_reference_date: null
        }
      };
    }

    // 2. Fetch KPI scores for all references
    const referenceIds = references.map(r => r.id);

    let scoresQuery = supabase
      .from('reference_kpi_scores')
      .select('*')
      .in('reference_id', referenceIds);

    if (!include_evidence) {
      // Exclude evidence_text to reduce payload size
      scoresQuery = supabase
        .from('reference_kpi_scores')
        .select('id, reference_id, kpi_id, kpi_key, kpi_name, score, confidence_level, created_at')
        .in('reference_id', referenceIds);
    }

    const { data: kpiScores, error: scoresError } = await scoresQuery;

    if (scoresError) {
      logger.error('Failed to fetch KPI scores', {
        candidateId,
        error: scoresError.message
      });
      throw scoresError;
    }

    // 3. Build reference objects with KPI scores
    const referenceMap = new Map(references.map(r => [r.id, { ...r, kpi_scores: [] }]));

    kpiScores.forEach(score => {
      const ref = referenceMap.get(score.reference_id);
      if (ref) {
        ref.kpi_scores.push(score);
      }
    });

    const referencesWithScores = Array.from(referenceMap.values());

    // 4. Calculate KPI-level aggregates
    const kpiAggregates = calculateKpiAggregates(kpiScores);

    // 5. Calculate overall summary
    const summary = calculateOverallSummary(references, kpiScores);

    logger.debug('Reference pack retrieved', {
      candidateId,
      reference_count: references.length,
      kpi_aggregate_count: kpiAggregates.length
    });

    return {
      success: true,
      candidateId,
      references: referencesWithScores.map(ref => formatReferenceForOutput(ref, include_evidence)),
      kpi_aggregates: kpiAggregates,
      summary
    };

  } catch (error) {
    logger.error('Error in getCandidateReferencePack', {
      candidateId,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to retrieve reference pack'
    };
  }
}

/**
 * Calculate KPI-level aggregates across all references
 *
 * @param {array} kpiScores - Array of KPI scores
 * @returns {array} Aggregated KPI data
 */
function calculateKpiAggregates(kpiScores) {
  // Group by kpi_key
  const kpiGroups = {};

  kpiScores.forEach(score => {
    if (!kpiGroups[score.kpi_key]) {
      kpiGroups[score.kpi_key] = {
        kpi_key: score.kpi_key,
        kpi_name: score.kpi_name,
        scores: []
      };
    }

    kpiGroups[score.kpi_key].scores.push({
      score: score.score,
      confidence_level: score.confidence_level
    });
  });

  // Calculate aggregates for each KPI
  const aggregates = Object.values(kpiGroups).map(kpiGroup => {
    const scores = kpiGroup.scores;
    const scoreValues = scores.map(s => s.score);

    // Calculate weighted average (by confidence)
    const weightedSum = scores.reduce((sum, s) => {
      const weight = CONFIDENCE_WEIGHTS[s.confidence_level] || 0.8;
      return sum + (s.score * weight);
    }, 0);

    const totalWeight = scores.reduce((sum, s) => {
      const weight = CONFIDENCE_WEIGHTS[s.confidence_level] || 0.8;
      return sum + weight;
    }, 0);

    const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Calculate standard average
    const avg = scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length;

    // Calculate standard deviation
    const variance = scoreValues.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scoreValues.length;
    const stddev = Math.sqrt(variance);

    // Count by confidence level
    const highConfidence = scores.filter(s => s.confidence_level === 'high').length;
    const mediumConfidence = scores.filter(s => s.confidence_level === 'medium').length;
    const lowConfidence = scores.filter(s => s.confidence_level === 'low').length;

    return {
      kpi_key: kpiGroup.kpi_key,
      kpi_name: kpiGroup.kpi_name,
      reference_count: scores.length,
      avg_score: parseFloat(avg.toFixed(2)),
      weighted_avg_score: parseFloat(weightedAvg.toFixed(2)),
      stddev: parseFloat(stddev.toFixed(2)),
      min_score: Math.min(...scoreValues),
      max_score: Math.max(...scoreValues),
      confidence_distribution: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence
      }
    };
  });

  // Sort by KPI name
  return aggregates.sort((a, b) => a.kpi_name.localeCompare(b.kpi_name));
}

/**
 * Calculate overall summary statistics
 *
 * @param {array} references - Array of references
 * @param {array} kpiScores - Array of KPI scores
 * @returns {object} Summary statistics
 */
function calculateOverallSummary(references, kpiScores) {
  if (references.length === 0) {
    return {
      total_references: 0,
      avg_overall_score: null,
      latest_reference_date: null
    };
  }

  // Calculate average across all KPI scores
  const allScores = kpiScores.map(s => s.score);
  const avgOverallScore = allScores.length > 0
    ? parseFloat((allScores.reduce((sum, s) => sum + s, 0) / allScores.length).toFixed(2))
    : null;

  // Latest reference date
  const latestDate = references.reduce((latest, ref) => {
    const refDate = new Date(ref.submitted_at);
    return refDate > latest ? refDate : latest;
  }, new Date(references[0].submitted_at));

  // Rehire decision distribution
  const rehireYes = references.filter(r => r.rehire_decision === 'yes').length;
  const rehireNo = references.filter(r => r.rehire_decision === 'no').length;
  const rehireConditional = references.filter(r => r.rehire_decision === 'conditional').length;

  // Confidence distribution
  const highConfidence = references.filter(r => r.confidence_level === 'high').length;
  const mediumConfidence = references.filter(r => r.confidence_level === 'medium').length;
  const lowConfidence = references.filter(r => r.confidence_level === 'low').length;

  // Relationship distribution
  const relationshipCounts = references.reduce((acc, ref) => {
    acc[ref.relationship_type] = (acc[ref.relationship_type] || 0) + 1;
    return acc;
  }, {});

  return {
    total_references: references.length,
    total_kpi_evaluations: kpiScores.length,
    avg_overall_score: avgOverallScore,
    latest_reference_date: latestDate.toISOString(),
    rehire_decision_distribution: {
      yes: rehireYes,
      no: rehireNo,
      conditional: rehireConditional
    },
    confidence_distribution: {
      high: highConfidence,
      medium: mediumConfidence,
      low: lowConfidence
    },
    relationship_distribution: relationshipCounts,
    avg_completeness_score: references.length > 0
      ? parseFloat((references.reduce((sum, r) => sum + (r.completeness_score || 0), 0) / references.length).toFixed(2))
      : null
  };
}

/**
 * Format reference for output
 *
 * @param {object} reference - Reference object
 * @param {boolean} includeEvidence - Include evidence text
 * @returns {object} Formatted reference
 */
function formatReferenceForOutput(reference, includeEvidence) {
  const formatted = {
    id: reference.id,
    referee_email: reference.referee_email,
    referee_name: reference.referee_name,
    relationship_type: reference.relationship_type,
    start_date: reference.start_date,
    end_date: reference.end_date,
    overall_recommendation: reference.overall_recommendation,
    rehire_decision: reference.rehire_decision,
    rehire_reasoning: reference.rehire_reasoning,
    confidence_level: reference.confidence_level,
    completeness_score: reference.completeness_score,
    avg_evidence_length: reference.avg_evidence_length,
    submitted_at: reference.submitted_at,
    kpi_set_version: reference.kpi_set_version,
    kpi_scores: reference.kpi_scores.map(score => ({
      kpi_id: score.kpi_id,
      kpi_key: score.kpi_key,
      kpi_name: score.kpi_name,
      score: score.score,
      confidence_level: score.confidence_level,
      ...(includeEvidence && { evidence_text: score.evidence_text })
    }))
  };

  return formatted;
}

/**
 * Get KPI-level aggregates from materialized view (fast)
 * This is a performance-optimized alternative to real-time aggregation
 *
 * @param {string} candidateId - Candidate user ID
 * @returns {Promise<{success: boolean, kpi_aggregates?: array, error?: string}>}
 */
export async function getCandidateKpiAggregatesFast(candidateId) {
  try {
    const { data: aggregates, error } = await supabase
      .from('candidate_kpi_aggregates')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('kpi_name', { ascending: true });

    if (error) {
      logger.error('Failed to fetch KPI aggregates from materialized view', {
        candidateId,
        error: error.message
      });
      throw error;
    }

    return {
      success: true,
      kpi_aggregates: aggregates || []
    };

  } catch (error) {
    logger.error('Error in getCandidateKpiAggregatesFast', {
      candidateId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve KPI aggregates'
    };
  }
}

/**
 * Get single reference by ID with permission check
 *
 * @param {string} referenceId - Reference UUID
 * @param {string} requestingUserId - User requesting access
 * @returns {Promise<{success: boolean, reference?: object, error?: string}>}
 */
export async function getReferenceById(referenceId, requestingUserId) {
  try {
    const { data: reference, error: refError } = await supabase
      .from('kpi_references')
      .select('*')
      .eq('id', referenceId)
      .maybeSingle();

    if (refError || !reference) {
      return {
        success: false,
        error: 'Reference not found'
      };
    }

    // Permission check: Only candidate or referee can access
    if (reference.candidate_id !== requestingUserId && reference.referee_id !== requestingUserId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Fetch KPI scores
    const { data: kpiScores, error: scoresError } = await supabase
      .from('reference_kpi_scores')
      .select('*')
      .eq('reference_id', referenceId);

    if (scoresError) {
      logger.error('Failed to fetch KPI scores', {
        referenceId,
        error: scoresError.message
      });
      throw scoresError;
    }

    return {
      success: true,
      reference: {
        ...reference,
        kpi_scores: kpiScores
      }
    };

  } catch (error) {
    logger.error('Error in getReferenceById', {
      referenceId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve reference'
    };
  }
}

/**
 * Get reference statistics for a candidate (counts, distributions)
 * Lightweight endpoint for dashboards
 *
 * @param {string} candidateId - Candidate user ID
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
export async function getCandidateReferenceStats(candidateId) {
  try {
    // Count references by status
    const { data: references, error: refError } = await supabase
      .from('kpi_references')
      .select('id, confidence_level, rehire_decision, submitted_at')
      .eq('candidate_id', candidateId);

    if (refError) {
      logger.error('Failed to fetch references for stats', {
        candidateId,
        error: refError.message
      });
      throw refError;
    }

    // Count pending requests
    const { data: pendingRequests, error: reqError } = await supabase
      .from('reference_requests')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('status', 'pending');

    if (reqError) {
      logger.error('Failed to fetch pending requests', {
        candidateId,
        error: reqError.message
      });
      throw reqError;
    }

    // Count total KPI scores
    const referenceIds = references.map(r => r.id);
    let totalKpiScores = 0;

    if (referenceIds.length > 0) {
      const { data: scores, error: scoresError } = await supabase
        .from('reference_kpi_scores')
        .select('id')
        .in('reference_id', referenceIds);

      if (scoresError) {
        logger.error('Failed to count KPI scores', {
          candidateId,
          error: scoresError.message
        });
      } else {
        totalKpiScores = scores?.length || 0;
      }
    }

    const stats = {
      total_references: references.length,
      pending_requests: pendingRequests?.length || 0,
      total_kpi_evaluations: totalKpiScores,
      latest_reference_date: references.length > 0
        ? references.reduce((latest, ref) => {
            const refDate = new Date(ref.submitted_at);
            const latestDate = new Date(latest);
            return refDate > latestDate ? ref.submitted_at : latest;
          }, references[0].submitted_at)
        : null,
      confidence_distribution: {
        high: references.filter(r => r.confidence_level === 'high').length,
        medium: references.filter(r => r.confidence_level === 'medium').length,
        low: references.filter(r => r.confidence_level === 'low').length
      },
      rehire_decision_distribution: {
        yes: references.filter(r => r.rehire_decision === 'yes').length,
        no: references.filter(r => r.rehire_decision === 'no').length,
        conditional: references.filter(r => r.rehire_decision === 'conditional').length
      }
    };

    return {
      success: true,
      stats
    };

  } catch (error) {
    logger.error('Error in getCandidateReferenceStats', {
      candidateId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve reference statistics'
    };
  }
}
