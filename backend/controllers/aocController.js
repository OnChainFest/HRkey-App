/**
 * AOC Protocol Controller
 *
 * Minimal API handlers that map HRKey flows to AOC vault operations.
 * Each handler validates the payload, delegates to the service, and
 * returns a deterministic JSON response.
 */

import {
  registerCandidatePack,
  grantCandidateConsent,
  mintEmployerCapability,
  requestEmployerAccess,
  revokeEmployerCapability
} from '../services/aocVault.service.js';
import logger from '../logger.js';

// POST /api/aoc/packs/register
export function registerPack(req, res) {
  try {
    const { packId, ownerId, schema } = req.body;
    if (!packId || !ownerId || !Array.isArray(schema)) {
      return res.status(400).json({ error: 'packId, ownerId, and schema[] are required' });
    }
    const result = registerCandidatePack({ packId, ownerId, schema });
    return res.status(201).json(result);
  } catch (error) {
    logger.error('AOC registerPack error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/aoc/consents/grant
export function grantConsent(req, res) {
  try {
    const { consentId, packId, granteeId, scopes, ttlSeconds } = req.body;
    if (!consentId || !packId || !granteeId || !Array.isArray(scopes) || !ttlSeconds) {
      return res.status(400).json({
        error: 'consentId, packId, granteeId, scopes[], and ttlSeconds are required'
      });
    }
    const result = grantCandidateConsent({ consentId, packId, granteeId, scopes, ttlSeconds });
    return res.status(201).json(result);
  } catch (error) {
    logger.error('AOC grantConsent error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/aoc/capabilities/mint
export function mintCapability(req, res) {
  try {
    const { consentId, granteeId, scopes, ttlSeconds } = req.body;
    if (!consentId || !granteeId || !Array.isArray(scopes) || !ttlSeconds) {
      return res.status(400).json({
        error: 'consentId, granteeId, scopes[], and ttlSeconds are required'
      });
    }
    const result = mintEmployerCapability({ consentId, granteeId, scopes, ttlSeconds });
    if (result.error) {
      return res.status(409).json(result);
    }
    return res.status(201).json(result);
  } catch (error) {
    logger.error('AOC mintCapability error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/aoc/access/request
export function requestAccess(req, res) {
  try {
    const { capabilityId, sdlPaths, nonce } = req.body;
    if (!capabilityId || !Array.isArray(sdlPaths) || !nonce) {
      return res.status(400).json({
        error: 'capabilityId, sdlPaths[], and nonce are required'
      });
    }
    const result = requestEmployerAccess({ capabilityId, sdlPaths, nonce });
    const status = result.verdict === 'ALLOW' ? 200 : 403;
    return res.status(status).json(result);
  } catch (error) {
    logger.error('AOC requestAccess error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/aoc/capabilities/revoke
export function revokeCapability(req, res) {
  try {
    const { capabilityId } = req.body;
    if (!capabilityId) {
      return res.status(400).json({ error: 'capabilityId is required' });
    }
    const result = revokeEmployerCapability({ capabilityId });
    if (result.error) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    logger.error('AOC revokeCapability error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

export default {
  registerPack,
  grantConsent,
  mintCapability,
  requestAccess,
  revokeCapability
};
