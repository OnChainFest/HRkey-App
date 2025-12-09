# Backend Security Audit Report
**Date:** 2025-12-09
**Project:** HRKey Backend
**Branch:** `claude/production-readiness-analysis-011djZiL2uJjqsDthZBeRPxf`
**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## Executive Summary

This audit identifies **8 critical and high-priority security vulnerabilities** in the HRKey backend that must be addressed before production deployment. The most severe issues include:

1. **Debug route exposed in production** (`/debug-sentry`)
2. **Public endpoints without authentication** (KPI observations, HRKey Score)
3. **CORS configuration weakness** (logs warnings but allows all origins)
4. **Placeholder secrets in configuration**

---

## 1. Current Security State

### ✅ Security Controls in Place

| Control | Status | Details |
|---------|--------|---------|
| **Helmet Security Headers** | ✅ Configured | CSP, HSTS, X-Frame-Options, XSS Protection |
| **CORS Configuration** | ⚠️ Partial | Defined but not enforced (allows all origins) |
| **Rate Limiting** | ✅ Implemented | 3 tiers: general (100/15min), strict (5/hr), auth (10/15min) |
| **Authentication Middleware** | ✅ Implemented | JWT-based with Supabase, multiple auth levels |
| **Input Validation** | ✅ Implemented | Zod schemas for body/params/query validation |
| **Request Logging** | ✅ Implemented | Winston with structured logging and request correlation |
| **Error Monitoring** | ✅ Implemented | Sentry integration with context capture |

### ❌ Missing Security Controls

| Control | Priority | Impact |
|---------|----------|--------|
| **Debug route protection** | CRITICAL | Production info disclosure |
| **Public endpoint authorization** | CRITICAL | Unauthorized data access |
| **CORS enforcement** | HIGH | CSRF and origin bypass risks |
| **Request size limits** | MEDIUM | DoS attack vector |
| **Timing attack protection** | MEDIUM | Token enumeration risk |

---

## 2. Critical Vulnerabilities (P0)

### 🔴 VULN-001: Debug Route Exposed in Production

**File:** `backend/server.js:1235-1261`

**Issue:**
```javascript
app.get('/debug-sentry', async (req, res) => {
  try {
    throw new Error("Ruta de prueba ejecutada en Render");
  } catch (error) {
    // ... sends error details in response
    res.status(500).json({
      message: "Error enviado a Sentry",
      error: error.message,
      sentryEnabled: sentryEnabled,
      timestamp: new Date().toISOString()
    });
  }
});
```

**Risk:**
- **Information Disclosure:** Exposes Sentry configuration status
- **Attack Surface:** Debug endpoints should never be public
- **Enumeration:** Allows attackers to probe internal error handling

**CVSS Score:** 7.5 (High)

**Recommendation:**
```javascript
// Option 1: Disable in production
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', async (req, res) => { /* ... */ });
}

// Option 2: Require authentication
app.get('/debug-sentry', requireAuth, requireSuperadmin, async (req, res) => { /* ... */ });

// Option 3: Remove entirely (preferred)
```

---

### 🔴 VULN-002: KPI Observations Endpoints Are Public

**File:** `backend/server.js:1027, 1045, 1063`

**Issue:**
```javascript
// NO AUTHENTICATION REQUIRED
app.post('/api/kpi-observations', kpiObservationsController.createKpiObservations);
app.get('/api/kpi-observations', kpiObservationsController.getKpiObservations);
app.get('/api/kpi-observations/summary', kpiObservationsController.getKpiObservationsSummary);
```

**Risk:**
- **Unauthorized Data Creation:** Anyone can POST fake KPI observations
- **Data Exfiltration:** Anyone can READ all KPI data (competitive intelligence risk)
- **Data Integrity:** Malicious actors can poison the ML training data
- **Privacy Violation:** User performance data exposed without authentication

**CVSS Score:** 9.1 (Critical)

**Recommendation:**
```javascript
// Add authentication
app.post('/api/kpi-observations', requireAuth, kpiObservationsController.createKpiObservations);
app.get('/api/kpi-observations', requireAuth, kpiObservationsController.getKpiObservations);
app.get('/api/kpi-observations/summary', requireAuth, kpiObservationsController.getKpiObservationsSummary);
```

**Note:** If these endpoints are intentionally public for Web3 wallets, implement:
1. Signature verification (wallet-based auth)
2. Rate limiting per wallet address
3. Data validation and sanitization

---

### 🔴 VULN-003: HRKey Score ML Endpoints Are Public

**File:** `backend/server.js:1118, 1211`

**Issue:**
```javascript
// NO AUTHENTICATION REQUIRED
app.post('/api/hrkey-score', async (req, res) => { /* ML scoring */ });
app.get('/api/hrkey-score/model-info', async (req, res) => { /* Model metadata */ });
```

**Risk:**
- **Model Extraction:** Attackers can reverse-engineer the ML model through systematic queries
- **Resource Abuse:** Expensive ML operations without rate limiting
- **Competitive Intelligence:** Scoring algorithm exposed
- **Data Enumeration:** Can probe salary predictions for any wallet address

**CVSS Score:** 8.2 (High)

**Recommendation:**
```javascript
app.post('/api/hrkey-score', requireAuth, apiLimiter, async (req, res) => { /* ... */ });
app.get('/api/hrkey-score/model-info', requireAuth, async (req, res) => { /* ... */ });
```

---

## 3. High-Priority Vulnerabilities (P1)

### 🟠 VULN-004: CORS Configuration Not Enforced

**File:** `backend/server.js:471-495`

**Issue:**
```javascript
if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
  callback(null, true);
} else {
  logger.warn('CORS blocked origin', { origin });
  callback(null, true); // ⚠️ ALLOWS ANYWAY - This is the problem
}
```

**Risk:**
- **CSRF Attacks:** Unauthorized origins can make authenticated requests
- **Data Theft:** Malicious sites can steal user data via CORS bypass
- **Security Theater:** Logs violations but doesn't block them

**CVSS Score:** 6.5 (Medium-High)

**Recommendation:**
```javascript
if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
  callback(null, true);
} else {
  logger.warn('CORS blocked origin', { origin });

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    callback(new Error('CORS policy violation'));
  } else {
    callback(null, true); // Permissive in dev
  }
}
```

---

### 🟠 VULN-005: Default Placeholder Secrets

**File:** `backend/server.js:121-122`

**Issue:**
```javascript
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_reemplaza';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_reemplaza';
```

**Risk:**
- **Accidental Production Use:** If env vars aren't set, uses insecure defaults
- **Git History:** Placeholder values might indicate secrets were committed
- **Configuration Error Detection:** App starts even with invalid keys

**CVSS Score:** 5.5 (Medium)

**Recommendation:**
```javascript
// Fail fast if secrets are missing in production
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Stripe secrets not configured');
  }
  logger.warn('Stripe secrets not configured - using test mode');
}
```

---

### 🟠 VULN-006: No Request Size Limits

**File:** `backend/server.js:580-583`

**Issue:**
```javascript
app.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  return express.json()(req, res, next); // No size limit
});
```

**Risk:**
- **DoS Attack:** Large payloads can exhaust server memory
- **Resource Exhaustion:** Parsing huge JSON consumes CPU
- **Cost Amplification:** Cloud hosting charges for bandwidth

**CVSS Score:** 5.0 (Medium)

**Recommendation:**
```javascript
app.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  return express.json({
    limit: '1mb', // Adjust based on legitimate use cases
    strict: true
  })(req, res, next);
});
```

---

## 4. Medium-Priority Vulnerabilities (P2)

### 🟡 VULN-007: Timing Attack on Token Validation

**File:** Multiple endpoints using token validation

**Issue:** Token comparison might use non-constant-time string comparison, enabling timing attacks.

**Risk:**
- **Token Enumeration:** Attackers can guess tokens character-by-character
- **Brute Force Optimization:** Reduces search space for token guessing

**CVSS Score:** 4.0 (Low-Medium)

**Recommendation:**
```javascript
import crypto from 'crypto';

function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return crypto.timingSafeEqual(
    Buffer.from(a, 'utf8'),
    Buffer.from(b, 'utf8')
  );
}
```

---

### 🟡 VULN-008: Public Reference Submission Endpoints

**File:** `backend/server.js:745, 760`

**Issue:**
```javascript
// Public by design, but risky
app.post('/api/reference/submit', validateBody(submitReferenceSchema), async (req, res) => { /* ... */ });
app.get('/api/reference/by-token/:token', validateParams(getReferenceByTokenSchema), async (req, res) => { /* ... */ });
```

**Risk:**
- **Token Guessing:** 32-byte hex tokens (64 chars) are strong but still guessable
- **Enumeration:** No rate limiting on token validation
- **Spam/Abuse:** Can submit fake references if token is compromised

**CVSS Score:** 4.5 (Low-Medium)

**Recommendation:**
1. Add rate limiting to token endpoints
2. Implement CAPTCHA for public submission
3. Add token expiration checks
4. Log failed token attempts for monitoring

**Current State:**
```javascript
// Add rate limiting
const tokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 attempts per IP
  message: 'Too many token validation attempts'
});

app.post('/api/reference/submit', tokenLimiter, validateBody(submitReferenceSchema), async (req, res) => { /* ... */ });
app.get('/api/reference/by-token/:token', tokenLimiter, validateParams(getReferenceByTokenSchema), async (req, res) => { /* ... */ });
```

---

## 5. Environment Variables Audit

### Required Secrets (Must be set in production)

| Variable | Status | Risk if Missing |
|----------|--------|-----------------|
| `SUPABASE_SERVICE_KEY` | ⚠️ Has default | App fails to authenticate |
| `STRIPE_SECRET_KEY` | ⚠️ Has default | Payment processing breaks |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ Has default | Webhook verification fails |
| `RESEND_API_KEY` | ✅ Checked | Emails silently fail (logged) |
| `SENTRY_DSN` | ✅ Optional | Monitoring disabled |

### Configuration Variables

| Variable | Current Default | Recommendation |
|----------|-----------------|----------------|
| `FRONTEND_URL` | Falls back to APP_URL | ✅ Set explicitly in production |
| `PORT` | 3001 | ✅ Let Render set this |
| `NODE_ENV` | 'development' | ✅ MUST be 'production' on Render |
| `LOG_LEVEL` | 'debug' (dev) / 'info' (prod) | ✅ Good default |

### ⚠️ Exposed in Logs

**File:** `backend/server.js:1272-1279`

```javascript
logger.info('HRKey Backend started', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
  healthEndpoint: new URL('/health', BACKEND_PUBLIC_URL).toString(),
  frontendUrl: APP_URL,
  stripeMode: STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST' // ✅ Safe
});
```

**Status:** ✅ No secrets exposed, only configuration metadata

---

## 6. Error Handling Audit

### ✅ Good Practices Found

1. **No Stack Traces in Client Responses:**
   ```javascript
   // Good example from middleware/auth.js
   return res.status(500).json({
     error: 'Authentication error',
     message: 'An error occurred during authentication'
     // ✅ No stack, no internal details
   });
   ```

2. **Structured Logging:**
   ```javascript
   logger.error('Authentication middleware failed', {
     requestId: req.requestId,
     path: req.path,
     error: error.message,
     stack: error.stack // ✅ Logged server-side only
   });
   ```

3. **Generic 500 Messages:**
   Most error responses use safe, generic messages.

### ⚠️ Areas for Improvement

1. **Validation Error Details:**
   ```javascript
   // File: middleware/validate.js:23-28
   return res.status(400).json({
     error: 'Validation failed',
     details: error.errors.map(err => ({
       field: err.path.join('.'),
       message: err.message, // ⚠️ Could expose schema structure
       code: err.code
     }))
   });
   ```

   **Risk:** Low - validation errors are expected to be detailed for UX
   **Recommendation:** Keep as-is, but ensure Zod messages don't leak internals

---

## 7. Endpoint Security Matrix

### Authentication Status by Endpoint

| Endpoint | Method | Auth | Rate Limit | Validation | Risk Level |
|----------|--------|------|------------|------------|------------|
| `/health` | GET | ❌ Public | ✅ Skipped | ❌ None | 🟢 Low |
| `/health/deep` | GET | ❌ Public | ✅ Skipped | ❌ None | 🟢 Low |
| `/api/wallet/create` | POST | ✅ Required | ✅ Strict | ✅ Schema | 🟢 Low |
| `/api/wallet/:userId` | GET | ❌ Public | ✅ General | ✅ Params | 🟡 Medium |
| `/api/reference/request` | POST | ✅ Required | ✅ General | ✅ Schema | 🟢 Low |
| `/api/reference/submit` | POST | ❌ Public | ❌ None | ✅ Schema | 🟡 Medium |
| `/api/reference/by-token/:token` | GET | ❌ Public | ❌ None | ✅ Params | 🟡 Medium |
| `/create-payment-intent` | POST | ✅ Required | ✅ Auth | ✅ Schema | 🟢 Low |
| `/webhook` | POST | ⚠️ Signature | ✅ General | ✅ Stripe | 🟢 Low |
| `/api/identity/*` | * | ✅ Required | ✅ Auth/Gen | ✅ Schema | 🟢 Low |
| `/api/company/*` | * | ✅ Required | ✅ Signer | ✅ Schema | 🟢 Low |
| `/api/signers/invite/:token` | GET | ❌ Public | ❌ None | ❌ None | 🟡 Medium |
| `/api/signers/accept/:token` | POST | ✅ Required | ❌ None | ❌ None | 🟡 Medium |
| `/api/audit/*` | * | ✅ Required | ✅ General | ❌ None | 🟢 Low |
| `/api/data-access/*` | * | ✅ Required | ✅ General | ❌ None | 🟢 Low |
| `/api/revenue/*` | * | ✅ Required | ✅ General | ❌ None | 🟢 Low |
| **`/api/kpi-observations`** | POST | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |
| **`/api/kpi-observations`** | GET | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |
| **`/api/kpi-observations/summary`** | GET | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |
| **`/api/hrkey-score`** | POST | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |
| **`/api/hrkey-score/model-info`** | GET | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |
| **`/debug-sentry`** | GET | 🔴 **None** | ❌ None | ❌ None | 🔴 **Critical** |

**Legend:**
- 🔴 Critical Risk - Immediate action required
- 🟡 Medium Risk - Should be addressed
- 🟢 Low Risk - Acceptable with current controls

---

## 8. Recommendations Summary

### Immediate Actions (Pre-Production)

1. **VULN-001:** Remove or gate `/debug-sentry` route
2. **VULN-002:** Add authentication to KPI observation endpoints OR implement wallet signature verification
3. **VULN-003:** Add authentication to HRKey Score ML endpoints
4. **VULN-004:** Enforce CORS blocking in production
5. **VULN-005:** Fail fast if Stripe secrets missing in production
6. **VULN-006:** Add request size limits

### Short-Term Improvements

7. **VULN-007:** Implement timing-safe token comparison
8. **VULN-008:** Add rate limiting to public token endpoints
9. Add validation schemas to all endpoints missing them
10. Implement request/response size monitoring

### Long-Term Hardening

11. Implement Web Application Firewall (WAF) rules
12. Add automated security scanning in CI/CD
13. Implement CSRF tokens for state-changing operations
14. Add security headers testing to test suite
15. Implement audit logging for all sensitive operations
16. Add anomaly detection for unusual access patterns

---

## 9. Testing Recommendations

### Security Test Cases to Add

```javascript
// Test 1: Debug route should not be accessible in production
test('DEBUG-1: /debug-sentry should be blocked in production', async () => {
  process.env.NODE_ENV = 'production';
  const res = await request(app).get('/debug-sentry');
  expect(res.status).toBe(404); // Or 403
});

// Test 2: KPI endpoints should require auth
test('SEC-KPI-1: POST /api/kpi-observations should require auth', async () => {
  const res = await request(app)
    .post('/api/kpi-observations')
    .send({ /* valid payload */ });
  expect(res.status).toBe(401);
});

// Test 3: CORS should block unauthorized origins in production
test('SEC-CORS-1: Should block non-whitelisted origins in production', async () => {
  process.env.NODE_ENV = 'production';
  const res = await request(app)
    .get('/health')
    .set('Origin', 'https://evil.com');
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});

// Test 4: Request size limits
test('SEC-SIZE-1: Should reject oversized payloads', async () => {
  const hugePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
  const res = await request(app)
    .post('/api/wallet/create')
    .send({ data: hugePayload });
  expect(res.status).toBe(413); // Payload Too Large
});
```

---

## 10. Compliance Notes

### OWASP Top 10 (2021) Coverage

| Vulnerability | Status | Notes |
|---------------|--------|-------|
| **A01:2021 - Broken Access Control** | 🔴 Found | KPI and ML endpoints lack auth |
| **A02:2021 - Cryptographic Failures** | ✅ Good | Supabase handles encryption, HTTPS enforced |
| **A03:2021 - Injection** | ✅ Good | Zod validation, parameterized queries |
| **A04:2021 - Insecure Design** | 🟡 Partial | Debug routes in production, public ML endpoints |
| **A05:2021 - Security Misconfiguration** | 🟡 Partial | CORS not enforced, default secrets |
| **A06:2021 - Vulnerable Components** | ✅ Good | Dependencies up to date (check regularly) |
| **A07:2021 - Authentication Failures** | ✅ Good | JWT + Supabase, rate limiting |
| **A08:2021 - Data Integrity Failures** | 🟡 Partial | No signature verification for public endpoints |
| **A09:2021 - Logging Failures** | ✅ Good | Winston structured logging, Sentry monitoring |
| **A10:2021 - SSRF** | ✅ Good | No user-controlled URLs in fetch calls |

---

## 11. Sign-Off

**Audited by:** Claude (Anthropic AI)
**Date:** 2025-12-09
**Scope:** Backend API security (Express.js + Node.js)
**Methodology:** Manual code review + configuration analysis

**Next Steps:**
1. Review this audit with the development team
2. Prioritize critical vulnerabilities (P0)
3. Implement fixes and test thoroughly
4. Re-audit after changes
5. Deploy to staging for penetration testing
6. Final security review before production launch

---

**END OF SECURITY AUDIT**
