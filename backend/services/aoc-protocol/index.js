/**
 * AOC Protocol – HRKey Adapter Layer
 *
 * Object-Capability (OCAP) authorization runtime for HRKey.
 * Deterministic, in-memory, zero external dependencies.
 *
 * Concepts:
 *   Pack       – registered candidate data pack with SDL schema paths
 *   Consent    – permission from pack owner → grantee for specific scopes
 *   Capability – attenuated, nonce-guarded, time-limited token minted from a consent
 *   Access     – deterministic ALLOW / DENY resolution against capability + SDL paths
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// SDL path helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a single SDL path is covered by at least one scope entry.
 * Supports exact match, root wildcard `*`, and prefix wildcard `foo.*`.
 */
export function isPathInScope(path, scopes) {
  return scopes.some((scope) => {
    if (scope === '*') return true;
    if (scope === path) return true;
    if (scope.endsWith('.*')) {
      const prefix = scope.slice(0, -2);
      return path === prefix || path.startsWith(prefix + '.');
    }
    return false;
  });
}

/**
 * Attenuation check – every child scope must be coverable by the parent scopes.
 */
function isScopeSubset(childScopes, parentScopes) {
  return childScopes.every((child) => {
    if (child.endsWith('.*')) {
      const prefix = child.slice(0, -2);
      return (
        parentScopes.some((ps) => ps === child || ps === '*') ||
        isPathInScope(prefix, parentScopes)
      );
    }
    return isPathInScope(child, parentScopes);
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an HRKey-compatible AOC vault adapter.
 *
 * @param {Object}   [config]
 * @param {Function} [config.generateId] – custom ID generator (default: crypto.randomUUID)
 * @param {Function} [config.now]        – custom clock        (default: () => new Date())
 * @returns {IHRKeyVaultAdapter}
 */
export function createHRKeyAdapter(config = {}) {
  const generateId = config.generateId || (() => crypto.randomUUID());
  const now = config.now || (() => new Date());

  /** @type {Map<string, Object>} */
  const packs = new Map();
  /** @type {Map<string, Object>} */
  const consents = new Map();
  /** @type {Map<string, Object>} */
  const capabilities = new Map();

  return {
    // ----- registerPack ---------------------------------------------------
    registerPack({ packId, ownerId, schema }) {
      if (!packId || !ownerId || !Array.isArray(schema)) {
        throw new Error('registerPack: packId, ownerId, and schema[] are required');
      }
      const pack = {
        packId,
        ownerId,
        schema: [...schema],
        registeredAt: now().toISOString()
      };
      packs.set(packId, pack);
      return { ...pack };
    },

    // ----- grantConsent ---------------------------------------------------
    grantConsent({ consentId, packId, granteeId, scopes, ttlSeconds }) {
      if (!consentId || !packId || !granteeId || !Array.isArray(scopes) || !ttlSeconds) {
        throw new Error(
          'grantConsent: consentId, packId, granteeId, scopes[], and ttlSeconds are required'
        );
      }
      const pack = packs.get(packId);
      if (!pack) {
        throw new Error(`Pack not found: ${packId}`);
      }
      const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
      const consent = {
        consentId,
        packId,
        grantorId: pack.ownerId,
        granteeId,
        scopes: [...scopes],
        expiresAt: expiresAt.toISOString(),
        revoked: false
      };
      consents.set(consentId, consent);
      return { ...consent };
    },

    // ----- mintCapability -------------------------------------------------
    mintCapability({ consentId, granteeId, scopes, ttlSeconds }) {
      if (!consentId || !granteeId || !Array.isArray(scopes) || !ttlSeconds) {
        throw new Error(
          'mintCapability: consentId, granteeId, scopes[], and ttlSeconds are required'
        );
      }
      const consent = consents.get(consentId);
      if (!consent) return { error: 'CONSENT_NOT_FOUND' };
      if (consent.revoked) return { error: 'CONSENT_REVOKED' };
      if (new Date(consent.expiresAt) <= now()) return { error: 'CONSENT_EXPIRED' };
      if (consent.granteeId !== granteeId) return { error: 'GRANTEE_MISMATCH' };

      // Attenuation: requested scopes must be a subset of the consent scopes
      if (!isScopeSubset(scopes, consent.scopes)) {
        return { error: 'SCOPE_ESCALATION' };
      }

      const capabilityId = generateId();
      // Capability can never outlive its parent consent
      const expiresAt = new Date(
        Math.min(now().getTime() + ttlSeconds * 1000, new Date(consent.expiresAt).getTime())
      );

      const capability = {
        capabilityId,
        consentId,
        granteeId,
        scopes: [...scopes],
        expiresAt: expiresAt.toISOString(),
        revoked: false,
        usedNonces: new Set()
      };
      capabilities.set(capabilityId, capability);

      return {
        capabilityId,
        consentId,
        granteeId,
        scopes: capability.scopes,
        expiresAt: capability.expiresAt
      };
    },

    // ----- resolveAccess --------------------------------------------------
    resolveAccess({ capabilityId, sdlPaths, nonce }) {
      if (!capabilityId || !Array.isArray(sdlPaths) || !nonce) {
        throw new Error('resolveAccess: capabilityId, sdlPaths[], and nonce are required');
      }

      const DENY = (reason, extra) => ({
        verdict: 'DENY',
        reason,
        resolvedFields: [],
        unresolvedFields: [],
        ...extra
      });

      const capability = capabilities.get(capabilityId);
      if (!capability) return DENY('CAPABILITY_NOT_FOUND');
      if (capability.revoked) return DENY('REVOKED');
      if (new Date(capability.expiresAt) <= now()) return DENY('EXPIRED');

      const consent = consents.get(capability.consentId);
      if (!consent) return DENY('CONSENT_NOT_FOUND');
      if (consent.revoked) return DENY('CONSENT_REVOKED');

      // Replay guard
      if (capability.usedNonces.has(nonce)) return DENY('REPLAY');

      // Scope guard – every requested path must fall within capability scopes
      const outOfScope = sdlPaths.filter((p) => !isPathInScope(p, capability.scopes));
      if (outOfScope.length > 0) {
        return DENY('SCOPE_ESCALATION', { deniedPaths: outOfScope });
      }

      // Record nonce (side-effect; the only mutation during resolution)
      capability.usedNonces.add(nonce);

      // Partition requested paths against the pack schema
      const pack = packs.get(consent.packId);
      const packSchema = pack ? pack.schema : [];
      const resolvedFields = sdlPaths.filter((p) => packSchema.includes(p));
      const unresolvedFields = sdlPaths.filter((p) => !packSchema.includes(p));

      return { verdict: 'ALLOW', resolvedFields, unresolvedFields };
    },

    // ----- revokeCapability -----------------------------------------------
    revokeCapability({ capabilityId }) {
      if (!capabilityId) {
        throw new Error('revokeCapability: capabilityId is required');
      }
      const capability = capabilities.get(capabilityId);
      if (!capability) return { error: 'CAPABILITY_NOT_FOUND' };

      capability.revoked = true;
      return { capabilityId, revoked: true };
    },

    // Expose internal maps for test-only introspection
    _state: { packs, consents, capabilities }
  };
}
