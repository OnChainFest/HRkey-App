import crypto from 'crypto';
import { keccak256 as ethersKeccak256, toUtf8Bytes } from 'ethers';

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalizeJson(value) {
  const sorted = sortKeysDeep(value);
  return JSON.stringify(sorted);
}

export function canonicalHash(value) {
  const canonicalJson = canonicalizeJson(value);
  const hash = crypto.createHash('sha256').update(canonicalJson).digest('hex');
  return { canonicalJson, hash };
}

/**
 * Compute keccak256 hash of a value (Ethereum-compatible bytes32)
 * @param {any} value - Object or value to hash
 * @returns {{ canonicalJson: string, hash: string }} - The canonical JSON and keccak256 hash (0x-prefixed)
 */
export function keccak256Hash(value) {
  const canonicalJson = canonicalizeJson(value);
  const hash = ethersKeccak256(toUtf8Bytes(canonicalJson));
  return { canonicalJson, hash };
}

/**
 * Compute keccak256 hash from a string (Ethereum-compatible bytes32)
 * @param {string} input - String to hash
 * @returns {string} - Keccak256 hash (0x-prefixed, 66 chars)
 */
export function keccak256String(input) {
  return ethersKeccak256(toUtf8Bytes(input));
}
