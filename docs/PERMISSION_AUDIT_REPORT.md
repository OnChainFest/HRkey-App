# HRKey Backend Permission & Authorization Audit Report

**Date:** 2025-12-12
**Auditor:** Security & Authorization Architect
**Scope:** All backend API endpoints (`backend/server.js`)
**Status:** Analysis Complete - No Code Changes

---

## Executive Summary

This audit identifies **15 critical permission gaps** across 54 API endpoints. The system currently relies on:

- **Role-based guards** (`requireAuth`, `requireSuperadmin`, `requireCompanySigner`)
- **Controller-level authorization** (inline checks)
- **Rate limiting** (general API, auth, token, strict)

**Primary Concern:** Many endpoints delegate resource-scoped authorization to controllers without middleware enforcement. This creates inconsistent patterns and potential bypass risks.

---

## 1. Middleware Inventory

| Middleware | Purpose | Location |
|------------|---------|----------|
| `requireAuth` | Verifies JWT, attaches `req.user` | `middleware/auth.js:23` |
| `requireSuperadmin` | Requires `role === 'superadmin'` | `middleware/auth.js:93` |
| `requireAdmin` | Requires `role in ['admin', 'superadmin']` | `middleware/auth.js:111` (unused) |
| `requireCompanySigner` | Requires active signer for `:companyId` param | `middleware/auth.js:135` |
| `requireAnySigner` | Requires signer of any company | `middleware/auth.js:194` (unused) |
| `optionalAuth` | Extracts user if token present, doesn't require | `middleware/auth.js:243` (unused) |
| `validateBody` | Zod schema validation for request body | `middleware/validate.js:14` |
| `validateParams` | Zod schema validation for URL params | `middleware/validate.js:51` |
| `apiLimiter` | 100 req/15min per IP | `server.js:696` |
| `strictLimiter` | 5 req/hour per IP | `server.js:712` |
| `authLimiter` | 10 req/15min per IP | `server.js:725` |
| `tokenLimiter` | 20 req/hour per IP | `server.js:737` |

---

## 2. Endpoint Audit Table

### 2.1 Wallet Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/wallet/create` | POST | `requireAuth`, `strictLimiter`, `validateBody` | `userId` in body | ✅ Checks `req.user.id === userId` | NO | LOW |
| `/api/wallet/:userId` | GET | `requireAuth`, `validateParams` | `userId` param | ✅ Checks owner OR superadmin | NO | LOW |

### 2.2 Reference Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/reference/request` | POST | `requireAuth`, `validateBody` | `userId` in body | ✅ Checks `req.user.id === userId` | NO | LOW |
| `/api/reference/submit` | POST | `tokenLimiter`, `validateBody` | `token` in body | ❌ No auth required - PUBLIC | **YES** | MEDIUM |
| `/api/reference/by-token/:token` | GET | `tokenLimiter`, `validateParams` | `token` param | ❌ No auth required - PUBLIC | **YES** | MEDIUM |

**Analysis:** Reference submission is intentionally public (referees don't have accounts). Rate limiting mitigates enumeration risk. **Acceptable design decision.**

### 2.3 Payment Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/create-payment-intent` | POST | `requireAuth`, `authLimiter`, `validateBody` | Authenticated user | ❌ No user-resource binding | **YES** | LOW |
| `/webhook` | POST | Stripe signature verification | External webhook | ✅ Stripe signature validation | NO | LOW |

**Analysis:** Payment intent uses authenticated user's email. No resource ownership concerns.

### 2.4 Identity Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/identity/verify` | POST | `authLimiter`, `requireAuth` | `userId` in body | ❌ **NO CHECK** - Any user can verify any userId | **YES** | **HIGH** |
| `/api/identity/status/:userId` | GET | `requireAuth` | `userId` param | ❌ **NO CHECK** - Any user can view any user's status | **YES** | **HIGH** |

**CRITICAL:** Identity verification allows any authenticated user to verify ANY other user's identity. This is a severe authorization bypass.

### 2.5 Candidate Evaluation Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/candidates/:userId/evaluation` | GET | `requireAuth` | `userId` param | ✅ Checks self OR superadmin | NO | LOW |
| `/api/candidates/:userId/tokenomics-preview` | GET | `requireAuth` | `userId` param | ✅ Checks self OR superadmin | NO | LOW |
| `/api/me/public-identifier` | GET | `requireAuth` | Authenticated user | ✅ Uses `req.user.id` | NO | LOW |
| `/api/public/candidates/:identifier` | GET | None | Public endpoint | ❌ No auth required - PUBLIC | NO | LOW |

### 2.6 Company Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/company/create` | POST | `requireAuth` | Authenticated user | ✅ Uses `req.user.id` as creator | NO | LOW |
| `/api/companies/my` | GET | `requireAuth` | Authenticated user | ✅ Filters by `req.user.id` | NO | LOW |
| `/api/company/:companyId` | GET | `requireAuth`, `requireCompanySigner` | `companyId` param | ✅ Middleware enforces | NO | LOW |
| `/api/company/:companyId` | PATCH | `requireAuth`, `requireCompanySigner` | `companyId` param | ✅ Middleware enforces | NO | LOW |
| `/api/company/:companyId/verify` | POST | `requireAuth`, `requireSuperadmin` | `companyId` param | ✅ Superadmin only | NO | LOW |

### 2.7 Company Signers Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/company/:companyId/signers` | POST | `strictLimiter`, `requireAuth`, `requireCompanySigner` | `companyId` param | ✅ Middleware enforces | NO | LOW |
| `/api/company/:companyId/signers` | GET | `requireAuth`, `requireCompanySigner` | `companyId` param | ✅ Middleware enforces | NO | LOW |
| `/api/company/:companyId/signers/:signerId` | PATCH | `requireAuth`, `requireCompanySigner` | `companyId`, `signerId` | ⚠️ No signerId ownership check | **YES** | MEDIUM |
| `/api/signers/invite/:token` | GET | `tokenLimiter` | `token` param | ❌ No auth - PUBLIC | NO | LOW |
| `/api/signers/accept/:token` | POST | `requireAuth` | `token` param | ✅ Email match validation | NO | LOW |

**Analysis:** `PATCH /signers/:signerId` - any company signer can modify any other signer in the same company. No role hierarchy (admin vs viewer).

### 2.8 Audit Log Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/audit/logs` | GET | `requireAuth` | Query filters | ✅ Complex but correct | NO | LOW |
| `/api/audit/recent` | GET | `requireAuth` | User's companies | ✅ Filters by signer membership | NO | LOW |
| `/api/admin/overview` | GET | `requireAuth` | Admin metrics | ✅ Checks `role === 'superadmin'` | NO | LOW |

### 2.9 Data Access Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/data-access/request` | POST | `requireAuth` | `companyId`, `targetUserId` | ✅ Verifies company signer | NO | LOW |
| `/api/data-access/pending` | GET | `requireAuth` | `req.user.id` | ✅ Filters by target_user_id | NO | LOW |
| `/api/data-access/:requestId/approve` | POST | `requireAuth` | `requestId` param | ✅ Verifies `target_user_id === req.user.id` | NO | LOW |
| `/api/data-access/:requestId/reject` | POST | `requireAuth` | `requestId` param | ✅ Verifies `target_user_id === req.user.id` | NO | LOW |
| `/api/data-access/:requestId/data` | GET | `requireAuth` | `requestId` param | ✅ Verifies company signer + APPROVED | NO | LOW |

### 2.10 Revenue Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/revenue/balance` | GET | `requireAuth` | `req.user.id` | ✅ Uses authenticated user | NO | LOW |
| `/api/revenue/shares` | GET | `requireAuth` | `req.user.id` | ✅ Filters by `target_user_id` | NO | LOW |
| `/api/revenue/transactions` | GET | `requireAuth` | `req.user.id` | ✅ Filters by `user_id` | NO | LOW |
| `/api/revenue/summary` | GET | `requireAuth` | `req.user.id` | ✅ Uses authenticated user | NO | LOW |
| `/api/revenue/payout/request` | POST | `requireAuth` | `req.user.id` | ✅ Uses authenticated user | NO | LOW |

### 2.11 KPI Observations Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/kpi-observations` | POST | `requireAuth` | `subject_wallet`, `observer_wallet` | ❌ **NO CHECK** - Any user can submit KPIs for any wallet | **YES** | **HIGH** |
| `/api/kpi-observations` | GET | `requireAuth` | Query filters | ❌ **NO CHECK** - Any user can read all KPI data | **YES** | **HIGH** |
| `/api/kpi-observations/summary` | GET | `requireAuth` | Query filters | ❌ **NO CHECK** - Any user can read all summaries | **YES** | **HIGH** |

**CRITICAL:** KPI observations allow data poisoning. Any authenticated user can submit false KPIs for any wallet. This directly impacts ML model integrity.

### 2.12 HRKey Score Endpoints

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/hrkey-score` | POST | `requireAuth` | `subject_wallet`, `role_id` | ❌ **NO CHECK** - Any user can request score for any wallet | **YES** | MEDIUM |
| `/api/hrkey-score/model-info` | GET | `requireAuth` | ML model metadata | ❌ Exposes model internals | **YES** | MEDIUM |
| `/api/hrscore/info` | GET | `requireAuth` | Layer metadata | ✅ Safe - general info | NO | LOW |
| `/api/hrscore/user/:userId/latest` | GET | `requireAuth` | `userId` param | ⚠️ Uses `is_superadmin` instead of `role` | **YES** | MEDIUM |
| `/api/hrscore/user/:userId/history` | GET | `requireAuth` | `userId` param | ⚠️ Uses `is_superadmin` instead of `role` | **YES** | MEDIUM |
| `/api/hrscore/user/:userId/improvement` | GET | `requireAuth` | `userId` param | ⚠️ Uses `is_superadmin` instead of `role` | **YES** | MEDIUM |
| `/api/hrscore/user/:userId/stats` | GET | `requireAuth` | `userId` param | ⚠️ Uses `is_superadmin` instead of `role` | **YES** | MEDIUM |
| `/api/hrscore/user/:userId/evolution` | GET | `requireSuperadmin` | `userId` param | ✅ Middleware enforces | NO | LOW |
| `/api/hrscore/calculate` | POST | `requireSuperadmin` | Admin trigger | ✅ Middleware enforces | NO | LOW |

**BUG:** HRScore controller checks `req.user.is_superadmin` but auth middleware sets `req.user.role`. This check will ALWAYS FAIL because `is_superadmin` is undefined.

### 2.13 Analytics Endpoints (Superadmin)

| Endpoint | Method | Middleware | Resource Scope | Controller Auth | Permission Gap | Risk |
|----------|--------|------------|----------------|-----------------|----------------|------|
| `/api/analytics/dashboard` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/info` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/candidates/activity` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/companies/activity` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/funnel` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/demand-trends` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |
| `/api/analytics/skills/trending` | GET | `requireSuperadmin` | Global metrics | ✅ Middleware enforces | NO | LOW |

---

## 3. Permission Gap Summary

| # | Endpoint | Gap Description | Risk Level |
|---|----------|-----------------|------------|
| 1 | `POST /api/identity/verify` | Any user can verify any userId | **HIGH** |
| 2 | `GET /api/identity/status/:userId` | Any user can view any user's KYC status | **HIGH** |
| 3 | `POST /api/kpi-observations` | Any user can submit KPIs for any wallet (data poisoning) | **HIGH** |
| 4 | `GET /api/kpi-observations` | Any user can read all KPI data | **HIGH** |
| 5 | `GET /api/kpi-observations/summary` | Any user can read all aggregated KPI data | **HIGH** |
| 6 | `POST /api/hrkey-score` | Any user can request scores for any wallet | **MEDIUM** |
| 7 | `GET /api/hrkey-score/model-info` | ML model coefficients exposed to all users | **MEDIUM** |
| 8-11 | `GET /api/hrscore/user/:userId/*` | Wrong property check (`is_superadmin` vs `role`) | **MEDIUM** |
| 12 | `PATCH /api/company/:companyId/signers/:signerId` | No role hierarchy within company | **MEDIUM** |

---

## 4. Proposed Permission Model

### 4.1 Role Definitions

```
ROLES:
  - user              # Default authenticated user
  - company_viewer    # Can view company data (signer role)
  - company_admin     # Can manage company signers/settings
  - superadmin        # Platform administrator
```

### 4.2 Resource Ownership Rules

| Resource | Owner | Access Rules |
|----------|-------|--------------|
| User Profile | `user.id` | Owner OR superadmin |
| Identity Verification | `user.id` | Owner only (self-service) |
| Wallet | `wallet.user_id` | Owner OR superadmin |
| Reference | `reference.owner_id` | Owner OR superadmin |
| Company | `company.created_by` + signers | Active signers OR superadmin |
| KPI Observation | `subject_wallet` | Subject owner, OR verified observer, OR superadmin |
| HRScore | `user_id` | Owner OR superadmin |
| Revenue | `user_id` | Owner OR superadmin |

### 4.3 Middleware Stack (Proposed)

```
requireAuth          → All protected endpoints
requireSelf          → userId param must match req.user.id
requireSelfOrAdmin   → userId param matches OR superadmin
requireCompanyMember → Active signer of companyId param
requireCompanyAdmin  → Signer with role='Company Admin'
requireSuperadmin    → role === 'superadmin'
```

### 4.4 Permission Matrix

| Action | user | company_viewer | company_admin | superadmin |
|--------|------|----------------|---------------|------------|
| View own profile | ✅ | ✅ | ✅ | ✅ |
| View any profile | ❌ | ❌ | ❌ | ✅ |
| Verify own identity | ✅ | ✅ | ✅ | ✅ |
| Verify any identity | ❌ | ❌ | ❌ | ✅ |
| Submit own KPIs | ✅ | ✅ | ✅ | ✅ |
| Submit any KPIs | ❌ | ❌ | ❌ | ✅ |
| View own KPIs | ✅ | ✅ | ✅ | ✅ |
| View company KPIs | ❌ | ✅* | ✅* | ✅ |
| Manage signers | ❌ | ❌ | ✅ | ✅ |
| Access analytics | ❌ | ❌ | ❌ | ✅ |

*Only for candidates who approved data access requests

---

## 5. Prioritized Remediation Plan

### Phase 1: Critical (Immediate - Week 1)

| Priority | Issue | Action | Files |
|----------|-------|--------|-------|
| P0 | Identity verification bypass | Add `req.user.id === userId` check | `identityController.js:32-41` |
| P0 | Identity status info leak | Add `req.user.id === userId` OR superadmin check | `identityController.js:152-166` |
| P0 | KPI data poisoning | Add wallet ownership verification | `kpiObservationsController.js:58-227` |
| P0 | KPI data exposure | Add subject_wallet ownership filter | `kpiObservationsController.js:251-359` |

### Phase 2: High (Week 2)

| Priority | Issue | Action | Files |
|----------|-------|--------|-------|
| P1 | HRScore auth bug | Change `is_superadmin` to `role === 'superadmin'` | `hrscoreController.js:56,158,227,296,365` |
| P1 | HRScore request bypass | Add wallet ownership check OR company signer with approved access | `server.js:1400-1469` |
| P1 | Model info exposure | Restrict to superadmin only | `server.js:1494-1510` |

### Phase 3: Medium (Week 3-4)

| Priority | Issue | Action | Files |
|----------|-------|--------|-------|
| P2 | Signer role hierarchy | Add `company_admin` role check for signer management | `signersController.js:395-510` |
| P2 | Create reusable middleware | Implement `requireSelf`, `requireSelfOrAdmin` | `middleware/auth.js` |
| P2 | Centralize resource checks | Create `requireResourceOwner(resourceType)` | `middleware/resourceAuth.js` (new) |

### Phase 4: Hardening (Month 2)

| Priority | Issue | Action | Files |
|----------|-------|--------|-------|
| P3 | Audit trail gaps | Add audit logging for all authorization failures | All controllers |
| P3 | Rate limiting refinement | Add per-user rate limiting for sensitive endpoints | `server.js` |
| P3 | Input validation | Add Zod schemas for all endpoints without validation | Various |

---

## 6. Flagged Ambiguities

| # | Question | Context | Recommendation |
|---|----------|---------|----------------|
| 1 | Should companies be able to view KPI data for candidates who approved data access? | Current: No company access to KPIs | Discuss with product - may need `company_viewer` permissions |
| 2 | Can any authenticated user submit KPIs as an observer? | Current: Yes, no restrictions | Recommend requiring observer wallet ownership proof |
| 3 | Should HRScore calculations be triggered by data access requests? | Current: Manual/superadmin only | Consider automated scoring for approved access |
| 4 | Is `is_superadmin` property ever set on user object? | Auth middleware sets `role` only | Confirm expected behavior with codebase owner |

---

## 7. Technical Debt Notes

1. **Inconsistent auth patterns:** Some controllers check permissions inline, others rely on middleware. Standardize.
2. **Unused middleware:** `requireAdmin`, `requireAnySigner`, `optionalAuth` are defined but never used.
3. **Missing validation schemas:** Many endpoints lack Zod schema validation for body/params.
4. **No RBAC library:** Consider `casbin` or `accesscontrol` for scalable permission management.

---

## Appendix A: File References

| File | Purpose |
|------|---------|
| `backend/server.js` | Main route definitions (lines 921-1757) |
| `backend/middleware/auth.js` | Authentication/authorization middleware |
| `backend/middleware/validate.js` | Zod validation middleware |
| `backend/controllers/identityController.js` | **HIGH RISK** - Missing auth checks |
| `backend/controllers/kpiObservationsController.js` | **HIGH RISK** - Missing auth checks |
| `backend/controllers/hrscoreController.js` | **MEDIUM RISK** - Wrong property check |
| `backend/controllers/dataAccessController.js` | Good reference for proper auth patterns |

---

**Report Prepared By:** Security & Authorization Architect
**Classification:** Internal - Security Sensitive
**Distribution:** Engineering Team, Security Team
