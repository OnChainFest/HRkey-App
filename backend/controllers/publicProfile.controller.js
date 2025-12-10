import logger from '../logger.js';
import { getPublicProfile } from '../services/publicProfile.service.js';

/**
 * GET /api/public/candidates/:identifier
 * Public endpoint to fetch a safe candidate profile by handle or id.
 */
export async function getPublicCandidateProfile(req, res) {
  try {
    const { identifier } = req.params;
    const normalizedIdentifier = identifier?.trim();

    if (!normalizedIdentifier) {
      return res.status(400).json({ error: 'identifier is required' });
    }

    const profile = await getPublicProfile(normalizedIdentifier);

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
