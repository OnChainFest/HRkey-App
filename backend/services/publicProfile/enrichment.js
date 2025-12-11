/**
 * Public Profile Enrichment
 *
 * Enriches base profiles with HRScore, pricing, tokenomics, and analytics data.
 * All enrichment is fail-soft - failures never block profile display.
 *
 * @module services/publicProfile/enrichment
 */

import { evaluateCandidateForUser } from '../candidateEvaluation.service.js';
import { getTokenomicsPreviewForUser } from '../tokenomicsPreview.service.js';
import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * @typedef {Object} HRScoreSummary
 * @property {number|null} current - Current HRScore (0-100)
 */

/**
 * @typedef {Object} ProfileMetrics
 * @property {number|null} profileViews - Total profile view count
 */

/**
 * Attach HRScore summary to a profile.
 *
 * Queries the candidate evaluation service to get:
 * - Current HRScore
 * - Dynamic pricing
 * - Optional tokenomics data
 *
 * Fail-soft behavior: Returns degraded data on errors, never throws.
 *
 * @param {string} userId - User ID to enrich
 * @returns {Promise<{hrScore: number, priceUsd: number, hrkTokens: number|null, hrscore: HRScoreSummary}>}
 *
 * @example
 * const enriched = await attachHrScoreSummary('uuid-123');
 * // Returns: { hrScore: 78.5, priceUsd: 1500, hrkTokens: 15000, hrscore: { current: 78.5 } }
 */
export async function attachHrScoreSummary(userId) {
  const defaultResult = {
    hrScore: 0,
    priceUsd: 0,
    hrkTokens: null,
    hrscore: {
      current: null
    }
  };

  try {
    if (!userId) {
      logger.warn('PublicProfile: No userId provided for HRScore enrichment');
      return defaultResult;
    }

    // Get evaluation data (HRScore + pricing)
    let evaluation;
    try {
      evaluation = await evaluateCandidateForUser(userId);
    } catch (err) {
      logger.error('PublicProfile: Failed to evaluate candidate for HRScore', {
        userId,
        error: err.message
      });
      return defaultResult;
    }

    const hrScore = evaluation?.scoring?.hrScoreResult?.hrScore ?? 0;
    const priceUsd = evaluation?.scoring?.pricingResult?.priceUsd ?? 0;

    // Get tokenomics data (optional, fail-soft)
    let hrkTokens = null;
    try {
      const preview = await getTokenomicsPreviewForUser(userId);
      hrkTokens = preview?.tokens?.clampedTokens ?? null;
    } catch (err) {
      logger.warn('PublicProfile: Tokenomics preview unavailable', {
        userId,
        error: err.message
      });
      // Continue without tokenomics - not critical
    }

    // Build enriched result
    const result = {
      hrScore,
      priceUsd,
      hrkTokens,
      hrscore: {
        current: hrScore > 0 ? hrScore : null
      }
    };

    logger.debug('PublicProfile: HRScore enrichment successful', {
      userId,
      hrScore,
      priceUsd
    });

    return result;

  } catch (err) {
    logger.error('PublicProfile: Exception in attachHrScoreSummary', {
      userId,
      error: err.message,
      stack: err.stack
    });
    return defaultResult;
  }
}

/**
 * Attach view metrics to a profile.
 *
 * Queries the analytics_events table to count PROFILE_VIEW events
 * for the given candidate.
 *
 * Fail-soft behavior: Returns null on errors, never throws.
 *
 * @param {string} userId - Candidate user ID
 * @returns {Promise<ProfileMetrics>}
 *
 * @example
 * const metrics = await attachViewMetrics('uuid-123');
 * // Returns: { profileViews: 42 }
 */
export async function attachViewMetrics(userId) {
  const defaultResult = {
    profileViews: null
  };

  try {
    if (!userId) {
      logger.warn('PublicProfile: No userId provided for view metrics');
      return defaultResult;
    }

    // Query analytics_events for PROFILE_VIEW events
    const { data, error } = await supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'PROFILE_VIEW')
      .eq('context->>candidateId', userId);

    if (error) {
      logger.error('PublicProfile: Failed to query view metrics', {
        userId,
        error: error.message
      });
      return defaultResult;
    }

    // Supabase returns count in the response headers when using count: 'exact'
    // But for simpler approach, let's do an aggregate query
    const { count, error: countError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'PROFILE_VIEW')
      .eq('context->>candidateId', userId);

    if (countError) {
      logger.error('PublicProfile: Failed to count view metrics', {
        userId,
        error: countError.message
      });
      return defaultResult;
    }

    const profileViews = count ?? 0;

    logger.debug('PublicProfile: View metrics retrieved', {
      userId,
      profileViews
    });

    return {
      profileViews: profileViews > 0 ? profileViews : null
    };

  } catch (err) {
    logger.error('PublicProfile: Exception in attachViewMetrics', {
      userId,
      error: err.message,
      stack: err.stack
    });
    return defaultResult;
  }
}

/**
 * Enrich a base profile with all available data.
 *
 * Combines HRScore, pricing, tokenomics, and view metrics.
 * All enrichment is fail-soft - partial failures return degraded data.
 *
 * @param {import('./resolver.js').BaseProfile} baseProfile - Base profile from resolver
 * @returns {Promise<Object>} Fully enriched profile
 *
 * @example
 * const base = await resolveProfileByIdentifier('john_doe');
 * const enriched = await enrichProfile(base);
 * // Returns: { ...base, hrScore, priceUsd, hrkTokens, hrscore: {...}, metrics: {...} }
 */
export async function enrichProfile(baseProfile) {
  if (!baseProfile) {
    logger.warn('PublicProfile: No base profile provided for enrichment');
    return null;
  }

  try {
    const userId = baseProfile.userId;

    // Enrich with HRScore (fail-soft)
    const hrScoreData = await attachHrScoreSummary(userId);

    // Enrich with view metrics (fail-soft)
    const metricsData = await attachViewMetrics(userId);

    // Build enriched profile
    const enrichedProfile = {
      userId: baseProfile.userId,
      handle: baseProfile.handle,
      fullName: baseProfile.fullName,
      headline: baseProfile.headline,
      skills: baseProfile.skills,
      hrScore: hrScoreData.hrScore,
      priceUsd: hrScoreData.priceUsd,
      hrkTokens: hrScoreData.hrkTokens,
      hrscore: hrScoreData.hrscore,
      metrics: metricsData
    };

    logger.debug('PublicProfile: Profile enrichment complete', {
      userId,
      hasHrScore: hrScoreData.hrscore.current !== null,
      hasMetrics: metricsData.profileViews !== null
    });

    return enrichedProfile;

  } catch (err) {
    logger.error('PublicProfile: Exception in enrichProfile', {
      userId: baseProfile?.userId,
      error: err.message,
      stack: err.stack
    });

    // Return base profile with default enrichment on catastrophic failure
    return {
      userId: baseProfile.userId,
      handle: baseProfile.handle,
      fullName: baseProfile.fullName,
      headline: baseProfile.headline,
      skills: baseProfile.skills,
      hrScore: 0,
      priceUsd: 0,
      hrkTokens: null,
      hrscore: { current: null },
      metrics: { profileViews: null }
    };
  }
}

export default {
  attachHrScoreSummary,
  attachViewMetrics,
  enrichProfile
};
