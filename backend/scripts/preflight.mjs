#!/usr/bin/env node
/**
 * Launch-0 Preflight Checker
 *
 * Validates required environment variables are present.
 * Never prints secrets; only shows presence and masked suffix.
 */

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'RESEND_API_KEY',
  'FRONTEND_URL',
  'USE_HASHED_REFERENCE_TOKENS',
  'NODE_ENV'
];

const OPTIONAL_VARS = [
  'BASE_URL',
  'TEST_USER_JWT'
];

const results = [];

const maskValue = (value) => {
  if (!value) return '(missing)';
  const suffix = value.slice(-4);
  return `present (****${suffix})`;
};

const checkVar = (name, required = true) => {
  const value = process.env[name];
  const isPresent = typeof value === 'string' && value.trim().length > 0;
  results.push({
    name,
    required,
    status: isPresent ? 'PASS' : 'FAIL',
    detail: isPresent ? maskValue(value.trim()) : '(missing)'
  });
};

for (const name of REQUIRED_VARS) {
  checkVar(name, true);
}

for (const name of OPTIONAL_VARS) {
  checkVar(name, false);
}

const hasFailures = results.some((item) => item.required && item.status === 'FAIL');

console.log('Launch-0 Preflight Check');
console.log('========================');
for (const item of results) {
  const tag = item.status === 'PASS' ? 'PASS' : item.required ? 'FAIL' : 'WARN';
  const requiredLabel = item.required ? 'required' : 'optional';
  console.log(`${tag} - ${item.name} (${requiredLabel}): ${item.detail}`);
}
console.log('========================');
console.log(hasFailures ? 'Preflight FAILED' : 'Preflight PASSED');

process.exit(hasFailures ? 1 : 0);
