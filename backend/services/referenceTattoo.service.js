/**
 * Reference Tattoo Service
 *
 * Handles on-chain "tattooing" of references for immutable integrity verification.
 * A tattoo is a one-time write of the reference's canonical hash to the blockchain.
 * Once tattooed, the integrity can be verified by comparing local hash vs on-chain hash.
 *
 * Philosophy:
 * - Tattoo is immutable. If reference content changes, integrity becomes INVALID.
 * - VALID = local hash matches on-chain hash
 * - INVALID = local hash differs from on-chain hash
 * - UNKNOWN = reference not yet tattooed
 */

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { keccak256Hash, canonicalizeJson } from '../utils/canonicalHash.js';
import logger from '../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// PeerProofRegistry ABI (minimal interface for tattoo operations)
const PEER_PROOF_REGISTRY_ABI = [
  'function createReference(bytes32 refId, address employee, address reviewer, bytes32 dataHash) external',
  'function references(bytes32 refId) view returns (address employee, address reviewer, bytes32 dataHash, uint64 createdAt, uint8 status)',
  'event ReferenceCreated(bytes32 indexed refId, address indexed employee, address indexed reviewer, bytes32 dataHash)'
];

/**
 * Schema version for canonical reference data
 * Increment if the canonical structure changes
 */
const CANONICAL_SCHEMA_VERSION = 'hrkey.reference.v1';

/**
 * Get blockchain configuration from environment
 * Supports multiple networks via env vars
 */
function getBlockchainConfig() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.BLOCKCHAIN_RPC_URL;
  const contractAddress = process.env.PEER_PROOF_REGISTRY_ADDRESS || process.env.TATTOO_CONTRACT_ADDRESS;
  const chainId = Number(process.env.BASE_CHAIN_ID || process.env.BLOCKCHAIN_CHAIN_ID || 84532);
  const signerKey = process.env.TATTOO_SIGNER_PRIVATE_KEY || process.env.PROOF_SIGNER_PRIVATE_KEY;

  return { rpcUrl, contractAddress, chainId, signerKey };
}

/**
 * Validate blockchain configuration
 */
function validateBlockchainConfig() {
  const { rpcUrl, contractAddress, signerKey } = getBlockchainConfig();

  const errors = [];
  if (!rpcUrl) errors.push('RPC URL not configured (BASE_SEPOLIA_RPC_URL or BLOCKCHAIN_RPC_URL)');
  if (!contractAddress) errors.push('Contract address not configured (PEER_PROOF_REGISTRY_ADDRESS or TATTOO_CONTRACT_ADDRESS)');
  if (!signerKey) errors.push('Signer private key not configured (TATTOO_SIGNER_PRIVATE_KEY or PROOF_SIGNER_PRIVATE_KEY)');

  if (errors.length > 0) {
    const error = new Error(`Blockchain configuration incomplete: ${errors.join('; ')}`);
    error.status = 503;
    error.code = 'BLOCKCHAIN_NOT_CONFIGURED';
    throw error;
  }

  return true;
}

/**
 * Get read-only contract instance
 */
function getReadContract() {
  const { rpcUrl, contractAddress, chainId } = getBlockchainConfig();

  if (!rpcUrl || !contractAddress) {
    const error = new Error('Blockchain not configured for reading');
    error.status = 503;
    throw error;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  const contract = new ethers.Contract(contractAddress, PEER_PROOF_REGISTRY_ABI, provider);

  return { contract, chainId, contractAddress };
}

/**
 * Get write-capable contract instance (with signer)
 */
function getWriteContract() {
  validateBlockchainConfig();

  const { rpcUrl, contractAddress, chainId, signerKey } = getBlockchainConfig();

  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  const signer = new ethers.Wallet(signerKey, provider);
  const contract = new ethers.Contract(contractAddress, PEER_PROOF_REGISTRY_ABI, signer);

  return { contract, signer, chainId, contractAddress };
}

/**
 * Build canonical reference data for hashing
 * Only includes fields that represent the actual meaning of the reference.
 * Excludes volatile fields like timestamps, status, hidden state, etc.
 *
 * @param {Object} reference - Reference row from database
 * @returns {Object} Canonical reference data
 */
export function buildCanonicalReferenceData(reference) {
  // Normalize string values
  const normalize = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val.trim().replace(/\s+/g, ' ');
    return val;
  };

  // Normalize KPI ratings to consistent format
  const normalizeKpiRatings = (ratings) => {
    if (!ratings || typeof ratings !== 'object') return null;

    const normalized = Array.isArray(ratings)
      ? ratings
          .filter((r) => r && typeof r === 'object')
          .map((r) => ({
            kpi_id: normalize(r.kpi_id || r.kpi_name),
            rating: r.rating_value ?? r.rating ?? null
          }))
          .filter((r) => r.kpi_id)
          .sort((a, b) => String(a.kpi_id).localeCompare(String(b.kpi_id)))
      : Object.entries(ratings)
          .map(([kpi_id, rating]) => ({
            kpi_id: normalize(kpi_id),
            rating: rating ?? null
          }))
          .filter((r) => r.kpi_id)
          .sort((a, b) => String(a.kpi_id).localeCompare(String(b.kpi_id)));

    return normalized.length > 0 ? normalized : null;
  };

  return {
    schema: CANONICAL_SCHEMA_VERSION,
    reference_id: reference.id,
    relationship: normalize(reference.relationship),
    summary: normalize(reference.summary),
    detailed_feedback: normalize(reference.detailed_feedback),
    overall_rating: reference.overall_rating ?? null,
    kpi_ratings: normalizeKpiRatings(reference.kpi_ratings),
    reference_type: normalize(reference.reference_type),
    role_id: normalize(reference.role_id),
    // Hash referrer name for privacy but include in canonical data
    referrer_name_hash: reference.referrer_name
      ? keccak256Hash(normalize(reference.referrer_name)).hash
      : null
  };
}

/**
 * Compute keccak256 hash of reference data
 *
 * @param {Object} reference - Reference row from database
 * @returns {{ canonicalData: Object, canonicalJson: string, hash: string }}
 */
export function computeReferenceHash(reference) {
  const canonicalData = buildCanonicalReferenceData(reference);
  const { canonicalJson, hash } = keccak256Hash(canonicalData);

  return { canonicalData, canonicalJson, hash };
}

/**
 * Convert reference UUID to bytes32 for contract
 *
 * @param {string} referenceId - UUID of the reference
 * @returns {string} bytes32 representation
 */
function referenceIdToBytes32(referenceId) {
  // Remove dashes from UUID and pad/truncate to 32 bytes
  const hex = referenceId.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
}

/**
 * Tattoo a reference on-chain
 * This is a one-time operation that commits the reference hash to the blockchain.
 *
 * @param {string} referenceId - UUID of the reference
 * @param {string} ownerId - UUID of the reference owner (for authorization)
 * @param {Object} options - Optional configuration
 * @param {string} options.employeeAddress - Ethereum address for employee (default: zero address)
 * @param {string} options.reviewerAddress - Ethereum address for reviewer (default: zero address)
 * @returns {Promise<Object>} Tattoo result with tx_hash, canonical_hash, etc.
 */
export async function tattooReference(referenceId, ownerId, options = {}) {
  // Fetch reference
  const { data: reference, error: fetchError } = await supabase
    .from('references')
    .select('*')
    .eq('id', referenceId)
    .single();

  if (fetchError || !reference) {
    const error = new Error('Reference not found');
    error.status = 404;
    throw error;
  }

  // Verify ownership
  if (reference.owner_id !== ownerId) {
    const error = new Error('Only the reference owner can tattoo it');
    error.status = 403;
    throw error;
  }

  // Check if already tattooed
  if (reference.tattoo_tx_hash) {
    const error = new Error('Reference is already tattooed');
    error.status = 409;
    error.code = 'ALREADY_TATTOOED';
    error.details = {
      tattoo_tx_hash: reference.tattoo_tx_hash,
      tattooed_at: reference.tattooed_at,
      canonical_hash: reference.canonical_hash
    };
    throw error;
  }

  // Check if hidden
  if (reference.is_hidden) {
    const error = new Error('Cannot tattoo a hidden reference');
    error.status = 400;
    error.code = 'REFERENCE_HIDDEN';
    throw error;
  }

  // Check validation status if exists
  if (reference.validation_status && reference.validation_status.startsWith('REJECTED')) {
    const error = new Error('Cannot tattoo a rejected reference');
    error.status = 400;
    error.code = 'REFERENCE_REJECTED';
    throw error;
  }

  // Compute hash
  const { canonicalData, canonicalJson, hash } = computeReferenceHash(reference);

  // Get contract
  const { contract, chainId, contractAddress, signer } = getWriteContract();

  // Prepare contract call
  const refIdBytes32 = referenceIdToBytes32(referenceId);
  const employeeAddress = options.employeeAddress || ethers.ZeroAddress;
  const reviewerAddress = options.reviewerAddress || ethers.ZeroAddress;
  const dataHash = hash;

  logger.info('Tattooing reference on-chain', {
    referenceId,
    refIdBytes32,
    dataHash,
    chainId,
    contractAddress
  });

  try {
    // Call contract
    const tx = await contract.createReference(
      refIdBytes32,
      employeeAddress,
      reviewerAddress,
      dataHash
    );

    // Wait for confirmation
    const receipt = await tx.wait();

    const tattooedAt = new Date().toISOString();

    // Update database
    const { error: updateError } = await supabase
      .from('references')
      .update({
        tattoo_tx_hash: tx.hash,
        tattoo_chain_id: chainId,
        tattooed_at: tattooedAt,
        canonical_hash: hash,
        onchain_hash: hash,
        integrity_status: 'VALID'
      })
      .eq('id', referenceId);

    if (updateError) {
      logger.error('Failed to update reference after tattoo', {
        referenceId,
        txHash: tx.hash,
        error: updateError.message
      });
      // Don't throw - tx succeeded, just log the error
    }

    logger.info('Reference tattooed successfully', {
      referenceId,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      chainId
    });

    return {
      success: true,
      reference_id: referenceId,
      tattoo_tx_hash: tx.hash,
      tattoo_chain_id: chainId,
      tattooed_at: tattooedAt,
      canonical_hash: hash,
      integrity_status: 'VALID',
      block_number: receipt.blockNumber,
      contract_address: contractAddress
    };
  } catch (err) {
    // Check for specific contract errors
    if (err.message?.includes('already exists')) {
      const error = new Error('Reference already exists on-chain');
      error.status = 409;
      error.code = 'ALREADY_ON_CHAIN';
      throw error;
    }

    logger.error('Failed to tattoo reference on-chain', {
      referenceId,
      error: err.message,
      code: err.code
    });

    const error = new Error(`Blockchain transaction failed: ${err.message}`);
    error.status = 500;
    error.code = 'BLOCKCHAIN_ERROR';
    throw error;
  }
}

/**
 * Read the stored hash from on-chain contract
 *
 * @param {string} referenceId - UUID of the reference
 * @returns {Promise<Object>} On-chain reference data
 */
export async function readOnchainHash(referenceId) {
  try {
    const { contract, chainId, contractAddress } = getReadContract();
    const refIdBytes32 = referenceIdToBytes32(referenceId);

    const result = await contract.references(refIdBytes32);

    // Result is a tuple: [employee, reviewer, dataHash, createdAt, status]
    const [employee, reviewer, dataHash, createdAt, status] = result;

    // Check if reference exists (createdAt > 0)
    const createdAtNumber = typeof createdAt === 'bigint' ? Number(createdAt) : Number(createdAt);
    const exists = createdAtNumber > 0;

    return {
      exists,
      reference_id: referenceId,
      employee,
      reviewer,
      data_hash: dataHash,
      created_at: exists ? new Date(createdAtNumber * 1000).toISOString() : null,
      status: Number(status),
      chain_id: chainId,
      contract_address: contractAddress
    };
  } catch (err) {
    // Handle case where blockchain is not configured
    if (err.status === 503) {
      throw err;
    }

    logger.error('Failed to read on-chain hash', {
      referenceId,
      error: err.message
    });

    const error = new Error(`Failed to read on-chain data: ${err.message}`);
    error.status = 500;
    throw error;
  }
}

/**
 * Verify reference integrity by comparing local hash vs on-chain hash
 *
 * @param {Object} reference - Reference row from database
 * @param {Object} options - Options
 * @param {boolean} options.forceOnchainRead - Force reading from blockchain (ignore cache)
 * @returns {Promise<Object>} Integrity verification result
 */
export async function verifyReferenceIntegrity(reference, options = {}) {
  // If not tattooed, return UNKNOWN
  if (!reference.tattoo_tx_hash) {
    return {
      integrity_status: 'UNKNOWN',
      reason: 'Reference has not been tattooed',
      local_hash: null,
      onchain_hash: null
    };
  }

  // Compute current local hash
  const { hash: localHash } = computeReferenceHash(reference);

  let onchainHash = reference.onchain_hash;

  // Read from chain if forced or no cached hash
  if (options.forceOnchainRead || !onchainHash) {
    try {
      const onchainData = await readOnchainHash(reference.id);
      if (onchainData.exists) {
        onchainHash = onchainData.data_hash;
      }
    } catch (err) {
      // If blockchain is not configured, use cached hash
      if (err.status === 503) {
        logger.warn('Blockchain not configured, using cached on-chain hash', {
          referenceId: reference.id
        });
        onchainHash = reference.onchain_hash || reference.canonical_hash;
      } else {
        throw err;
      }
    }
  }

  // Compare hashes
  const isValid = localHash.toLowerCase() === onchainHash?.toLowerCase();

  return {
    integrity_status: isValid ? 'VALID' : 'INVALID',
    local_hash: localHash,
    onchain_hash: onchainHash,
    canonical_hash_at_tattoo: reference.canonical_hash,
    tattooed_at: reference.tattooed_at,
    tattoo_tx_hash: reference.tattoo_tx_hash,
    tattoo_chain_id: reference.tattoo_chain_id
  };
}

/**
 * Compute integrity status for a reference (without full verification)
 * Uses cached hashes for efficiency
 *
 * @param {Object} reference - Reference row from database
 * @returns {string} Integrity status: VALID | INVALID | UNKNOWN
 */
export function computeIntegrityStatus(reference) {
  // Not tattooed
  if (!reference.tattoo_tx_hash || !reference.canonical_hash) {
    return 'UNKNOWN';
  }

  // Compute current hash
  const { hash: localHash } = computeReferenceHash(reference);

  // Compare with stored canonical hash (at time of tattoo)
  const storedHash = reference.onchain_hash || reference.canonical_hash;
  const isValid = localHash.toLowerCase() === storedHash.toLowerCase();

  return isValid ? 'VALID' : 'INVALID';
}

/**
 * Batch compute integrity status for multiple references
 *
 * @param {Array<Object>} references - Array of reference rows
 * @returns {Array<Object>} References with integrity_status added
 */
export function addIntegrityStatusToReferences(references) {
  return references.map((ref) => ({
    ...ref,
    integrity_status: computeIntegrityStatus(ref)
  }));
}

export default {
  buildCanonicalReferenceData,
  computeReferenceHash,
  tattooReference,
  readOnchainHash,
  verifyReferenceIntegrity,
  computeIntegrityStatus,
  addIntegrityStatusToReferences,
  CANONICAL_SCHEMA_VERSION
};
