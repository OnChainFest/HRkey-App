# Public Profile & Discovery Layer v1

## 📋 Overview

The **Public Profile & Discovery Layer** is a fail-soft service layer that handles resolution, enrichment, and analytics tracking for public candidate profiles in HRKey.

This layer provides:
- **Profile Resolution**: Fetch profiles by handle or user ID
- **Privacy Controls**: Respect `is_public_profile` flag
- **HRScore Enrichment**: Attach HRScore, pricing, and tokenomics data
- **Analytics Integration**: Track profile views via Analytics Layer
- **Fail-Soft Behavior**: Never block profile display on errors

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Controllers                                                       │
│ ├─ publicProfile.controller.js                                  │
│ │  └─ GET /api/public/candidates/:identifier                    │
│ └─ publicIdentifier.controller.js                               │
│    └─ GET /api/me/public-identifier                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Service Layer: backend/services/publicProfile/                   │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ index.js                                                     │ │
│ │ ├─ getPublicProfile(identifier, options)                    │ │
│ │ │  ├─ Resolves profile (handle or user ID)                  │ │
│ │ │  ├─ Enriches with HRScore, tokenomics, metrics            │ │
│ │ │  └─ Optionally tracks view event                          │ │
│ │ └─ Re-exports all sub-module functions                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ resolver.js                                                  │ │
│ │ ├─ resolveProfileByIdentifier(identifier)                   │ │
│ │ ├─ resolveProfileByUserId(userId)                           │ │
│ │ └─ getPublicIdentifierForUser(userId)                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ enrichment.js                                                │ │
│ │ ├─ attachHrScoreSummary(userId)                             │ │
│ │ ├─ attachViewMetrics(userId)                                │ │
│ │ └─ enrichProfile(baseProfile)                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ viewTracker.js                                               │ │
│ │ ├─ registerProfileView({ candidateId, viewerId, ... })     │ │
│ │ └─ registerProfileViewBatch(views)                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Dependencies                                                      │
│ ├─ candidateEvaluation.service.js (HRScore + pricing)           │
│ └─ analytics/eventTracker.js (PROFILE_VIEW events)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Functions

### Primary API

#### `getPublicProfile(identifier, options)`

Main entry point for fetching public profiles. Combines resolution, enrichment, and optional view tracking.

**Parameters:**
- `identifier` (string): Public handle or user ID
- `options` (object, optional):
  - `trackView` (boolean): Log a PROFILE_VIEW event (default: false)
  - `viewerId` (string): Viewer user ID for analytics
  - `companyId` (string): Viewer company ID for analytics
  - `req` (object): Express request object for metadata

**Returns:**
- Enriched profile object or `null` if not found

**Example:**
```javascript
import { getPublicProfile } from './services/publicProfile/index.js';

const profile = await getPublicProfile('john_doe', {
  trackView: true,
  viewerId: req.user?.id,
  req
});
```

---

### Resolver Functions

#### `resolveProfileByIdentifier(identifier)`

Resolves a profile by handle or user ID. Respects `is_public_profile` flag.

**Returns:**
```javascript
{
  userId: string,
  handle: string | null,
  fullName: string | null,
  headline: string | null,
  skills: string[] | null,
  isPublicProfile: boolean
}
```

#### `resolveProfileByUserId(userId)`

Resolves a profile specifically by user ID.

#### `getPublicIdentifierForUser(userId)`

Gets the preferred public identifier (handle or user ID) for a user.

**Returns:**
```javascript
{
  userId: string,
  identifier: string,        // handle or userId
  handle: string | null,
  isPublicProfile: boolean
}
```

---

### Enrichment Functions

#### `attachHrScoreSummary(userId)`

Enriches a profile with HRScore, pricing, and tokenomics data.

**Returns:**
```javascript
{
  hrScore: number,
  priceUsd: number,
  hrscore: {
    current: number | null
  }
}
```

**Fail-soft behavior:**
- Returns defaults (`hrScore: 0`, `priceUsd: 0`) on evaluation errors
- Continues without tokenomics if that service fails
- Never throws errors

#### `attachViewMetrics(userId)`

Queries analytics for profile view counts.

**Returns:**
```javascript
{
  profileViews: number | null
}
```

#### `enrichProfile(baseProfile)`

Combines HRScore, tokenomics, and view metrics into a full enriched profile.

---

### View Tracking Functions

#### `registerProfileView({ candidateId, viewerId, companyId, req })`

Logs a `PROFILE_VIEW` event to the Analytics Layer.

**Fail-soft behavior:**
- Never throws errors
- Logs warnings on failure
- Never blocks profile display

#### `registerProfileViewBatch(views)`

Registers multiple profile view events efficiently.

---

## 📊 Response Shape

### Base Response (Backwards-Compatible)

```javascript
{
  userId: string,
  handle: string | null,
  fullName: string | null,
  headline: string | null,
  skills: string[] | null,
  hrScore: number,
  priceUsd: number,
}
```

### Enriched Response (v1 - Additive Fields)

```javascript
{
  userId: string,
  handle: string | null,
  fullName: string | null,
  headline: string | null,
  skills: string[] | null,
  hrScore: number,
  priceUsd: number,

  // NEW: Additive enrichment (v1)
  hrscore: {
    current: number | null       // HRScore or null if unavailable
  },
  metrics: {
    profileViews: number | null  // View count or null if unavailable
  }
}
```

**Backwards Compatibility:**
- All existing fields remain unchanged
- New fields are optional nested objects
- Enrichment failures return `null` values, not errors

---

## 🔒 Privacy & Security

### Privacy Controls

1. **`is_public_profile` Flag**
   - Profiles with `is_public_profile = false` return `null`
   - No data leakage for private profiles

2. **Exposed Fields (Safe)**
   - `userId`: Public (used for identification)
   - `handle`: Public (chosen by user)
   - `fullName`: Public (user-controlled)
   - `headline`: Public (professional headline)
   - `skills`: Public (skill tags)
   - `hrScore`: Public (already visible via evaluation)
   - `priceUsd`: Public (dynamic pricing)

3. **Hidden Fields (Internal)**
   - Email addresses
   - Wallet addresses (unless explicitly public)
   - Internal IDs (company_id, reference IDs)
   - Sensitive PII
   - RLS-protected data

### Security Best Practices

- **No raw Supabase errors** exposed to API responses
- **Fail-soft logging** prevents information disclosure
- **Rate limiting** should be applied at the controller/middleware level (not in service layer)
- **Analytics tracking** respects user privacy (anonymous views allowed)

---

## 🛡️ Fail-Soft Behavior

All functions in this layer follow **fail-soft principles**:

### Core Principles

1. **Never throw errors to callers**
   - Return `null` or degraded data instead
   - Log errors internally with `logger.error()`

2. **Graceful degradation**
   - If HRScore fails → return `hrScore: 0`
   - If analytics fails → skip view tracking silently

3. **Non-blocking enrichment**
   - View tracking uses fire-and-forget pattern
   - Analytics failures never block profile responses

4. **Database error handling**
   - Supabase errors logged and converted to `null` returns
   - No sensitive error details in responses

### Example: Fail-Soft Flow

```javascript
try {
  const profile = await getPublicProfile('john_doe');
  // profile may have partial data if enrichment failed
} catch (err) {
  // This should never happen - service layer never throws
}
```

---

## 📈 Analytics Integration

### PROFILE_VIEW Events

The layer integrates with the Analytics Layer to track profile views.

**Event Type**: `PROFILE_VIEW` (existing in Analytics Layer)

**Context:**
```javascript
{
  candidateId: 'user-123',
  dataType: 'public_profile'
}
```

**Metadata** (auto-extracted from request):
- IP address
- User agent
- Referrer
- Request path

### Querying View Metrics

View counts are aggregated from `analytics_events` table:

```sql
SELECT COUNT(*)
FROM analytics_events
WHERE event_type = 'PROFILE_VIEW'
  AND context->>'candidateId' = 'user-123';
```

No new database tables required.

---

## 🧪 Testing

### Test Coverage

**File**: `backend/tests/services/publicProfile.test.js`

**Scenarios Covered:**

#### Resolver Tests
- ✅ Resolve by valid handle
- ✅ Resolve by valid user ID
- ✅ Return null for empty identifier
- ✅ Return null for non-existent profile
- ✅ Return null for non-public profile
- ✅ Handle database errors gracefully
- ✅ Never throw errors
- ✅ Normalize skills from various formats
- ✅ Use fallback fields (name, title)

#### Enrichment Tests
- ✅ Enrich with HRScore and pricing
- ✅ Handle missing HRScore gracefully
- ✅ Continue without tokenomics on error
- ✅ Return defaults on evaluation error
- ✅ Handle empty userId
- ✅ Return view metrics
- ✅ Enrich full profile with all data
- ✅ Return degraded profile on catastrophic error

#### View Tracker Tests
- ✅ Log PROFILE_VIEW event
- ✅ Handle anonymous viewers
- ✅ Skip logging without candidateId
- ✅ Never throw errors
- ✅ Register batch views
- ✅ Handle empty/invalid batch input

#### Integration Tests
- ✅ Return fully enriched public profile
- ✅ Track view when option enabled
- ✅ Return null for non-existent profile
- ✅ Handle errors gracefully

### Running Tests

```bash
cd backend
npm test -- tests/services/publicProfile.test.js
```

---

## 🔄 Migration from Legacy Service

### Before (Old Service)

```javascript
// backend/services/publicProfile.service.js
export async function getPublicProfile(identifier) {
  const { data, error } = await supabase.from('users')...
  if (error) throw error; // ❌ Throws raw errors
  // ...
}
```

### After (New Service Layer)

```javascript
// backend/services/publicProfile/index.js
export async function getPublicProfile(identifier) {
  try {
    const baseProfile = await resolveProfileByIdentifier(identifier);
    if (!baseProfile) return null;

    const enriched = await enrichProfile(baseProfile);
    return enriched;
  } catch (err) {
    logger.error('Exception in getPublicProfile', { error: err.message });
    return null; // ✅ Never throws
  }
}
```

### Controller Changes

```javascript
// Before
import { getPublicProfile } from '../services/publicProfile.service.js';

// After
import { getPublicProfile } from '../services/publicProfile/index.js';

// Usage (same external behavior)
const profile = await getPublicProfile(identifier, {
  trackView: true,
  viewerId: req.user?.id,
  req
});
```

---

## 🚦 Backwards Compatibility

### Guaranteed Contracts

#### `GET /api/public/candidates/:identifier`
- ✅ Same URL path
- ✅ Same HTTP method (GET)
- ✅ Same status codes (400/404/200/500)
- ✅ Same response fields (userId, handle, fullName, headline, skills, hrScore, priceUsd)
- ✅ New fields are additive only (hrscore, metrics)

#### `GET /api/me/public-identifier`
- ✅ Same URL path
- ✅ Same HTTP method (GET)
- ✅ Same status codes (401/404/200/500)
- ✅ Same response shape

### Testing Compatibility

Integration tests in other branches (e.g., Codex's tests) should pass without modification.

---

## 📚 Related Documentation

- **Analytics Layer**: `backend/ANALYTICS_LAYER.md`
- **HRScore Engine**: `backend/HRKEY_SCORE_README.md`
- **Reference Validation**: `backend/REFERENCE_VALIDATION.md`
- **Permission Tests**: `backend/TESTS_PERMISSIONS.md`

---

## 🔮 Future Enhancements (v2+)

Potential additions for future iterations:

1. **Extended HRScore Summary**
   ```javascript
   hrscore: {
     current: number,
     trend: 'improving' | 'stable' | 'declining',
     lastUpdated: string,
     history: Array<{ date: string, score: number }>
   }
   ```

2. **Extended Metrics**
   ```javascript
   metrics: {
     profileViews: number,
     lastViewed: string,
     searchAppearances: number,
     dataAccessRequests: number
   }
   ```

3. **Caching Layer**
   - Redis caching for frequently accessed profiles
   - TTL-based invalidation
   - Bust cache on profile updates

4. **Rate Limiting**
   - Per-IP rate limits for anonymous viewers
   - Per-user rate limits for authenticated viewers
   - Prevent scraping/abuse

5. **Profile View Dedupe**
   - Track unique viewers vs. total views
   - Sessionized view tracking
   - Time-windowed deduplication

6. **Dedicated View Table** (if performance requires)
   ```sql
   CREATE TABLE public_profile_views (
     id uuid PRIMARY KEY,
     candidate_id uuid REFERENCES users(id),
     viewer_id uuid REFERENCES users(id) NULL,
     viewed_at timestamptz DEFAULT now()
   );
   ```

---

## 🤝 Contributing

When extending this layer:

1. **Maintain fail-soft behavior**: Never throw to controllers
2. **Respect privacy**: Only expose safe, public fields
3. **Test thoroughly**: Add tests for new functions
4. **Document changes**: Update this file with new APIs
5. **Backwards compatibility**: Don't break existing contracts

---

## 📝 Summary

The Public Profile & Discovery Layer v1 provides:
- ✅ Fail-soft profile resolution by handle or user ID
- ✅ Privacy-aware field exposure
- ✅ HRScore and tokenomics enrichment
- ✅ Analytics integration (PROFILE_VIEW tracking)
- ✅ Comprehensive test coverage
- ✅ 100% backwards-compatible with existing endpoints
- ✅ Production-ready error handling

This layer strengthens the internal architecture without changing external APIs, ensuring a smooth integration with Codex's parallel integration testing work.
