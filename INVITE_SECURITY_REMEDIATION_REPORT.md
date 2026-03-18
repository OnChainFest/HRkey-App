# Invite Security Remediation Report

## Summary of baseline findings
The baseline audit identified a split-brain design in the reference invite flow:
- a stronger SQL/RPC path used by the Next.js verification page
- a weaker Node/Express path used by backend controllers/services

This divergence caused the practical gaps behind cards #150, #152, #153, #154, #155 and #158.

## Architecture decision taken
The remediation makes the SQL/RPC path the authoritative source of truth for invite verification and invite consumption.

Implementation decisions:
- `submit_reference_by_token` is now the only state-transition authority for invite consumption.
- `get_invite_by_token` now returns invite details only for valid, pending, non-expired invites.
- The frontend verification page no longer calls Supabase RPCs directly; it now goes through hardened backend endpoints.
- The runtime backend entrypoint (`backend/server.js`) now reuses `backend/app.js` instead of maintaining divergent route wiring.
- The backend submit flow enriches the authoritative RPC call with trusted IP-hash and user-agent metadata.

## Files changed
- `backend/app.js`
- `backend/server.js`
- `backend/controllers/referencesController.js`
- `backend/services/references.service.js`
- `backend/schemas/reference.schema.js`
- `HRkey/src/app/ref/verify/page.tsx`
- `sql/015_invite_security_unification.sql`
- `backend/__tests__/integration/inviteSecurity.test.js`
- `backend/tests/integration/references.int.test.js`

## Card-by-card remediation

### #150
- Kept `token_hash` as the only lookup key in the backend service layer.
- Removed stale behavior assumptions by updating tests away from plaintext/legacy lookup expectations.
- Preserved server-side hashing in authoritative SQL RPCs.

### #152
- Expiration enforcement remains in SQL, inside the authoritative claim predicate.
- The backend submit route no longer performs an app-layer pre-check followed by a weaker DB update.
- The frontend now submits through the backend endpoint that delegates to the SQL RPC.

### #153
- Invite claim/use semantics are now centralized in the authoritative SQL RPC.
- Added replay hardening with a unique index on `references(invite_id)`.
- Removed the weaker Node flow that previously performed multi-step invite status changes.

### #154
- Public token lookup now collapses invalid / expired / used / malformed tokens into the same external outcome.
- Public submit now collapses invalid / expired / replayed invites into the same external outcome.
- The frontend verification page no longer exposes invite status distinctions such as “completed” vs “expired”.
- Token parameter validation was relaxed so malformed tokens do not fail early with a distinguishable public response.

### #155
- The real submit flow now runs through the backend endpoint `/api/references/respond/:token`.
- That endpoint is protected by `submitLimiter` in the authoritative runtime wiring.
- `backend/server.js` now reuses `backend/app.js`, removing limiter drift between runtime and app definitions.
- Added tests that exercise rate limiting on the real submit path.

### #158
- Invite usage metadata is now captured in the authoritative backend-to-RPC submit path.
- The backend hashes the trusted client IP with `INVITE_IP_SALT` and sends bounded user-agent data to the SQL RPC.
- Production now requires `INVITE_IP_SALT`; non-production uses an explicit fallback salt with a warning.
- Added tests asserting the RPC receives `p_ip_hash` and `p_user_agent`.

## Remaining risks
- `backend/wallet-creation-backend.js` and `backend/Wallet_Creation_Base_SDK.js` still exist as legacy code artifacts and should not be treated as authoritative runtime entrypoints.
- The repo still contains older non-primary test files under `backend/tests/integration/` that are not part of the default Jest `testMatch`; they were partially updated, but CI should eventually be aligned so there is only one canonical integration-test location.
- The SQL migration exists in-repo, but deployment/application to the live database still depends on operational rollout.

## Follow-up recommendations
- Remove or archive legacy standalone backend files that still embed older invite-flow logic.
- Add database-level deployment verification for migration 015 in staging/production rollout checklists.
- Add end-to-end tests covering the frontend verification page against the backend public endpoints.
- Consider adding per-token and per-IP telemetry counters for abuse monitoring in addition to rate limiting.

## Post-fix delta
- Fixed the frontend/backend response-contract mismatch on the verify page by aligning the page with the backend response shape (`referee_name` / `referee_email`) and keeping the page free of legacy invite-status assumptions.
- Disabled the legacy public submit endpoint `/api/reference/submit` with an explicit `410 ENDPOINT_DEPRECATED` response so the only active public submit path is `/api/references/respond/:token`.
- Fixed the `hashInviteToken` catch-scope issue in `backend/app.js` for public token lookup logging.
- Re-validated cards #154, #155 and #158 with the duplicate public submit path removed from active use.

## Authoritative submit path is now controller-thin + RPC-authoritative
- `referencesController.respondToReferenceInvite` no longer performs invite prefetch or app-layer state validation; it only extracts trusted metadata, delegates to `ReferenceService.submitReference(...)`, and normalizes the external response.
- `ReferenceService.submitReference(...)` remains the single backend submit orchestrator and delegates invite claim/use semantics to the SQL RPC `submit_reference_by_token`.
- `backend/server.js` is now a true thin runtime wrapper that only imports the app and starts listening, leaving route/config authority in `backend/app.js`.

## Final truth table

| Card | Previous Audit Result | New Result | Evidence |
|------|------------------------|-----------|----------|
| #150 | DONE WITH GAPS | DONE | All authoritative lookups use token hashing or hashed-token SQL RPCs; stale plaintext expectations were updated. |
| #151 | DONE | DONE | The invite flow still avoids raw token comparison by hashing before lookup. |
| #152 | DONE WITH GAPS | DONE | Expiration enforcement remains in the SQL claim predicate and the active submit path now delegates to that RPC. |
| #153 | DONE WITH GAPS | DONE | Invite claim/use is centralized in SQL; replay protection was strengthened with `references(invite_id)` uniqueness. |
| #154 | NOT DONE | DONE | Public lookup/submit responses are normalized and the frontend no longer reveals invite state. |
| #155 | PARTIAL | DONE | The real submit path is backend-mediated, rate-limited, and covered by tests on the runtime entrypoint. |
| #158 | PARTIAL | DONE | The authoritative submit flow now forwards trusted IP-hash and bounded user-agent metadata into the SQL RPC, with tests. |
