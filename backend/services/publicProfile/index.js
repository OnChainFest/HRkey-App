/**
 * Public Profile & Discovery Layer
 *
 * Unified service layer for resolving and enriching public candidate profiles.
 *
 * Features:
 * - Profile resolution by identifier (handle or user ID)
 * - HRScore and pricing enrichment
 * - Analytics integration (view tracking)
 * - Fail-soft error handling
 * - Privacy-aware data exposure
 *
 * @module services/publicProfile
 */

import {
  resolveProfileByIdentifier,
  resolveProfileByUserId,
  getPublicIdentifierForUser
} from './resolver.js';

import {
  attachHrScoreSummary,
  attachViewMetrics,
  enrichProfile
} from './enrichment.js';

import {
  registerProfileView,
  registerProfileViewBatch
} from './viewTracker.js';

import logger from '../../logger.js';

/**
 * Get a fully enriched public profile by identifier (handle or user ID).
 *
 * This is the primary entry point for fetching public profiles.
 * It combines resolution, enrichment, and optional view tracking.
 *
 * @param {string} identifier - Public handle or user ID
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.trackView=false] - Whether to log a PROFILE_VIEW event
 * @param {string} [options.viewerId] - Viewer user ID (for analytics)
 * @param {string} [options.companyId] - Viewer company ID (for analytics)
 * @param {Object} [options.req] - Express request object (for analytics)
 * @returns {Promise<Object|null>} Enriched profile or null
 *
 * @example
 * const profile = await getPublicProfile('john_doe', {
 *   trackView: true,
 *   viewerId: 'uuid-viewer',
 *   req
 * });
 */
export async function getPublicProfile(identifier, options = {}) {
  try {
    // Step 1: Resolve base profile
    const baseProfile = await resolveProfileByIdentifier(identifier);

    if (!baseProfile) {
      return null;
    }

    // Step 2: Enrich with HRScore, pricing, metrics
    const enrichedProfile = await enrichProfile(baseProfile);

    // Step 3: Optional view tracking (fail-soft)
    if (options.trackView && enrichedProfile) {
      // Fire and forget - don't await to avoid blocking response
      registerProfileView({
        candidateId: enrichedProfile.userId,
        viewerId: options.viewerId,
        companyId: options.companyId,
        req: options.req
      }).catch(err => {
        // Already logged in registerProfileView, but catching here for safety
        logger.debug('PublicProfile: View tracking failed (non-blocking)', {
          error: err.message
        });
      });
    }

    return enrichedProfile;

  } catch (err) {
    logger.error('PublicProfile: Exception in getPublicProfile', {
      identifier,
      error: err.message,
      stack: err.stack
    });
    return null;
  }
}

// Re-export all sub-module functions for direct access if needed
export {
  // Resolver functions
  resolveProfileByIdentifier,
  resolveProfileByUserId,
  getPublicIdentifierForUser,

  // Enrichment functions
  attachHrScoreSummary,
  attachViewMetrics,
  enrichProfile,

  // View tracking functions
  registerProfileView,
  registerProfileViewBatch
};

export default {
  // Primary API
  getPublicProfile,

  // Resolver functions
  resolveProfileByIdentifier,
  resolveProfileByUserId,
  getPublicIdentifierForUser,

  // Enrichment functions
  attachHrScoreSummary,
  attachViewMetrics,
  enrichProfile,

  // View tracking functions
  registerProfileView,
  registerProfileViewBatch
};
