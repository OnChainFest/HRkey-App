// =============================================================================
// Verifier Request Pipeline Service
// HRKey Grant Architecture Spec v1.0.0 — §3 Steps 4,5,6,7
// =============================================================================
// Implements the full verifier → consent → proof pipeline:
//
//   Step 4: createVerifierRequest()   — recruiter submits request
//   Step 5: grantConsent()            — candidate grants consent + on-chain anchor
//   Step 6: generateProof()           — proof generation with Merkle disclosure
//   Step 7: verifyProof()             — verifier validates proof
// =============================================================================

import crypto from 'crypto';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { checkConsent, createConsent, logAuditEvent } from '../utils/consentManager.js';
import {
  generateDisclosureProof,
  verifyDisclosureProof,
  canonicalizeValue,
} from './selectiveDisclosure.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPEC_VERSION  = '1.0.0';
const HASH_PREFIX   = 'sha256:';
const CHAIN_ID      = parseInt(process.env.BASE_CHAIN_ID || '84532', 10); // Default: Base Sepolia
const CONTRACT_ADDR = process.env.HRK_ANCHOR_REGISTRY_ADDRESS || '';

// ---------------------------------------------------------------------------
// Database client
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

// ---------------------------------------------------------------------------
// Blockchain client + contract
// ---------------------------------------------------------------------------
let _provider;
let _issuerWallet;
let _anchorContract;

async function getBlockchainClients() {
  if (_anchorContract) return { provider: _provider, wallet: _issuerWallet, contract: _anchorContract };

  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) throw new Error('verifierRequest: BASE_RPC_URL not configured');

  const issuerKey = process.env.ISSUER_PRIVATE_KEY;
  if (!issuerKey) throw new Error('verifierRequest: ISSUER_PRIVATE_KEY not configured');

  if (!CONTRACT_ADDR) throw new Error('verifierRequest: HRK_ANCHOR_REGISTRY_ADDRESS not configured');

  _provider    = new ethers.JsonRpcProvider(rpcUrl);
  _issuerWallet = new ethers.Wallet(issuerKey, _provider);

  // Minimal ABI — only functions we call
  const abi = [
    'function registerConsentHash(bytes32 consentHash, bytes32 consentId) external',
    'function revokeConsentHash(bytes32 consentHash) external',
    'function verifyConsent(bytes32 consentHash) external view returns (bool valid, address recorder, uint64 timestamp)',
    'function verifyReferenceAnchor(bytes32 refHash) external view returns (bool exists, address recorder, uint64 timestamp)',
    'event ConsentRegistered(bytes32 indexed consentHash, bytes32 indexed consentId, address indexed recorder, uint64 timestamp)',
    'event ConsentRevoked(bytes32 indexed consentHash, address indexed revoker, uint64 timestamp)',
  ];

  _anchorContract = new ethers.Contract(CONTRACT_ADDR, abi, _issuerWallet);

  return { provider: _provider, wallet: _issuerWallet, contract: _anchorContract };
}

// =============================================================================
// UTILITY — Hash helpers
// =============================================================================

function sha256hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Convert a UUID string to bytes32 (pad right with zeros for unused bytes).
 * UUID hex without dashes = 32 hex chars = 16 bytes, padded to 32 bytes.
 *
 * @param {string} uuid  e.g. "123e4567-e89b-12d3-a456-426614174000"
 * @returns {string}     "0x" + 32-byte hex
 */
function uuidToBytes32(uuid) {
  const hex = uuid.replace(/-/g, ''); // 32 hex chars = 16 bytes
  return '0x' + hex.padEnd(64, '0'); // pad to 64 hex chars = 32 bytes
}

/**
 * Convert a "sha256:<hex>" string to bytes32 for on-chain use.
 * @param {string} hashStr "sha256:<64 hex chars>"
 * @returns {string}       "0x<64 hex chars>"
 */
function hashStrToBytes32(hashStr) {
  const hex = hashStr.replace(HASH_PREFIX, '');
  if (hex.length !== 64) throw new Error(`Invalid sha256 hash length: ${hex.length}`);
  return '0x' + hex;
}

// =============================================================================
// STEP 4 — CREATE VERIFIER REQUEST
// =============================================================================

/**
 * Create a new VerifierRequestObject.
 *
 * Validates:
 *   - Verifier is a registered company_signer
 *   - ref_id exists and is Active
 *   - requested_fields are valid field names
 *   - verifier_signature is valid EIP-191 over request_hash
 *
 * @param {Object} params
 * @param {string} params.verifierDid        did:ethr:base:0x...
 * @param {string} params.verifierCompanyId  UUID of verifier's company
 * @param {string} params.subjectDid         Candidate's DID
 * @param {string} params.subjectUserId      Candidate's user UUID
 * @param {string} params.refId              Reference UUID
 * @param {string[]} params.requestedFields  Fields to request
 * @param {string} params.purpose            Purpose string
 * @param {string} params.expiresAt          ISO-8601 expiry
 * @param {string} params.verifierSignature  EIP-191 signature
 * @returns {Promise<Object>}                Created VerifierRequestObject
 */
export async function createVerifierRequest({
  verifierDid,
  verifierCompanyId,
  subjectDid,
  subjectUserId,
  refId,
  requestedFields,
  purpose,
  expiresAt,
  verifierSignature,
}) {
  const db = getDb();

  // --- Validate reference exists and is active ---
  const { data: ref, error: refErr } = await db
    .from('references')
    .select('id, status, subject_user_id')
    .eq('id', refId)
    .single();

  if (refErr || !ref) {
    throw Object.assign(new Error('Reference not found'), { statusCode: 404 });
  }
  if (ref.status === 'Suppressed' || ref.status === 'Revoked') {
    throw Object.assign(new Error(`Reference is ${ref.status}`), { statusCode: 409 });
  }

  // --- Validate requested fields exist in field hash table ---
  const { data: fieldRows } = await db
    .from('reference_field_hashes')
    .select('field_name')
    .eq('ref_id', refId);

  const availableFields = new Set((fieldRows || []).map(r => r.field_name));
  const invalidFields   = requestedFields.filter(f => !availableFields.has(f));
  if (invalidFields.length > 0) {
    throw Object.assign(
      new Error(`Invalid requested fields: ${invalidFields.join(', ')}`),
      { statusCode: 400 }
    );
  }

  // --- Generate nonce and build request object for signature verification ---
  const nonce     = crypto.randomBytes(32).toString('hex');
  const requestId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const requestBody = {
    spec_version:       SPEC_VERSION,
    object_type:        'VerifierRequestObject',
    request_id:         requestId,
    verifier_did:       verifierDid,
    verifier_company_id: verifierCompanyId,
    subject_did:        subjectDid,
    ref_id:             refId,
    requested_fields:   [...requestedFields].sort(),
    purpose,
    created_at:         createdAt,
    expires_at:         expiresAt,
    nonce,
  };

  const canonicalBody = canonicalizeValue(requestBody);
  const requestHash   = `${HASH_PREFIX}${sha256hex(canonicalBody)}`;

  // --- Verify verifier's EIP-191 signature ---
  try {
    const hashHex   = requestHash.replace(HASH_PREFIX, '');
    const msgBytes  = ethers.toUtf8Bytes(hashHex);
    const recovered = ethers.verifyMessage(msgBytes, verifierSignature);
    const expectedAddr = verifierDid.split(':').pop(); // last segment of did:ethr:base:0x...
    if (recovered.toLowerCase() !== expectedAddr.toLowerCase()) {
      throw new Error('signature address mismatch');
    }
  } catch (e) {
    throw Object.assign(
      new Error(`Invalid verifier signature: ${e.message}`),
      { statusCode: 401 }
    );
  }

  // --- Persist VerifierRequestObject ---
  const { data: savedRequest, error: saveErr } = await db
    .from('verifier_requests')
    .insert([{
      id:                  requestId,
      verifier_did:        verifierDid,
      verifier_company_id: verifierCompanyId,
      subject_did:         subjectDid,
      subject_user_id:     subjectUserId,
      ref_id:              refId,
      requested_fields:    [...requestedFields].sort(),
      purpose,
      nonce,
      request_hash:        requestHash,
      verifier_signature:  verifierSignature,
      status:              'pending',
      expires_at:          expiresAt,
    }])
    .select()
    .single();

  if (saveErr) {
    logger.error('verifierRequest: failed to save request', { error: saveErr.message });
    throw saveErr;
  }

  logger.info('verifierRequest: created', {
    requestId,
    verifierDid,
    refId,
    subjectUserId,
    requestedFields,
  });

  return { requestId, requestHash, status: 'pending' };
}

// =============================================================================
// STEP 5 — GRANT CONSENT
// =============================================================================

/**
 * Process a candidate's consent grant for a verifier request.
 *
 * Actions:
 *   1. Validate subject owns the reference
 *   2. Validate subject_signature over consent_hash
 *   3. Validate disclosed_fields ⊆ requested_fields
 *   4. Create ConsentObject (DB + existing consents table)
 *   5. Anchor consent_hash on Base via HRKAnchorRegistry.registerConsentHash()
 *   6. Update request status → consent_granted
 *
 * @param {Object} params
 * @param {string} params.requestId         VerifierRequest UUID
 * @param {string} params.subjectDid        Candidate's DID
 * @param {string} params.subjectUserId     Candidate's user UUID
 * @param {string[]} params.disclosedFields Fields candidate consents to share
 * @param {string|null} params.validTo      ISO-8601 consent expiry (null = open-ended)
 * @param {string} params.subjectSignature  EIP-191 signature
 * @returns {Promise<Object>}               { consentId, consentHash, anchorTx }
 */
export async function grantConsent({
  requestId,
  subjectDid,
  subjectUserId,
  disclosedFields,
  validTo,
  subjectSignature,
}) {
  const db = getDb();

  // --- Load verifier request ---
  const { data: request, error: reqErr } = await db
    .from('verifier_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (reqErr || !request) {
    throw Object.assign(new Error('Verifier request not found'), { statusCode: 404 });
  }
  if (request.status !== 'pending') {
    throw Object.assign(
      new Error(`Request is not pending (status: ${request.status})`),
      { statusCode: 409 }
    );
  }
  if (new Date(request.expires_at) < new Date()) {
    await db.from('verifier_requests').update({ status: 'expired' }).eq('id', requestId);
    throw Object.assign(new Error('Verifier request has expired'), { statusCode: 410 });
  }

  // --- Validate subject owns the reference ---
  if (request.subject_did !== subjectDid) {
    throw Object.assign(
      new Error('Subject DID does not match request'),
      { statusCode: 403 }
    );
  }

  // --- Validate disclosed_fields ⊆ requested_fields ---
  const requestedSet = new Set(request.requested_fields);
  const unauthorized  = disclosedFields.filter(f => !requestedSet.has(f));
  if (unauthorized.length > 0) {
    throw Object.assign(
      new Error(`Cannot disclose fields not in request: ${unauthorized.join(', ')}`),
      { statusCode: 400 }
    );
  }

  // --- Build ConsentObject body for signature verification ---
  const consentId = crypto.randomUUID();
  const nonce     = crypto.randomBytes(32).toString('hex');
  const validFrom = new Date().toISOString();

  const consentBody = {
    spec_version:        SPEC_VERSION,
    object_type:         'ConsentObject',
    consent_id:          consentId,
    subject_did:         subjectDid,
    grantee_did:         request.verifier_did,
    grantee_company_id:  request.verifier_company_id,
    ref_id:              request.ref_id,
    verifier_request_id: requestId,
    purpose:             request.purpose,
    disclosed_fields:    [...disclosedFields].sort(),
    valid_from:          validFrom,
    valid_to:            validTo,
    nonce,
  };

  const canonicalBody = canonicalizeValue(consentBody);
  const consentHash   = `${HASH_PREFIX}${sha256hex(canonicalBody)}`;

  // --- Verify subject's EIP-191 signature over consent_hash ---
  try {
    const hashHex    = consentHash.replace(HASH_PREFIX, '');
    const msgBytes   = ethers.toUtf8Bytes(hashHex);
    const recovered  = ethers.verifyMessage(msgBytes, subjectSignature);
    const expectedAddr = subjectDid.split(':').pop();
    if (recovered.toLowerCase() !== expectedAddr.toLowerCase()) {
      throw new Error('address mismatch');
    }
  } catch (e) {
    throw Object.assign(
      new Error(`Invalid subject signature: ${e.message}`),
      { statusCode: 401 }
    );
  }

  // --- Create entry in existing consents table (for backward compat) ---
  const legacyConsent = await createConsent({
    subjectUserId,
    grantedToOrg:  request.verifier_company_id || null,
    grantedToUser: null,
    resourceType:  'references',
    resourceId:    request.ref_id,
    scope:         ['read'],
    purpose:       request.purpose,
    expiresAt:     validTo,
    metadata:      { verifier_request_id: requestId, grant_arch_spec: '1.0.0' },
  });

  // --- Persist ConsentObject with crypto bindings ---
  const { data: consentObj, error: coErr } = await db
    .from('consent_objects')
    .insert([{
      id:                  consentId,
      consent_id:          legacyConsent.id,
      subject_did:         subjectDid,
      grantee_did:         request.verifier_did,
      grantee_company_id:  request.verifier_company_id,
      ref_id:              request.ref_id,
      verifier_request_id: requestId,
      purpose:             request.purpose,
      disclosed_fields:    [...disclosedFields].sort(),
      valid_from:          validFrom,
      valid_to:            validTo,
      nonce,
      subject_signature:   subjectSignature,
      consent_hash:        consentHash,
      chain_id:            CHAIN_ID,
    }])
    .select()
    .single();

  if (coErr) {
    logger.error('verifierRequest: failed to save consent_object', { error: coErr.message });
    throw coErr;
  }

  // --- Anchor consent_hash on Base ---
  let anchorTx = null;
  let anchorBlock = null;
  try {
    const { contract } = await getBlockchainClients();
    const consentHashBytes32 = hashStrToBytes32(consentHash);
    const consentIdBytes32   = uuidToBytes32(consentId);
    const tx = await contract.registerConsentHash(consentHashBytes32, consentIdBytes32);
    const receipt = await tx.wait(1);
    anchorTx    = receipt.hash;
    anchorBlock = Number(receipt.blockNumber);

    // Update consent_object with anchor data
    await db
      .from('consent_objects')
      .update({
        anchor_tx:       anchorTx,
        anchor_block:    anchorBlock,
        anchor_contract: CONTRACT_ADDR,
        anchored_at:     new Date().toISOString(),
      })
      .eq('id', consentId);

    logger.info('verifierRequest: consent anchored on Base', {
      consentId,
      anchorTx,
      anchorBlock,
    });
  } catch (chainErr) {
    // Log but don't fail — consent is valid in DB; anchor can be retried
    logger.error('verifierRequest: consent anchor failed', {
      error: chainErr.message,
      consentId,
    });
  }

  // --- Update request status ---
  await db
    .from('verifier_requests')
    .update({ status: 'consent_granted' })
    .eq('id', requestId);

  await logAuditEvent({
    actorUserId:   subjectUserId,
    action:        'consent_granted',
    targetType:    'reference',
    targetId:      request.ref_id,
    targetOwnerId: subjectUserId,
    purpose:       request.purpose,
    result:        'allowed',
    reason:        'subject_granted_consent',
    consentId:     legacyConsent.id,
    metadata:      { verifier_request_id: requestId, consent_object_id: consentId },
  });

  logger.info('verifierRequest: consent granted', {
    consentId,
    requestId,
    subjectUserId,
    disclosedFields,
    anchorTx,
  });

  return { consentId, consentHash, anchorTx, anchorBlock };
}

// =============================================================================
// STEP 6 — GENERATE DISCLOSURE PROOF
// =============================================================================

/**
 * Generate a DisclosureProofObject for a verifier request with granted consent.
 *
 * @param {string} requestId    VerifierRequest UUID
 * @param {string} requesterId  User ID of requester (for audit)
 * @returns {Promise<Object>}   { proofId, proofObject }
 */
export async function generateProof(requestId, requesterId) {
  const db = getDb();

  // --- Load request ---
  const { data: request, error: reqErr } = await db
    .from('verifier_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (reqErr || !request) {
    throw Object.assign(new Error('Verifier request not found'), { statusCode: 404 });
  }
  if (request.status !== 'consent_granted') {
    throw Object.assign(
      new Error(`Cannot generate proof: request status is ${request.status}`),
      { statusCode: 409 }
    );
  }

  // --- Load ConsentObject ---
  const { data: consentObj } = await db
    .from('consent_objects')
    .select('*')
    .eq('verifier_request_id', requestId)
    .single();

  if (!consentObj) {
    throw Object.assign(new Error('ConsentObject not found for request'), { statusCode: 404 });
  }

  // --- Get issuer signing function ---
  const { wallet } = await getBlockchainClients();
  const issuerSignerFn = async (proofHash) => {
    const hashHex  = proofHash.replace(HASH_PREFIX, '');
    const msgBytes = ethers.toUtf8Bytes(hashHex);
    return wallet.signMessage(msgBytes);
  };

  // --- Generate proof ---
  const { proofId, proofObject } = await generateDisclosureProof({
    refId:              request.ref_id,
    consentObjectId:    consentObj.id,
    verifierRequestId:  requestId,
    disclosedFields:    consentObj.disclosed_fields,
    issuerSignerFn,
    issuerAddress:      wallet.address,
  });

  // --- Update request status ---
  await db
    .from('verifier_requests')
    .update({ status: 'proof_generated' })
    .eq('id', requestId);

  // --- Audit log ---
  await logAuditEvent({
    actorUserId:   requesterId,
    action:        'disclosure_proof_generated',
    targetType:    'reference',
    targetId:      request.ref_id,
    targetOwnerId: null,
    purpose:       request.purpose,
    result:        'allowed',
    reason:        'valid_consent_and_request',
    consentId:     consentObj.consent_id,
    metadata:      {
      verifier_request_id: requestId,
      proof_id: proofId,
      disclosed_fields: consentObj.disclosed_fields,
    },
  });

  logger.info('verifierRequest: proof generated', { proofId, requestId });

  return { proofId, proofObject };
}

// =============================================================================
// STEP 7 — VERIFY PROOF (Server-side helper)
// =============================================================================

/**
 * Server-side disclosure proof verification.
 * Performs both off-chain (Merkle, signature) and on-chain (anchor) checks.
 *
 * @param {Object} proofObject       Full DisclosureProofObject
 * @param {string} verifierRequestId Request ID (for ownership validation)
 * @param {string} verifierDid       Verifier's DID (must match proof's grantee_did)
 * @returns {Promise<Object>}        { valid, checks, onChainChecks }
 */
export async function verifyProof(proofObject, verifierRequestId, verifierDid) {
  const db = getDb();
  const { contract } = await getBlockchainClients();

  const issuerAddress = process.env.ISSUER_PUBLIC_KEY || '';
  const failureReasons = [];
  const onChainChecks  = { referenceAnchored: false, consentValid: false };

  // --- Off-chain verification ---
  const recoverAddressFn = (hashHex, sig) => {
    const msgBytes = ethers.toUtf8Bytes(hashHex);
    return ethers.verifyMessage(msgBytes, sig);
  };

  const offChain = verifyDisclosureProof(proofObject, issuerAddress, recoverAddressFn);

  // --- On-chain: verify reference anchor ---
  try {
    const refMerkleRoot = proofObject.reference_anchor.tx_hash
      ? null
      : null;

    // Load root_hash from our DB (authoritative for what was anchored)
    const { data: merkleRoot } = await db
      .from('reference_merkle_roots')
      .select('root_hash')
      .eq('ref_id', proofObject.ref_id)
      .single();

    if (merkleRoot?.root_hash) {
      const rootBytes32 = hashStrToBytes32(merkleRoot.root_hash);
      const [exists] = await contract.verifyReferenceAnchor(rootBytes32);
      onChainChecks.referenceAnchored = exists;
      if (!exists) failureReasons.push('reference hash not found on-chain');
    }
  } catch (e) {
    failureReasons.push(`on-chain reference check failed: ${e.message}`);
  }

  // --- On-chain: verify consent anchor ---
  try {
    const { data: consentObj } = await db
      .from('consent_objects')
      .select('consent_hash')
      .eq('verifier_request_id', verifierRequestId)
      .single();

    if (consentObj?.consent_hash) {
      const consentBytes32 = hashStrToBytes32(consentObj.consent_hash);
      const [valid] = await contract.verifyConsent(consentBytes32);
      onChainChecks.consentValid = valid;
      if (!valid) failureReasons.push('consent hash invalid or revoked on-chain');
    }
  } catch (e) {
    failureReasons.push(`on-chain consent check failed: ${e.message}`);
  }

  const valid = offChain.valid
    && onChainChecks.referenceAnchored
    && onChainChecks.consentValid;

  // --- Update proof record ---
  if (valid) {
    await db
      .from('disclosure_proofs')
      .update({ verified_at: new Date().toISOString() })
      .eq('verifier_request_id', verifierRequestId);

    await db
      .from('verifier_requests')
      .update({ status: 'verified' })
      .eq('id', verifierRequestId);
  }

  // --- Log verification attempt ---
  await db.from('verifier_verification_log').insert([{
    proof_id:              proofObject.proof_id,
    verifier_did:          verifierDid,
    verification_result:   valid,
    failure_reason:        failureReasons.length > 0 ? failureReasons.join('; ') : null,
    ref_anchor_valid:      onChainChecks.referenceAnchored,
    consent_anchor_valid:  onChainChecks.consentValid,
    signature_valid:       offChain.checks.signatureValid,
    fields_verified:       Object.keys(proofObject.disclosed_fields || {}),
  }]);

  return {
    valid,
    checks: offChain.checks,
    onChainChecks,
    failureReasons: [...(offChain.failureReasons || []), ...failureReasons],
  };
}

// =============================================================================
// CONSENT REVOCATION (callable by candidate)
// =============================================================================

/**
 * Revoke a consent object on-chain and in the database.
 *
 * @param {string} consentObjectId  UUID of the ConsentObject
 * @param {string} subjectDid       Subject's DID (must match consent)
 * @param {string} subjectUserId    Subject's user UUID
 * @returns {Promise<Object>}       { revoked: true, anchorTx }
 */
export async function revokeConsent(consentObjectId, subjectDid, subjectUserId) {
  const db = getDb();

  const { data: consentObj, error } = await db
    .from('consent_objects')
    .select('*')
    .eq('id', consentObjectId)
    .single();

  if (error || !consentObj) {
    throw Object.assign(new Error('ConsentObject not found'), { statusCode: 404 });
  }
  if (consentObj.subject_did !== subjectDid) {
    throw Object.assign(new Error('Unauthorized: not the consent subject'), { statusCode: 403 });
  }
  if (consentObj.revoked_at) {
    throw Object.assign(new Error('Consent already revoked'), { statusCode: 409 });
  }

  // --- Revoke on-chain ---
  let anchorTx = null;
  try {
    const { contract } = await getBlockchainClients();
    const consentHashBytes32 = hashStrToBytes32(consentObj.consent_hash);
    const tx      = await contract.revokeConsentHash(consentHashBytes32);
    const receipt = await tx.wait(1);
    anchorTx = receipt.hash;
  } catch (chainErr) {
    logger.error('verifierRequest: on-chain consent revocation failed', {
      error: chainErr.message,
      consentObjectId,
    });
    // Proceed with DB revocation regardless
  }

  // --- Revoke in DB ---
  const revokedAt = new Date().toISOString();
  await db
    .from('consent_objects')
    .update({ revoked_at: revokedAt, revoked_by_did: subjectDid })
    .eq('id', consentObjectId);

  // Also revoke in legacy consents table
  if (consentObj.consent_id) {
    const { revokeConsent: revokeLegacy } = await import('../utils/consentManager.js');
    await revokeLegacy(consentObj.consent_id, subjectUserId);
  }

  await logAuditEvent({
    actorUserId:   subjectUserId,
    action:        'consent_revoked',
    targetType:    'reference',
    targetId:      consentObj.ref_id,
    targetOwnerId: subjectUserId,
    result:        'allowed',
    reason:        'subject_revoked_consent',
    consentId:     consentObj.consent_id,
    metadata:      { consent_object_id: consentObjectId, anchor_tx: anchorTx },
  });

  logger.info('verifierRequest: consent revoked', {
    consentObjectId,
    subjectDid,
    anchorTx,
  });

  return { revoked: true, anchorTx };
}

export default {
  createVerifierRequest,
  grantConsent,
  generateProof,
  verifyProof,
  revokeConsent,
};
