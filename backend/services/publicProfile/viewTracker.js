/**
 * Public Profile View Tracker
 *
 * Tracks profile views using the Analytics Layer.
 * Provides a simple, fail-soft wrapper around analytics event logging.
 *
 * @module services/publicProfile/viewTracker
 */

import { logEvent, EventTypes } from '../analytics/eventTracker.js';
import logger from '../../logger.js';

/**
 * Register a public profile view event.
 *
 * Logs a PROFILE_VIEW event to the Analytics Layer with:
 * - candidateId: The profile being viewed
 * - dataType: 'public_profile'
 * - Optional viewer context (userId, companyId)
 *
 * This function is 100% fail-soft:
 * - Never throws errors
 * - Logs warnings on failure
 * - Never blocks profile display
 *
 * @param {Object} params - View tracking parameters
 * @param {string} params.candidateId - Candidate user ID being viewed
 * @param {string} [params.viewerId] - Viewer user ID (optional, null for anonymous)
 * @param {string} [params.companyId] - Viewer's company ID (optional)
 * @param {Object} [params.req] - Express request object (auto-extracts metadata)
 * @returns {Promise<void>}
 *
 * @example
 * await registerProfileView({
 *   candidateId: 'uuid-123',
 *   viewerId: 'uuid-456',
 *   companyId: 'uuid-789',
 *   req
 * });
 */
export async function registerProfileView({ candidateId, viewerId = null, companyId = null, req = null }) {
  try {
    if (!candidateId) {
      logger.warn('PublicProfile: Cannot register view without candidateId');
      return;
    }

    // Log PROFILE_VIEW event via Analytics Layer
    await logEvent({
      userId: viewerId,
      companyId: companyId,
      eventType: EventTypes.PROFILE_VIEW,
      context: {
        candidateId,
        dataType: 'public_profile'
      },
      source: 'backend',
      req
    });

    logger.debug('PublicProfile: View event registered', {
      candidateId,
      viewerId: viewerId || 'anonymous',
      companyId: companyId || 'none'
    });

  } catch (err) {
    // Analytics failures must NEVER block application flow
    logger.warn('PublicProfile: Failed to register profile view', {
      candidateId,
      viewerId,
      error: err.message
    });
    // Do not throw - fail silently
  }
}

/**
 * Register a batch of profile view events (for efficiency).
 *
 * Useful when tracking multiple profile views at once
 * (e.g., search results page showing multiple profiles).
 *
 * @param {Array<{candidateId: string, viewerId?: string, companyId?: string}>} views - Array of view events
 * @returns {Promise<void>}
 *
 * @example
 * await registerProfileViewBatch([
 *   { candidateId: 'uuid-1', viewerId: 'uuid-viewer' },
 *   { candidateId: 'uuid-2', viewerId: 'uuid-viewer' },
 *   { candidateId: 'uuid-3', viewerId: 'uuid-viewer' }
 * ]);
 */
export async function registerProfileViewBatch(views) {
  try {
    if (!Array.isArray(views) || views.length === 0) {
      logger.warn('PublicProfile: Empty or invalid views array for batch tracking');
      return;
    }

    // Register each view individually (Analytics Layer handles batching internally)
    const promises = views.map(view =>
      registerProfileView({
        candidateId: view.candidateId,
        viewerId: view.viewerId,
        companyId: view.companyId,
        req: view.req
      })
    );

    await Promise.allSettled(promises);

    logger.debug('PublicProfile: Batch view events registered', {
      count: views.length
    });

  } catch (err) {
    logger.warn('PublicProfile: Failed to register batch profile views', {
      count: views?.length,
      error: err.message
    });
    // Do not throw - fail silently
  }
}

export default {
  registerProfileView,
  registerProfileViewBatch
};
