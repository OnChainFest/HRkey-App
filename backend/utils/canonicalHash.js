import crypto from 'crypto';

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
