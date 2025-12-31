# 🚀 Quick Smoke Test Guide

## Before Running Tests

### 1. Get Test Credentials

```bash
# You need these 4 values:
export BASE_URL="https://hrkey-backend.onrender.com"
export TEST_USER_JWT="eyJhbGciOiJIUzI1NiIs..."  # Get from Supabase
export TEST_USER_ID="550e8400-e29b-41d4-a716-446655440000"  # UUID of test user
export TEST_OTHER_USER_ID="660e8400-e29b-41d4-a716-446655440001"  # Different user
```

### 2. How to Get JWT Token

**Option A: Supabase Dashboard**
1. Go to https://app.supabase.com
2. Select your project
3. Go to Authentication → Users
4. Find your test user
5. Click "..." → "Get JWT"

**Option B: Frontend Login**
1. Login to https://hrkey.vercel.app
2. Open browser DevTools → Application → Local Storage
3. Copy the value of `sb-<project-id>-auth-token`
4. Extract the `access_token` field

---

## Run Automated Smoke Tests

```bash
cd backend
npm run smoke:staging
```

**Expected Output**:
```
Launch-0 Staging Smoke v2
==========================
PASS - GET /health: status=200
PASS - GET /api/references/me (no auth): status=401
PASS - GET /api/hrkey-score/history: status=200
PASS - GET /api/hrkey-score/history (other user): status=403
PASS - Rate limit sanity (public token lookup): status=429
==========================
```

---

## Manual Quick Checks

### ✅ Test 1: Backend is Alive
```bash
curl https://hrkey-backend.onrender.com/health
```
**Expected**: `{"status":"ok","timestamp":"..."}`

### ✅ Test 2: Auth Works
```bash
curl https://hrkey-backend.onrender.com/api/references/me
```
**Expected**: `{"error":"Authentication required"}` (HTTP 401)

### ✅ Test 3: P0 Security Fix (CRITICAL)
```bash
# As regular user (should FAIL):
curl -H "Authorization: Bearer $TEST_USER_JWT" \
  https://hrkey-backend.onrender.com/api/admin/overview
```
**Expected**: `{"error":"Forbidden","message":"Superadmin access required"}` (HTTP 403)

If you get **200 OK**, the security fix is NOT deployed! ⚠️

---

## Troubleshooting

### Backend Returns 500
```
Reason: Backend not deployed or crashed
Fix: Check Render logs, verify env vars, redeploy
```

### Auth Returns 403 (Expected 200)
```
Reason: Token expired or invalid
Fix: Generate fresh JWT from Supabase
```

### Rate Limit Not Triggering
```
Reason: Rate limiter disabled or configured differently
Fix: Check server.js rate limiter config
```

---

## Success Criteria

✅ **All tests PASS** → Ready for production
⚠️ **Test 3 returns 200** → P0 security issue NOT fixed
❌ **Backend returns 500** → Deployment failed

---

**After all tests pass**: 🎉 **GO LIVE!**
