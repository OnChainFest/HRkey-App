# Backend Logging Audit & Improvement Plan
**Date:** 2025-12-09
**Status:** AUDIT COMPLETE - Ready for Implementation
**Branch:** `claude/production-readiness-analysis-011djZiL2uJjqsDthZBeRPxf`

---

## Executive Summary

The HRKey backend **already has** a well-designed centralized Winston logger (`logger.js`) with:
- ✅ Structured JSON logging for production
- ✅ Colorized human-readable logs for development
- ✅ Request correlation ID support (`requestId`)
- ✅ Configurable log levels
- ✅ Service metadata

**BUT** the logger is **barely being used**. The codebase has **100+ `console.*` calls** instead of using the Winston logger, resulting in:
- ❌ No structured logging in production
- ❌ No request correlation in error logs
- ❌ No contextual metadata (userId, companyId, etc.)
- ❌ Inconsistent log levels and formats
- ❌ Logs not compatible with log aggregation tools

---

## Current State Analysis

### Files Analyzed
- **server.js**: 15 console.* calls, 2 logger calls
- **Controllers** (7 files): ~70 console.* calls, 0 logger calls
- **Middleware** (2 files): ~8 console.* calls, 0 logger calls
- **Services** (1 file): ~11 console.* calls, 0 logger calls
- **Total**: **~104 console.* statements** vs **2 logger statements**

### Specific Issues

#### 1. **server.js** (Line-by-Line Issues)
| Line | Current Code | Issue |
|------|-------------|-------|
| 134 | `console.warn('⚠️ HRKEY_SUPERADMIN_EMAIL not set...')` | No structured logging, no severity tracking |
| 146 | `console.warn('⚠️ Superadmin email not found...')` | Missing context (email value) |
| 156 | `console.log('✅ User assigned role: superadmin')` | Should be `logger.info` with metadata |
| 279 | `console.log('🧩 EMAIL VERIFICATION LINK:', url)` | Security risk: logging sensitive URLs |
| 366 | `console.warn('RESEND_API_KEY not configured...')` | No structured logging |
| 654-709 | `console.error(e)` (6 occurrences) | No context, no requestId, raw error objects |
| 740 | `console.error('Stripe error:', e)` | No structured metadata |
| 1106 | `console.error('❌ Error en /api/hrkey-score:', err)` | Spanish text, no context |
| 1143 | `console.error('❌ Error en /api/hrkey-score/model-info:', err)` | Spanish text, no context |

#### 2. **Controllers** (All Files)
**Pattern:** Every controller uses `console.error()` in catch blocks with zero context.

**Example from revenueController.js:**
```javascript
} catch (error) {
  console.error('Request payout error:', error);  // ❌ No requestId, no userId, no amount
  return res.status(500).json({ error: 'Failed to create payout request' });
}
```

**What's missing:**
- No request correlation ID
- No user context (userId, email, role)
- No business context (amount, payoutMethod, companyId)
- No structured metadata for filtering/searching

**Files affected:**
- `identityController.js`: 4 console.error calls
- `companyController.js`: 10 console.error/warn calls
- `signersController.js`: 12 console.error/warn calls
- `auditController.js`: 4 console.error calls
- `dataAccessController.js`: 14 console.error/warn calls
- `revenueController.js`: 8 console.error calls
- `kpiObservationsController.js`: 10 console.log/error calls (mix of EN/ES)

#### 3. **Middleware** (auth.js, validate.js)
**Pattern:** Critical middleware errors logged with `console.error()` in `catch` blocks.

**Example from auth.js:**
```javascript
} catch (error) {
  console.error('Auth middleware error:', error);  // ❌ No requestId, no token info
  return res.status(500).json({ error: 'Authentication error' });
}
```

**Impact:**
- Authentication failures impossible to correlate across requests
- No visibility into which routes are failing auth
- No metadata for security monitoring

#### 4. **Services** (webhookService.js)
**Critical gaps:**
- Payment processing uses `console.log()` for success events
- No structured logging for payment amounts, user IDs, plans
- Stripe webhook events not logged with structured metadata
- No correlation between webhook event ID and processing

---

## Problems Summary

### P1 - Critical Production Issues
1. **No Log Aggregation**: Console.* logs in JSON format not parseable by log aggregators
2. **No Request Correlation**: Impossible to trace a request through multiple services
3. **No Error Context**: 500 errors logged without userId, requestId, or business context
4. **Security Gaps**: Missing logs for critical flows (payments, auth failures, data access)

### P2 - High Priority
5. **Inconsistent Log Levels**: Everything is either `console.log` or `console.error`
6. **No Structured Metadata**: Can't filter by userId, companyId, or business events
7. **Mixed Languages**: Some logs in Spanish, others in English
8. **Sensitive Data Logging**: Email verification URLs logged in plaintext (line 279)

### P3 - Medium Priority
9. **Poor Developer Experience**: Dev logs not using Winston's colorization
10. **No Performance Tracking**: No logging of slow queries or operations
11. **Incomplete Error Stack Traces**: Some errors logged without `.stack`

---

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Express App                        │
├─────────────────────────────────────────────────────┤
│  1. requestIdMiddleware (ALREADY EXISTS)            │
│     - Generates unique requestId per request        │
│     - Attaches to req.requestId                     │
│     - Adds X-Request-ID response header             │
├─────────────────────────────────────────────────────┤
│  2. requestLoggingMiddleware (NEW)                  │
│     - Logs incoming requests                        │
│     - Logs response status/duration                 │
│     - Structured: method, path, statusCode, ms      │
├─────────────────────────────────────────────────────┤
│  3. Controllers/Services/Middleware                 │
│     - Import logger from './logger.js'              │
│     - Use logger.withRequest(req) for context       │
│     - Log errors with metadata:                     │
│       logger.error('Payout failed', {               │
│         userId, amount, error: err.message          │
│       })                                            │
├─────────────────────────────────────────────────────┤
│  4. Winston Logger (ALREADY EXISTS)                 │
│     - Development: Colorized console output         │
│     - Production: JSON structured logs              │
│     - Test: Silent (unless ENABLE_TEST_LOGS=1)      │
└─────────────────────────────────────────────────────┘
```

### Implementation Plan

#### Phase 1: Request Logging Middleware (NEW)
**File:** `backend/logger.js`

Add HTTP request/response logging:
```javascript
export function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Log incoming request
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration
    });
  });

  next();
}
```

#### Phase 2: Replace console.* in server.js
**File:** `backend/server.js`

Replace all 15 console.* calls with structured logger calls:

| Current | Replacement |
|---------|-------------|
| `console.warn('⚠️ HRKEY_SUPERADMIN_EMAIL...')` | `logger.warn('Superadmin email not configured')` |
| `console.log('✅ User assigned role: superadmin')` | `logger.info('Superadmin assigned', { email })` |
| `console.log('🧩 EMAIL VERIFICATION LINK:', url)` | `logger.debug('Email verification sent', { userId })` (NO URL) |
| `console.error(e)` | `logger.error('Operation failed', { error: e.message, stack: e.stack })` |

#### Phase 3: Replace console.* in Controllers
**Files:** All 7 controller files

Pattern to follow:
```javascript
// BEFORE
try {
  // ... business logic
} catch (error) {
  console.error('Request payout error:', error);
  return res.status(500).json({ error: 'Failed to create payout request' });
}

// AFTER
try {
  // ... business logic
} catch (error) {
  const reqLogger = logger.withRequest(req);
  reqLogger.error('Payout request failed', {
    userId: req.user?.id,
    amount: req.body?.amount,
    payoutMethod: req.body?.payoutMethod,
    error: error.message,
    stack: error.stack
  });

  // Sentry capture (already exists)
  if (sentryEnabled) {
    Sentry.captureException(error, /* ... */);
  }

  return res.status(500).json({ error: 'Failed to create payout request' });
}
```

#### Phase 4: Replace console.* in Middleware
**Files:** `middleware/auth.js`, `middleware/validate.js`

Add structured logging with security context:
```javascript
// Example from auth.js
catch (error) {
  logger.error('Authentication failed', {
    requestId: req.requestId,
    path: req.path,
    hasToken: !!req.headers.authorization,
    error: error.message
  });
  // ... error response
}
```

#### Phase 5: Replace console.* in Services
**Files:** `services/webhookService.js`

Add business event logging:
```javascript
// Payment success
logger.info('Payment processed successfully', {
  stripeEventId: event.id,
  userId: user.id,
  email: customer.email,
  amountCents: amount,
  plan: newPlan
});

// Payment failure
logger.warn('Payment failed', {
  stripeEventId: event.id,
  email: customer.email,
  reason: paymentIntent.last_payment_error?.message
});
```

---

## Benefits

### Production Benefits
1. **Render Dashboard**: Structured JSON logs filterable by `requestId`, `userId`, `service`
2. **Error Tracking**: Every 500 error has full context for debugging
3. **Security Monitoring**: Auth failures, suspicious patterns easily queryable
4. **Performance Analysis**: Request durations tracked automatically
5. **Correlation**: Trace a single request across middleware → controller → service

### Development Benefits
1. **Better DX**: Colorized logs with timestamps and request IDs
2. **Faster Debugging**: Full context in error messages
3. **Consistent Format**: Same logging pattern across all files

### Compliance Benefits
1. **Audit Trail**: Structured logs for data access, payments, auth
2. **PII Protection**: Sensitive data NOT logged in URLs/tokens
3. **Retention Ready**: JSON logs ready for archival/analysis

---

## Migration Strategy

### Safety First
1. **Incremental Migration**: Change files one at a time
2. **Keep Tests Green**: Run `npm test` after each file
3. **No Breaking Changes**: Only change logging, not business logic
4. **Preserve Sentry**: Keep all existing `Sentry.captureException()` calls

### Testing Strategy
- ✅ Tests already pass (138/153 passing)
- ✅ Tests don't validate console output
- ✅ Logger is silent in test mode by default
- ✅ No test changes required

### Rollback Plan
If issues arise in production:
- Logs still go to stdout (Render captures them)
- No external dependencies added
- Can revert commit without data loss

---

## Implementation Checklist

- [ ] **Phase 1**: Add `requestLoggingMiddleware` to logger.js
- [ ] **Phase 2**: Add middleware to server.js (after requestIdMiddleware)
- [ ] **Phase 3**: Replace console.* in server.js (15 calls)
- [ ] **Phase 4**: Replace console.* in controllers (7 files, ~70 calls)
- [ ] **Phase 5**: Replace console.* in middleware (2 files, ~8 calls)
- [ ] **Phase 6**: Replace console.* in services (1 file, ~11 calls)
- [ ] **Phase 7**: Run tests (`npm test`)
- [ ] **Phase 8**: Verify logs locally (start server, make requests)
- [ ] **Phase 9**: Commit & push to branch
- [ ] **Phase 10**: Deploy to Render, verify structured logs

---

## Log Level Guidelines

Use these levels consistently:

| Level | When to Use | Example |
|-------|-------------|---------|
| `error` | 500 errors, critical failures | Database connection lost, payment failed |
| `warn` | 4xx errors, deprecations, recoverable issues | Invalid input, missing optional config |
| `info` | Business events, important state changes | User registered, payment processed, server started |
| `debug` | Detailed flow info, helpful for debugging | Query executed, cache hit/miss |
| `http` | HTTP requests/responses (via middleware) | GET /api/revenue/balance 200 (125ms) |

---

## Next Steps

1. **Review this audit** with team/stakeholder
2. **Approve implementation plan**
3. **Execute phases 1-10** (estimated 2-3 hours)
4. **Verify in Render** logs dashboard
5. **Document** logging patterns for future development

---

## Estimated Impact

**Lines of Code Changed:** ~104 console.* replacements
**Files Modified:** ~12 files
**Test Impact:** Zero (logger is silent in tests)
**Breaking Changes:** Zero
**Risk Level:** Low (logging only, no business logic changes)
**Production Value:** High (full observability)
