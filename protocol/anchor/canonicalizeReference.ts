import canonicalize from 'canonicalize';
import { CanonicalReference } from './types.js';

/**
 * Build canonical reference from database row
 * CRITICAL: Throws error if created_at missing (no Date fallback for determinism)
 */
export function buildCanonicalReference(dbRow: any): CanonicalReference {
  // CRITICAL: created_at MUST exist for deterministic hashing
  if (!dbRow.created_at) {
    throw new Error(
      `Missing created_at timestamp for reference ${dbRow.id || 'unknown'}. ` +
      `Cannot build deterministic canonical reference.`
    );
  }

  return {
    referenceId: dbRow.id,
    subjectUserId: dbRow.subject_user_id || dbRow.owner_id,
    observerUserId: dbRow.observer_user_id || dbRow.referrer_id,
    timestamp: dbRow.created_at,  // NO FALLBACK
    kpis: dbRow.kpis || {},
    overallScore: dbRow.overall_rating || 0,
    metadata: {
      version: '1.0.0',
      role: dbRow.role,
      relationship: dbRow.relationship
    }
  };
}

/**
 * Canonicalize reference using RFC 8785
 */
export function canonicalizeReference(ref: CanonicalReference): string {
  const result = canonicalize(ref);
  if (!result) {
    throw new Error('Failed to canonicalize reference');
  }
  return result;
}

/**
 * Hash canonical reference with Keccak256
 */
export function hashReference(canonicalJson: string): string {
  const { keccak256, toUtf8Bytes } = require('ethers');
  return keccak256(toUtf8Bytes(canonicalJson));
}
