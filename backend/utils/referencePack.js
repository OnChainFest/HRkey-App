/**
 * Reference Pack Helper
 *
 * Constructs the canonical Reference Pack object for a submitted reference,
 * normalizes it for deterministic ordering, and computes a SHA256 hash.
 *
 * The resulting hash is stored in references.reference_hash and used for:
 *   - integrity verification
 *   - blockchain anchoring
 *   - scoring algorithms
 *   - paid reference consultation
 */

import crypto from 'crypto';

/**
 * Recursively sort all object keys alphabetically.
 * Arrays preserve element order (order is meaningful).
 * undefined values are omitted.
 *
 * @param {*} value
 * @returns {*} Deep-sorted, undefined-stripped value
 */
function sortKeysDeep(value) {
  if (value === null || value === undefined) {
    return value === undefined ? null : value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const v = value[key];
        // Omit undefined; keep null (null is an explicit "no value")
        if (v !== undefined) {
          acc[key] = sortKeysDeep(v);
        }
        return acc;
      }, {});
  }

  return value;
}

/**
 * Build the canonical Reference Pack for a single submitted reference,
 * normalize it, serialize to JSON, and compute the SHA256 hash.
 *
 * Reference Pack structure:
 * {
 *   answers:      { kpi_ratings, detailed_feedback } — all answers submitted by referee
 *   candidate_id: UUID of the candidate receiving the reference
 *   created_at:   ISO timestamp of reference creation
 *   referee_email: email of the referee who submitted
 *   role_id:      reference role id
 * }
 *
 * @param {Object} reference  - Inserted reference row from the database
 * @param {string} reference.owner_id
 * @param {string} reference.referrer_email
 * @param {string|null} reference.role_id
 * @param {Object|null} reference.kpi_ratings
 * @param {Object|null} reference.detailed_feedback
 * @param {string} reference.created_at
 *
 * @returns {{ reference_pack: Object, reference_hash: string }}
 */
export function buildReferencePack(reference) {
  const pack = {
    candidate_id: reference.owner_id ?? null,
    referee_email: reference.referrer_email ?? null,
    role_id: reference.role_id ?? null,
    answers: {
      kpi_ratings: reference.kpi_ratings ?? null,
      detailed_feedback: reference.detailed_feedback ?? null
    },
    created_at: reference.created_at ?? null
  };

  // Normalize: alphabetically sort all keys at every depth, strip undefined
  const normalized = sortKeysDeep(pack);

  // Canonical JSON serialization — no whitespace, no key ambiguity
  const serialized = JSON.stringify(normalized);

  // SHA256 of canonical JSON
  const reference_hash = crypto.createHash('sha256').update(serialized).digest('hex');

  return { reference_pack: normalized, reference_hash };
}
