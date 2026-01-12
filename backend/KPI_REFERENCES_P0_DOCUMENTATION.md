# KPI-Driven References System (P0 - Vertical Slice)

## 🎯 Overview

This document describes the P0 (Vertical Slice) implementation of HRKey's KPI-driven References system - a production-ready backend that enables structured, auditable, and ML-ready professional references.

### Core Principle (Non-Negotiable)

**KPIs already exist (by role + seniority). A reference does NOT define KPIs, it provides evidence against them.**

Every reference must be:
- ✅ **KPI-scoped** - No free-text references outside KPIs
- ✅ **Versioned** - KPI sets are versioned; references lock to a specific version
- ✅ **Auditable** - Signature hashes, timestamps, immutability after submission
- ✅ **Comparable** - Same KPIs across all candidates for a role+seniority combination

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Validation Rules](#validation-rules)
5. [Data Flow](#data-flow)
6. [Setup & Deployment](#setup--deployment)
7. [Testing](#testing)
8. [Architectural Decisions](#architectural-decisions)
9. [Future Enhancements](#future-enhancements)

---

## 🏗️ Architecture Overview

### Stack
- **Backend**: Express.js (Node.js)
- **Database**: PostgreSQL (via Supabase)
- **Validation**: Zod
- **Authentication**: Supabase Auth (JWT)
- **Email**: Resend

### Folder Structure

```
backend/
├── services/kpiReference/
│   ├── kpiSets.service.js           # KPI set management
│   ├── referenceRequest.service.js  # Reference invitations
│   ├── referenceSubmit.service.js   # Reference submission with validation
│   └── referencePack.service.js     # Candidate reference retrieval & aggregation
├── controllers/
│   └── kpiReferenceController.js    # HTTP request handlers
├── schemas/
│   └── kpiReference.schema.js       # Zod validation schemas
└── server.js                        # Route registration

sql/
├── 010_kpi_references_p0.sql        # Database schema migration
└── seed_kpi_sets.sql                # Seed data for initial KPI sets
```

### Architecture Principles

1. **Separation of Concerns**
   - Controllers: HTTP request/response handling
   - Services: Business logic
   - Schemas: Validation
   - Database: Data persistence with RLS

2. **Immutability**
   - References cannot be edited after submission
   - KPI sets are versioned (copy-on-write)
   - Signature hashes prevent tampering

3. **Version Locking**
   - Reference requests capture the active KPI set version at creation time
   - References store the exact `kpi_set_version` used
   - Even if KPI sets are updated, old references remain valid and interpretable

4. **Validation at Multiple Layers**
   - Zod schemas (request validation)
   - Service layer (business logic)
   - Database constraints (data integrity)

---

## 🗄️ Database Schema

### Tables

#### 1. `kpi_sets`
Versioned KPI definitions grouped by role + seniority.

```sql
CREATE TABLE kpi_sets (
    id UUID PRIMARY KEY,
    role TEXT NOT NULL,
    seniority_level TEXT NOT NULL, -- 'junior', 'mid', 'senior', 'lead', 'principal'
    version INTEGER NOT NULL,
    active BOOLEAN DEFAULT true,   -- Only ONE active version per role+seniority
    description TEXT,
    created_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    UNIQUE (role, seniority_level, version)
);
```

**Key Features:**
- Only one active version per role+seniority (enforced by unique index)
- Version increments when KPI definitions change
- References lock to a specific version for immutability

#### 2. `kpis`
Individual KPI definitions within a KPI set.

```sql
CREATE TABLE kpis (
    id UUID PRIMARY KEY,
    kpi_set_id UUID REFERENCES kpi_sets(id) ON DELETE CASCADE,
    key TEXT NOT NULL,              -- Machine-readable: 'code_quality', 'leadership'
    name TEXT NOT NULL,             -- Human-readable: 'Code Quality'
    description TEXT NOT NULL,
    category TEXT,                  -- 'technical', 'leadership', 'collaboration'
    required BOOLEAN DEFAULT true,  -- Must be scored in every reference?
    weight DECIMAL(5,4),            -- Weight for HRScore calculation
    min_evidence_length INTEGER DEFAULT 200,
    created_at TIMESTAMPTZ,
    UNIQUE (kpi_set_id, key)
);
```

**Key Features:**
- `required`: If true, must be scored in every reference submission
- `weight`: Used for HRScore calculation and aggregation
- `min_evidence_length`: Enforces quality of evidence (default 200 chars)

#### 3. `reference_requests`
Invitation/request tracking for references.

```sql
CREATE TABLE reference_requests (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES auth.users(id),
    referee_email TEXT NOT NULL,
    referee_name TEXT,
    relationship_type TEXT NOT NULL, -- 'manager', 'peer', 'report', etc.
    role TEXT NOT NULL,
    seniority_level TEXT NOT NULL,
    kpi_set_id UUID REFERENCES kpi_sets(id),
    kpi_set_version INTEGER,        -- Version lock
    token TEXT UNIQUE,              -- Plain text token (for email)
    token_hash TEXT NOT NULL,       -- SHA-256 hash (for secure lookup)
    expires_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',  -- 'pending', 'submitted', 'expired', 'revoked'
    created_at TIMESTAMPTZ,
    created_by UUID,
    submitted_at TIMESTAMPTZ
);
```

**Key Features:**
- Token-based access control (64-char hex token)
- SHA-256 hash for secure database lookups
- Single-use tokens (status changes to 'submitted')
- Expiration enforcement (default 30 days)

#### 4. `kpi_references`
Submitted reference data (header/metadata).

```sql
CREATE TABLE kpi_references (
    id UUID PRIMARY KEY,
    reference_request_id UUID UNIQUE REFERENCES reference_requests(id),
    candidate_id UUID REFERENCES auth.users(id),
    referee_id UUID REFERENCES auth.users(id),
    referee_email TEXT NOT NULL,
    referee_name TEXT,
    relationship_type TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    overall_recommendation TEXT,    -- 'strongly_recommend', 'recommend', etc.
    rehire_decision TEXT NOT NULL,  -- 'yes', 'no', 'conditional'
    rehire_reasoning TEXT,
    confidence_level TEXT DEFAULT 'medium',
    submitted_at TIMESTAMPTZ,
    signature_hash TEXT NOT NULL,   -- SHA-256 for tamper detection
    ip_address INET,
    user_agent TEXT,
    kpi_set_id UUID,
    kpi_set_version INTEGER,
    completeness_score DECIMAL(3,2),
    avg_evidence_length INTEGER
);
```

**Key Features:**
- One-to-one with `reference_requests` (single-use tokens)
- `signature_hash`: Hash of all reference data for integrity verification
- `completeness_score`: 0.00-1.00 metric for quality filtering
- Immutable after submission (no UPDATE operations)

#### 5. `reference_kpi_scores`
Individual KPI scores and evidence within a reference.

```sql
CREATE TABLE reference_kpi_scores (
    id UUID PRIMARY KEY,
    reference_id UUID REFERENCES kpi_references(id) ON DELETE CASCADE,
    kpi_id UUID REFERENCES kpis(id),
    kpi_key TEXT NOT NULL,          -- Denormalized for fast queries
    kpi_name TEXT NOT NULL,
    score INTEGER NOT NULL,         -- 1-5 scale
    evidence_text TEXT NOT NULL,    -- Minimum 50 chars (enforced)
    confidence_level TEXT DEFAULT 'medium',
    evidence_metadata JSONB,        -- Future extensibility
    created_at TIMESTAMPTZ,
    UNIQUE (reference_id, kpi_id)
);
```

**Key Features:**
- Normalized structure for ML/analytics
- Denormalized `kpi_key` and `kpi_name` for performance
- Each KPI scored only once per reference
- Evidence minimum 50 chars (constraint)

#### 6. `candidate_kpi_aggregates` (Materialized View)
Pre-aggregated KPI scores per candidate for fast retrieval.

```sql
CREATE MATERIALIZED VIEW candidate_kpi_aggregates AS
SELECT
    kr.candidate_id,
    rks.kpi_key,
    rks.kpi_name,
    COUNT(rks.id) as reference_count,
    AVG(rks.score) as avg_score,
    -- Confidence-weighted average
    AVG(rks.score * CASE confidence_level WHEN 'high' THEN 1.0 WHEN 'medium' THEN 0.8 ELSE 0.5 END) as weighted_avg_score,
    STDDEV(rks.score) as score_stddev,
    MIN(rks.score) as min_score,
    MAX(rks.score) as max_score,
    -- Confidence distribution
    COUNT(*) FILTER (WHERE confidence_level = 'high') as high_confidence_count,
    AVG(LENGTH(rks.evidence_text)) as avg_evidence_length,
    MAX(kr.submitted_at) as latest_reference_date
FROM kpi_references kr
JOIN reference_kpi_scores rks ON rks.reference_id = kr.id
GROUP BY kr.candidate_id, rks.kpi_key, rks.kpi_name;
```

**Key Features:**
- Fast retrieval of KPI aggregates (no real-time computation)
- Refresh after new references submitted
- Used by `GET /api/kpi-references/candidate/:id/aggregates`

---

## 🔌 API Endpoints

### 1. GET `/api/kpis/sets`
Get active KPI set for a given role and seniority level.

**Query Params:**
```json
{
  "role": "backend_engineer",
  "level": "senior"  // 'junior', 'mid', 'senior', 'lead', 'principal'
}
```

**Response:**
```json
{
  "success": true,
  "kpiSet": {
    "id": "uuid",
    "role": "backend_engineer",
    "seniority_level": "senior",
    "version": 1,
    "description": "...",
    "created_at": "2026-01-12T10:00:00Z"
  },
  "kpis": [
    {
      "id": "uuid",
      "key": "code_quality",
      "name": "Code Quality",
      "description": "Ability to write clean, maintainable code...",
      "category": "technical",
      "required": true,
      "weight": 1.2,
      "min_evidence_length": 200
    }
    // ... more KPIs
  ]
}
```

### 2. GET `/api/kpis/roles`
List all available roles.

**Response:**
```json
{
  "success": true,
  "roles": ["backend_engineer", "frontend_engineer", "product_manager", ...]
}
```

### 3. POST `/api/kpi-references/request`
Create a reference request (invitation).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Body:**
```json
{
  "candidate_id": "uuid",
  "referee_email": "referee@example.com",
  "referee_name": "John Smith",
  "relationship_type": "manager",  // 'manager', 'peer', 'report', 'client', 'mentor', 'other'
  "role": "backend_engineer",
  "seniority_level": "senior",
  "expires_in_days": 30  // Optional, default 30
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "uuid",
  "token": "64-char-hex-token",
  "invite_url": "https://hrkey.com/references/submit/abc123...",
  "expires_at": "2026-02-11T10:00:00Z",
  "kpi_set_version": 1
}
```

### 4. GET `/api/kpi-references/request/:token`
Get reference request by token (for referee to view form).

**Response (Success):**
```json
{
  "success": true,
  "request": {
    "id": "uuid",
    "candidate_id": "uuid",
    "candidate_email": "candidate@example.com",
    "referee_email": "referee@example.com",
    "referee_name": "John Smith",
    "relationship_type": "manager",
    "role": "backend_engineer",
    "seniority_level": "senior",
    "expires_at": "2026-02-11T10:00:00Z",
    "created_at": "2026-01-12T10:00:00Z"
  },
  "kpiSet": {
    "id": "uuid",
    "role": "backend_engineer",
    "seniority_level": "senior",
    "version": 1,
    "description": "..."
  },
  "kpis": [
    {
      "id": "uuid",
      "key": "code_quality",
      "name": "Code Quality",
      "description": "...",
      "required": true,
      "min_evidence_length": 200
    }
    // ... all KPIs in the set
  ],
  "status": "valid"
}
```

**Error Responses:**
- `404`: Token invalid
- `410`: Token expired or already submitted

### 5. POST `/api/kpi-references/submit/:token`
Submit a completed reference.

**Body:**
```json
{
  "relationship_type": "manager",
  "start_date": "2023-01-15",        // YYYY-MM-DD
  "end_date": "2025-12-31",          // YYYY-MM-DD (nullable if current)
  "confidence_level": "high",         // 'high', 'medium', 'low'
  "rehire_decision": "yes",           // 'yes', 'no', 'conditional'
  "rehire_reasoning": "Outstanding engineer with strong leadership skills...",
  "overall_recommendation": "strongly_recommend",  // Optional
  "kpis": [
    {
      "kpi_id": "uuid",
      "score": 5,  // 1-5 integer
      "evidence_text": "Jane consistently delivered high-quality code with excellent test coverage. She led the redesign of our API gateway, which improved performance by 40% and reduced latency by 200ms. Her code reviews were thorough and constructive, helping the team improve their skills.",
      "confidence_level": "high"  // Optional, per-KPI
    }
    // ... ALL required KPIs must be present
  ],
  "referee_name": "John Smith"  // Optional
}
```

**Validation Rules (STRICT):**
- ✅ All required KPIs must be scored
- ✅ Each KPI must have minimum evidence length (default 200 chars)
- ✅ Score must be 1-5 (integer)
- ✅ `relationship_type` and `rehire_decision` are required
- ✅ `end_date` must be after `start_date` if both provided
- ✅ No duplicate KPI IDs
- ✅ All KPI IDs must belong to the KPI set
- ✅ Token must be valid and not expired

**Response:**
```json
{
  "success": true,
  "reference_id": "uuid",
  "signature_hash": "sha256-hash",
  "submitted_at": "2026-01-12T10:30:00Z"
}
```

**Error Responses:**
- `400`: Validation failed (with detailed `validation_errors` array)
- `404`: Invalid token
- `410`: Token expired or already used
- `422`: Business logic validation failed

### 6. GET `/api/kpi-references/candidate/:candidate_id`
Get reference pack for a candidate with KPI aggregation.

**Query Params (Optional):**
```json
{
  "include_evidence": "false",  // 'true' or 'false' (default: 'false')
  "min_confidence": "medium",   // 'high', 'medium', 'low'
  "limit": 10                   // Max references to return
}
```

**Response:**
```json
{
  "success": true,
  "candidateId": "uuid",
  "references": [
    {
      "id": "uuid",
      "referee_email": "referee@example.com",
      "referee_name": "John Smith",
      "relationship_type": "manager",
      "start_date": "2023-01-15",
      "end_date": "2025-12-31",
      "overall_recommendation": "strongly_recommend",
      "rehire_decision": "yes",
      "confidence_level": "high",
      "completeness_score": 0.92,
      "submitted_at": "2026-01-12T10:30:00Z",
      "kpi_set_version": 1,
      "kpi_scores": [
        {
          "kpi_id": "uuid",
          "kpi_key": "code_quality",
          "kpi_name": "Code Quality",
          "score": 5,
          "confidence_level": "high"
          // "evidence_text" included if include_evidence=true
        }
        // ... more scores
      ]
    }
    // ... more references
  ],
  "kpi_aggregates": [
    {
      "kpi_key": "code_quality",
      "kpi_name": "Code Quality",
      "reference_count": 5,
      "avg_score": 4.6,
      "weighted_avg_score": 4.7,  // Confidence-weighted
      "stddev": 0.49,
      "min_score": 4,
      "max_score": 5,
      "confidence_distribution": {
        "high": 4,
        "medium": 1,
        "low": 0
      }
    }
    // ... aggregates for all KPIs
  ],
  "summary": {
    "total_references": 5,
    "total_kpi_evaluations": 50,
    "avg_overall_score": 4.65,
    "latest_reference_date": "2026-01-12T10:30:00Z",
    "rehire_decision_distribution": {
      "yes": 5,
      "no": 0,
      "conditional": 0
    },
    "confidence_distribution": {
      "high": 4,
      "medium": 1,
      "low": 0
    },
    "relationship_distribution": {
      "manager": 2,
      "peer": 2,
      "client": 1
    },
    "avg_completeness_score": 0.88
  }
}
```

### 7. GET `/api/kpi-references/candidate/:candidate_id/stats`
Get lightweight statistics for a candidate (fast endpoint for dashboards).

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_references": 5,
    "pending_requests": 2,
    "total_kpi_evaluations": 50,
    "latest_reference_date": "2026-01-12T10:30:00Z",
    "confidence_distribution": { "high": 4, "medium": 1, "low": 0 },
    "rehire_decision_distribution": { "yes": 5, "no": 0, "conditional": 0 }
  }
}
```

### 8. GET `/api/kpi-references/:id`
Get single reference by ID (with permission check).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Permission:** Only candidate or referee can access.

**Response:**
```json
{
  "success": true,
  "reference": {
    "id": "uuid",
    "candidate_id": "uuid",
    "referee_email": "referee@example.com",
    // ... full reference data with kpi_scores
  }
}
```

### 9. GET `/api/kpi-references/requests/pending`
Get pending reference requests for authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid",
      "referee_email": "referee@example.com",
      "referee_name": "John Smith",
      "relationship_type": "manager",
      "role": "backend_engineer",
      "seniority_level": "senior",
      "status": "pending",
      "expires_at": "2026-02-11T10:00:00Z",
      "created_at": "2026-01-12T10:00:00Z"
    }
  ]
}
```

---

## ✅ Validation Rules

### Request-Level Validation (Zod)

All endpoints use Zod schemas for runtime validation:

1. **Type checking**: Ensures correct data types
2. **Enum validation**: Validates against allowed values
3. **String lengths**: Min/max character limits
4. **Date formats**: YYYY-MM-DD validation
5. **UUID validation**: Proper UUID format
6. **Email validation**: RFC-compliant emails

### Business Logic Validation (Service Layer)

1. **KPI Set Validation**
   - Active KPI set exists for role+seniority
   - All submitted KPI IDs belong to the KPI set

2. **Required KPI Validation**
   - All KPIs marked as `required: true` must be scored
   - Returns list of missing KPIs if validation fails

3. **Evidence Quality Validation**
   - Each KPI evidence must meet minimum length (default 200 chars)
   - Configured per-KPI via `min_evidence_length`

4. **Date Validation**
   - `end_date` must be >= `start_date`
   - Dates must be valid ISO 8601 format

5. **Token Validation**
   - Token must exist in database
   - Token must not be expired
   - Token must not be already used (single-use enforcement)
   - Token must not be revoked

6. **Duplicate Prevention**
   - Each KPI can only be scored once per reference
   - `reference_request_id` is UNIQUE in `kpi_references` table

### Database Constraints

1. **Foreign Key Constraints**: Ensures referential integrity
2. **Unique Constraints**: Prevents duplicates
3. **Check Constraints**: Validates score range (1-5), seniority levels, etc.
4. **NOT NULL Constraints**: Enforces required fields
5. **Unique Indexes**: One active KPI set per role+seniority

---

## 🔄 Data Flow

### Reference Request Flow

```
1. Candidate creates request
   ↓
2. System resolves active KPI set (version lock)
   ↓
3. Generate secure token (64-char hex)
   ↓
4. Store token + SHA-256 hash
   ↓
5. Send invitation email to referee
   ↓
6. Referee clicks link with token
```

### Reference Submission Flow

```
1. Referee loads form via token
   ↓
2. System validates token (expiration, single-use)
   ↓
3. Returns KPI set (version-locked)
   ↓
4. Referee fills form with KPI scores + evidence
   ↓
5. Referee submits
   ↓
6. System validates:
      - All required KPIs present?
      - Evidence meets minimum length?
      - Scores in valid range (1-5)?
      - All KPIs belong to set?
      - Date logic correct?
   ↓
7. If valid:
      - Insert reference record
      - Insert KPI scores records
      - Generate signature hash
      - Mark request as 'submitted'
      - Send notification to candidate
      - Trigger materialized view refresh (async)
   ↓
8. If invalid:
      - Return detailed validation errors
```

### Reference Pack Retrieval Flow

```
1. Request candidate references
   ↓
2. Fetch all references for candidate
   ↓
3. Fetch all KPI scores for those references
   ↓
4. Build reference objects (with scores)
   ↓
5. Calculate KPI-level aggregates:
      - Average score per KPI
      - Weighted average (by confidence)
      - Standard deviation
      - Min/max scores
      - Confidence distribution
   ↓
6. Calculate overall summary:
      - Total references
      - Rehire decision distribution
      - Relationship distribution
      - Average completeness score
   ↓
7. Return structured response
```

---

## 🚀 Setup & Deployment

### 1. Database Migration

Run the migration SQL files in order:

```bash
# 1. Run the schema migration
psql -U postgres -d your_database -f sql/010_kpi_references_p0.sql

# 2. Run the seed data
psql -U postgres -d your_database -f sql/seed_kpi_sets.sql
```

**For Supabase:**

1. Go to SQL Editor in Supabase Dashboard
2. Paste contents of `010_kpi_references_p0.sql`
3. Execute
4. Paste contents of `seed_kpi_sets.sql`
5. Execute

### 2. Environment Variables

Add to `.env`:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Email (Resend)
RESEND_API_KEY=your-resend-api-key

# Frontend URL (for invite links)
FRONTEND_URL=https://app.hrkey.com
```

### 3. Start Server

```bash
cd backend
npm install
npm start
```

### 4. Verify Installation

Check that KPI sets were seeded:

```sql
SELECT role, seniority_level, version, active, COUNT(kpis.id) as kpi_count
FROM kpi_sets
LEFT JOIN kpis ON kpis.kpi_set_id = kpi_sets.id
GROUP BY kpi_sets.id, role, seniority_level, version, active
ORDER BY role, seniority_level;
```

Expected output:
```
       role        | seniority_level | version | active | kpi_count
-------------------+-----------------+---------+--------+-----------
 backend_engineer  | junior          |       1 | t      |         7
 backend_engineer  | mid             |       1 | t      |         8
 backend_engineer  | senior          |       1 | t      |        10
 data_scientist    | senior          |       1 | t      |         8
 engineering_manager | lead          |       1 | t      |         8
 frontend_engineer | senior          |       1 | t      |         8
 product_manager   | senior          |       1 | t      |         9
```

---

## 🧪 Testing

### Manual Testing Workflow

#### 1. Create Reference Request

```bash
curl -X POST http://localhost:3000/api/kpi-references/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_id": "YOUR_CANDIDATE_UUID",
    "referee_email": "referee@example.com",
    "referee_name": "John Smith",
    "relationship_type": "manager",
    "role": "backend_engineer",
    "seniority_level": "senior"
  }'
```

Response includes `token` and `invite_url`.

#### 2. Get Request by Token

```bash
curl http://localhost:3000/api/kpi-references/request/YOUR_TOKEN
```

Should return KPI set with all KPIs.

#### 3. Submit Reference

```bash
curl -X POST http://localhost:3000/api/kpi-references/submit/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{
    "relationship_type": "manager",
    "start_date": "2023-01-15",
    "end_date": "2025-12-31",
    "confidence_level": "high",
    "rehire_decision": "yes",
    "rehire_reasoning": "Outstanding engineer...",
    "overall_recommendation": "strongly_recommend",
    "kpis": [
      {
        "kpi_id": "KPI_UUID_1",
        "score": 5,
        "evidence_text": "Jane consistently delivered high-quality code with excellent test coverage. She led the redesign of our API gateway, which improved performance by 40% and reduced latency by 200ms. Her code reviews were thorough and constructive, helping the team improve their skills.",
        "confidence_level": "high"
      },
      {
        "kpi_id": "KPI_UUID_2",
        "score": 4,
        "evidence_text": "Jane demonstrated strong system design skills when architecting our microservices platform. She made thoughtful decisions about service boundaries, data consistency, and observability. The system has been running smoothly in production for 18 months with 99.95% uptime.",
        "confidence_level": "high"
      }
    ]
  }'
```

#### 4. Get Candidate References

```bash
curl http://localhost:3000/api/kpi-references/candidate/CANDIDATE_UUID
```

Should return all references with KPI aggregates.

### Testing Edge Cases

1. **Expired Token**
   - Create request with `expires_in_days: 0`
   - Wait 1 second
   - Try to load form → should return 410 Gone

2. **Already Submitted**
   - Submit reference
   - Try to submit again with same token → should return 410 Gone

3. **Missing Required KPI**
   - Submit reference without a required KPI
   - Should return 400 with validation error listing missing KPI

4. **Evidence Too Short**
   - Submit reference with evidence < 50 chars
   - Should return 400 with validation error

5. **Invalid Score**
   - Submit reference with score = 0 or 6
   - Should return 400 with validation error

6. **Invalid KPI ID**
   - Submit reference with KPI ID not in the set
   - Should return 400 with validation error

---

## 📝 Architectural Decisions

### AD-1: Token Storage Strategy

**Decision:** Store plain text token + SHA-256 hash.

**Rationale:**
- Plain text token needed for email sending
- SHA-256 hash used for database lookups (prevents token leakage from DB dumps)
- If DB is compromised, attacker cannot use hashes to access forms

**Trade-offs:**
- Slightly more storage (64 chars + 64 chars)
- More secure than plain text only

### AD-2: Denormalization in `reference_kpi_scores`

**Decision:** Copy `kpi_key` and `kpi_name` from `kpis` table.

**Rationale:**
- Performance: Avoid joins when retrieving references
- Simplicity: Can query by `kpi_key` without joining `kpis` table
- Immutability: If KPI name changes in future version, old references preserve original name

**Trade-offs:**
- Increased storage (~50 bytes per score)
- Data redundancy
- BUT: Acceptable for P0; optimizes read-heavy workload

### AD-3: Version Locking

**Decision:** Store `kpi_set_version` in both `reference_requests` and `kpi_references`.

**Rationale:**
- Immutability: References must remain interpretable even if KPI definitions change
- Auditability: Can reconstruct exact KPI set used at reference time
- Comparability: Only compare references using same KPI set version

**Trade-offs:**
- More complex versioning logic
- BUT: Critical for data integrity and compliance

### AD-4: Single-Use Tokens

**Decision:** `reference_request_id` is UNIQUE in `kpi_references` table.

**Rationale:**
- Prevents duplicate submissions
- Enforces one reference per request
- Simpler than tracking submission attempts

**Trade-offs:**
- Cannot "retry" a submission (must create new request)
- BUT: Acceptable for P0; prevents data quality issues

### AD-5: Materialized View for Aggregates

**Decision:** Pre-compute KPI aggregates in materialized view.

**Rationale:**
- Performance: Real-time aggregation is expensive for candidates with many references
- Read-heavy workload: Aggregates read >> writes
- Complexity trade-off acceptable for P0

**Trade-offs:**
- Must refresh view after writes (async)
- Potential stale data (< 1 minute typically)
- BUT: Acceptable for P0; can optimize later

### AD-6: RLS Policies

**Decision:** Simplified RLS policies for P0.

**Rationale:**
- Candidate can read own references
- Referee can read references they submitted
- KPI sets are public (anyone can read)
- Service role key bypasses RLS for backend operations

**Trade-offs:**
- Not as granular as production might need
- BUT: Sufficient for P0; can tighten later

### AD-7: Completeness Score

**Decision:** Calculate optional `completeness_score` (0.00-1.00).

**Rationale:**
- ML readiness: Quality signal for filtering low-quality references
- Future: Can use for HRScore weighting or reference ranking
- Low cost: Calculated via trigger

**Trade-offs:**
- Additional computation
- BUT: Valuable for analytics and future features

---

## 🚀 Future Enhancements (Out of Scope for P0)

### Priority 1 (P1)
1. **UI Components**
   - Referee form (React)
   - Candidate dashboard
   - Reference pack visualization

2. **HRScore Integration**
   - Use KPI weights for score calculation
   - Incorporate reference quality signals
   - Historical score tracking

3. **Admin Features**
   - KPI set versioning UI
   - Reference moderation
   - Fraud detection alerts

### Priority 2 (P2)
1. **AI Features**
   - AI-assisted evidence writing (suggestions)
   - Fraud detection (LLM-based)
   - Reference summarization

2. **Advanced Analytics**
   - KPI correlation analysis
   - Role benchmarking
   - Industry comparisons

3. **Blockchain Integration**
   - Immutable reference attestations
   - NFT-based credentials

### Priority 3 (P3)
1. **Video References**
   - Record video evidence
   - Transcript + sentiment analysis

2. **Multi-language Support**
   - Localized KPI sets
   - Translation API integration

3. **Reference Marketplace**
   - Paid reference requests
   - Premium referee verification

---

## 📞 Support & Maintenance

### Monitoring Checklist

- [ ] Track reference submission rate
- [ ] Monitor token expiration rate
- [ ] Alert on validation error spikes
- [ ] Track materialized view refresh lag
- [ ] Monitor database query performance

### Scheduled Jobs

1. **Daily:**
   - Expire old pending requests (set status = 'expired')
   - Refresh materialized views

2. **Weekly:**
   - Generate analytics reports
   - Clean up expired tokens (after 90 days)

3. **Monthly:**
   - Review completeness scores
   - Analyze KPI score distributions
   - Audit reference quality

### Troubleshooting

**Issue:** References not showing up in candidate pack

**Solution:**
1. Check reference status: `SELECT status FROM kpi_references WHERE id = ?`
2. Verify materialized view: `REFRESH MATERIALIZED VIEW candidate_kpi_aggregates;`
3. Check RLS policies

**Issue:** Validation errors on submission

**Solution:**
1. Check validation error array in response
2. Verify all required KPIs present
3. Check evidence minimum lengths
4. Verify score range (1-5)

---

## ✅ P0 Completion Checklist

- [x] Database schema implemented
- [x] All 5 core endpoints implemented
- [x] Strict validation rules enforced
- [x] Seed data for 7 role+seniority combinations
- [x] Token-based access control
- [x] Version locking
- [x] Signature hashing
- [x] KPI aggregation
- [x] Documentation complete
- [x] Ready for testing

---

## 📄 License & Attribution

**Project:** HRKey Platform
**Feature:** KPI-Driven References (P0)
**Date:** 2026-01-12
**Architect:** Senior Backend Engineer

---

**End of Documentation**
