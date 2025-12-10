# Reference Validation Layer (RVL) - Documentation

**Version:** 1.0.0
**Date:** 2025-12-10
**Status:** Production Ready

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Integration](#integration)
- [Data Schema](#data-schema)
- [Configuration](#configuration)
- [Testing](#testing)
- [Future Enhancements](#future-enhancements)

---

## 🎯 Overview

The **Reference Validation Layer (RVL)** is a comprehensive system for validating, standardizing, and scoring professional references submitted to the HRKey platform. It processes raw reference submissions through multiple validation stages to ensure data quality, detect fraud, and prepare structured data for the HRScore engine.

### Key Features

✅ **Text Standardization** - Cleans and normalizes narrative text
✅ **Fraud Detection** - Calculates fraud risk score (0-100)
✅ **Consistency Checking** - Validates against previous references
✅ **Embedding Generation** - Creates vector embeddings for semantic analysis
✅ **Structured Output** - Generates JSON consumable by HRScore engine

### Benefits

- **Improved Data Quality:** Standardized, clean reference data
- **Fraud Prevention:** Automatic detection of suspicious patterns
- **Consistency Validation:** Cross-reference validation for reliability
- **Semantic Search:** Embedding vectors enable similarity searches
- **Admin Flagging:** Automatic flagging of high-risk references

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Reference Submission                         │
│                   (from referee-evaluation-page)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    server.js: submitReference()                  │
│              1. Insert raw reference to database                 │
│              2. Fetch previous references for comparison         │
│              3. Call RVL: validateReference()                    │
│              4. Update reference with validated_data             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                 RVL: services/validation/index.js                │
│                                                                  │
│    ┌──────────────────────────────────────────────────────┐    │
│    │  STAGE 1: Narrative Standardization                  │    │
│    │  - Trim whitespace, normalize line breaks           │    │
│    │  - Fix punctuation, convert smart quotes            │    │
│    │  - Remove zero-width characters                     │    │
│    │  Output: standardized_text                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│    ┌──────────────────────────────────────────────────────┐    │
│    │  STAGE 2: Embedding Generation                       │    │
│    │  - Generate 1536-dim vector (OpenAI ada-002)        │    │
│    │  - Or use mock embeddings for testing               │    │
│    │  Output: embedding_vector                           │    │
│    └──────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│    ┌──────────────────────────────────────────────────────┐    │
│    │  STAGE 3: Consistency Checking                       │    │
│    │  - Compare KPI ratings with previous references     │    │
│    │  - Calculate variance and deviations                │    │
│    │  - Flag large deviations (>2.0 rating difference)   │    │
│    │  Output: consistency_score (0-1), flags             │    │
│    └──────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│    ┌──────────────────────────────────────────────────────┐    │
│    │  STAGE 4: Fraud Detection                            │    │
│    │  - Analyze text quality (length, boilerplate)       │    │
│    │  - Check rating patterns (all perfect = suspicious) │    │
│    │  - Email reputation (disposable domains penalized)  │    │
│    │  - Consistency penalty (low consistency = fraud)    │    │
│    │  Output: fraud_score (0-100)                        │    │
│    └──────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│    ┌──────────────────────────────────────────────────────┐    │
│    │  STAGE 5: Structured Output Generation               │    │
│    │  - Build structured_dimensions from KPIs            │    │
│    │  - Calculate overall confidence                     │    │
│    │  - Determine validation_status (APPROVED/REJECTED)  │    │
│    │  Output: complete validated_data object             │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Database: references table                     │
│                                                                  │
│  validated_data: {                                               │
│    standardized_text: "...",                                     │
│    structured_dimensions: {                                      │
│      teamwork: { rating: 4.5, confidence: 0.95, ... },         │
│      leadership: { rating: 4.0, confidence: 0.85, ... }         │
│    },                                                            │
│    consistency_score: 0.92,                                      │
│    fraud_score: 12,                                              │
│    confidence: 0.93,                                             │
│    validation_status: "APPROVED",                                │
│    flags: [],                                                    │
│    embedding_vector: [0.123, -0.456, ...],                      │
│    metadata: { ... }                                             │
│  }                                                               │
│                                                                  │
│  Additional columns:                                             │
│  - validation_status (TEXT)                                      │
│  - fraud_score (INTEGER)                                         │
│  - consistency_score (DECIMAL)                                   │
│  - validated_at (TIMESTAMPTZ)                                    │
│  - is_flagged (BOOLEAN) [auto-set if fraud_score >= 70]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ How It Works

### 1. Narrative Standardization

**Module:** `services/validation/narrativeStandardizer.js`

**Purpose:** Clean and normalize reference text to ensure consistent formatting.

**Operations:**
- Trim leading/trailing whitespace
- Normalize line breaks (CRLF → LF)
- Remove excessive punctuation (3+ → 3)
- Convert smart quotes to straight quotes
- Normalize dashes and Unicode characters
- Capitalize first letter

**Example:**
```javascript
Input:  "  john  was   EXCELLENT!!!!!!  "
Output: "John was EXCELLENT!!!"
```

### 2. Embedding Generation

**Module:** `services/validation/embeddingService.js`

**Purpose:** Generate vector embeddings for semantic similarity analysis.

**Current Status:**
- **Production:** Uses OpenAI `text-embedding-ada-002` (1536 dimensions)
- **Testing/Development:** Uses mock deterministic embeddings

**Configuration:**
```javascript
EMBEDDING_PROVIDER=openai        // 'openai' | 'anthropic' | 'mock'
EMBEDDING_MODEL=text-embedding-ada-002
OPENAI_API_KEY=your-api-key-here
```

**TODO:** Replace mock with real API calls when ready for production.

### 3. Consistency Checking

**Module:** `services/validation/consistencyChecker.js`

**Purpose:** Validate that current reference aligns with previous references for the same candidate.

**Checks:**
- **KPI Variance:** Calculate standard deviation across references
- **Rating Deviations:** Flag if any KPI differs by >2.0 from average
- **Semantic Similarity:** Compare narrative embeddings (future)

**Scoring:**
```
consistency_score = (kpi_consistency * 0.6) + (semantic_consistency * 0.4)
```

**Flags:**
- `KPI_DEVIATION`: Current rating significantly different from previous
- `LOW_CONSISTENCY`: Overall score < 0.6
- `POTENTIAL_CONTRADICTION`: Contradictory statements detected

### 4. Fraud Detection

**Module:** `services/validation/fraudDetector.js`

**Purpose:** Calculate fraud risk score (0-100, lower is better).

**Components:**

| Component | Weight | Signals |
|-----------|--------|---------|
| Text Quality | 25% | Length, boilerplate phrases, repetition, punctuation |
| Rating Patterns | 30% | All perfect (>4.5), all identical, no variance |
| Consistency | 25% | Inverse of consistency_score |
| Email Reputation | 20% | Disposable domains, free providers, suspicious patterns |

**Risk Levels:**
- `0-20`: Low risk (green)
- `20-40`: Medium risk (yellow)
- `40-70`: High risk (orange)
- `70-100`: Critical risk (red) → Auto-flagged

**Auto-Flagging Triggers:**
- `fraud_score >= 70`
- `consistency_score < 0.4`
- `validation_status = REJECTED_*`

### 5. Structured Output Generation

**Module:** `services/validation/structuredOutputGen.js`

**Purpose:** Generate final validated reference JSON.

**Output Structure:**
```json
{
  "standardized_text": "John was an excellent...",
  "structured_dimensions": {
    "teamwork": {
      "rating": 4.5,
      "confidence": 0.95,
      "normalized": 0.9,
      "feedback": "..."
    },
    "leadership": { ... }
  },
  "consistency_score": 0.92,
  "fraud_score": 12,
  "confidence": 0.93,
  "validation_status": "APPROVED",
  "flags": [],
  "embedding_vector": [...],
  "metadata": {
    "validation_version": "1.0.0",
    "validated_at": "2025-12-10T12:00:00Z",
    "text_length": 245,
    "kpi_count": 5,
    "has_embedding": true,
    "processing_time_ms": 342
  }
}
```

**Validation Statuses:**
- `APPROVED`: All checks passed, low fraud risk
- `APPROVED_WITH_WARNINGS`: Minor issues but acceptable
- `REJECTED_HIGH_FRAUD_RISK`: Fraud score >= 70
- `REJECTED_CRITICAL_ISSUES`: Critical validation flags
- `REJECTED_INCONSISTENT`: Consistency score < 0.4

---

## 🔌 Integration

### In Backend Code

The RVL is automatically integrated into the reference submission flow in `server.js`:

```javascript
// server.js: submitReference() method

import { validateReference as validateReferenceRVL } from './services/validation/index.js';

// ... after inserting reference into database ...

try {
  // Fetch previous references for consistency checking
  const { data: previousRefs } = await supabase
    .from('references')
    .select('summary, kpi_ratings, validated_data')
    .eq('owner_id', candidateId)
    .limit(10);

  // Validate through RVL
  const validatedData = await validateReferenceRVL({
    summary: rawReference.summary,
    kpi_ratings: rawReference.kpi_ratings,
    detailed_feedback: rawReference.detailed_feedback,
    owner_id: rawReference.owner_id,
    referrer_email: rawReference.referrer_email
  }, {
    previousReferences: previousRefs || [],
    skipEmbeddings: process.env.NODE_ENV === 'test'
  });

  // Update reference with validated data
  await supabase
    .from('references')
    .update({
      validated_data: validatedData,
      validation_status: validatedData.validation_status,
      fraud_score: validatedData.fraud_score,
      consistency_score: validatedData.consistency_score,
      validated_at: new Date().toISOString()
    })
    .eq('id', referenceId);

} catch (rvlError) {
  // Non-fatal: log and continue
  logger.error('RVL processing failed', { error: rvlError.message });
}
```

### Querying Validated References

```javascript
// Get all approved references for a candidate
const { data: references } = await supabase
  .from('references')
  .select('*, validated_data')
  .eq('owner_id', candidateId)
  .eq('validation_status', 'APPROVED')
  .order('validated_at', { ascending: false });

// Get flagged references for admin review
const { data: flagged } = await supabase
  .from('flagged_references_queue')
  .select('*')
  .order('fraud_score', { ascending: false });
```

---

## 📊 Data Schema

### Database Columns Added to `references` Table

```sql
-- Validated data (JSONB)
validated_data JSONB

-- Quick access columns (extracted from validated_data)
validation_status TEXT CHECK (validation_status IN (
  'PENDING', 'APPROVED', 'APPROVED_WITH_WARNINGS',
  'REJECTED_HIGH_FRAUD_RISK', 'REJECTED_CRITICAL_ISSUES', 'REJECTED_INCONSISTENT'
))
fraud_score INTEGER CHECK (fraud_score >= 0 AND fraud_score <= 100)
consistency_score DECIMAL(5, 4) CHECK (consistency_score >= 0 AND consistency_score <= 1)
validated_at TIMESTAMPTZ

-- Admin review fields
is_flagged BOOLEAN DEFAULT FALSE
flag_reason TEXT
reviewed_by UUID REFERENCES users(id)
reviewed_at TIMESTAMPTZ
```

### Indexes

```sql
CREATE INDEX idx_references_validation_status ON references(validation_status);
CREATE INDEX idx_references_fraud_score ON references(fraud_score DESC);
CREATE INDEX idx_references_flagged ON references(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_references_validated_data_gin ON references USING GIN (validated_data);
```

### Views

**`flagged_references_queue`:** References needing admin review
**`reference_validation_stats`:** Aggregated validation statistics

---

## ⚙️ Configuration

### Environment Variables

```bash
# Embedding Service
EMBEDDING_PROVIDER=mock            # 'openai' | 'anthropic' | 'mock'
EMBEDDING_MODEL=text-embedding-ada-002
OPENAI_API_KEY=your-api-key-here

# RVL Behavior
NODE_ENV=production                # Skip embeddings if 'test'
```

### Customization

Edit thresholds in individual service modules:

```javascript
// services/validation/fraudDetector.js
const THRESHOLDS = {
  min_text_length: 50,
  perfect_ratings_threshold: 0.9,
  // ... etc
};

// services/validation/consistencyChecker.js
const CONSISTENCY_THRESHOLDS = {
  kpi_variance_max: 1.5,
  semantic_similarity_min: 0.6,
  // ... etc
};
```

---

## 🧪 Testing

### Run RVL Tests

```bash
cd backend
npm test tests/services/rvl.test.js
```

### Test Coverage

The RVL test suite (`tests/services/rvl.test.js`) includes:

- ✅ Narrative standardization (text cleaning, validation)
- ✅ Embedding generation (mock + cosine similarity)
- ✅ Consistency checking (KPI variance, contradictions)
- ✅ Fraud detection (text quality, rating patterns, email reputation)
- ✅ Structured output generation (formatting, validation status)
- ✅ End-to-end validation flow

**Target Coverage:** >80%

### Manual Testing

```javascript
import { validateReference } from './services/validation/index.js';

const result = await validateReference({
  summary: "John was an excellent team member...",
  kpi_ratings: { teamwork: 4.5, leadership: 4 },
  detailed_feedback: { recommendation: "Highly recommend" },
  owner_id: "uuid-here",
  referrer_email: "manager@company.com"
}, {
  skipEmbeddings: true  // For local testing
});

console.log(result);
```

---

## 🚀 Future Enhancements

### Phase 2 (Q1 2026)

1. **Real AI Integration**
   - Replace mock embeddings with OpenAI API calls
   - Add Anthropic as alternative provider
   - Implement embedding caching in Supabase

2. **Advanced Semantic Analysis**
   - Use embeddings for semantic consistency checking
   - Detect paraphrased contradictions
   - Cluster similar references for anomaly detection

3. **ML-Based Fraud Detection**
   - Train supervised model on labeled fraud data
   - Use ensemble methods (Random Forest + Neural Net)
   - Real-time fraud score updates

4. **Admin Dashboard**
   - UI for reviewing flagged references
   - Bulk actions (approve/reject)
   - Analytics dashboard (fraud trends, validation stats)

5. **Webhook Integration**
   - Notify admins when high-fraud references detected
   - Slack/Discord integration for real-time alerts

---

## 📝 Zod Schemas

Validation schemas are defined in `schemas/validatedReference.schema.js`:

```javascript
import { validatedReferenceSchema, rvlInputSchema } from './schemas/validatedReference.schema.js';

// Validate RVL input
rvlInputSchema.parse(rawReference);

// Validate RVL output
validatedReferenceSchema.parse(validatedData);
```

---

## 📞 Support & Contact

**Questions?** Contact the HRKey Development Team

**Issues?** [GitHub Issues](https://github.com/OnChainFest/HRkey-App/issues)

**Version:** 1.0.0
**Last Updated:** 2025-12-10
