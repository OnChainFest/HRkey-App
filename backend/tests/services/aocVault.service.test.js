/**
 * AOC Protocol – HRKey Adapter Unit Tests
 *
 * Validates the deterministic OCAP authorization runtime:
 *   1. Happy path  – consent → mint → ALLOW (resolved + unresolved)
 *   2. Scope escalation → DENY(SCOPE_ESCALATION)
 *   3. Replay → DENY(REPLAY)
 *   4. Unknown consent → CONSENT_NOT_FOUND
 *   5. Revocation → DENY(REVOKED)
 *   6. Expiration → DENY(EXPIRED)
 *   7. Attenuation invariant (cap TTL ≤ consent TTL)
 */

import { jest } from '@jest/globals';
import { createHRKeyAdapter, isPathInScope } from '../../services/aoc-protocol/index.js';

describe('AOC Protocol – HRKey Adapter', () => {
  let adapter;
  let fixedTime;

  beforeEach(() => {
    fixedTime = new Date('2025-06-01T00:00:00Z');
    let counter = 0;
    adapter = createHRKeyAdapter({
      generateId: () => `cap-${++counter}`,
      now: () => fixedTime
    });
  });

  // -----------------------------------------------------------------------
  // Helper: set up a standard pack + consent scenario
  // -----------------------------------------------------------------------
  function setupPackAndConsent() {
    adapter.registerPack({
      packId: 'pack-1',
      ownerId: 'candidate-1',
      schema: ['references.kpi_ratings', 'references.narrative', 'profile.name']
    });
    adapter.grantConsent({
      consentId: 'consent-1',
      packId: 'pack-1',
      granteeId: 'employer-1',
      scopes: ['references.*', 'profile.name'],
      ttlSeconds: 3600
    });
  }

  // =======================================================================
  // isPathInScope (exported utility)
  // =======================================================================
  describe('isPathInScope', () => {
    test('exact match', () => {
      expect(isPathInScope('profile.name', ['profile.name'])).toBe(true);
    });
    test('wildcard match', () => {
      expect(isPathInScope('references.kpi_ratings', ['references.*'])).toBe(true);
    });
    test('root wildcard', () => {
      expect(isPathInScope('anything.here', ['*'])).toBe(true);
    });
    test('no match', () => {
      expect(isPathInScope('profile.email', ['references.*', 'profile.name'])).toBe(false);
    });
  });

  // =======================================================================
  // registerPack
  // =======================================================================
  describe('registerPack', () => {
    test('registers a pack and returns its data', () => {
      const result = adapter.registerPack({
        packId: 'pack-1',
        ownerId: 'candidate-1',
        schema: ['references.kpi_ratings', 'references.narrative']
      });

      expect(result).toEqual({
        packId: 'pack-1',
        ownerId: 'candidate-1',
        schema: ['references.kpi_ratings', 'references.narrative'],
        registeredAt: fixedTime.toISOString()
      });
    });

    test('throws on missing params', () => {
      expect(() => adapter.registerPack({})).toThrow();
    });
  });

  // =======================================================================
  // grantConsent
  // =======================================================================
  describe('grantConsent', () => {
    test('creates consent for a registered pack', () => {
      adapter.registerPack({
        packId: 'pack-1',
        ownerId: 'candidate-1',
        schema: ['references.kpi_ratings']
      });

      const result = adapter.grantConsent({
        consentId: 'consent-1',
        packId: 'pack-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 3600
      });

      expect(result.consentId).toBe('consent-1');
      expect(result.grantorId).toBe('candidate-1');
      expect(result.granteeId).toBe('employer-1');
      expect(result.scopes).toEqual(['references.*']);
    });

    test('throws for unknown pack', () => {
      expect(() =>
        adapter.grantConsent({
          consentId: 'c-1',
          packId: 'nonexistent',
          granteeId: 'emp-1',
          scopes: ['*'],
          ttlSeconds: 3600
        })
      ).toThrow('Pack not found');
    });
  });

  // =======================================================================
  // Happy path: consent → mint → ALLOW with resolved + unresolved
  // =======================================================================
  describe('Happy path: consent → mint → ALLOW', () => {
    test('resolves access with resolved and unresolved fields', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*', 'profile.name'],
        ttlSeconds: 1800
      });

      expect(cap.capabilityId).toBeDefined();
      expect(cap.error).toBeUndefined();

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: [
          'references.kpi_ratings', // in pack schema → resolved
          'references.narrative', //    in pack schema → resolved
          'references.sentiment' //     NOT in pack schema → unresolved
        ],
        nonce: 'nonce-1'
      });

      expect(result.verdict).toBe('ALLOW');
      expect(result.resolvedFields).toEqual([
        'references.kpi_ratings',
        'references.narrative'
      ]);
      expect(result.unresolvedFields).toEqual(['references.sentiment']);
    });
  });

  // =======================================================================
  // Scope escalation → DENY(SCOPE_ESCALATION)
  // =======================================================================
  describe('Scope escalation → DENY(SCOPE_ESCALATION)', () => {
    test('denies when mint requests broader scope than consent', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*', 'profile.*'], // profile.* exceeds consent's profile.name
        ttlSeconds: 1800
      });

      expect(cap.error).toBe('SCOPE_ESCALATION');
    });

    test('denies when access request exceeds capability scope', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.kpi_ratings'], // narrow scope only
        ttlSeconds: 1800
      });

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings', 'references.narrative'], // narrative out of cap scope
        nonce: 'nonce-1'
      });

      expect(result.verdict).toBe('DENY');
      expect(result.reason).toBe('SCOPE_ESCALATION');
      expect(result.deniedPaths).toEqual(['references.narrative']);
    });
  });

  // =======================================================================
  // Replay → DENY(REPLAY)
  // =======================================================================
  describe('Replay → DENY(REPLAY)', () => {
    test('denies when nonce is reused', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      // First request – ALLOW
      const first = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });
      expect(first.verdict).toBe('ALLOW');

      // Replay with same nonce – DENY
      const replay = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });
      expect(replay.verdict).toBe('DENY');
      expect(replay.reason).toBe('REPLAY');
    });
  });

  // =======================================================================
  // Unknown consent → CONSENT_NOT_FOUND
  // =======================================================================
  describe('Unknown consent → CONSENT_NOT_FOUND', () => {
    test('returns error when minting with unknown consent', () => {
      const result = adapter.mintCapability({
        consentId: 'nonexistent',
        granteeId: 'employer-1',
        scopes: ['*'],
        ttlSeconds: 1800
      });

      expect(result.error).toBe('CONSENT_NOT_FOUND');
    });

    test('DENY when consent removed after capability minted', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      // Remove consent from internal state
      adapter._state.consents.delete('consent-1');

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });

      expect(result.verdict).toBe('DENY');
      expect(result.reason).toBe('CONSENT_NOT_FOUND');
    });
  });

  // =======================================================================
  // Revocation
  // =======================================================================
  describe('Revocation', () => {
    test('revoked capability → DENY(REVOKED)', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      const revResult = adapter.revokeCapability({ capabilityId: cap.capabilityId });
      expect(revResult.revoked).toBe(true);

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });
      expect(result.verdict).toBe('DENY');
      expect(result.reason).toBe('REVOKED');
    });

    test('revoking unknown capability returns error', () => {
      const result = adapter.revokeCapability({ capabilityId: 'nonexistent' });
      expect(result.error).toBe('CAPABILITY_NOT_FOUND');
    });
  });

  // =======================================================================
  // Expiration
  // =======================================================================
  describe('Expiration', () => {
    test('expired capability → DENY(EXPIRED)', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      // Advance clock past capability expiry (1800s = 30min)
      fixedTime = new Date('2025-06-01T01:00:00Z');

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });

      expect(result.verdict).toBe('DENY');
      expect(result.reason).toBe('EXPIRED');
    });
  });

  // =======================================================================
  // Attenuation invariant: capability TTL ≤ consent TTL
  // =======================================================================
  describe('Attenuation invariant', () => {
    test('capability TTL is capped at consent expiry', () => {
      setupPackAndConsent(); // consent TTL = 3600s → expires at T+1h

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 7200 // request 2h, but consent expires in 1h
      });

      const capExpiry = new Date(cap.expiresAt);
      const consentExpiry = new Date('2025-06-01T01:00:00Z');

      expect(capExpiry.getTime()).toBeLessThanOrEqual(consentExpiry.getTime());
    });
  });

  // =======================================================================
  // Grantee mismatch
  // =======================================================================
  describe('Grantee mismatch', () => {
    test('denies minting when granteeId does not match consent', () => {
      setupPackAndConsent();

      const result = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'wrong-employer',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      expect(result.error).toBe('GRANTEE_MISMATCH');
    });
  });

  // =======================================================================
  // Consent revocation cascades to access resolution
  // =======================================================================
  describe('Consent revocation cascade', () => {
    test('revoking consent causes DENY(CONSENT_REVOKED) on existing capability', () => {
      setupPackAndConsent();

      const cap = adapter.mintCapability({
        consentId: 'consent-1',
        granteeId: 'employer-1',
        scopes: ['references.*'],
        ttlSeconds: 1800
      });

      // Revoke the underlying consent (via internal state)
      adapter._state.consents.get('consent-1').revoked = true;

      const result = adapter.resolveAccess({
        capabilityId: cap.capabilityId,
        sdlPaths: ['references.kpi_ratings'],
        nonce: 'nonce-1'
      });

      expect(result.verdict).toBe('DENY');
      expect(result.reason).toBe('CONSENT_REVOKED');
    });
  });
});
