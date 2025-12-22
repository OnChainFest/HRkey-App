# Launch-0 Runbook + Go/No-Go Checklist

This runbook is a minimal, practical guide for Launch-0 readiness. It assumes
security P0s are closed and integration tests exist.

---

## 1) Staging Setup Checklist

**Environment & config**
- ✅ `SUPABASE_URL` set and points to staging
- ✅ `SUPABASE_SERVICE_ROLE_KEY` set (server-only, never exposed to clients)
- ✅ `SUPABASE_ANON_KEY` set (client usage only)
- ✅ `RESEND_API_KEY` set and verified domain configured
- ✅ `FRONTEND_URL` points to staging web app
- ✅ `USE_HASHED_REFERENCE_TOKENS` set to expected value
- ✅ `NODE_ENV=staging` (or equivalent)

**Domain & DNS**
- ✅ Staging API domain resolves correctly
- ✅ HTTPS certificate valid

**Supabase**
- ✅ RLS enabled for all tables in scope
- ✅ Service role key is restricted to server usage only
- ✅ Migrations applied successfully

**Email**
- ✅ Resend sender identity verified
- ✅ Test email delivered to a real mailbox

---

## 2) Required Commands (Exact)

```bash
npm test -- tests/integration/ --runInBand
node backend/scripts/preflight.mjs
node backend/scripts/smoke.mjs
```

---

## 3) Interpreting Failures

### `npm test -- tests/integration/ --runInBand` fails
- **Action:** Stop launch. Identify failing suite and fix before proceeding.
- **Common causes:** Missing env vars, database schema mismatch, auth mocks out of date.
- **Next step:** Re-run tests locally and in staging after fixes.

### `node backend/scripts/preflight.mjs` fails
- **Action:** Fix missing/empty env vars in the deployment environment.
- **Rule:** Do **not** proceed until all required vars pass.

### `node backend/scripts/smoke.mjs` fails
- **Action:** Check API uptime and route accessibility for the failed endpoint.
- **If `/health` fails:** Confirm service is deployed and reachable.
- **If `/api/references/me` fails with token present:** Validate auth token and
  backend auth configuration.
- **If `/api/hrkey-score/history` fails:** Confirm route availability or accept
  SKIP if 404 is expected in this environment.

---

## 4) Rollback Plan

**Rollback means:**
- Revert to the last known-good deployment artifact.
- Rotate any leaked or compromised keys.
- Disable outbound email sending (e.g., revoke Resend API key) if necessary.
- Turn off public traffic via load balancer or DNS if needed.

**Steps:**
1. Re-deploy last known-good build.
2. Verify `/health` returns 200.
3. Re-run smoke checks.
4. If incident-related, rotate keys and update env vars.

---

## 5) Incident Checklist

**Auth failures**
- Validate token issuer and expiration.
- Confirm Supabase auth is reachable.
- Check `SUPABASE_URL` and auth config.

**Email failures**
- Confirm `RESEND_API_KEY` is valid.
- Verify sender domain status.
- Check for throttling or API quota issues.

**Reference token issues**
- Validate token generation/verification settings.
- Confirm `USE_HASHED_REFERENCE_TOKENS` matches expected behavior.
- Ensure database contains issued tokens.

**HRScore failures**
- Confirm model artifacts are present and readable.
- Check related dependencies (KPIs, observations) exist.
- Validate environment configuration.

---

## 6) Log Hygiene Rules

**Never paste secrets or tokens into logs.** Always redact.

**Safe examples:**
- `Authorization: Bearer ****abcd`
- `SUPABASE_SERVICE_ROLE_KEY=****wxyz`
- `token=****1234`

**Unsafe examples (do NOT share):**
- Full JWTs
- Full API keys
- Raw reference tokens

---

## 7) Go/No-Go Checklist (Release Day)

**Security**
- ✅ P0 issues closed
- ✅ No secrets in logs

**Observability**
- ✅ Error logging enabled
- ✅ Alerts configured for auth failures and API 5xx

**Performance Basics**
- ✅ `/health` and core endpoints respond within acceptable latency

**Ops/Runbook**
- ✅ Runbook reviewed
- ✅ Rollback plan confirmed

**Data & Migrations**
- ✅ Migrations applied
- ✅ Backups verified

If any item above is **No-Go**, delay launch.
