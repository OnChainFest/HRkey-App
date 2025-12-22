#!/usr/bin/env node
/**
 * Launch-0 Staging Smoke Runner (v2)
 *
 * Executes HTTP checks against a deployed environment.
 * Never logs response bodies or full tokens.
 */

const BASE_URL = process.env.BASE_URL;
const TEST_USER_JWT = process.env.TEST_USER_JWT;
const TEST_USER_ID = process.env.TEST_USER_ID;
const TEST_OTHER_USER_ID = process.env.TEST_OTHER_USER_ID;
const SMOKE_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '15000', 10);

const checks = [];

const record = (name, status, detail) => {
  checks.push({ name, status, detail });
};

const maskValue = (value) => {
  if (!value) return '(missing)';
  const suffix = value.slice(-4);
  return `****${suffix}`;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SMOKE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const hasSensitiveKeys = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  const serialized = JSON.stringify(obj);
  return (
    serialized.includes('email') ||
    serialized.includes('wallet') ||
    serialized.includes('token')
  );
};

const runChecks = async () => {
  if (!BASE_URL || !TEST_USER_JWT || !TEST_USER_ID || !TEST_OTHER_USER_ID) {
    console.log('Smoke v2 requires BASE_URL, TEST_USER_JWT, TEST_USER_ID, TEST_OTHER_USER_ID.');
    console.log(`BASE_URL=${BASE_URL ? 'present' : '(missing)'}`);
    console.log(`TEST_USER_JWT=${maskValue(TEST_USER_JWT)}`);
    console.log(`TEST_USER_ID=${TEST_USER_ID ? 'present' : '(missing)'}`);
    console.log(`TEST_OTHER_USER_ID=${TEST_OTHER_USER_ID ? 'present' : '(missing)'}`);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${TEST_USER_JWT}` };

  // A) Health check (skip if not found)
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/health`);
    if (response.status === 404) {
      record('GET /health', 'WARN', 'status=404');
    } else {
      record('GET /health', response.ok ? 'PASS' : 'FAIL', `status=${response.status}`);
    }
  } catch (error) {
    record('GET /health', 'FAIL', `error=${error.name}`);
  }

  // B) Auth gate: protected endpoint without auth should be 401
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/references/me`);
    record(
      'GET /api/references/me (no auth)',
      response.status === 401 ? 'PASS' : 'FAIL',
      `status=${response.status}`
    );
  } catch (error) {
    record('GET /api/references/me (no auth)', 'FAIL', `error=${error.name}`);
  }

  // C) HRScore history (self)
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/hrkey-score/history?limit=10`, {
      headers: authHeaders
    });
    if (!response.ok) {
      record('GET /api/hrkey-score/history', 'FAIL', `status=${response.status}`);
    } else {
      const json = await parseJsonSafe(response);
      const shapeOk = json && typeof json === 'object' && Array.isArray(json.history);
      const sensitiveOk = !hasSensitiveKeys(json);
      record(
        'GET /api/hrkey-score/history',
        shapeOk && sensitiveOk ? 'PASS' : 'FAIL',
        shapeOk ? 'status=200' : 'invalid json shape'
      );
    }
  } catch (error) {
    record('GET /api/hrkey-score/history', 'FAIL', `error=${error.name}`);
  }

  // D) Negative auth test (other user history)
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/hrkey-score/history?user_id=${encodeURIComponent(TEST_OTHER_USER_ID)}`,
      { headers: authHeaders }
    );
    record(
      'GET /api/hrkey-score/history (other user)',
      response.status === 403 ? 'PASS' : 'FAIL',
      `status=${response.status}`
    );
  } catch (error) {
    record('GET /api/hrkey-score/history (other user)', 'FAIL', `error=${error.name}`);
  }

  // E) Rate limit sanity: trigger 429 with a small burst
  try {
    let limited = false;
    const targetUrl = `${BASE_URL}/api/reference/by-token/invalid-token`;
    const maxAttempts = 25;
    for (let i = 0; i < maxAttempts; i += 1) {
      const response = await fetchWithTimeout(targetUrl);
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    record(
      'Rate limit sanity (public token lookup)',
      limited ? 'PASS' : 'FAIL',
      limited ? 'status=429' : 'no 429 within 25 requests'
    );
  } catch (error) {
    record('Rate limit sanity (public token lookup)', 'FAIL', `error=${error.name}`);
  }

  console.log('Launch-0 Staging Smoke v2');
  console.log('==========================');
  for (const check of checks) {
    console.log(`${check.status} - ${check.name}: ${check.detail}`);
  }
  console.log('==========================');

  const hasFailures = checks.some((check) => check.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
};

runChecks();
