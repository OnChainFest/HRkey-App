import logger from '../logger.js';
import { getPublicProfile } from '../services/publicProfile/index.js';

/**
 * GET /api/public/candidates/:identifier
 * Public endpoint to fetch a safe candidate profile by handle or id.
 *
 * Uses the Public Profile & Discovery Layer for:
 * - Profile resolution (handle or user ID)
 * - HRScore and tokenomics enrichment
 * - Analytics tracking (PROFILE_VIEW events)
 *
 * External contract (backwards-compatible):
 * - Returns 400 if identifier is missing
 * - Returns 404 if profile not found or not public
 * - Returns 200 with profile data on success
 * - Returns 500 on server errors
 */
export async function getPublicCandidateProfile(req, res) {
  try {
    const { identifier } = req.params;
    const normalizedIdentifier = identifier?.trim();

    if (!normalizedIdentifier) {
      return res.status(400).json({ error: 'identifier is required' });
    }

    // Resolve and enrich profile using new service layer
    // Optional: track view event (fail-soft, non-blocking)
    const profile = await getPublicProfile(normalizedIdentifier, {
      trackView: true,
      viewerId: req.user?.id || null, // Anonymous if not authenticated
      companyId: req.user?.company_id || null,
      req
    });

    if (!profile) {
      return res.status(404).json({ error: 'Public profile not found' });
    }

    return res.status(200).json(profile);
  } catch (err) {
    logger.error('Error in getPublicCandidateProfile', {
      requestId: req.requestId,
      identifier: req.params?.identifier,
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'Failed to load public profile' });
  }
}

export default {
  getPublicCandidateProfile
};
