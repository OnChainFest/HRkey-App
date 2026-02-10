/**
 * AOC Vault Service – HRKey Integration Boundary
 *
 * Thin wrapper around the AOC Protocol adapter that exposes
 * HRKey-domain functions.  All state lives in the adapter;
 * this module only manages the singleton lifecycle.
 */

import { createHRKeyAdapter } from './aoc-protocol/index.js';

// ---------------------------------------------------------------------------
// Singleton adapter
// ---------------------------------------------------------------------------

let adapter = null;

export function getAdapter() {
  if (!adapter) {
    adapter = createHRKeyAdapter();
  }
  return adapter;
}

/** Reset the adapter (test-only). */
export function resetAdapter() {
  adapter = null;
}

/** Inject a custom adapter (test-only). */
export function setAdapter(custom) {
  adapter = custom;
}

// ---------------------------------------------------------------------------
// Domain functions
// ---------------------------------------------------------------------------

/** Register a candidate's reference pack in the AOC vault. */
export function registerCandidatePack({ packId, ownerId, schema }) {
  return getAdapter().registerPack({ packId, ownerId, schema });
}

/** Grant consent for a grantee to access pack data via specified scopes. */
export function grantCandidateConsent({ consentId, packId, granteeId, scopes, ttlSeconds }) {
  return getAdapter().grantConsent({ consentId, packId, granteeId, scopes, ttlSeconds });
}

/** Mint an attenuated capability for an employer, derived from a consent. */
export function mintEmployerCapability({ consentId, granteeId, scopes, ttlSeconds }) {
  return getAdapter().mintCapability({ consentId, granteeId, scopes, ttlSeconds });
}

/** Resolve an employer access request against SDL paths (deterministic). */
export function requestEmployerAccess({ capabilityId, sdlPaths, nonce }) {
  return getAdapter().resolveAccess({ capabilityId, sdlPaths, nonce });
}

/** Revoke an employer capability. */
export function revokeEmployerCapability({ capabilityId }) {
  return getAdapter().revokeCapability({ capabilityId });
}

export default {
  getAdapter,
  resetAdapter,
  setAdapter,
  registerCandidatePack,
  grantCandidateConsent,
  mintEmployerCapability,
  requestEmployerAccess,
  revokeEmployerCapability
};
