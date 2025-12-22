#!/usr/bin/env node
/**
 * Launch-0 Smoke Test Runner
 *
 * Executes basic HTTP checks against a deployed environment.
 * Never logs response bodies, only status codes.
 */

const BASE_URL = process.env.BASE_URL;
const TEST_USER_JWT = process.env.TEST_USER_JWT;
const PUBLIC_PROFILE_ID = process.env.PUBLIC_PROFILE_ID;

const checks = [];

const record = (name, status, detail) => {
  checks.push({ name, status, detail });
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const runChecks = async () => {
  if (!BASE_URL || BASE_URL.trim().length === 0) {
    console.log('Smoke tests require BASE_URL to be set.');
    process.exit(1);
  }

  const headers = TEST_USER_JWT
    ? { Authorization: `Bearer ${TEST_USER_JWT}` }
    : {};

  // Health check
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/health`);
    record('GET /health', response.ok ? 'PASS' : 'FAIL', `status=${response.status}`);
  } catch (error) {
    record('GET /health', 'FAIL', `error=${error.name}`);
  }

  // Public profile (optional)
  if (PUBLIC_PROFILE_ID) {
    try {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/public-profile/${encodeURIComponent(PUBLIC_PROFILE_ID)}`
      );
      record(
        'GET /api/public-profile/:id',
        response.ok ? 'PASS' : 'FAIL',
        `status=${response.status}`
      );
    } catch (error) {
      record('GET /api/public-profile/:id', 'FAIL', `error=${error.name}`);
    }
  } else {
    record('GET /api/public-profile/:id', 'SKIP', 'PUBLIC_PROFILE_ID not set');
  }

  // HRScore history (optional route)
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/hrkey-score/history?limit=10`, {
      headers
    });
    if (response.status === 404) {
      record('GET /api/hrkey-score/history', 'SKIP', 'status=404');
    } else {
      record('GET /api/hrkey-score/history', response.ok ? 'PASS' : 'FAIL', `status=${response.status}`);
    }
  } catch (error) {
    record('GET /api/hrkey-score/history', 'FAIL', `error=${error.name}`);
  }

  // References
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/references/me`, { headers });
    if (TEST_USER_JWT) {
      record(
        'GET /api/references/me',
        response.status === 401 ? 'FAIL' : 'PASS',
        `status=${response.status}`
      );
    } else {
      record(
        'GET /api/references/me',
        response.status === 401 ? 'PASS' : 'FAIL',
        `status=${response.status}`
      );
    }
  } catch (error) {
    record('GET /api/references/me', 'FAIL', `error=${error.name}`);
  }

  console.log('Launch-0 Smoke Tests');
  console.log('=====================');
  for (const check of checks) {
    console.log(`${check.status} - ${check.name}: ${check.detail}`);
  }
  console.log('=====================');

  const hasFailures = checks.some((check) => check.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
};

runChecks();
