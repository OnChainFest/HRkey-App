# HRKey Dynamic Pricing Specification
## Technical Implementation for Market-Driven Reference Pricing

**Version:** 1.0
**Last Updated:** November 26, 2025
**Owner:** HRKey Protocol Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pricing Formula](#2-pricing-formula)
3. [Multiplier Specifications](#3-multiplier-specifications)
4. [Implementation Architecture](#4-implementation-architecture)
5. [Off-Chain Engine](#5-off-chain-engine)
6. [On-Chain Oracle](#6-on-chain-oracle)
7. [Price Update Flow](#7-price-update-flow)
8. [Security & Validation](#8-security--validation)
9. [Testing & Scenarios](#9-testing--scenarios)
10. [Monitoring & Analytics](#10-monitoring--analytics)

---

## 1. Overview

### 1.1 Purpose

The HRKey Dynamic Pricing Mechanism creates a **market-driven economy** for professional references where:

- High-demand candidates command premium prices
- Senior profiles cost more than junior profiles
- Rare skillsets are priced higher than common ones
- Prices reflect real-time supply/demand dynamics

### 1.2 Design Goals

1. **Economic Efficiency**: Prices signal true market value
2. **Fairness**: All candidates start with base price, earn premiums via merit
3. **Anti-Gaming**: Manipulation is economically irrational
4. **Scalability**: Supports 10M+ candidates with sub-second query times
5. **Transparency**: Candidates see exactly why their price is X HRK

### 1.3 Key Constraints

```
P_min = 5 HRK      // Minimum price (ensures evaluator compensation)
P_max = 500 HRK    // Maximum price (prevents extreme volatility)
P_base = 5 HRK     // Default price for new profiles
```

---

## 2. Pricing Formula

### 2.1 Master Equation

```
P_candidate = P_base × M_seniority × M_demand × M_rarity × M_hrscore × M_geography × M_industry

Where:
- P_base = 5 HRK (constant)
- M_* = Multipliers (dimensionless, typically 0.5 - 2.0)
```

### 2.2 Bounded Output

```typescript
function calculateFinalPrice(rawPrice: number): number {
  return Math.min(Math.max(rawPrice, P_MIN), P_MAX);
}

// Example:
// rawPrice = 750 HRK → finalPrice = 500 HRK (capped)
// rawPrice = 2 HRK → finalPrice = 5 HRK (floored)
```

### 2.3 Rationale for Multiplicative Model

**Why Multiplicative (not Additive)?**

```
Additive Model Issues:
P = 5 + M_sen + M_dem + ... → Linear growth, no compounding effects

Multiplicative Model Advantages:
P = 5 × M_sen × M_dem × ... → Exponential growth reflects market reality
```

**Example:**
- Senior (1.5x) + High Demand (2x) + Rare Skills (1.5x)
- Additive: 5 + 0.5 + 1 + 0.5 = **7 HRK** (underpriced)
- Multiplicative: 5 × 1.5 × 2 × 1.5 = **22.5 HRK** (market-accurate)

---

## 3. Multiplier Specifications

### 3.1 M_seniority (Seniority Multiplier)

**Purpose**: Experienced professionals have more verifiable track records.

**Formula**:
```typescript
function getSeniorityMultiplier(yearsOfExperience: number): number {
  return 1 + (yearsOfExperience / 20);
}
```

**Lookup Table**:

| Years of Experience | Multiplier | Label |
|---------------------|------------|-------|
| 0 | 1.00 | Entry-level |
| 1-2 | 1.05 - 1.10 | Junior |
| 3-5 | 1.15 - 1.25 | Mid-level |
| 6-9 | 1.30 - 1.45 | Senior |
| 10-15 | 1.50 - 1.75 | Staff/Principal |
| 16-20 | 1.80 - 2.00 | Executive |
| 20+ | 2.00 | Capped |

**Justification**:
- Linear growth up to 20 years
- Prevents extreme multipliers for 30+ year careers
- 2x max multiplier aligns with market research (senior salaries ~2x junior)

**Implementation**:
```typescript
export function getSeniorityMultiplier(yearsOfExperience: number): number {
  const years = Math.max(0, yearsOfExperience); // No negative years
  const cappedYears = Math.min(years, 20);      // Cap at 20 years
  return 1 + (cappedYears / 20);
}

// Test cases:
// getSeniorityMultiplier(0)   → 1.00
// getSeniorityMultiplier(10)  → 1.50
// getSeniorityMultiplier(25)  → 2.00 (capped)
// getSeniorityMultiplier(-5)  → 1.00 (floored)
```

---

### 3.2 M_demand (Demand Multiplier)

**Purpose**: Popular profiles (high query volume) command premium prices.

**Formula**:
```typescript
function getDemandMultiplier(
  queriesLast30Days: number,
  globalAvgQueries: number
): number {
  const ratio = queriesLast30Days / Math.max(globalAvgQueries, 1);
  return 1 + Math.log10(1 + ratio);
}
```

**Rationale for Log Scale**:
- Prevents runaway pricing for viral profiles
- 10x queries → 2x price (not 10x price)
- Smooth curve, no discontinuities

**Lookup Table** (assuming globalAvg = 5 queries/month):

| Queries/Month | Ratio | Multiplier | Description |
|---------------|-------|------------|-------------|
| 0 | 0 | 1.00 | No demand |
| 1 | 0.2 | 1.08 | Below average |
| 5 | 1.0 | 1.30 | Average |
| 10 | 2.0 | 1.48 | Above average |
| 25 | 5.0 | 1.78 | High demand |
| 50 | 10.0 | 2.04 | Very high demand |
| 100 | 20.0 | 2.32 | Extreme demand |
| 500 | 100.0 | 3.00 | Viral (rare) |

**Implementation**:
```typescript
export function getDemandMultiplier(
  queriesLast30Days: number,
  globalAvgQueries: number
): number {
  const queries = Math.max(0, queriesLast30Days);
  const avgQueries = Math.max(1, globalAvgQueries); // Prevent division by zero

  const ratio = queries / avgQueries;
  const multiplier = 1 + Math.log10(1 + ratio);

  // Cap multiplier at 3.0 (equivalent to 1000x queries)
  return Math.min(multiplier, 3.0);
}

// Test cases:
// getDemandMultiplier(0, 5)    → 1.00
// getDemandMultiplier(5, 5)    → 1.30
// getDemandMultiplier(50, 5)   → 2.04
// getDemandMultiplier(10000, 5) → 3.00 (capped)
```

**Edge Cases**:
- **New candidate (0 queries)**: M = 1.00 (base price)
- **First query**: Increments to M = 1.04 (encourages early adoption)
- **Viral candidate (1000+ queries)**: Capped at M = 3.00 (prevents manipulation)

---

### 3.3 M_rarity (Skill Rarity Multiplier)

**Purpose**: Rare skillsets (e.g., Rust + Cryptography) are harder to verify, thus more valuable.

**Formula**:
```typescript
function getRarityMultiplier(skillPercentile: number): number {
  return 1 + (1 - skillPercentile);
}
```

**Percentile Calculation**:
```sql
WITH skill_counts AS (
  SELECT
    skill,
    COUNT(DISTINCT candidate_id) AS candidate_count
  FROM candidate_skills
  GROUP BY skill
)
SELECT
  skill,
  PERCENT_RANK() OVER (ORDER BY candidate_count DESC) AS percentile
FROM skill_counts;

-- Example:
-- JavaScript: 80,000 candidates → percentile = 0.95 (common)
-- Rust: 1,200 candidates → percentile = 0.10 (rare)
```

**Lookup Table**:

| Skill Percentile | Multiplier | Description |
|------------------|------------|-------------|
| 0.00 - 0.10 | 1.90 - 2.00 | Ultra-rare (top 10%) |
| 0.11 - 0.25 | 1.75 - 1.89 | Rare |
| 0.26 - 0.50 | 1.50 - 1.74 | Uncommon |
| 0.51 - 0.75 | 1.25 - 1.49 | Common |
| 0.76 - 0.90 | 1.10 - 1.24 | Very common |
| 0.91 - 1.00 | 1.00 - 1.09 | Ubiquitous |

**Implementation**:
```typescript
export function getRarityMultiplier(skillPercentile: number): number {
  const percentile = Math.max(0, Math.min(1, skillPercentile)); // Clamp to [0, 1]
  return 1 + (1 - percentile);
}

// Test cases:
// getRarityMultiplier(0.05)  → 1.95 (ultra-rare, e.g., Zero-Knowledge Proofs)
// getRarityMultiplier(0.50)  → 1.50 (uncommon, e.g., Solidity)
// getRarityMultiplier(0.95)  → 1.05 (common, e.g., JavaScript)
```

**Skill Combination Bonuses**:
```typescript
function getCombinedSkillRarity(skills: string[]): number {
  // For multiple skills, use geometric mean of percentiles
  const percentiles = skills.map(skill => getSkillPercentile(skill));
  const geometricMean = Math.pow(
    percentiles.reduce((a, b) => a * b, 1),
    1 / percentiles.length
  );
  return getRarityMultiplier(geometricMean);
}

// Example:
// Candidate with [Rust (10%), Cryptography (5%), Solana (8%)]
// Geometric mean = (0.10 × 0.05 × 0.08)^(1/3) = 0.073
// Multiplier = 1 + (1 - 0.073) = 1.927 (ultra-rare combo)
```

---

### 3.4 M_hrscore (HRScore Multiplier)

**Purpose**: Higher HRScores correlate with better job performance, increasing reference value.

**Formula**:
```typescript
function getHRScoreMultiplier(hrScore: number): number {
  return 0.5 + (hrScore / 100);
}
```

**Rationale**:
- HRScore 0 → M = 0.50 (discount for unproven candidates)
- HRScore 50 → M = 1.00 (average)
- HRScore 100 → M = 1.50 (premium for top performers)

**Lookup Table**:

| HRScore Range | Multiplier | Description |
|---------------|------------|-------------|
| 0 - 20 | 0.50 - 0.70 | Unproven / Red flags |
| 21 - 40 | 0.71 - 0.90 | Below average |
| 41 - 60 | 0.91 - 1.10 | Average |
| 61 - 80 | 1.11 - 1.30 | Above average |
| 81 - 95 | 1.31 - 1.45 | Excellent |
| 96 - 100 | 1.46 - 1.50 | Elite (top 1%) |

**Implementation**:
```typescript
export function getHRScoreMultiplier(hrScore: number): number {
  const score = Math.max(0, Math.min(100, hrScore)); // Clamp to [0, 100]
  return 0.5 + (score / 100);
}

// Test cases:
// getHRScoreMultiplier(0)    → 0.50 (discount)
// getHRScoreMultiplier(50)   → 1.00 (neutral)
// getHRScoreMultiplier(88)   → 1.38 (premium)
// getHRScoreMultiplier(100)  → 1.50 (maximum)
```

**Special Cases**:
- **New candidates (no HRScore)**: Default to 50 (neutral M = 1.00)
- **Candidates with 1-2 evaluations**: Apply confidence penalty
  ```typescript
  const confidencePenalty = Math.min(1, evaluationCount / 3);
  const adjustedMultiplier = 1 + (hrScoreMultiplier - 1) * confidencePenalty;
  ```

---

### 3.5 M_geography (Geographic Multiplier)

**Purpose**: Reflects regional salary differentials and hiring demand.

**Formula**:
```typescript
function getGeographyMultiplier(location: string): number {
  const index = MARKET_COMPENSATION_INDEX[location] || 100;
  return index / 100;
}
```

**Market Compensation Index** (based on Numbeo Cost of Living + Salary Index):

| Region | Index | Multiplier | Examples |
|--------|-------|------------|----------|
| **Tier 1 (High)** | 120 | 1.20 | Switzerland, Singapore, Norway |
| **Tier 2 (Above Avg)** | 100-110 | 1.00-1.10 | USA, UK, Germany, Australia |
| **Tier 3 (Average)** | 80-99 | 0.80-0.99 | Spain, Italy, South Korea |
| **Tier 4 (Below Avg)** | 60-79 | 0.60-0.79 | Mexico, Brazil, Poland |
| **Tier 5 (Low)** | 40-59 | 0.40-0.59 | India, Vietnam, Philippines |
| **Tier 6 (Very Low)** | 20-39 | 0.20-0.39 | Pakistan, Bangladesh, Nigeria |

**Implementation**:
```typescript
const MARKET_COMPENSATION_INDEX: Record<string, number> = {
  // Tier 1
  'Switzerland': 120,
  'Singapore': 115,
  'Norway': 118,
  'Denmark': 115,

  // Tier 2
  'United States': 100,
  'United Kingdom': 95,
  'Germany': 92,
  'Australia': 98,
  'Canada': 90,

  // Tier 3
  'Spain': 75,
  'Italy': 72,
  'South Korea': 85,
  'Japan': 82,

  // Tier 4
  'Mexico': 60,
  'Brazil': 55,
  'Poland': 68,
  'Argentina': 58,

  // Tier 5
  'India': 40,
  'Vietnam': 35,
  'Philippines': 38,
  'Indonesia': 36,

  // Tier 6
  'Pakistan': 28,
  'Bangladesh': 25,
  'Nigeria': 30,
};

export function getGeographyMultiplier(location: string): number {
  const index = MARKET_COMPENSATION_INDEX[location] || 100; // Default to Tier 2
  return index / 100;
}

// Test cases:
// getGeographyMultiplier('United States')  → 1.00
// getGeographyMultiplier('Switzerland')    → 1.20
// getGeographyMultiplier('India')          → 0.40
// getGeographyMultiplier('Unknown')        → 1.00 (default)
```

**Justification**:
- Not discriminatory (reflects market reality)
- Candidates can relocate to higher-tier regions (geographic arbitrage)
- Employers pay market rates regardless of location

---

### 3.6 M_industry (Industry Multiplier)

**Purpose**: High-turnover industries (retail, hospitality) generate more queries, increasing data value.

**Formula**:
```typescript
function getIndustryMultiplier(industry: string, turnoverRate: number): number {
  return 1 + (turnoverRate / 100);
}
```

**Industry Turnover Rates** (US Bureau of Labor Statistics + Glassdoor data):

| Industry | Turnover Rate | Multiplier | Rationale |
|----------|---------------|------------|-----------|
| **Retail** | 60% | 1.60 | High churn, frequent hiring |
| **Hospitality** | 73% | 1.73 | Highest turnover |
| **Call Centers** | 50% | 1.50 | Moderate-high churn |
| **Tech** | 25% | 1.25 | Above average |
| **Finance** | 20% | 1.20 | Stable with M&A activity |
| **Healthcare** | 18% | 1.18 | Stable, aging workforce |
| **Manufacturing** | 22% | 1.22 | Moderate |
| **Academia** | 12% | 1.12 | Very stable |
| **Government** | 8% | 1.08 | Lowest turnover |

**Implementation**:
```typescript
const INDUSTRY_TURNOVER_RATES: Record<string, number> = {
  'Retail': 60,
  'Hospitality': 73,
  'Call Center': 50,
  'Technology': 25,
  'Finance': 20,
  'Healthcare': 18,
  'Manufacturing': 22,
  'Academia': 12,
  'Government': 8,
  'Nonprofit': 15,
  'Construction': 28,
  'Real Estate': 35,
};

export function getIndustryMultiplier(industry: string): number {
  const turnoverRate = INDUSTRY_TURNOVER_RATES[industry] || 20; // Default 20%
  return 1 + (turnoverRate / 100);
}

// Test cases:
// getIndustryMultiplier('Hospitality')  → 1.73
// getIndustryMultiplier('Technology')   → 1.25
// getIndustryMultiplier('Government')   → 1.08
// getIndustryMultiplier('Unknown')      → 1.20 (default)
```

**Note**: Candidates can belong to multiple industries (e.g., "Fintech" = Finance + Tech). Use weighted average:

```typescript
function getCombinedIndustryMultiplier(industries: string[], weights: number[]): number {
  const multipliers = industries.map(ind => getIndustryMultiplier(ind));
  const weightedSum = multipliers.reduce((sum, m, i) => sum + m * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return weightedSum / totalWeight;
}

// Example:
// Candidate in Fintech (50% Finance, 50% Tech)
// (1.20 × 0.5 + 1.25 × 0.5) / 1 = 1.225
```

---

## 4. Implementation Architecture

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     HRKey Frontend                          │
│  (Next.js + React)                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ API Request: /api/pricing/:wallet
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Backend Pricing Service (Node.js)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  pricingEngine.ts                                    │   │
│  │  - calculateCandidatePrice()                         │   │
│  │  - getAllMultipliers()                               │   │
│  │  - applyBounds()                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Fetch candidate data
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  Supabase PostgreSQL                        │
│  - candidates (wallet, experience, location, industry)     │
│  - queries (query history for demand calculation)          │
│  - skills (skill rarity percentiles)                       │
│  - candidate_prices (cached prices, updated every 6h)      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Price calculation results
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Price Oracle Service (Node.js)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  priceOracle.ts                                      │   │
│  │  - generateMerkleTree()                              │   │
│  │  - publishRootOnChain()                              │   │
│  │  - generateProofForQuery()                           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Every 6 hours: publish Merkle root
                       ↓
┌─────────────────────────────────────────────────────────────┐
│           HRKPriceOracle.sol (Base L2)                      │
│  - priceRoot (bytes32): Merkle root of all prices           │
│  - lastUpdate (uint256): Timestamp of last update           │
│  - verifyPrice(address, uint256, proof): Validate price     │
│  - queryCandidate(address, uint256, proof): Execute query   │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Data Flow

**Step 1: Price Calculation (every 6 hours)**
```
Cron Job (0 */6 * * *)
  ↓
Fetch all candidates from Supabase
  ↓
For each candidate:
  - Calculate multipliers (seniority, demand, rarity, etc.)
  - Apply pricing formula
  - Bound to [5, 500] HRK
  ↓
Store results in candidate_prices table
  ↓
Generate Merkle tree of (wallet, price) pairs
  ↓
Publish Merkle root to HRKPriceOracle.sol
```

**Step 2: Query Execution (real-time)**
```
Employer clicks "Query Candidate" on frontend
  ↓
Frontend: GET /api/pricing/:wallet
  ↓
Backend: Fetch cached price from candidate_prices
  ↓
Backend: Generate Merkle proof for (wallet, price)
  ↓
Frontend: Display price to employer
  ↓
Employer confirms purchase (wallet signature)
  ↓
Smart Contract: HRKPriceOracle.queryCandidate(wallet, price, proof)
  ↓
Contract: Verify Merkle proof (ensure price is valid)
  ↓
Contract: Transfer HRK from employer
  ↓
Contract: Distribute revenue (40/40/20 split)
  ↓
Contract: Emit QueryExecuted event
  ↓
Backend webhook: Grant access to reference data
  ↓
Frontend: Display references to employer
```

---

## 5. Off-Chain Engine

### 5.1 Pricing Engine (TypeScript)

**File**: `/backend/pricing/pricingEngine.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Constants
export const P_BASE = 5; // HRK
export const P_MIN = 5;  // HRK
export const P_MAX = 500; // HRK

// Interfaces
export interface PricingFactors {
  yearsOfExperience: number;
  queriesLast30Days: number;
  skillPercentile: number;
  hrScore: number;
  location: string;
  industry: string;
}

export interface PricingResult {
  priceHRK: number;
  factors: {
    seniority: number;
    demand: number;
    rarity: number;
    hrScore: number;
    geography: number;
    industry: number;
  };
  breakdown: string; // Human-readable explanation
}

// Multiplier functions (as defined in section 3)
export function getSeniorityMultiplier(years: number): number {
  const cappedYears = Math.min(Math.max(0, years), 20);
  return 1 + (cappedYears / 20);
}

export function getDemandMultiplier(queries: number, avgQueries: number): number {
  const ratio = queries / Math.max(avgQueries, 1);
  return Math.min(1 + Math.log10(1 + ratio), 3.0);
}

export function getRarityMultiplier(percentile: number): number {
  return 1 + (1 - Math.max(0, Math.min(1, percentile)));
}

export function getHRScoreMultiplier(score: number): number {
  return 0.5 + (Math.max(0, Math.min(100, score)) / 100);
}

export function getGeographyMultiplier(location: string): number {
  const MARKET_INDEX: Record<string, number> = {
    'Switzerland': 120,
    'United States': 100,
    'India': 40,
    // ... (full list from section 3.5)
  };
  return (MARKET_INDEX[location] || 100) / 100;
}

export function getIndustryMultiplier(industry: string): number {
  const TURNOVER_RATES: Record<string, number> = {
    'Hospitality': 73,
    'Technology': 25,
    'Government': 8,
    // ... (full list from section 3.6)
  };
  return 1 + ((TURNOVER_RATES[industry] || 20) / 100);
}

// Main pricing function
export async function calculateCandidatePrice(
  candidateWallet: string
): Promise<PricingResult> {
  // 1. Fetch candidate data
  const { data: candidate, error } = await supabase
    .from('candidates')
    .select(`
      years_of_experience,
      location,
      industry,
      hr_score,
      skills (percentile)
    `)
    .eq('wallet_address', candidateWallet)
    .single();

  if (error || !candidate) {
    throw new Error(`Candidate not found: ${candidateWallet}`);
  }

  // 2. Fetch query count (last 30 days)
  const { count: queriesLast30Days } = await supabase
    .from('queries')
    .select('*', { count: 'exact', head: true })
    .eq('candidate_wallet', candidateWallet)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // 3. Fetch global average queries
  const { data: avgData } = await supabase
    .rpc('get_average_queries_per_candidate_30d');
  const globalAvgQueries = avgData?.[0]?.avg || 5;

  // 4. Calculate multipliers
  const factors = {
    seniority: getSeniorityMultiplier(candidate.years_of_experience),
    demand: getDemandMultiplier(queriesLast30Days || 0, globalAvgQueries),
    rarity: getRarityMultiplier(candidate.skills?.[0]?.percentile || 0.5),
    hrScore: getHRScoreMultiplier(candidate.hr_score || 50),
    geography: getGeographyMultiplier(candidate.location),
    industry: getIndustryMultiplier(candidate.industry),
  };

  // 5. Apply formula
  const rawPrice = P_BASE *
    factors.seniority *
    factors.demand *
    factors.rarity *
    factors.hrScore *
    factors.geography *
    factors.industry;

  // 6. Apply bounds
  const finalPrice = Math.min(Math.max(rawPrice, P_MIN), P_MAX);

  // 7. Generate breakdown
  const breakdown = `
    Base Price: ${P_BASE} HRK
    × Seniority (${candidate.years_of_experience} YoE): ${factors.seniority.toFixed(2)}x
    × Demand (${queriesLast30Days} queries): ${factors.demand.toFixed(2)}x
    × Skill Rarity: ${factors.rarity.toFixed(2)}x
    × HRScore (${candidate.hr_score}): ${factors.hrScore.toFixed(2)}x
    × Geography (${candidate.location}): ${factors.geography.toFixed(2)}x
    × Industry (${candidate.industry}): ${factors.industry.toFixed(2)}x
    = ${finalPrice.toFixed(2)} HRK
  `.trim();

  return {
    priceHRK: finalPrice,
    factors,
    breakdown,
  };
}

// Batch calculation for all candidates (for Merkle tree generation)
export async function calculateAllPrices(): Promise<Map<string, number>> {
  const { data: candidates } = await supabase
    .from('candidates')
    .select('wallet_address');

  if (!candidates) return new Map();

  const prices = new Map<string, number>();

  for (const { wallet_address } of candidates) {
    try {
      const result = await calculateCandidatePrice(wallet_address);
      prices.set(wallet_address, result.priceHRK);
    } catch (error) {
      console.error(`Failed to calculate price for ${wallet_address}:`, error);
      prices.set(wallet_address, P_BASE); // Fallback to base price
    }
  }

  return prices;
}
```

### 5.2 API Endpoint

**File**: `/backend/api/pricing/[wallet].ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateCandidatePrice, PricingResult } from '../../pricing/pricingEngine';
import { generateMerkleProof } from '../../pricing/priceOracle';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PricingResult | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.query;

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // 1. Calculate price
    const result = await calculateCandidatePrice(wallet);

    // 2. Generate Merkle proof
    const proof = await generateMerkleProof(wallet, result.priceHRK);

    // 3. Return result with proof
    return res.status(200).json({
      ...result,
      merkleProof: proof, // For on-chain verification
    });
  } catch (error: any) {
    console.error('Pricing API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

---

## 6. On-Chain Oracle

### 6.1 Smart Contract

**File**: `/contracts/HRKPriceOracle.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract HRKPriceOracle is AccessControl, ReentrancyGuard {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // Current Merkle root of all (candidate, price) pairs
    bytes32 public priceRoot;
    uint256 public lastUpdate;

    // Price bounds (in HRK wei, 18 decimals)
    uint256 public constant P_MIN = 5 * 10**18;
    uint256 public constant P_MAX = 500 * 10**18;

    // Update frequency (6 hours)
    uint256 public constant UPDATE_INTERVAL = 6 hours;

    event PriceRootUpdated(bytes32 indexed newRoot, uint256 timestamp);
    event PriceVerified(address indexed candidate, uint256 priceHRK);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    /**
     * @notice Update the Merkle root of all candidate prices
     * @dev Only callable by ORACLE_ROLE (backend service)
     * @param newRoot The new Merkle root
     */
    function updatePriceRoot(bytes32 newRoot) external onlyRole(ORACLE_ROLE) {
        require(
            block.timestamp >= lastUpdate + UPDATE_INTERVAL,
            "Update too frequent"
        );
        require(newRoot != bytes32(0), "Invalid root");

        priceRoot = newRoot;
        lastUpdate = block.timestamp;

        emit PriceRootUpdated(newRoot, block.timestamp);
    }

    /**
     * @notice Verify a candidate's price using a Merkle proof
     * @param candidate The candidate's wallet address
     * @param priceHRK The claimed price in HRK (18 decimals)
     * @param merkleProof The Merkle proof for this (candidate, price) pair
     * @return True if the price is valid
     */
    function verifyPrice(
        address candidate,
        uint256 priceHRK,
        bytes32[] calldata merkleProof
    ) public view returns (bool) {
        require(priceHRK >= P_MIN && priceHRK <= P_MAX, "Price out of bounds");

        bytes32 leaf = keccak256(abi.encodePacked(candidate, priceHRK));
        return MerkleProof.verify(merkleProof, priceRoot, leaf);
    }

    /**
     * @notice Get the current price root and last update time
     * @return root The current Merkle root
     * @return timestamp The last update timestamp
     */
    function getPriceInfo() external view returns (bytes32 root, uint256 timestamp) {
        return (priceRoot, lastUpdate);
    }
}
```

---

## 7. Price Update Flow

### 7.1 Cron Job (Every 6 Hours)

**File**: `/backend/pricing/updatePricesCron.ts`

```typescript
import { calculateAllPrices } from './pricingEngine';
import { generateMerkleTree, publishRootOnChain } from './priceOracle';

export async function updatePricesCron() {
  console.log('[Cron] Starting price update job...');

  try {
    // 1. Calculate prices for all candidates
    console.log('[Cron] Calculating prices...');
    const prices = await calculateAllPrices();
    console.log(`[Cron] Calculated ${prices.size} prices`);

    // 2. Store in database (for API queries)
    console.log('[Cron] Storing prices in database...');
    await storePricesInDB(prices);

    // 3. Generate Merkle tree
    console.log('[Cron] Generating Merkle tree...');
    const tree = await generateMerkleTree(prices);

    // 4. Publish root on-chain
    console.log('[Cron] Publishing Merkle root on-chain...');
    const txHash = await publishRootOnChain(tree.getRoot());
    console.log(`[Cron] Published root in tx: ${txHash}`);

    console.log('[Cron] Price update complete!');
  } catch (error) {
    console.error('[Cron] Price update failed:', error);
    // Alert ops team (Sentry, PagerDuty, etc.)
    throw error;
  }
}

async function storePricesInDB(prices: Map<string, number>) {
  const records = Array.from(prices.entries()).map(([wallet, price]) => ({
    candidate_wallet: wallet,
    price_hrk: price,
    updated_at: new Date().toISOString(),
  }));

  // Upsert all prices in a single transaction
  await supabase.from('candidate_prices').upsert(records);
}

// Schedule cron job
if (require.main === module) {
  const cron = require('node-cron');
  cron.schedule('0 */6 * * *', updatePricesCron); // Every 6 hours
  console.log('[Cron] Price update job scheduled (every 6 hours)');
}
```

---

## 8. Security & Validation

### 8.1 Attack Vectors

**Attack 1: Price Manipulation (Fake Queries)**

**Scenario**: Attacker creates 1,000 fake queries for their own profile to inflate demand multiplier.

**Mitigation**:
```typescript
// Require employer verification (KYB)
// Detect wallet clustering (same funding source)
// Apply query cooldowns (max 1 query per candidate per 30 days per employer)

async function isValidQuery(employerWallet: string, candidateWallet: string): Promise<boolean> {
  // 1. Check if employer is verified
  const { data: employer } = await supabase
    .from('companies')
    .select('verified')
    .eq('signer_wallet', employerWallet)
    .single();

  if (!employer?.verified) {
    throw new Error('Employer not verified');
  }

  // 2. Check cooldown
  const { data: recentQuery } = await supabase
    .from('queries')
    .select('created_at')
    .eq('employer_wallet', employerWallet)
    .eq('candidate_wallet', candidateWallet)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .single();

  if (recentQuery) {
    throw new Error('Query cooldown active (30 days)');
  }

  return true;
}
```

**Attack 2: Oracle Manipulation (Fake Merkle Proof)**

**Scenario**: Attacker submits fake proof claiming price is 1 HRK when actual price is 100 HRK.

**Mitigation**:
- On-chain Merkle proof verification (trustless)
- Oracle multi-sig (3/5 signatures required for root updates)
- Price bounds (5-500 HRK enforced in contract)

**Attack 3: Frontrunning (MEV)**

**Scenario**: Searcher sees high-value query in mempool, frontruns to query first.

**Mitigation**:
- Use Flashbots RPC (private transactions)
- Implement commit-reveal scheme
- Add randomness to query order

---

## 9. Testing & Scenarios

### 9.1 Unit Tests

**File**: `/backend/pricing/__tests__/pricingEngine.test.ts`

```typescript
import {
  getSeniorityMultiplier,
  getDemandMultiplier,
  getRarityMultiplier,
  getHRScoreMultiplier,
  calculateCandidatePrice,
} from '../pricingEngine';

describe('Seniority Multiplier', () => {
  test('0 years → 1.00x', () => {
    expect(getSeniorityMultiplier(0)).toBe(1.00);
  });

  test('10 years → 1.50x', () => {
    expect(getSeniorityMultiplier(10)).toBe(1.50);
  });

  test('25 years → 2.00x (capped)', () => {
    expect(getSeniorityMultiplier(25)).toBe(2.00);
  });
});

describe('Demand Multiplier', () => {
  test('0 queries → 1.00x', () => {
    expect(getDemandMultiplier(0, 5)).toBeCloseTo(1.00, 2);
  });

  test('5 queries (avg) → 1.30x', () => {
    expect(getDemandMultiplier(5, 5)).toBeCloseTo(1.30, 2);
  });

  test('50 queries → 2.04x', () => {
    expect(getDemandMultiplier(50, 5)).toBeCloseTo(2.04, 2);
  });
});

describe('Full Price Calculation', () => {
  test('Junior developer (base case)', async () => {
    const result = await calculateCandidatePrice('0xJuniorDev');
    expect(result.priceHRK).toBeGreaterThanOrEqual(5);
    expect(result.priceHRK).toBeLessThanOrEqual(20);
  });

  test('Senior engineer (high demand)', async () => {
    const result = await calculateCandidatePrice('0xSeniorEng');
    expect(result.priceHRK).toBeGreaterThanOrEqual(50);
    expect(result.priceHRK).toBeLessThanOrEqual(200);
  });
});
```

### 9.2 Integration Tests

**File**: `/backend/pricing/__tests__/priceOracle.integration.test.ts`

```typescript
import { ethers } from 'hardhat';
import { calculateAllPrices } from '../pricingEngine';
import { generateMerkleTree, generateMerkleProof } from '../priceOracle';

describe('Price Oracle Integration', () => {
  let oracle: any;
  let prices: Map<string, number>;
  let tree: any;

  beforeAll(async () => {
    // Deploy contract
    const OracleFactory = await ethers.getContractFactory('HRKPriceOracle');
    oracle = await OracleFactory.deploy();

    // Calculate prices
    prices = await calculateAllPrices();
    tree = await generateMerkleTree(prices);

    // Publish root
    await oracle.updatePriceRoot(tree.getRoot());
  });

  test('Verify valid price with proof', async () => {
    const candidate = Array.from(prices.keys())[0];
    const price = prices.get(candidate)!;
    const proof = generateMerkleProof(tree, candidate, price);

    const isValid = await oracle.verifyPrice(candidate, price, proof);
    expect(isValid).toBe(true);
  });

  test('Reject invalid price', async () => {
    const candidate = Array.from(prices.keys())[0];
    const fakePrice = ethers.utils.parseEther('1'); // 1 HRK (fake)
    const proof = generateMerkleProof(tree, candidate, fakePrice);

    const isValid = await oracle.verifyPrice(candidate, fakePrice, proof);
    expect(isValid).toBe(false);
  });

  test('Reject price out of bounds', async () => {
    const candidate = Array.from(prices.keys())[0];
    const oobPrice = ethers.utils.parseEther('1000'); // > 500 HRK max
    const proof = generateMerkleProof(tree, candidate, oobPrice);

    await expect(
      oracle.verifyPrice(candidate, oobPrice, proof)
    ).to.be.revertedWith('Price out of bounds');
  });
});
```

---

## 10. Monitoring & Analytics

### 10.1 Metrics Dashboard

**Track in real-time:**

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Average Price** | 20-30 HRK | <10 or >50 HRK |
| **Price Volatility** | <10% daily change | >20% change |
| **Query Volume** | 1K/day (Year 1) | <100/day |
| **Oracle Uptime** | 99.9% | <99% |
| **Price Update Latency** | <5 min | >15 min |

### 10.2 Analytics Queries

**SQL: Price Distribution**
```sql
SELECT
  CASE
    WHEN price_hrk < 10 THEN '5-10 HRK'
    WHEN price_hrk < 20 THEN '10-20 HRK'
    WHEN price_hrk < 50 THEN '20-50 HRK'
    WHEN price_hrk < 100 THEN '50-100 HRK'
    ELSE '100+ HRK'
  END AS price_bucket,
  COUNT(*) AS candidate_count,
  AVG(price_hrk) AS avg_price
FROM candidate_prices
GROUP BY price_bucket
ORDER BY avg_price;
```

**SQL: Top 10 Most Expensive Profiles**
```sql
SELECT
  c.wallet_address,
  c.years_of_experience,
  c.location,
  c.industry,
  cp.price_hrk,
  COUNT(q.id) AS queries_last_30d
FROM candidates c
JOIN candidate_prices cp ON c.wallet_address = cp.candidate_wallet
LEFT JOIN queries q ON c.wallet_address = q.candidate_wallet
  AND q.created_at > NOW() - INTERVAL '30 days'
GROUP BY c.wallet_address, cp.price_hrk
ORDER BY cp.price_hrk DESC
LIMIT 10;
```

---

## 11. Conclusion

The HRKey Dynamic Pricing Mechanism creates a **market-driven economy** for professional data where:

1. **Prices reflect value**: High-demand, senior, rare-skill candidates command premiums
2. **Transparency**: Candidates understand exactly why their price is X HRK
3. **Anti-gaming**: Manipulation is economically irrational
4. **Scalability**: Handles 10M+ candidates with sub-second queries
5. **On-chain verification**: Merkle proofs ensure trustless price enforcement

**Next Steps:**

1. Implement TypeScript pricing engine
2. Deploy HRKPriceOracle.sol to Base Sepolia testnet
3. Run integration tests with 1,000 synthetic candidates
4. Launch mainnet with 10,000 real candidates (Q2 2025)

---

**Version**: 1.0 | **Last Updated**: November 26, 2025
**Maintainer**: HRKey Protocol Team
**Contact**: engineering@hrkey.io
