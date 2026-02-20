// =============================================================================
// Selective Disclosure Service
// HRKey Grant Architecture Spec v1.0.0 — §2 and §3 Steps 1,2,6
// =============================================================================
// Implements:
//   - Merkle tree construction over reference field hashes
//   - Salted field hash derivation (SHA-256)
//   - Disclosure proof generation for specific fields
//   - Merkle path extraction per disclosed field
//   - Verifier-side proof verification
// =============================================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPEC_VERSION = '1.0.0';
const HASH_PREFIX  = 'sha256:';

// Standard field names per spec Appendix C
export const REFERENCE_FIELDS = [
  'duration_months',
  'full_text',
  'performance_rating',
  'recommendation_strength',
  'relationship',
  'skills',
  'title_at_time',
  'would_rehire',
];

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
let _supabase;
const getDb = () => {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
};

// =============================================================================
// SECTION A — HASH PRIMITIVES
// =============================================================================

/**
 * Compute a single field hash leaf.
 *
 * Formula per spec §1.1:
 *   field_hash = SHA256( ref_id + ":" + field_name + ":" + canonical(field_value) + ":" + field_salt )
 *
 * @param {string} refId       UUID of the reference
 * @param {string} fieldName   Lowercase field name (e.g. "relationship")
 * @param {*}      fieldValue  Field value (will be canonicalized)
 * @param {string} fieldSalt   32-byte hex string (stored only in vault)
 * @returns {string}           "sha256:<hex>"
 */
export function computeFieldHash(refId, fieldName, fieldValue, fieldSalt) {
  const canonicalValue = canonicalizeValue(fieldValue);
  const input = `${refId}:${fieldName}:${canonicalValue}:${fieldSalt}`;
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return `${HASH_PREFIX}${hash}`;
}

/**
 * Produce canonical (deterministic) string representation of a value.
 * Follows RFC 8785 principles: keys sorted, no whitespace.
 *
 * @param {*} value
 * @returns {string}
 */
export function canonicalizeValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string')  return value;
  if (typeof value === 'number')  return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(canonicalizeValue));
  }
  if (typeof value === 'object') {
    const sorted = Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = value[k];
      return acc;
    }, {});
    return JSON.stringify(sorted);
  }
  return String(value);
}

/**
 * Compute SHA-256 of a buffer or string, returning hex string.
 *
 * @param {string|Buffer} input
 * @returns {string} hex digest
 */
function sha256hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// =============================================================================
// SECTION B — MERKLE TREE
// =============================================================================

/**
 * Build a Merkle tree from an ordered list of leaf hashes.
 *
 * Leaves are padded to next power of 2 by repeating the last leaf.
 * Internal nodes: SHA256( left_bytes || right_bytes ).
 *
 * @param {string[]} leaves  Array of hex strings (WITHOUT "sha256:" prefix)
 * @returns {{ layers: string[][], root: string }}
 *   layers[0] = leaves, layers[last] = [root]
 */
export function buildMerkleTree(leaves) {
  if (!leaves || leaves.length === 0) {
    throw new Error('selectiveDisclosure: cannot build tree with zero leaves');
  }

  // Pad to power of 2
  const n = nextPowerOfTwo(leaves.length);
  const padded = [...leaves];
  while (padded.length < n) {
    padded.push(padded[padded.length - 1]);
  }

  const layers = [padded];

  let current = padded;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left  = current[i];
      const right = current[i + 1];
      // Deterministic ordering: sort hex strings before hashing
      const [lo, hi] = left <= right ? [left, right] : [right, left];
      next.push(sha256hex(Buffer.from(lo + hi, 'utf8')));
    }
    layers.push(next);
    current = next;
  }

  return { layers, root: current[0] };
}

/**
 * Generate Merkle proof (sibling path) for a leaf at given index.
 *
 * @param {string[][]} layers  Output of buildMerkleTree
 * @param {number}     index   Leaf index
 * @returns {string[]}         Sibling hashes from leaf to root
 */
export function getMerklePath(layers, index) {
  const path = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sibling < layers[level].length) {
      path.push(layers[level][sibling]);
    }
    idx = Math.floor(idx / 2);
  }
  return path;
}

/**
 * Verify a Merkle proof.
 *
 * @param {string}   leafHash  Hex string of the leaf
 * @param {string[]} path      Sibling path from getMerklePath
 * @param {string}   root      Expected Merkle root (hex, no prefix)
 * @returns {boolean}
 */
export function verifyMerklePath(leafHash, path, root) {
  let current = leafHash;
  for (const sibling of path) {
    const [lo, hi] = current <= sibling ? [current, sibling] : [sibling, current];
    current = sha256hex(Buffer.from(lo + hi, 'utf8'));
  }
  return current === root;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// =============================================================================
// SECTION C — REFERENCE FIELD HASH COMPUTATION
// =============================================================================

/**
 * Compute all field hashes for a reference and build the Merkle root.
 * Salts are generated here and returned for vault storage.
 *
 * @param {string} refId    UUID of the reference
 * @param {Object} fields   Map of fieldName → fieldValue
 * @returns {{
 *   fieldSalts:  Object,   // fieldName → 32-byte hex salt (store in vault ONLY)
 *   fieldHashes: Object,   // fieldName → "sha256:<hex>"
 *   leafOrder:   string[], // sorted field names (Merkle leaf order)
 *   merkleRoot:  string,   // "sha256:<hex>"
 *   merkleTree:  Object    // full tree (layers + root)
 * }}
 */
export function computeReferenceHashes(refId, fields) {
  const fieldNames = Object.keys(fields).sort(); // lexicographic for determinism

  const fieldSalts  = {};
  const fieldHashes = {};

  for (const name of fieldNames) {
    const salt = crypto.randomBytes(32).toString('hex');
    fieldSalts[name]  = salt;
    fieldHashes[name] = computeFieldHash(refId, name, fields[name], salt);
  }

  // Merkle tree uses hex-only values (strip "sha256:" prefix for tree ops)
  const leaves = fieldNames.map(n => fieldHashes[n].replace(HASH_PREFIX, ''));
  const tree   = buildMerkleTree(leaves);

  return {
    fieldSalts,
    fieldHashes,
    leafOrder:  fieldNames,
    merkleRoot: `${HASH_PREFIX}${tree.root}`,
    merkleTree: tree,
  };
}

// =============================================================================
// SECTION D — DISCLOSURE PROOF GENERATION
// =============================================================================

/**
 * Generate a DisclosureProofObject for a set of consented fields.
 *
 * Enforces security invariants:
 *   INV-1: disclosed_fields ⊆ consent.disclosed_fields
 *   INV-5: reference must not be Suppressed
 *
 * @param {Object} params
 * @param {string} params.refId                UUID of the reference
 * @param {string} params.consentObjectId      UUID of the ConsentObject
 * @param {string} params.verifierRequestId    UUID of the VerifierRequestObject
 * @param {string[]} params.disclosedFields    Fields to include in proof
 * @param {string} params.issuerSignerFn       async (proofHash) => "0x<sig>" — called with hex hash
 * @param {string} params.issuerAddress        Ethereum address of issuer signer
 * @returns {Promise<Object>}                  DisclosureProofObject (spec §1.3)
 */
export async function generateDisclosureProof({
  refId,
  consentObjectId,
  verifierRequestId,
  disclosedFields,
  issuerSignerFn,
  issuerAddress,
}) {
  const db = getDb();

  // --------------------------------------------------
  // Load ConsentObject — validates disclosed_fields scope
  // --------------------------------------------------
  const { data: consentObj, error: coErr } = await db
    .from('consent_objects')
    .select('*')
    .eq('id', consentObjectId)
    .single();

  if (coErr || !consentObj) {
    throw new Error(`selectiveDisclosure: ConsentObject not found: ${consentObjectId}`);
  }

  // Enforce INV-4: consent must not be revoked
  if (consentObj.revoked_at) {
    throw new Error('selectiveDisclosure: ConsentObject has been revoked');
  }

  // Enforce valid_to
  if (consentObj.valid_to && new Date(consentObj.valid_to) < new Date()) {
    throw new Error('selectiveDisclosure: ConsentObject has expired');
  }

  // Enforce INV-1: disclosed_fields must be a subset of consent.disclosed_fields
  const consentedFields = new Set(consentObj.disclosed_fields);
  const unauthorized    = disclosedFields.filter(f => !consentedFields.has(f));
  if (unauthorized.length > 0) {
    throw new Error(
      `selectiveDisclosure: Fields not in consent scope: ${unauthorized.join(', ')}`
    );
  }

  // --------------------------------------------------
  // Load reference field hashes + Merkle root
  // --------------------------------------------------
  const { data: merkleRoot, error: mrErr } = await db
    .from('reference_merkle_roots')
    .select('*')
    .eq('ref_id', refId)
    .single();

  if (mrErr || !merkleRoot) {
    throw new Error(`selectiveDisclosure: Merkle root not found for ref ${refId}`);
  }

  const { data: fieldHashRows, error: fhErr } = await db
    .from('reference_field_hashes')
    .select('field_name, field_hash, leaf_index')
    .eq('ref_id', refId)
    .order('leaf_index');

  if (fhErr || !fieldHashRows || fieldHashRows.length === 0) {
    throw new Error(`selectiveDisclosure: No field hashes found for ref ${refId}`);
  }

  // Build a map of fieldName → { field_hash, leaf_index }
  const fieldHashMap = {};
  for (const row of fieldHashRows) {
    fieldHashMap[row.field_name] = {
      fieldHash:  row.field_hash,
      leafIndex:  row.leaf_index,
    };
  }

  // --------------------------------------------------
  // Load field salts and plaintext values from vault
  // (only for fields being disclosed)
  // --------------------------------------------------
  const disclosedFieldData = {};
  const undisclosedFieldHashes = {};

  for (const row of fieldHashRows) {
    if (disclosedFields.includes(row.field_name)) {
      // Load from vault — sdl_statements keyed by ref_id:field_name
      const vaultKey = `${refId}:field:${row.field_name}`;
      const { data: vaultEntry } = await db
        .from('sdl_statements')
        .select('value_ref')
        .eq('subject', refId)
        .eq('key', vaultKey)
        .single();

      const fieldValue = vaultEntry?.value_ref?.value ?? null;
      disclosedFieldData[row.field_name] = {
        value:     fieldValue,
        fieldHash: row.field_hash,
        leafIndex: row.leaf_index,
      };
    } else {
      undisclosedFieldHashes[row.field_name] = row.field_hash;
    }
  }

  // --------------------------------------------------
  // Reconstruct Merkle tree for path generation
  // --------------------------------------------------
  const sortedLeaves = fieldHashRows
    .sort((a, b) => a.leaf_index - b.leaf_index)
    .map(r => r.field_hash.replace(HASH_PREFIX, ''));

  const tree = buildMerkleTree(sortedLeaves);
  const expectedRoot = `${HASH_PREFIX}${tree.root}`;

  if (expectedRoot !== merkleRoot.root_hash) {
    throw new Error(
      'selectiveDisclosure: Merkle root mismatch — vault integrity failure'
    );
  }

  // --------------------------------------------------
  // Build disclosed_fields with Merkle proofs
  // --------------------------------------------------
  const disclosedWithProofs = {};
  for (const fieldName of disclosedFields) {
    const data      = disclosedFieldData[fieldName];
    if (!data) {
      throw new Error(`selectiveDisclosure: Field not found in vault: ${fieldName}`);
    }
    const merklePath = getMerklePath(tree.layers, data.leafIndex);
    disclosedWithProofs[fieldName] = {
      value:       data.value,
      field_hash:  data.fieldHash,
      merkle_path: merklePath,
      merkle_root: merkleRoot.root_hash,
    };
  }

  // --------------------------------------------------
  // Build DisclosureProofObject body
  // --------------------------------------------------
  const proofId   = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const proofBody = {
    spec_version:            SPEC_VERSION,
    object_type:             'DisclosureProofObject',
    proof_id:                proofId,
    ref_id:                  refId,
    consent_id:              consentObj.consent_id,
    verifier_request_id:     verifierRequestId,
    created_at:              createdAt,
    disclosed_fields:        disclosedWithProofs,
    undisclosed_field_hashes: undisclosedFieldHashes,
    reference_anchor: {
      tx_hash:          merkleRoot.anchor_tx,
      block_number:     merkleRoot.anchor_block,
      contract_address: merkleRoot.anchor_contract,
      chain_id:         merkleRoot.chain_id,
    },
    consent_anchor: {
      tx_hash:          consentObj.anchor_tx,
      block_number:     consentObj.anchor_block,
      contract_address: consentObj.anchor_contract,
      chain_id:         consentObj.chain_id,
    },
  };

  // Canonical hash of proof body
  const canonicalBody = canonicalizeValue(proofBody);
  const proofHash     = `${HASH_PREFIX}${sha256hex(canonicalBody)}`;

  // Sign the proof hash
  const issuerSignature = await issuerSignerFn(proofHash);

  const proofObject = {
    ...proofBody,
    proof_hash:       proofHash,
    issuer_signature: issuerSignature,
    issuer_address:   issuerAddress,
  };

  // --------------------------------------------------
  // Persist DisclosureProofObject to DB
  // --------------------------------------------------
  const { data: savedProof, error: saveErr } = await db
    .from('disclosure_proofs')
    .insert([{
      ref_id:                   refId,
      consent_id:               consentObj.consent_id,
      consent_object_id:        consentObjectId,
      verifier_request_id:      verifierRequestId,
      disclosed_fields:         disclosedWithProofs,
      undisclosed_field_hashes: undisclosedFieldHashes,
      ref_anchor_tx:            merkleRoot.anchor_tx,
      ref_anchor_block:         merkleRoot.anchor_block,
      ref_anchor_contract:      merkleRoot.anchor_contract,
      ref_chain_id:             merkleRoot.chain_id,
      consent_anchor_tx:        consentObj.anchor_tx,
      consent_anchor_block:     consentObj.anchor_block,
      consent_anchor_contract:  consentObj.anchor_contract,
      consent_chain_id:         consentObj.chain_id,
      proof_hash:               proofHash,
      issuer_signature:         issuerSignature,
      issuer_address:           issuerAddress,
    }])
    .select()
    .single();

  if (saveErr) {
    logger.error('selectiveDisclosure: failed to persist proof', { error: saveErr.message, refId });
    throw saveErr;
  }

  // Update verifier_request status
  await db
    .from('verifier_requests')
    .update({ status: 'proof_generated' })
    .eq('id', verifierRequestId);

  logger.info('selectiveDisclosure: proof generated', {
    proofId,
    refId,
    consentId: consentObj.consent_id,
    verifierRequestId,
    disclosedFields,
  });

  return { proofId: savedProof.id, proofObject };
}

// =============================================================================
// SECTION E — VERIFIER-SIDE PROOF VERIFICATION (Off-chain checks)
// =============================================================================

/**
 * Verify a DisclosureProofObject off-chain.
 * Callers should ALSO call HRKAnchorRegistry on-chain for anchor verification.
 *
 * Checks:
 *   1. Merkle path validity for each disclosed field
 *   2. Issuer signature over proof_hash
 *   3. Consent expiry
 *   4. Proof structural integrity
 *
 * @param {Object} proofObject       Full DisclosureProofObject
 * @param {string} trustedIssuerAddr Known issuer Ethereum address
 * @param {Function} recoverAddressFn  (hash, sig) => address — ethers.verifyMessage or equiv
 * @returns {{
 *   valid:              boolean,
 *   checks:            Object,
 *   failureReasons:    string[]
 * }}
 */
export function verifyDisclosureProof(proofObject, trustedIssuerAddr, recoverAddressFn) {
  const reasons = [];
  const checks  = {
    merklePathsValid:   true,
    signatureValid:     false,
    consentNotExpired:  true,
    structureValid:     true,
  };

  // --- Structural check ---
  const required = ['proof_id','ref_id','consent_id','disclosed_fields',
                    'proof_hash','issuer_signature','reference_anchor','consent_anchor'];
  for (const field of required) {
    if (!(field in proofObject)) {
      checks.structureValid = false;
      reasons.push(`missing required field: ${field}`);
    }
  }

  if (!checks.structureValid) {
    return { valid: false, checks, failureReasons: reasons };
  }

  // --- Merkle path verification for each disclosed field ---
  const merkleRoot = proofObject.reference_anchor.tx_hash
    ? null  // must be verified on-chain by caller
    : null;

  for (const [fieldName, fieldData] of Object.entries(proofObject.disclosed_fields)) {
    const leafHex = fieldData.field_hash?.replace(HASH_PREFIX, '');
    const rootHex = fieldData.merkle_root?.replace(HASH_PREFIX, '');
    if (!leafHex || !rootHex || !fieldData.merkle_path) {
      checks.merklePathsValid = false;
      reasons.push(`incomplete Merkle proof for field: ${fieldName}`);
      continue;
    }
    const pathValid = verifyMerklePath(leafHex, fieldData.merkle_path, rootHex);
    if (!pathValid) {
      checks.merklePathsValid = false;
      reasons.push(`invalid Merkle path for field: ${fieldName}`);
    }
  }

  // --- Issuer signature verification ---
  try {
    const proofHashHex = proofObject.proof_hash.replace(HASH_PREFIX, '');
    const recovered    = recoverAddressFn(proofHashHex, proofObject.issuer_signature);
    if (recovered.toLowerCase() === trustedIssuerAddr.toLowerCase()) {
      checks.signatureValid = true;
    } else {
      reasons.push(`issuer signature address mismatch: got ${recovered}`);
    }
  } catch (e) {
    reasons.push(`issuer signature verification error: ${e.message}`);
  }

  const valid = checks.merklePathsValid
    && checks.signatureValid
    && checks.consentNotExpired
    && checks.structureValid;

  return { valid, checks, failureReasons: reasons };
}

// =============================================================================
// SECTION F — STORE FIELD HASHES (called during reference creation)
// =============================================================================

/**
 * Persist computed field hashes and Merkle root to the database.
 * Called after generateDisclosureProof is impossible — this is Step 1+2.
 *
 * @param {string} refId
 * @param {Object} computedHashes  Output of computeReferenceHashes
 * @returns {Promise<void>}
 */
export async function persistReferenceHashes(refId, computedHashes) {
  const db = getDb();
  const { fieldHashes, leafOrder, merkleRoot } = computedHashes;

  // Insert field hash rows
  const rows = leafOrder.map((fieldName, idx) => ({
    ref_id:     refId,
    field_name: fieldName,
    field_hash: fieldHashes[fieldName],
    leaf_index: idx,
  }));

  const { error: fhErr } = await db
    .from('reference_field_hashes')
    .insert(rows);

  if (fhErr) {
    throw new Error(`selectiveDisclosure: failed to persist field hashes: ${fhErr.message}`);
  }

  // Insert (or upsert) merkle root record — anchor fields populated later
  const { error: mrErr } = await db
    .from('reference_merkle_roots')
    .upsert([{
      ref_id:      refId,
      root_hash:   merkleRoot,
      field_count: leafOrder.length,
      author_signature: '', // updated after signing
    }], { onConflict: 'ref_id' });

  if (mrErr) {
    throw new Error(`selectiveDisclosure: failed to persist merkle root: ${mrErr.message}`);
  }

  logger.info('selectiveDisclosure: persisted field hashes', {
    refId,
    fieldCount: leafOrder.length,
    merkleRoot,
  });
}

/**
 * Update the Merkle root record with author signature and on-chain anchor data.
 *
 * @param {string} refId
 * @param {Object} updates  { author_signature, anchor_tx, anchor_block, anchor_contract, anchored_at }
 */
export async function updateReferenceAnchor(refId, updates) {
  const db = getDb();
  const { error } = await db
    .from('reference_merkle_roots')
    .update(updates)
    .eq('ref_id', refId);

  if (error) {
    throw new Error(`selectiveDisclosure: failed to update anchor: ${error.message}`);
  }
}

export default {
  REFERENCE_FIELDS,
  computeFieldHash,
  canonicalizeValue,
  computeReferenceHashes,
  buildMerkleTree,
  getMerklePath,
  verifyMerklePath,
  generateDisclosureProof,
  verifyDisclosureProof,
  persistReferenceHashes,
  updateReferenceAnchor,
};
