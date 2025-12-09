# Health Checks Documentation

**Service**: HRkey Backend
**Version**: 1.0.0
**Last Updated**: 2025-12-09

---

## Overview

The HRkey backend provides two health check endpoints for monitoring service availability and dependency status:

1. **`GET /health`** - Simple liveness check (is the service running?)
2. **`GET /health/deep`** - Comprehensive readiness check (are dependencies available?)

Both endpoints are **public** (no authentication required) and designed for use by:
- Cloud platform health checks (Render, AWS ELB, etc.)
- External monitoring services (UptimeRobot, Pingdom, Datadog, etc.)
- Load balancers and orchestration tools (Kubernetes, Docker Swarm, etc.)

---

## Endpoints

### GET /health

**Purpose**: Liveness probe - verifies the server process is running and responding to requests.

**URL**: `https://your-domain.com/health`

**Method**: `GET`

**Authentication**: None required

**Response Time**: < 100ms (no external dependencies)

**Response** (200 OK):
```json
{
  "status": "ok",
  "service": "hrkey-backend",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600.5,
  "timestamp": "2025-12-09T10:30:00.000Z"
}
```

**Fields**:
- `status` (string): Always `"ok"` when service is running
- `service` (string): Service identifier (`"hrkey-backend"`)
- `version` (string): Service version number
- `environment` (string): Deployment environment (`production`, `staging`, `development`)
- `uptime` (number): Process uptime in seconds
- `timestamp` (string): ISO 8601 timestamp of the health check

**Use Cases**:
- ✅ **Liveness probe**: Does the service need to be restarted?
- ✅ **Quick uptime checks**: Is the service responding?
- ✅ **Process monitoring**: Has the service crashed or hung?

**Monitoring Configuration**:
```yaml
# Example: Render health check
path: /health
interval: 30  # seconds
timeout: 5    # seconds
failure_threshold: 3
```

---

### GET /health/deep

**Purpose**: Readiness probe - verifies the service and its dependencies are ready to handle traffic.

**URL**: `https://your-domain.com/health/deep`

**Method**: `GET`

**Authentication**: None required

**Response Time**: < 5 seconds (includes dependency checks with timeout)

**Response** (200 OK - All systems operational):
```json
{
  "status": "ok",
  "service": "hrkey-backend",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600.5,
  "timestamp": "2025-12-09T10:30:00.000Z",
  "checks": {
    "supabase": {
      "status": "ok",
      "responseTime": 45
    },
    "stripe": {
      "status": "ok",
      "configured": true
    }
  }
}
```

**Response** (200 OK - Degraded but functional):
```json
{
  "status": "degraded",
  "service": "hrkey-backend",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600.5,
  "timestamp": "2025-12-09T10:30:00.000Z",
  "checks": {
    "supabase": {
      "status": "error",
      "error": "Connection timeout after 5000ms",
      "responseTime": 5000
    },
    "stripe": {
      "status": "warning",
      "configured": false,
      "message": "Stripe secrets not configured"
    }
  }
}
```

**Response** (503 Service Unavailable - Critical failure):
```json
{
  "status": "error",
  "service": "hrkey-backend",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600.5,
  "timestamp": "2025-12-09T10:30:00.000Z",
  "checks": {
    "supabase": {
      "status": "error",
      "error": "Database connection failed",
      "responseTime": 5000
    },
    "stripe": {
      "status": "ok",
      "configured": true
    }
  }
}
```

**Fields**:
- `status` (string): Overall health status
  - `"ok"`: All systems operational
  - `"degraded"`: Service functional but some checks failed
  - `"error"`: Critical failure, service not ready
- `service` (string): Service identifier
- `version` (string): Service version
- `environment` (string): Deployment environment
- `uptime` (number): Process uptime in seconds
- `timestamp` (string): ISO 8601 timestamp
- `checks` (object): Individual dependency status
  - `supabase`: Database connectivity check
  - `stripe`: Payment configuration check

**HTTP Status Codes**:
- **200 OK**: Service is operational (`status: "ok"`) or degraded but still functional (`status: "degraded"`)
- **503 Service Unavailable**: Critical failure, service not ready to handle traffic (`status: "error"`)

**Use Cases**:
- ✅ **Readiness probe**: Is the service ready to accept traffic?
- ✅ **Dependency monitoring**: Are external services reachable?
- ✅ **Configuration validation**: Are required secrets configured?
- ✅ **Performance monitoring**: How long do dependency checks take?

**Monitoring Configuration**:
```yaml
# Example: Render health check (readiness)
path: /health/deep
interval: 60  # seconds
timeout: 10   # seconds
failure_threshold: 2
```

---

## Dependency Checks

### Supabase Database Check

**What it checks**:
- Database connectivity (can we connect to Supabase?)
- Query execution (can we run a simple query?)

**How it works**:
```javascript
// Lightweight ping query with 5-second timeout
SELECT count FROM users LIMIT 1
```

**Timeout**: 5 seconds

**Status values**:
- `"ok"`: Database reachable and responsive
- `"error"`: Database unreachable, timeout, or query error

**Response time metric**: Included in `responseTime` field (milliseconds)

**Impact on overall status**:
- ❌ **Error**: Changes overall status to `"degraded"`
- HTTP code remains 200 (service still functional, just degraded)

---

### Stripe Configuration Check

**What it checks**:
- Are `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables set?
- Do the keys appear to be valid (not placeholder values, sufficient length)?

**What it does NOT check**:
- ❌ Does NOT make API calls to Stripe (no latency or cost impact)
- ❌ Does NOT validate key format or authenticity
- ❌ Does NOT test actual Stripe connectivity

**Status values**:
- `"ok"`: Both secrets configured and appear valid
- `"warning"`: Secrets missing or appear to be placeholders
- `"error"`: Exception occurred while checking configuration

**Impact on overall status**:
- ✅ **Warning**: Does NOT change overall status (informational only)
- ❌ **Error**: Changes overall status to `"degraded"`

**Rationale**: Missing Stripe configuration is a deployment issue, not a runtime issue. The service can still function for non-payment operations.

---

## Monitoring System Integration

### Render

**Liveness Check** (required):
```yaml
Health Check Path: /health
Initial Delay: 0
Interval: 30
Timeout: 5
Unhealthy Threshold: 3
Healthy Threshold: 1
```

**Readiness Check** (optional but recommended):
```yaml
Health Check Path: /health/deep
Initial Delay: 30
Interval: 60
Timeout: 10
Unhealthy Threshold: 2
Healthy Threshold: 1
```

**Zero-downtime deploys**: Use `/health` as the health check path for deployments

---

### UptimeRobot

**Basic Monitoring**:
```
Monitor Type: HTTP(s)
URL: https://your-domain.com/health
Monitoring Interval: 5 minutes
HTTP Method: GET (HEAD)
Alert When: 2 times down
```

**Advanced Monitoring**:
```
Monitor Type: Keyword
URL: https://your-domain.com/health/deep
Keyword: "status":"ok"
Monitoring Interval: 5 minutes
Alert When: Keyword not found (2 times)
```

---

### Kubernetes

**Liveness Probe**:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3
```

**Readiness Probe**:
```yaml
readinessProbe:
  httpGet:
    path: /health/deep
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 60
  timeoutSeconds: 10
  failureThreshold: 2
  successThreshold: 1
```

---

### Docker Swarm

**Health Check**:
```yaml
services:
  hrkey-backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
```

---

### AWS Elastic Load Balancer

**Target Group Health Check**:
```
Protocol: HTTP
Path: /health
Port: traffic port
Healthy threshold: 2
Unhealthy threshold: 3
Timeout: 5 seconds
Interval: 30 seconds
Success codes: 200
```

---

## Security & Privacy

### ✅ What's Safe to Expose

- Service name and version (helps identify the service)
- Environment type (production, staging, development)
- Process uptime (operational metric)
- Dependency status (ok, warning, error)
- Response times (performance metric)

### ⚠️ What's NOT Exposed

- ❌ Database connection strings or credentials
- ❌ API keys or secrets (Stripe, Supabase, etc.)
- ❌ Internal IP addresses or network topology
- ❌ Stack traces or detailed error messages
- ❌ User data or business metrics
- ❌ Detailed system information (CPU, memory, etc.)

### Rate Limiting

Health check endpoints have **no rate limiting** by design:
- ✅ Can be called frequently by monitoring systems
- ✅ No authentication required
- ⚠️ Be considerate: Don't poll more than once per 10 seconds

---

## Testing

### Manual Testing

**Test liveness check**:
```bash
curl -i https://your-domain.com/health
```

**Expected output**:
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","service":"hrkey-backend",...}
```

**Test readiness check**:
```bash
curl -i https://your-domain.com/health/deep
```

**Expected output**:
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","service":"hrkey-backend","checks":{...}}
```

---

### Automated Testing

**Run health check tests**:
```bash
cd backend
npm test tests/health/health.test.js
```

**Expected output**:
```
PASS tests/health/health.test.js
  Health Check Endpoints
    GET /health
      ✓ HEALTH-1: Should return 200 with expected JSON shape
      ✓ HEALTH-2: Should return valid ISO timestamp
      ✓ HEALTH-3: Should not require authentication
      ✓ HEALTH-4: Should respond quickly (< 100ms)
      ✓ HEALTH-5: Should not expose sensitive data
    GET /health/deep
      ✓ DEEP-1: Should return 200 with expected structure when Supabase is ok
      ✓ DEEP-2: Should verify Supabase connectivity
      ✓ DEEP-3: Should return degraded status when Supabase errors
      ✓ DEEP-4: Should handle Supabase exceptions gracefully
      ✓ DEEP-5: Should include uptime in response
      ✓ DEEP-6: Should not require authentication
      ✓ DEEP-7: Should not expose sensitive Supabase details
      ✓ DEEP-8: Should return valid ISO timestamp
      ✓ DEEP-9: Should have timeout protection
      ✓ DEEP-10: Should check Stripe configuration
      ✓ DEEP-11: Should return response time metrics for Supabase

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

**Test coverage**:
- ✅ Response structure validation
- ✅ No authentication required
- ✅ Response time performance
- ✅ Timeout protection
- ✅ Error handling (Supabase failures)
- ✅ Security (no sensitive data exposure)
- ✅ Stripe configuration check
- ✅ Supabase connectivity check

---

## Troubleshooting

### Health check returns 503

**Problem**: `/health/deep` returns 503 Service Unavailable

**Possible causes**:
1. Supabase database is unreachable
2. Network connectivity issues
3. Database credentials expired or invalid

**Actions**:
1. Check Supabase dashboard for service status
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` environment variables
3. Check network firewall rules
4. Review application logs for detailed error messages

---

### Health check returns "degraded" status

**Problem**: `/health/deep` returns 200 but `status: "degraded"`

**Possible causes**:
1. Supabase connectivity issues (slow or intermittent)
2. Stripe configuration warnings (missing or invalid keys)

**Actions**:
1. Check the `checks` object to identify which dependency failed
2. Review the error messages in the checks
3. Verify environment variable configuration
4. Check application logs for detailed information

**Note**: Degraded status means the service is still functional but monitoring indicates potential issues.

---

### Health check timeout

**Problem**: Health check request times out (> 10 seconds)

**Possible causes**:
1. Supabase query hanging (rare - should timeout at 5s)
2. Server under heavy load
3. Network connectivity issues

**Actions**:
1. Check server CPU and memory usage
2. Review application logs for blocked operations
3. Verify Supabase service status
4. Consider increasing monitoring timeout threshold

---

### Stripe status is "warning"

**Problem**: `/health/deep` shows Stripe status as "warning"

**Possible causes**:
1. `STRIPE_SECRET_KEY` not set
2. `STRIPE_WEBHOOK_SECRET` not set
3. Keys appear to be placeholder values

**Actions**:
1. Verify Stripe secrets are configured in environment variables
2. Check that keys are not placeholder text like "your-secret-key"
3. Ensure keys have sufficient length (> 20 characters)
4. Restart service after updating environment variables

**Note**: Stripe warnings do NOT change overall health status to "degraded". The service remains operational.

---

## Changelog

### 2025-12-09 - Enhanced Health Checks

**Added**:
- ✅ `service` field to identify the service
- ✅ `environment` field (production, staging, development)
- ✅ `uptime` field to `/health` endpoint
- ✅ Structured `checks` object in `/health/deep`
- ✅ Stripe configuration validation
- ✅ Response time metrics for Supabase
- ✅ HTTP 503 status code for critical failures

**Changed**:
- ⚠️ Response format for `/health/deep` (now uses nested `checks` structure)
- ⚠️ Stripe warnings don't affect overall health status (informational only)

**Maintained**:
- ✅ Backward compatibility for HTTP status codes (200, 503)
- ✅ No authentication required
- ✅ Timeout protection (5 seconds)
- ✅ No sensitive data exposure

### Previous (< 2025-12-09)

- Basic `/health` endpoint
- Simple `/health/deep` with Supabase check only

---

## Related Documentation

- **Logging**: `backend/LOGGING_AUDIT.md` - Structured logging implementation
- **Security**: `backend/SECURITY_AUDIT.md` - Security hardening and CORS
- **Permission Tests**: `backend/TESTS_PERMISSIONS.md` - Test inventory and patterns
- **Server Configuration**: `backend/server.js` - Main application file

---

## Support

For questions or issues with health checks:
1. Check this documentation first
2. Review application logs for detailed error messages
3. Verify environment variable configuration
4. Test endpoints manually with `curl`
5. Run automated tests: `npm test tests/health/health.test.js`

**Production Deployment Checklist**:
- ✅ Health check endpoints accessible (not blocked by firewall)
- ✅ Monitoring systems configured (Render, UptimeRobot, etc.)
- ✅ Alert thresholds configured appropriately
- ✅ On-call team knows how to respond to health check failures
- ✅ Supabase credentials valid and not expired
- ✅ Stripe secrets configured (if payment features used)
