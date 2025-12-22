# Launch-0 Preflight + Smoke Checklist

## Overview
This checklist provides a lightweight preflight validation and smoke test runner
for Launch-0 readiness. These scripts are intended to run against a deployed
environment and do **not** modify data or require admin access.

---

## 1) Preflight Checker

**Script:** `backend/scripts/preflight.mjs`

**Purpose:** Validate required environment variables are present and non-empty.
Secrets are never printed; only presence and masked suffixes are shown.

### Required env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `FRONTEND_URL`
- `USE_HASHED_REFERENCE_TOKENS`
- `NODE_ENV`

### Optional env vars (reported as WARN when missing)
- `BASE_URL`
- `TEST_USER_JWT`

### Run
```bash
node backend/scripts/preflight.mjs
```

---

## 2) Smoke Test Runner

**Script:** `backend/scripts/smoke.mjs`

**Purpose:** Execute a small set of HTTP checks against a deployed API.
Outputs PASS/FAIL/SKIP with status codes only.

### Required env vars
- `BASE_URL` (e.g. `https://staging-api.example.com`)

### Optional env vars
- `TEST_USER_JWT` (bearer token for authenticated checks)
- `PUBLIC_PROFILE_ID` (if public profile route is enabled)

### Checks performed
- `GET /health`
- `GET /api/public-profile/:id` (only if `PUBLIC_PROFILE_ID` is set)
- `GET /api/hrkey-score/history?limit=10` (PASS, or SKIP on 404)
- `GET /api/references/me` (expects 401 without token, non-401 with token)

### Run
```bash
BASE_URL="https://staging-api.example.com" \
TEST_USER_JWT="eyJhbGciOi..." \
PUBLIC_PROFILE_ID="public-id" \
node backend/scripts/smoke.mjs
```

---

## Example: Combined
```bash
export BASE_URL="https://staging-api.example.com"
export TEST_USER_JWT="eyJhbGciOi..."
export PUBLIC_PROFILE_ID="public-id"

node backend/scripts/preflight.mjs
node backend/scripts/smoke.mjs
```
