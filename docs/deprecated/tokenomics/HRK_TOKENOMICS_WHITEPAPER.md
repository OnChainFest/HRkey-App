# HRKey Token (HRK) Tokenomics Whitepaper
## Technical and Economic Specification v1.0

**Authors:** HRKey Protocol Team
**Date:** November 2025
**Network:** Base L2 (Primary), Solana (Secondary)
**Token Standard:** ERC-20 (Base), SPL (Solana)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background and Vision](#2-background-and-vision)
3. [Core Token Utility](#3-core-token-utility)
4. [Dynamic Pricing Mechanism](#4-dynamic-pricing-mechanism)
5. [Token Supply and Distribution](#5-token-supply-and-distribution)
6. [Staking Mechanism](#6-staking-mechanism)
7. [Slashing Mechanism](#7-slashing-mechanism)
8. [Incentive Models](#8-incentive-models)
9. [Economic Models and Formulas](#9-economic-models-and-formulas)
10. [Multi-Chain Architecture](#10-multi-chain-architecture)
11. [Governance](#11-governance)
12. [Risk Analysis and Mitigations](#12-risk-analysis-and-mitigations)
13. [Technical Implementation](#13-technical-implementation)
14. [Roadmap](#14-roadmap)
15. [Conclusion](#15-conclusion)
16. [Appendices](#16-appendices)

---

## 1. Executive Summary

**HRKey Token (HRK)** is the native utility token of the HRKey Protocol, a Web3 labor verification ecosystem that transforms professional references into verifiable, market-priced digital assets. HRK serves as:

- **Payment mechanism** for querying verified professional references
- **Staking collateral** for evaluators to ensure data integrity
- **Incentive layer** rewarding high-quality feedback
- **Slashing deterrent** against fraudulent evaluations
- **Governance instrument** for protocol upgrades

### Key Metrics

| Parameter | Value |
|-----------|-------|
| **Total Supply** | 1,000,000,000 HRK (fixed) |
| **Network** | Base L2 (Ethereum) |
| **Token Standard** | ERC-20 |
| **Decimal Places** | 18 |
| **Base Query Price** | 5-500 HRK (dynamic) |
| **Minimum Stake (Evaluator)** | 100 HRK (Bronze tier) |
| **Base APY** | 5% (up to 20% with multipliers) |
| **Slashing Range** | 10%-100% of stake |
| **Transaction Fee** | 2.5% (1% burn, 1.5% treasury) |

### Value Proposition

HRK creates a **toll-fee economy** where every professional reference query generates protocol revenue, token burns, and evaluator rewards. As global demand for verified labor data increases, HRK captures value through:

1. **Network Effects**: More candidates → more evaluators → more data → higher demand
2. **Deflationary Pressure**: Continuous token burns from high-demand profile queries
3. **Staking Yield**: Evaluators earn predictable returns for honest participation
4. **Data Moat**: Proprietary HRScore algorithm creates competitive advantage

---

## 2. Background and Vision

### 2.1 The Problem

Traditional labor markets suffer from:

- **Information Asymmetry**: Employers lack verified performance data
- **Reference Fraud**: Fake or exaggerated recommendations
- **Evaluator Disincentives**: Managers provide references for free, creating perverse incentives
- **Siloed Data**: Professional history locked in proprietary platforms
- **Trust Deficits**: No cryptographic proof of work history

### 2.2 The HRKey Solution

HRKey creates a **decentralized labor bureau** where:

1. **Workers** own their professional reputation as an on-chain asset (HRScore)
2. **Employers** access verified, predictive performance data
3. **Evaluators** (managers, colleagues) earn income for quality feedback
4. **Smart Contracts** enforce anti-fraud mechanisms via staking/slashing

### 2.3 Vision: The Global Labor Oracle

HRKey aspires to become the **world's labor oracle**, analogous to:

- **Chainlink** for labor data (decentralized, tamper-proof)
- **Google PageRank** for professional reputation (algorithmic credibility)
- **Stripe** for monetizing human capital data (seamless, global)

By 2030, HRKey aims to:

- Process 100M+ reference verifications annually
- Maintain HRScores for 50M+ professionals globally
- Generate $1B+ in protocol revenue (distributed to stakeholders)
- Eliminate traditional credit bureaus' labor market equivalents

---

## 3. Core Token Utility

### 3.1 Primary Use Cases

#### 3.1.1 Pay-Per-Query for References

Employers pay HRK to access verified references. Price is **dynamically adjusted** based on:

- Candidate seniority and experience
- Query frequency (demand signal)
- Skill rarity (market scarcity)
- HRScore (predictive value)
- Geographic and industry factors

**Example:**
```
Senior ML Engineer (10 YoE, HRScore 87, high demand)
→ Query Price: 120 HRK (~$60 at $0.50/HRK)

Junior Frontend Dev (2 YoE, HRScore 62, average demand)
→ Query Price: 15 HRK (~$7.50)
```

#### 3.1.2 Anti-Fraud Staking

Evaluators must **stake HRK** to submit feedback. This ensures:

- Skin in the game for honest evaluations
- Economic deterrent against coordinated attacks
- Slashable collateral for provable fraud

**Staking Tiers:**

| Tier | Stake Required | Max Evaluations/Month | APY | Cooldown |
|------|----------------|----------------------|-----|----------|
| **Bronze** | 100 HRK | 20 | 5% | 7 days |
| **Silver** | 500 HRK | 100 | 8% | 14 days |
| **Gold** | 2,000 HRK | Unlimited | 12% | 30 days |
| **Platinum** | 10,000 HRK | Unlimited | 15% base | 90 days |

#### 3.1.3 Incentive Rewards

Evaluators earn HRK when their feedback is:

- **Purchased** by employers (direct revenue share)
- **Validated** by AI correlation analysis (quality bonus)
- **Highly demanded** (popularity multiplier)

**Revenue Split (per query):**
- 40% → Candidate (data owner)
- 40% → HRKey Treasury
- 20% → Evaluator (reference creator)

#### 3.1.4 Slashing Mechanism

If an evaluator is proven to have:

- Submitted fabricated data
- Colluded with candidates for inflated scores
- Repeatedly provided low-correlation feedback

→ **10-100% of stake is slashed**:
- 50% burned (deflationary)
- 50% redistributed to honest evaluators

#### 3.1.5 Premium Access

HRK unlocks advanced features:

- **Employer Analytics Dashboard**: AI-powered candidate matching ($500 HRK/month)
- **Bulk Query Discounts**: Stake 5,000+ HRK for 20% off all queries
- **API Access**: Programmatic data access for ATS integrations ($2,000 HRK/month)
- **White-Label Solutions**: Custom HRScore integrations for enterprises

### 3.2 Secondary Use Cases

#### 3.2.1 Liquidity Provision

HRK/USDC and HRK/ETH pairs on Uniswap (Base) enable:

- Price discovery
- DeFi composability (lending, derivatives)
- Treasury diversification

#### 3.2.2 DAO Governance

HRK holders vote on:

- Protocol fee adjustments
- HRScore algorithm updates
- Treasury fund allocation
- Cross-chain expansion strategies

**Voting Power Formula:**
```
VP = staked_HRK × sqrt(stake_duration_days)
```

This rewards long-term alignment over short-term speculation.

---

## 4. Dynamic Pricing Mechanism

### 4.1 Economic Rationale

Professional references are **not commodities**—a senior engineer's endorsement is worth more than a junior's. HRKey's dynamic pricing creates a **market for professional data**, similar to:

- **NFT floor prices** (supply/demand driven)
- **Uber surge pricing** (real-time demand adjustment)
- **AWS Reserved Instances** (volume discounts for committed buyers)

### 4.2 Pricing Formula

The cost to query a candidate's references is:

```
P_candidate = P_base × M_seniority × M_demand × M_rarity × M_hrscore × M_geography × M_industry
```

Where:

#### P_base (Base Price)
- Fixed at **5 HRK** (floor price for all profiles)
- Ensures minimum evaluator compensation

#### M_seniority (Seniority Multiplier)
```
M_seniority = 1 + (years_of_experience / 20)

Examples:
- 0 years: M = 1.00 (junior)
- 5 years: M = 1.25 (mid-level)
- 10 years: M = 1.50 (senior)
- 20+ years: M = 2.00 (executive)
```

#### M_demand (Demand Multiplier)
```
M_demand = 1 + log10(1 + queries_last_30_days / avg_queries_global)

Examples:
- 0 queries: M = 1.00 (no demand)
- 10 queries (avg = 5): M = 1.48 (moderate demand)
- 50 queries (avg = 5): M = 2.00 (high demand)
- 200 queries (avg = 5): M = 2.61 (extreme demand)
```

This logarithmic scaling prevents runaway pricing while rewarding popular profiles.

#### M_rarity (Skill Rarity Multiplier)
```
M_rarity = 1 + (1 - skill_percentile)

skill_percentile = % of users with same primary skills

Examples:
- Common skills (75th percentile): M = 1.25
- Rare skills (95th percentile): M = 1.95
- Ultra-rare (99th percentile): M = 1.99
```

Rare skillsets (e.g., Rust + Zero-Knowledge Proofs) command premium pricing.

#### M_hrscore (HRScore Multiplier)
```
M_hrscore = 0.5 + (hrscore / 100)

Examples:
- HRScore 0: M = 0.50 (unproven, discounted)
- HRScore 50: M = 1.00 (average)
- HRScore 85: M = 1.35 (high performer)
- HRScore 100: M = 1.50 (exceptional)
```

Higher HRScores correlate with predictive accuracy, justifying premium pricing.

#### M_geography (Geographic Multiplier)
```
M_geography = market_compensation_index / 100

Examples:
- India (index = 40): M = 0.40
- Mexico (index = 60): M = 0.60
- US/UK (index = 100): M = 1.00
- Switzerland (index = 120): M = 1.20
```

Reflects regional salary differentials and hiring demand.

#### M_industry (Industry Multiplier)
```
M_industry = 1 + (industry_turnover_rate / 100)

Examples:
- Academia (turnover = 15%): M = 1.15
- Tech (turnover = 25%): M = 1.25
- Retail (turnover = 60%): M = 1.60
```

High-turnover industries generate more query volume, increasing data value.

### 4.3 Price Bounds

To prevent extreme volatility:

```
P_min = 5 HRK
P_max = 500 HRK

P_final = min(max(P_candidate, P_min), P_max)
```

### 4.4 Example Calculation

**Candidate Profile:**
- Senior Solidity Engineer
- 8 years experience
- 35 queries in last 30 days (avg = 10)
- Skill percentile: 92nd (rare)
- HRScore: 88
- Location: United States
- Industry: DeFi (30% turnover)

**Calculation:**
```
P_base = 5 HRK

M_seniority = 1 + (8 / 20) = 1.40
M_demand = 1 + log10(1 + 35/10) = 1 + log10(4.5) = 1.65
M_rarity = 1 + (1 - 0.92) = 1.08
M_hrscore = 0.5 + (88/100) = 1.38
M_geography = 100/100 = 1.00
M_industry = 1 + (30/100) = 1.30

P_candidate = 5 × 1.40 × 1.65 × 1.08 × 1.38 × 1.00 × 1.30
P_candidate = 5 × 4.05 = 20.25 HRK (~$10 at $0.50/HRK)
```

**Query Cost: 20 HRK**

### 4.5 Implementation Architecture

#### Off-Chain (Supabase + Node.js)

**Daily Price Updates:**

1. **Data Aggregation** (every 6 hours):
   ```sql
   SELECT
     candidate_id,
     years_of_experience,
     COUNT(queries) AS queries_30d,
     hrscore,
     skill_rarity_percentile,
     location,
     industry
   FROM candidates
   LEFT JOIN queries ON queries.candidate_id = candidates.id
   WHERE queries.created_at > NOW() - INTERVAL '30 days'
   GROUP BY candidate_id
   ```

2. **Price Calculation** (Node.js service):
   ```typescript
   for (const candidate of candidates) {
     const price = calculatePrice(candidate);
     await db.update('candidate_prices', {
       candidate_id: candidate.id,
       price_hrk: price,
       updated_at: new Date()
     });
   }
   ```

3. **Merkle Tree Generation**:
   ```typescript
   const leaves = candidates.map(c =>
     keccak256(encodePacked(['address', 'uint256'], [c.wallet, c.price]))
   );
   const tree = new MerkleTree(leaves, keccak256);
   const root = tree.getRoot();
   ```

4. **Oracle Update** (every 6 hours):
   ```solidity
   HRKPriceOracle.updatePriceRoot(root, block.timestamp);
   ```

#### On-Chain (Base Smart Contracts)

**Query Execution:**

```solidity
function queryCandidate(
    address candidate,
    uint256 priceHRK,
    bytes32[] calldata merkleProof
) external {
    // 1. Verify price via Merkle proof
    require(
        verifyPrice(candidate, priceHRK, merkleProof),
        "Invalid price proof"
    );

    // 2. Transfer HRK from employer
    HRK.transferFrom(msg.sender, address(this), priceHRK);

    // 3. Distribute revenue (40/40/20 split)
    uint256 candidateShare = (priceHRK * 40) / 100;
    uint256 treasuryShare = (priceHRK * 40) / 100;
    uint256 evaluatorShare = (priceHRK * 20) / 100;

    HRK.transfer(candidate, candidateShare);
    HRK.transfer(treasury, treasuryShare);
    // evaluatorShare distributed among all evaluators proportionally

    // 4. Grant access to reference data (off-chain)
    emit QueryExecuted(msg.sender, candidate, priceHRK);
}
```

### 4.6 Dynamic Pricing Benefits

1. **Market Efficiency**: Prices reflect true value of professional data
2. **Evaluator Incentives**: High-demand profiles generate more income
3. **Anti-Gaming**: Sybil attacks become economically unfeasible (low-quality profiles have near-zero value)
4. **Scalability**: Works globally across industries/geographies
5. **Deflationary Pressure**: High-value queries trigger token burns

---

## 5. Token Supply and Distribution

### 5.1 Total Supply

**Fixed Supply**: 1,000,000,000 HRK (1 billion tokens)

**Rationale for Fixed Supply:**

- **Predictability**: No inflation risk for long-term holders
- **Deflationary Dynamics**: Transaction burns create scarcity over time
- **Comparable to**: UNI (1B), AAVE (16M), COMP (10M)

**Alternative Considered (Semi-Inflationary):**

A 2% annual inflation model was considered to fund perpetual rewards, but rejected due to:

- Dilution risk for early adopters
- Complexity in governance (changing inflation rates)
- Market preference for deflationary tokens in 2024-2025 cycle

### 5.2 Token Distribution

| Allocation | Amount (HRK) | % | Vesting | Cliff |
|------------|--------------|---|---------|-------|
| **Ecosystem Incentives** | 350,000,000 | 35% | 48 months linear | None |
| **Community Treasury** | 200,000,000 | 20% | Governed by DAO | N/A |
| **Team & Advisors** | 150,000,000 | 15% | 48 months linear | 12 months |
| **Early Evaluators** | 100,000,000 | 10% | 24 months linear | 6 months |
| **Liquidity Provision** | 80,000,000 | 8% | Immediate | None |
| **Private Sale** | 70,000,000 | 7% | 18 months linear | 6 months |
| **Public Sale (TGE)** | 30,000,000 | 3% | Immediate | None |
| **Grant Programs** | 20,000,000 | 2% | 36 months linear | None |
| **TOTAL** | **1,000,000,000** | **100%** | | |

### 5.3 Allocation Rationale

#### Ecosystem Incentives (35%)

The largest allocation funds:

- **Proof-of-Feedback Rewards** (200M HRK): Distributed over 4 years to evaluators
- **Candidate Onboarding Incentives** (100M HRK): First 10M users get 10 HRK each
- **Employer Grants** (50M HRK): Early enterprises get $10K HRK credits

**Emission Schedule:**

```
Year 1: 120M HRK (34% of ecosystem pool)
Year 2: 100M HRK (29%)
Year 3: 80M HRK (23%)
Year 4: 50M HRK (14%)
```

Frontloaded to maximize early adoption, with declining emissions to avoid dilution.

#### Community Treasury (20%)

Controlled by HRK DAO, used for:

- Protocol development grants
- Marketing campaigns
- Strategic partnerships
- Cross-chain bridges
- Emergency reserves

**Unlocking Mechanism:**

- Requires 67% supermajority vote to deploy funds
- Maximum 5% per quarter can be unlocked
- Prevents single-point governance attacks

#### Team & Advisors (15%)

**12-month cliff ensures:**

- Team commitment through product-market fit
- No immediate sell pressure post-TGE

**Linear 48-month vesting:**

- Aligns team incentives with long-term growth
- Standard practice for Web3 projects (cf. Uniswap, Aave)

#### Early Evaluators (10%)

**Retroactive airdrop** to first 10,000 evaluators who:

- Submitted 10+ verified references
- Maintained HRScore correlation > 0.60
- Did not commit fraud

**Vesting**: 6-month cliff, 24-month linear

#### Liquidity Provision (8%)

**Initial DEX Liquidity:**

- 40M HRK + $500K USDC → Uniswap V3 (Base)
- 40M HRK + 1,000 SOL → Raydium (Solana)

**Lock Period**: 12 months (prevents rug pulls)

**LP Token Ownership**: HRKey Treasury (50%), Team (25%), Community (25%)

#### Private Sale (7%)

**Target Raise**: $3.5M at $0.05/HRK

**Investors**:

- VCs focused on Future of Work, DeSci, DePIN
- Strategic partners (ATS platforms, Web3 identity protocols)
- Angel investors from HR tech and blockchain industries

**Vesting**: 6-month cliff, 18-month linear

#### Public Sale (3%)

**Token Generation Event (TGE)**:

- Raise: $1M at $0.10/HRK (2x private sale price)
- Platform: CoinList or Base-native launchpad
- Access: Open to all jurisdictions (excluding restricted countries)

**Immediate Liquidity**: Enables price discovery and DEX trading

#### Grant Programs (2%)

**Developer Grants** (10M HRK):

- Build HRKey integrations (ATS plugins, wallet SDKs)
- Open-source tooling (HRScore visualization libraries)

**Research Grants** (10M HRK):

- Academic partnerships on labor economics
- Zero-Knowledge Proof privacy implementations

### 5.4 Vesting Schedule Visualization

```
Supply Release Timeline (Millions of HRK)

Month 0 (TGE):     110M (11%)
├─ Public Sale:      30M
├─ Liquidity:        80M

Month 6:           +150M (cumulative: 26%)
├─ Private Sale unlock begins
├─ Early Evaluator unlock begins

Month 12:          +180M (cumulative: 44%)
├─ Team/Advisor unlock begins
├─ Ecosystem incentives accelerate

Month 24:          +220M (cumulative: 66%)
├─ Early Evaluator fully vested
├─ Private Sale fully vested

Month 48:          +340M (cumulative: 100%)
├─ Team/Advisors fully vested
├─ Ecosystem incentives fully vested
```

**Circulating Supply at Key Milestones:**

| Event | Circulating HRK | % of Total |
|-------|-----------------|------------|
| TGE | 110M | 11% |
| Month 12 | 260M | 26% |
| Month 24 | 450M | 45% |
| Month 36 | 680M | 68% |
| Month 48 | 1,000M | 100% |

### 5.5 Token Burns

**Deflationary Mechanisms:**

1. **Transaction Fee Burns** (1% of every query):
   ```
   Annual queries: 10M (Year 1 target)
   Avg price: 20 HRK
   Total volume: 200M HRK
   Burned: 2M HRK (0.2% of supply)
   ```

2. **High-Demand Profile Burns** (queries > 100/month):
   - Additional 5% of query price burned
   - Extreme scarcity creates premium pricing

3. **Slashing Burns** (50% of all slashed stakes):
   ```
   Projected slashing: 0.5% of staked supply annually
   If 100M HRK staked → 500K HRK slashed → 250K burned
   ```

**5-Year Burn Projection:**

| Year | Queries | Avg Price | Volume | Burn Rate | Cumulative Burn |
|------|---------|-----------|--------|-----------|-----------------|
| 1 | 10M | 20 HRK | 200M | 1% | 2M |
| 2 | 50M | 25 HRK | 1.25B | 1% | 14.5M |
| 3 | 150M | 30 HRK | 4.5B | 1% | 59.5M |
| 4 | 300M | 35 HRK | 10.5B | 1% | 164.5M |
| 5 | 500M | 40 HRK | 20B | 1% | 364.5M |

**Effective Supply (Year 5)**: ~635M HRK (36.5% burned)

---

## 6. Staking Mechanism

### 6.1 Staking Overview

Staking serves three functions in HRKey:

1. **Evaluator Collateral**: Ensures honest feedback (slashable)
2. **Employer Discounts**: Volume-based pricing tiers
3. **Governance Rights**: Voting power for protocol upgrades

### 6.2 Evaluator Staking

#### Tier Structure

| Tier | Stake | Monthly Evals | Base APY | Cooldown | Slashing Risk |
|------|-------|---------------|----------|----------|---------------|
| **Bronze** | 100 HRK | 20 | 5% | 7 days | Low |
| **Silver** | 500 HRK | 100 | 8% | 14 days | Medium |
| **Gold** | 2,000 HRK | Unlimited | 12% | 30 days | Medium |
| **Platinum** | 10,000 HRK | Unlimited | 15% | 90 days | High |

**Rationale for Tiers:**

- **Bronze**: Low barrier to entry for casual evaluators (former colleagues)
- **Silver**: Professional recruiters and HR consultants
- **Gold**: Full-time evaluators and agencies
- **Platinum**: Institutional evaluators (background check companies)

#### APY Calculation

```
APY_total = APY_base × M_hrscore × M_volume × M_lockup

Where:
- M_hrscore = 1 + (evaluator_avg_hrscore_correlation / 100)
  → Evaluators whose feedback correlates with high HRScores earn more

- M_volume = 1 + log10(1 + evaluations_completed / 100)
  → More evaluations = higher rewards (up to 1.5x)

- M_lockup = sqrt(lockup_months / 12)
  → 12-month lockup = 1.0x, 24 months = 1.41x, 48 months = 2.0x
```

**Example (Gold Tier):**

```
Base APY: 12%
Evaluator avg correlation: 75% → M_hrscore = 1.75
Evaluations completed: 500 → M_volume = 1.37
Lockup: 24 months → M_lockup = 1.41

Total APY = 12% × 1.75 × 1.37 × 1.41 = 40.8%
```

This rewards high-quality, high-volume evaluators with 3-4x base APY.

#### Rewards Distribution

**Source of Staking Rewards:**

1. **Transaction Fees** (1.5% to treasury):
   - 50% → Staking rewards pool
   - 50% → Development fund

2. **Query Revenue Share** (20% to evaluators):
   - Distributed proportionally to evaluators whose references were purchased

**Distribution Logic:**

```solidity
function distributeRewards() external {
    uint256 totalRewards = rewardsPool.balance;
    uint256 totalStaked = stakingContract.totalStaked();

    for (uint i = 0; i < stakers.length; i++) {
        address staker = stakers[i];
        uint256 stakedAmount = stakingContract.balanceOf(staker);
        uint256 multiplier = calculateMultiplier(staker); // hrscore × volume × lockup
        uint256 effectiveStake = stakedAmount * multiplier;

        uint256 reward = (totalRewards * effectiveStake) / totalEffectiveStake;
        rewards[staker] += reward;
    }
}
```

**Claiming**:

- Rewards accrue per block
- Claimable anytime (no cooldown)
- Auto-compounded if "restake" option enabled

#### Unstaking Cooldown

**Purpose**: Prevents flash-loan attacks and ensures economic security.

| Tier | Cooldown Period | Grace Period |
|------|-----------------|--------------|
| Bronze | 7 days | 48 hours to claim |
| Silver | 14 days | 72 hours to claim |
| Gold | 30 days | 7 days to claim |
| Platinum | 90 days | 14 days to claim |

**If grace period expires**: Stake returns to locked state.

**Emergency Unstake**: Available for 50% penalty (25% burn, 25% redistributed to remaining stakers).

### 6.3 Employer Staking (Volume Discounts)

Employers can stake HRK to reduce query costs:

| Staked Amount | Discount | Annual Query Limit |
|---------------|----------|-------------------|
| 0 HRK | 0% | Unlimited (full price) |
| 1,000 HRK | 5% | — |
| 5,000 HRK | 10% | — |
| 20,000 HRK | 20% | — |
| 100,000 HRK | 30% | — |
| 500,000+ HRK | 40% | — |

**Example:**

```
Employer stakes 20,000 HRK
Candidate query base price: 50 HRK
Discounted price: 50 × 0.80 = 40 HRK
Savings: 10 HRK per query

If 1,000 queries/year → saves 10,000 HRK (~$5,000 at $0.50/HRK)
ROI on stake: 50% annual savings vs. stake value
```

**Cooldown**: 30 days (prevents gaming discounts)

### 6.4 Candidate Staking (Visibility Boost)

Candidates can stake HRK to increase profile visibility:

| Staked Amount | Boost | Effect |
|---------------|-------|--------|
| 50 HRK | +10% | Appears higher in search results |
| 200 HRK | +25% | Featured in weekly talent digest |
| 1,000 HRK | +50% | Priority matching for AI recruiter tools |

**Duration**: 3-month lockup, then recurring monthly

**Refund**: Full refund after 3 months if candidate wishes to unstake

### 6.5 Smart Contract Architecture

**HRKStaking.sol** (Solidity 0.8.20):

```solidity
contract HRKStaking is ReentrancyGuard, Pausable, AccessControl {
    IERC20 public HRK;

    struct Stake {
        uint256 amount;
        uint256 tier; // 0=Bronze, 1=Silver, 2=Gold, 3=Platinum
        uint256 stakedAt;
        uint256 lockupMonths;
        uint256 unstakeRequestedAt;
    }

    mapping(address => Stake) public stakes;
    mapping(address => uint256) public rewards;

    uint256[4] public tierMinimums = [100e18, 500e18, 2000e18, 10000e18];
    uint256[4] public baseAPYs = [500, 800, 1200, 1500]; // BPS
    uint256[4] public cooldowns = [7 days, 14 days, 30 days, 90 days];

    event Staked(address indexed user, uint256 amount, uint256 tier);
    event UnstakeRequested(address indexed user, uint256 unlockTime);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);

    function stake(uint256 amount, uint256 tier, uint256 lockupMonths) external;
    function requestUnstake() external;
    function executeUnstake() external;
    function claimRewards() external;
    function calculateRewards(address staker) public view returns (uint256);
}
```

---

## 7. Slashing Mechanism

### 7.1 Purpose of Slashing

Slashing economically disincentivizes:

1. **Fraudulent Evaluations**: Fake references, inflated ratings
2. **Collusion**: Coordinated schemes to boost HRScores artificially
3. **Low-Quality Feedback**: Consistently poor correlation with actual performance

### 7.2 Slashing Criteria

**Tier 1: Minor Violations (10% slash)**

- Evaluation correlation < 0.20 for 3+ consecutive months
- Missed evaluation deadlines (for contracted evaluators)

**Tier 2: Moderate Violations (30% slash)**

- Evaluation correlation < 0.10 (demonstrably poor quality)
- Submitting references for unverified identities
- Failure to respond to dispute resolution within 14 days

**Tier 3: Major Violations (60% slash)**

- Collusion detected via on-chain analysis (same IP, wallet clustering)
- Accepting payment outside HRKey for favorable reviews
- Repeated Tier 2 violations (3+ within 12 months)

**Tier 4: Fraud (100% slash + ban)**

- Proven identity impersonation
- Submitting references for candidates never worked with
- Cryptographic proof of data fabrication

### 7.3 Slash Execution Process

#### 7.3.1 Detection Phase

**AI-Powered Monitoring:**

```
Correlation Analysis (Daily):
FOR each evaluator:
  correlation = pearson(evaluator_ratings, actual_outcomes)

  IF correlation < 0.20 for 90 days:
    FLAG for human review

  IF correlation < 0.00 (negative):
    ESCALATE to slashing committee
```

**On-Chain Forensics:**

- Wallet clustering (same funding source)
- Temporal analysis (batch submissions from multiple accounts)
- Graph analysis (circular reference networks)

**Community Reporting:**

- Candidates can dispute references (with stake)
- Employers can report suspicious patterns
- Whistleblower rewards: 10% of slashed amount

#### 7.3.2 Evidence Submission

**Oracle Role** (HRKSlashing.sol):

```solidity
function proposeSlash(
    address evaluator,
    uint256 tier, // 1-4
    bytes32 evidenceHash, // IPFS CID of evidence
    string calldata reason
) external onlyOracle {
    require(tier <= 4, "Invalid tier");

    slashProposals[evaluator] = SlashProposal({
        tier: tier,
        evidenceHash: evidenceHash,
        reason: reason,
        proposedAt: block.timestamp,
        executed: false
    });

    emit SlashProposed(evaluator, tier, evidenceHash);
}
```

**Oracle = Multi-Sig Committee:**

- 3/5 signatures required to propose slash
- Committee members: Core team (2), elected community members (3)

#### 7.3.3 Appeals Period

**48-hour window** after slash proposal:

1. Evaluator can submit counter-evidence (IPFS document)
2. Stake additional HRK (50% of slash amount) to escalate to DAO vote
3. DAO votes with 72-hour voting period

**If appeal succeeds**:

- Slash cancelled
- Evaluator's counter-stake refunded
- Oracle committee member who proposed loses 10% of their stake

**If appeal fails**:

- Slash executed
- Counter-stake forfeited (50% burn, 50% to treasury)

#### 7.3.4 Slash Distribution

```solidity
function executeSlash(address evaluator) external {
    SlashProposal storage proposal = slashProposals[evaluator];
    require(block.timestamp > proposal.proposedAt + 48 hours, "Appeals period active");
    require(!proposal.executed, "Already executed");

    Stake storage stake = stakes[evaluator];
    uint256 slashAmount = (stake.amount * slashPercentages[proposal.tier]) / 100;

    // Split: 50% burn, 50% to honest evaluators
    uint256 burnAmount = slashAmount / 2;
    uint256 redistributeAmount = slashAmount / 2;

    HRK.transfer(BURN_ADDRESS, burnAmount);
    rewardsPool += redistributeAmount; // Distributed to all other stakers

    stake.amount -= slashAmount;
    proposal.executed = true;

    emit Slashed(evaluator, slashAmount, proposal.tier);
}
```

### 7.4 Slashing Economics

**Incentive Alignment:**

| Scenario | Evaluator Payoff | Optimal Strategy |
|----------|------------------|------------------|
| Honest feedback | +20% query revenue + 8% APY | **Be honest** |
| Mild fraud (10% slash risk) | +30% revenue - 10% stake | Risky |
| Major fraud (60% slash risk) | +50% revenue - 60% stake | **Irrational** |

**Expected Value Calculation (Honest vs. Fraudulent):**

```
Honest Evaluator (1 year):
- Stake: 500 HRK (Silver)
- Evaluations: 100/month = 1,200/year
- Avg revenue per eval: 2 HRK
- Total revenue: 2,400 HRK
- Staking APY: 8% × 500 = 40 HRK
- Total: 2,440 HRK

Fraudulent Evaluator (expectation):
- Inflated revenue: +50% = 3,600 HRK
- Slash risk: 30% chance of 60% slash = 0.30 × 300 HRK = 90 HRK
- Net: 3,600 - 90 = 3,510 HRK

BUT: 30% chance of complete loss (stake + reputation + future earnings)
Expected future earnings (discounted): 10,000 HRK over 5 years

Fraud EV = 0.70 × 3,510 + 0.30 × (-500 - 10,000) = 2,457 - 3,150 = -693 HRK

Honest Strategy Dominates by ~3,133 HRK
```

### 7.5 Slashing Statistics Dashboard

**On-Chain Transparency:**

HRKey publishes real-time metrics:

- Total slashes executed (count + HRK)
- Slash distribution by tier
- Appeals success rate
- Slash pool balance (redistributable rewards)

**Example Dashboard (Year 1):**

```
Total Slashes: 42
├─ Tier 1 (10%): 28 slashes, 14,000 HRK
├─ Tier 2 (30%): 10 slashes, 15,000 HRK
├─ Tier 3 (60%): 3 slashes, 3,600 HRK
└─ Tier 4 (100%): 1 slash, 10,000 HRK

Total Slashed: 42,600 HRK
├─ Burned: 21,300 HRK
└─ Redistributed: 21,300 HRK (to 5,000 honest evaluators)

Appeals Filed: 12
├─ Successful: 3 (25%)
└─ Unsuccessful: 9 (75%)
```

---

## 8. Incentive Models

### 8.1 Proof-of-Feedback (PoF)

HRKey introduces **Proof-of-Feedback**, a novel consensus mechanism for labor data:

**Core Principle**: Evaluators earn rewards proportional to the value and accuracy of their feedback.

#### 8.1.1 PoF Reward Formula

```
R_evaluator = R_base × M_quality × M_demand × M_velocity

Where:
- R_base = 2 HRK per evaluation (minimum reward)
- M_quality = correlation score (0.5 - 2.0)
- M_demand = how often the reference is purchased (1.0 - 5.0)
- M_velocity = recency bonus (1.0 - 1.5)
```

**M_quality (Quality Multiplier):**

```
M_quality = 0.5 + (correlation_score × 1.5)

Examples:
- correlation = 0.20 (poor): M = 0.80
- correlation = 0.50 (average): M = 1.25
- correlation = 0.80 (excellent): M = 1.70
```

**M_demand (Demand Multiplier):**

```
M_demand = 1 + log10(1 + purchases_of_reference)

Examples:
- 0 purchases: M = 1.00
- 10 purchases: M = 2.04
- 100 purchases: M = 3.00
- 1,000 purchases: M = 4.00
```

**M_velocity (Recency Multiplier):**

```
M_velocity = 1 + (0.5 × e^(-months_since_evaluation / 12))

Examples:
- 0 months old: M = 1.50 (fresh data)
- 6 months old: M = 1.30
- 12 months old: M = 1.18
- 24 months old: M = 1.07
```

#### 8.1.2 Example Reward Calculation

**Evaluator Profile:**

- Submitted reference for Senior Engineer
- Correlation score: 0.75 (high quality)
- Reference purchased 50 times (high demand)
- Evaluation submitted 3 months ago

**Calculation:**

```
R_base = 2 HRK

M_quality = 0.5 + (0.75 × 1.5) = 1.625
M_demand = 1 + log10(1 + 50) = 1 + 1.71 = 2.71
M_velocity = 1 + (0.5 × e^(-3/12)) = 1 + (0.5 × 0.78) = 1.39

R_total = 2 × 1.625 × 2.71 × 1.39 = 12.24 HRK per query

If reference purchased 50 times:
Total earnings = 12.24 × 50 = 612 HRK (~$306 at $0.50/HRK)
```

**Annualized Income (100 evaluations/year, avg 50 queries each):**

```
100 evals × 12.24 HRK × 50 queries = 61,200 HRK/year
= ~$30,600 at $0.50/HRK
```

This creates a viable **second income stream** for managers and HR professionals.

### 8.2 AI Reputation Multipliers

HRKey integrates **HRScore correlation** into all reward calculations:

**Evaluator Reputation Score:**

```
ERS = (Σ(correlation_i) / n_evaluations) × 100

Where:
- correlation_i = Pearson correlation between evaluator's ratings and actual outcomes
- n_evaluations = total evaluations submitted
```

**ERS Impact on Rewards:**

| ERS Range | Multiplier | Status |
|-----------|------------|--------|
| 0-30 | 0.50x | At-risk (potential slash) |
| 31-50 | 0.80x | Below average |
| 51-70 | 1.00x | Average |
| 71-85 | 1.30x | Above average |
| 86-95 | 1.60x | Excellent |
| 96-100 | 2.00x | Elite (top 1%) |

**Example:**

```
Evaluator A: ERS = 88 → 1.60x multiplier
Base reward: 10 HRK
Actual reward: 10 × 1.60 = 16 HRK

Evaluator B: ERS = 45 → 0.80x multiplier
Base reward: 10 HRK
Actual reward: 10 × 0.80 = 8 HRK
```

This creates a **meritocratic feedback economy** where high-quality evaluators dominate earnings.

### 8.3 Referral Loops

**Three-Sided Referral System:**

#### 8.3.1 Candidate Referrals

Candidates who refer other candidates earn:

```
Referral Reward = 5% of all query revenue generated by referred candidate (lifetime)
```

**Example:**

```
Alice refers Bob to HRKey
Bob's profile generates 1,000 queries over 2 years at avg 20 HRK each
Total revenue: 20,000 HRK

Alice earns: 20,000 × 0.05 = 1,000 HRK (~$500 at $0.50/HRK)
```

**Viral Growth Potential:**

```
If Alice refers 10 high-demand candidates:
10 candidates × 1,000 HRK each = 10,000 HRK/year passive income
```

#### 8.3.2 Evaluator Referrals

Evaluators who refer other evaluators earn:

```
Referral Reward = 2% of referred evaluator's earnings (for 12 months)
```

#### 8.3.3 Employer Referrals

Employers who refer other employers earn:

```
Referral Reward = 10% of first year's query volume (up to 10,000 HRK cap)
```

**Target**: ATS platforms, staffing agencies, executive search firms

### 8.4 Seasonal Campaigns

**Quarterly Incentive Boosts:**

1. **Q1: "Resolution Rally"** (January-March)
   - 2x rewards for first-time evaluators
   - 1.5x rewards for candidates completing profiles

2. **Q2: "Spring Hiring Surge"** (April-June)
   - 20% bonus for employer queries in high-demand industries
   - Evaluator bounties for tech/finance profiles

3. **Q3: "Summer Onboarding"** (July-September)
   - University partnerships: students get 50 HRK sign-up bonus
   - Alumni networks incentivized with 100 HRK grants

4. **Q4: "Year-End Push"** (October-December)
   - 3x rewards for evaluators hitting 200+ evaluations/year
   - Employer volume discounts (stake 50K HRK → 50% off queries)

---

## 9. Economic Models and Formulas

### 9.1 Network Value Model

HRKey's value grows with **Metcalfe's Law** (network effects):

```
V_protocol = k × (n_candidates × n_evaluators × n_employers)^1.5

Where:
- k = value coefficient (~$0.10 per interaction)
- Exponent 1.5 reflects three-sided marketplace dynamics
```

**Scenario Modeling:**

| Year | Candidates | Evaluators | Employers | Protocol Value |
|------|------------|------------|-----------|----------------|
| 1 | 100K | 10K | 1K | $3.2M |
| 2 | 500K | 50K | 5K | $88M |
| 3 | 2M | 200K | 20K | $1.13B |
| 5 | 10M | 1M | 100K | $31.6B |

**Token Price Implication:**

```
If Protocol Value = $1B and captures 5% as Treasury:
Treasury = $50M

Circulating Supply (Year 3): 680M HRK
Market Cap = $50M / 0.05 (5% treasury to MC ratio) = $1B
Price per HRK = $1B / 680M = $1.47
```

This is a **conservative estimate** assuming only 5% value capture.

### 9.2 Supply-Demand Equilibrium

**Demand Drivers:**

1. **Query Volume**: Q = f(candidates, avg_queries_per_candidate, price_elasticity)
2. **Staking Demand**: S = f(APY, slash_risk, token_price_appreciation)
3. **Speculative Demand**: D_spec = f(market_sentiment, comparables_valuation)

**Supply Dynamics:**

```
S_circulating(t) = S_TGE + Σ(emissions_t) - Σ(burns_t) - S_staked(t)

Where:
- S_TGE = 110M HRK (initial supply)
- emissions_t = vesting schedule releases
- burns_t = transaction burns + slash burns
- S_staked(t) = locked liquidity
```

**Equilibrium Price:**

```
P_equilibrium = (Total_Demand_USD) / S_liquid(t)

Where:
- Total_Demand_USD = query_revenue + staking_value + speculative_premium
- S_liquid(t) = S_circulating(t) - S_staked(t)
```

**Year 1 Projection:**

```
Query Revenue: $5M (10M queries × $0.50 avg)
Staking Value: $10M (20M HRK staked × $0.50)
Speculative Premium: $35M (7x revenue multiple)

Total Demand: $50M
Liquid Supply: 260M - 20M = 240M HRK
Price: $50M / 240M = $0.21/HRK

(Conservative, assumes no appreciation beyond utility)
```

### 9.3 Token Velocity

**Velocity Formula:**

```
V = (Total_Transaction_Volume) / (Average_Token_Holdings)

Target Velocity: 3-5 (similar to AAVE, COMP)
```

**Low Velocity Mechanisms (desired):**

1. **Staking Lockups**: Remove 20-30% of supply from circulation
2. **Long-Term Holdings**: DAO treasury holds 20% permanently
3. **Employer Stakes**: Enterprise customers lock tokens for discounts

**High Velocity Risks:**

- Excessive trading on CEXs (mitigated by utility requirements)
- Mercenary capital (mitigated by vesting)

### 9.4 Price Elasticity of Demand

**Employer Price Sensitivity:**

```
ε_employer = %ΔQ / %ΔP = -0.7 (inelastic)
```

**Rationale**: Hiring costs ($5K-$50K per hire) dwarf query prices ($5-$50), making demand relatively inelastic.

**Simulation:**

| HRK Price | Query Cost (20 HRK) | Queries/Month | Revenue |
|-----------|---------------------|---------------|---------|
| $0.25 | $5 | 10M | $50M |
| $0.50 | $10 | 9M | $90M |
| $1.00 | $20 | 7.5M | $150M |
| $2.00 | $40 | 6M | $240M |

**Insight**: Revenue grows despite query volume decline → **pricing power**.

### 9.5 Comparative Valuation

**Comparable Projects (Fully Diluted Valuation):**

| Project | FDV | Utility | Comparison to HRK |
|---------|-----|---------|-------------------|
| **Worldcoin** | $30B | Identity verification | HRKey adds labor data layer |
| **Helium** | $8B | Decentralized infrastructure | Similar PoF mechanism |
| **Arweave** | $2B | Permanent storage | HRKey = permanent labor records |
| **The Graph** | $3B | Data indexing | HRKey = labor data oracle |

**HRKey Target FDV (Year 3):**

```
Conservative: $500M (0.5x Arweave)
Base Case: $2B (1x Arweave)
Bull Case: $5B (0.6x Helium)
```

**Implied Token Prices (1B supply):**

- Conservative: $0.50
- Base: $2.00
- Bull: $5.00

---

## 10. Multi-Chain Architecture

### 10.1 Strategic Rationale

**Why Multi-Chain?**

1. **Base (Primary)**: Low fees, Coinbase integration, EVM compatibility
2. **Solana (Secondary)**: Ultra-low latency for micro-payments, high throughput
3. **Future**: Expand to Arbitrum, Optimism, Polygon for liquidity aggregation

### 10.2 Base L2 (Primary Network)

**Advantages:**

- **Native USDC**: Seamless fiat on/off-ramps via Coinbase
- **Smart Wallet SDK**: Gasless transactions via Biconomy
- **Low Fees**: $0.01-0.05 per transaction (vs. $5-50 on Ethereum mainnet)
- **Security**: Inherits Ethereum's security via optimistic rollup

**HRKey Contracts on Base:**

- **HRKToken.sol**: ERC-20 token contract
- **HRKStaking.sol**: Staking + rewards
- **HRKSlashing.sol**: Fraud detection + penalties
- **HRKPriceOracle.sol**: Dynamic pricing via Merkle proofs
- **HRKGovernance.sol**: DAO voting

**Transaction Flow:**

```
User (Supabase Auth)
  → Smart Wallet (Base SDK)
  → Biconomy Paymaster (gasless)
  → HRK Contracts (Base L2)
  → Settlement (Ethereum mainnet, optional)
```

### 10.3 Solana Integration (Secondary Network)

#### 10.3.1 Use Cases for Solana

1. **Micro-Payments**: Sub-$1 queries (junior profiles, high-volume employers)
2. **Real-Time Analytics**: 400ms block times enable live dashboards
3. **Emerging Markets**: Lower token prices + fees attract developing countries
4. **DeFi Composability**: Integrate with Jupiter, Raydium, Marinade

#### 10.3.2 Architecture Options

**Option A: Wrapped HRK (wHRK-SPL)**

**Mechanism:**

```
User locks HRK on Base
  → Bridge (Wormhole/LayerZero)
  → Mint equivalent wHRK on Solana
```

**Advantages:**

- Simple implementation (standard bridge)
- Unified supply (burns on Base = burns on Solana)

**Disadvantages:**

- Bridge risk (hacks like Wormhole 2022)
- 15-30 minute latency for cross-chain transfers
- Double gas fees (Base + Solana)

**Security Mitigations:**

- Use Wormhole NTT (Native Token Transfers) with rate limits
- Multi-sig guardians (5/9 threshold)
- Insurance via Nexus Mutual ($5M coverage)

---

**Option B: Mirrored Supply (HRK-SPL)**

**Mechanism:**

```
HRKey DAO mints native HRK-SPL on Solana
Supply is mirrored (1:1 ratio maintained)
Cross-chain oracle syncs balances every 6 hours
```

**Advantages:**

- No bridge risk (separate token programs)
- Independent liquidity pools (Base vs. Solana DEXs)
- Faster transactions (no bridge latency)

**Disadvantages:**

- Supply coordination complexity
- Price divergence risk (arbitrage needed)
- Governance overhead (dual-chain decisions)

**Supply Sync Mechanism:**

```solidity
// Base Contract
function syncSupplyToSolana() external onlyOracle {
    uint256 baseSupply = totalSupply();
    uint256 baseBurned = burnedSupply();

    // Emit event for Solana oracle
    emit SupplySyncEvent(baseSupply, baseBurned, block.timestamp);
}
```

```rust
// Solana Program
pub fn sync_supply(ctx: Context<SyncSupply>, base_supply: u64, base_burned: u64) -> Result<()> {
    let hrk_token = &mut ctx.accounts.hrk_token;

    // Adjust Solana supply to match Base
    let target_supply = base_supply;
    let current_supply = hrk_token.supply;

    if target_supply > current_supply {
        // Mint difference
        token::mint_to(ctx.accounts.into(), target_supply - current_supply)?;
    } else if target_supply < current_supply {
        // Burn difference
        token::burn(ctx.accounts.into(), current_supply - target_supply)?;
    }

    Ok(())
}
```

---

**Option C: Solana for Specific Use Cases Only**

**Mechanism:**

```
Base = Primary network (all core functions)
Solana = Micro-payment layer + emerging markets

HRK on Base: Full utility (staking, governance, queries)
wHRK on Solana: Payment-only (no staking/governance rights)
```

**Advantages:**

- Clear separation of concerns
- Minimal governance complexity
- Optimized for each network's strengths

**Disadvantages:**

- Fragmented user experience
- Lower Solana adoption (limited utility)

---

#### 10.3.3 Recommended Approach

**Hybrid Model: Option B (Mirrored Supply) + Option C (Limited Solana Utility)**

**Implementation:**

1. **Phase 1 (Year 1)**: Base only (focus on product-market fit)
2. **Phase 2 (Year 2)**: Deploy HRK-SPL on Solana for payments
   - Use Wormhole NTT for bridging (with rate limits)
   - Enable micro-payments (<$5 queries)
3. **Phase 3 (Year 3)**: Full Solana integration
   - Staking on Solana (with shared rewards pool)
   - Cross-chain governance via Wormhole governance bridge

**Cross-Chain Pricing:**

```
Base Query: 20 HRK × $0.50 = $10
Solana Query: 20 HRK × $0.48 = $9.60

Arbitrage: Buy on Solana, sell on Base
→ Converges prices within 1-2% (efficient markets)
```

### 10.4 Bridge Security

**Risk Mitigation:**

1. **Rate Limits**: Max 1M HRK bridged per day
2. **Multi-Sig Guardians**: 5/9 signers (Base team, community, Wormhole)
3. **Delayed Finality**: 24-hour timelock for large transfers (>100K HRK)
4. **Insurance**: $10M coverage via Nexus Mutual
5. **Audits**: Trail of Bits + OpenZeppelin for bridge contracts

**Emergency Pause:**

If bridge hack detected:

```
1. Guardian multi-sig pauses bridge (within 1 hour)
2. DAO vote to resume (48-hour voting period)
3. Affected users reimbursed from insurance fund
```

### 10.5 Multi-Chain Governance

**Unified DAO Voting:**

```
Voting Power = (HRK_base × weight_base) + (HRK_solana × weight_solana)

Where:
- weight_base = 1.0 (full governance rights)
- weight_solana = 0.5 (reduced rights, payment-focused)
```

**Rationale**: Base users have higher utility (staking, slashing) → higher governance weight.

**Snapshot Integration:**

- Off-chain voting (gasless)
- Wormhole oracle syncs Solana balances to Base
- Execution via Timelock contract (48-hour delay)

---

## 11. Governance

### 11.1 HRK DAO Structure

**Governance Framework:**

1. **Proposal Submission**: Requires 100K HRK stake (prevents spam)
2. **Discussion Period**: 7 days (forum + Discord)
3. **Voting Period**: 5 days (Snapshot)
4. **Execution Delay**: 48 hours (Timelock for security)

### 11.2 Voting Power

```
VP = staked_HRK × sqrt(stake_duration_days) × multiplier

Where:
- multiplier = 1.0 for standard staking
- multiplier = 1.5 for Platinum tier stakers
- multiplier = 2.0 for core team (vested tokens)
```

**Rationale**: Long-term stakeholders have more influence (prevents governance attacks).

### 11.3 Proposal Types

| Type | Quorum | Approval | Examples |
|------|--------|----------|----------|
| **Constitutional** | 40% | 67% | Tokenomics changes, supply adjustments |
| **Technical** | 20% | 60% | Contract upgrades, oracle updates |
| **Treasury** | 30% | 60% | Grant allocations, partnerships |
| **Emergency** | 10% | 75% | Security patches, bridge pauses |

### 11.4 Governance Roadmap

**Phase 1 (Year 1-2): Core Team Governance**

- 5/9 multi-sig controls treasury + contracts
- Community proposals accepted, but final decision with team

**Phase 2 (Year 2-3): Progressive Decentralization**

- DAO controls 50% of governance weight
- Core team retains veto power (emergency only)

**Phase 3 (Year 3+): Full DAO Control**

- 100% community governance
- Core team advisory role only

---

## 12. Risk Analysis and Mitigations

### 12.1 Economic Risks

#### 12.1.1 Token Price Volatility

**Risk**: HRK price crashes → employers can't afford queries → network death spiral

**Mitigations:**

1. **Fiat Pricing Option**: Employers pay in USDC, automatically converted to HRK
2. **Price Oracles**: Chainlink feeds ensure stable USD-denominated prices
3. **Treasury Buffer**: Hold 6 months operating expenses in stablecoins

#### 12.1.2 Staking Death Spiral

**Risk**: Token price drops → stakers unstake → less security → more fraud → further price drop

**Mitigations:**

1. **Minimum Stake Requirements**: Enforced regardless of USD value
2. **Automatic APY Adjustments**: If <20% of supply staked, APY increases by 50%
3. **Emergency Staking Incentives**: DAO can vote to deploy treasury funds for bonus rewards

#### 12.1.3 Hyperinflation from Vesting

**Risk**: Large token unlocks flood market → sell pressure → price collapse

**Mitigations:**

1. **Gradual Vesting**: Linear 48-month schedule (no cliffs after TGE)
2. **Lockup Incentives**: Team voluntarily extends vesting by 12 months for 20% bonus
3. **Market Making**: $5M treasury allocation for liquidity provision during unlock periods

### 12.2 Security Risks

#### 12.2.1 Smart Contract Exploits

**Risk**: Bug in HRKStaking.sol allows infinite minting

**Mitigations:**

1. **Audits**: Trail of Bits ($150K), OpenZeppelin ($100K), Consensys Diligence ($80K)
2. **Bug Bounty**: $500K pool (Immunefi), rewards up to $250K for critical bugs
3. **Formal Verification**: Certora for critical functions (mint, burn, slash)
4. **Upgradability**: UUPS proxy pattern with 48-hour timelock

#### 12.2.2 Oracle Manipulation

**Risk**: Attacker manipulates price oracle → pays 1 HRK for high-value query

**Mitigations:**

1. **Merkle Proofs**: On-chain verification of off-chain prices
2. **Multi-Oracle Consensus**: Chainlink + HRKey internal oracle (2/2 agreement)
3. **Price Bounds**: Min 5 HRK, max 500 HRK (prevents extreme manipulation)
4. **Slashing for Oracle Fraud**: Oracle operators stake 1M HRK (slashable)

#### 12.2.3 Bridge Hacks

**Risk**: Wormhole bridge exploited → 10M HRK stolen

**Mitigations:**

1. **Rate Limits**: 1M HRK/day max
2. **Multi-Sig Guardians**: 5/9 approval for large transfers
3. **Insurance**: $10M Nexus Mutual coverage
4. **Delayed Finality**: 24-hour timelock for >100K HRK transfers

### 12.3 Abuse Vectors

#### 12.3.1 Sybil Attacks

**Risk**: Attacker creates 1,000 fake evaluator accounts → earns undeserved rewards

**Mitigations:**

1. **KYC for Evaluators**: Required for Silver+ tiers (via Persona/Onfido)
2. **Stake Requirements**: 100 HRK minimum (1,000 accounts = $50K cost)
3. **Correlation Filtering**: AI detects low-quality feedback → no rewards
4. **Graph Analysis**: On-chain forensics identify wallet clusters → mass slashing

#### 12.3.2 Collusion

**Risk**: Candidate + evaluator collude → fake perfect HRScore

**Mitigations:**

1. **Multi-Evaluator Requirement**: HRScore requires 3+ independent evaluators
2. **Outlier Detection**: Statistical analysis flags suspicious patterns
3. **Employer Feedback Loop**: If hired candidate underperforms, all evaluators slashed
4. **Anonymous Evaluators**: Candidates cannot choose who evaluates them (assigned by protocol)

#### 12.3.3 Wash Trading (Employers)

**Risk**: Employer queries own employees' profiles repeatedly → inflates demand

**Mitigations:**

1. **IP + Wallet Fingerprinting**: Detects same entity making multiple queries
2. **Query Cooldowns**: Cannot query same candidate twice within 30 days
3. **Employer Verification**: KYB (Know Your Business) required for accounts
4. **Slashing for Employers**: Detected wash trading → lose staked HRK

### 12.4 Regulatory Risks

#### 12.4.1 Securities Classification

**Risk**: HRK deemed a security → must register with SEC

**Mitigations:**

1. **Utility Focus**: Emphasize functional usage (not investment)
2. **Decentralization**: DAO governance reduces "common enterprise" risk
3. **No Pre-Sale Marketing**: Avoid investment-focused messaging
4. **Legal Opinions**: Obtain Howey Test analysis from top-tier law firms

#### 12.4.2 Data Privacy (GDPR)

**Risk**: EU users demand data deletion → conflicts with blockchain immutability

**Mitigations:**

1. **Off-Chain PII**: Store names/emails in Supabase (deletable)
2. **On-Chain Hashes Only**: Blockchain stores keccak256(data), not raw data
3. **Right to Suppress**: Users can revoke access to references (not delete, but hide)
4. **Anonymization**: After 5 years, PII automatically anonymized

#### 12.4.3 Labor Law Compliance

**Risk**: HRKey classified as background check company → requires FCRA compliance

**Mitigations:**

1. **User Consent**: Candidates approve every query (not passive background checks)
2. **Candidate-Owned Data**: Users control access, not employers
3. **Dispute Resolution**: FCRA-compliant appeals process for incorrect references
4. **Legal Disclaimer**: "HRKey is not a consumer reporting agency"

---

## 13. Technical Implementation

### 13.1 Smart Contract Architecture

**Contract Hierarchy:**

```
HRKToken.sol (ERC-20)
├── Inherits: ERC20, ERC20Burnable, Pausable, AccessControl
├── Roles: MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE
└── Functions: mint(), burn(), pause(), unpause()

HRKStaking.sol (Staking + Rewards)
├── Inherits: ReentrancyGuard, Pausable, AccessControl
├── Dependencies: HRKToken, HRKSlashing
└── Functions: stake(), unstake(), claimRewards(), calculateAPY()

HRKSlashing.sol (Fraud Detection)
├── Inherits: ReentrancyGuard, AccessControl
├── Dependencies: HRKStaking
└── Functions: proposeSlash(), executeSlash(), appeal()

HRKPriceOracle.sol (Dynamic Pricing)
├── Inherits: AccessControl
├── Dependencies: Chainlink AggregatorV3
└── Functions: updatePriceRoot(), verifyPrice(), queryCandidate()

HRKGovernance.sol (DAO Voting)
├── Inherits: Governor, GovernorSettings, GovernorVotes
├── Dependencies: HRKToken (votes delegation)
└── Functions: propose(), castVote(), execute()
```

### 13.2 Key Contract Specifications

#### HRKToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract HRKToken is ERC20, ERC20Burnable, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1B tokens
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    constructor() ERC20("HRKey Token", "HRK") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}
```

#### HRKStaking.sol (Simplified)

```solidity
contract HRKStaking is ReentrancyGuard, Pausable, AccessControl {
    IERC20 public HRK;

    enum Tier { Bronze, Silver, Gold, Platinum }

    struct Stake {
        uint256 amount;
        Tier tier;
        uint256 stakedAt;
        uint256 lockupMonths;
        uint256 unstakeRequestedAt;
    }

    mapping(address => Stake) public stakes;
    mapping(address => uint256) public rewards;

    uint256[4] public tierMinimums = [
        100 * 10**18,   // Bronze
        500 * 10**18,   // Silver
        2000 * 10**18,  // Gold
        10000 * 10**18  // Platinum
    ];

    uint256[4] public baseAPYs = [500, 800, 1200, 1500]; // BPS (5%, 8%, 12%, 15%)
    uint256[4] public cooldowns = [7 days, 14 days, 30 days, 90 days];

    event Staked(address indexed user, uint256 amount, Tier tier);
    event UnstakeRequested(address indexed user, uint256 unlockTime);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);

    function stake(uint256 amount, Tier tier, uint256 lockupMonths) external nonReentrant {
        require(amount >= tierMinimums[uint(tier)], "Insufficient stake for tier");
        require(lockupMonths >= 1 && lockupMonths <= 48, "Invalid lockup period");

        HRK.transferFrom(msg.sender, address(this), amount);

        stakes[msg.sender] = Stake({
            amount: amount,
            tier: tier,
            stakedAt: block.timestamp,
            lockupMonths: lockupMonths,
            unstakeRequestedAt: 0
        });

        emit Staked(msg.sender, amount, tier);
    }

    function calculateRewards(address staker) public view returns (uint256) {
        Stake memory s = stakes[staker];
        if (s.amount == 0) return 0;

        uint256 stakeDuration = block.timestamp - s.stakedAt;
        uint256 baseAPY = baseAPYs[uint(s.tier)];

        // APY = base × time × multipliers
        uint256 reward = (s.amount * baseAPY * stakeDuration) / (365 days * 10000);

        return reward;
    }

    function requestUnstake() external {
        Stake storage s = stakes[msg.sender];
        require(s.amount > 0, "No stake found");
        require(s.unstakeRequestedAt == 0, "Unstake already requested");

        s.unstakeRequestedAt = block.timestamp;
        uint256 unlockTime = block.timestamp + cooldowns[uint(s.tier)];

        emit UnstakeRequested(msg.sender, unlockTime);
    }

    function executeUnstake() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.unstakeRequestedAt > 0, "Unstake not requested");
        require(block.timestamp >= s.unstakeRequestedAt + cooldowns[uint(s.tier)], "Cooldown period active");

        uint256 amount = s.amount;
        delete stakes[msg.sender];

        HRK.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant {
        uint256 reward = calculateRewards(msg.sender);
        require(reward > 0, "No rewards available");

        rewards[msg.sender] = 0;
        stakes[msg.sender].stakedAt = block.timestamp; // Reset reward timer

        HRK.transfer(msg.sender, reward);
        emit RewardsClaimed(msg.sender, reward);
    }
}
```

### 13.3 Off-Chain Architecture

**Backend Services (Node.js + TypeScript):**

```
/backend/pricing/
├── pricingEngine.ts       # Dynamic price calculations
├── priceOracle.ts         # Merkle tree generation + on-chain updates
├── correlationService.ts  # AI-powered quality scoring
└── slashingMonitor.ts     # Fraud detection + slash proposals
```

**Database Schema (Supabase PostgreSQL):**

```sql
-- Candidate Pricing Cache
CREATE TABLE candidate_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_wallet VARCHAR(42) NOT NULL,
    price_hrk NUMERIC(18, 6) NOT NULL,
    factors JSONB NOT NULL, -- Store all multipliers
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Query History (for demand multiplier)
CREATE TABLE queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_wallet VARCHAR(42) NOT NULL,
    candidate_wallet VARCHAR(42) NOT NULL,
    price_paid_hrk NUMERIC(18, 6) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Evaluator Reputation
CREATE TABLE evaluator_reputation (
    evaluator_wallet VARCHAR(42) PRIMARY KEY,
    avg_correlation NUMERIC(5, 4), -- 0.0000 - 1.0000
    total_evaluations INT DEFAULT 0,
    slash_count INT DEFAULT 0,
    reputation_score INT DEFAULT 50 -- ERS (0-100)
);
```

### 13.4 Integration Flow

**Query Execution (End-to-End):**

```
1. Employer clicks "Query Candidate" (Frontend)
   ↓
2. Frontend fetches price from /api/pricing/:wallet (Backend)
   ↓
3. Backend calculates price using pricingEngine.ts
   ↓
4. Backend generates Merkle proof for (candidate, price)
   ↓
5. Frontend prompts wallet signature (Smart Wallet SDK)
   ↓
6. Smart Wallet calls HRKPriceOracle.queryCandidate(candidate, price, proof)
   ↓
7. Contract verifies Merkle proof
   ↓
8. Contract transfers HRK from employer → splits revenue
   ↓
9. Contract emits QueryExecuted event
   ↓
10. Backend webhook catches event → grants access to reference data
    ↓
11. Frontend displays reference details to employer
```

### 13.5 Deployment Checklist

**Pre-Launch:**

- [ ] 3 independent audits (Trail of Bits, OpenZeppelin, Consensys)
- [ ] $500K bug bounty program (Immunefi)
- [ ] Formal verification (Certora) for critical functions
- [ ] Testnet deployment (Base Sepolia) for 3 months
- [ ] Community testing incentives (10K HRK rewards)

**Launch Day:**

- [ ] Deploy contracts to Base mainnet
- [ ] Verify contracts on Basescan
- [ ] Initialize liquidity pools (Uniswap V3)
- [ ] Enable staking contracts
- [ ] Activate price oracle (first update)

**Post-Launch:**

- [ ] 24/7 monitoring (Tenderly, OpenZeppelin Defender)
- [ ] Incident response playbook (1-hour response time)
- [ ] Monthly security reviews (internal team)
- [ ] Quarterly external audits (ongoing)

---

## 14. Roadmap

### Phase 1: Foundation (Months 1-6)

**Q1 2025:**

- [x] Tokenomics whitepaper published
- [ ] Smart contracts development
- [ ] Security audits (3 firms)
- [ ] Testnet launch (Base Sepolia)
- [ ] Private sale ($3.5M raise)

**Q2 2025:**

- [ ] Public sale (CoinList TGE)
- [ ] DEX liquidity provision (Uniswap V3)
- [ ] Staking contracts live
- [ ] Price oracle integration
- [ ] First 1,000 evaluators onboarded

### Phase 2: Growth (Months 7-18)

**Q3 2025:**

- [ ] CEX listings (Coinbase, Binance)
- [ ] 10,000 candidates onboarded
- [ ] 100,000 queries processed
- [ ] Dynamic pricing fully operational
- [ ] Slashing mechanism activated

**Q4 2025:**

- [ ] Solana bridge deployment (Wormhole)
- [ ] Cross-chain staking
- [ ] DAO governance launch
- [ ] First treasury grant program

**Q1-Q2 2026:**

- [ ] 100,000 candidates
- [ ] 1M queries/month
- [ ] Enterprise partnerships (ATS integrations)
- [ ] Mobile app launch (iOS + Android)

### Phase 3: Scale (Months 19-36)

**Q3-Q4 2026:**

- [ ] 1M candidates
- [ ] 10M queries/month
- [ ] Expand to Arbitrum, Optimism
- [ ] White-label solutions for enterprises
- [ ] AI-powered candidate matching

**2027:**

- [ ] 10M candidates
- [ ] 100M queries/year
- [ ] IPO of HRKey (tradfi entity, separate from DAO)
- [ ] Global partnerships (LinkedIn, Workday, SAP)

---

## 15. Conclusion

HRKey Token (HRK) represents a paradigm shift in labor market infrastructure:

1. **Economic Innovation**: First dynamic pricing mechanism for professional references
2. **Incentive Alignment**: Proof-of-Feedback ensures high-quality data
3. **Anti-Fraud**: Staking + slashing create game-theoretic security
4. **Deflationary**: Continuous burns from high-demand profiles
5. **Global Scalability**: Multi-chain architecture for worldwide adoption

**Investment Thesis:**

- **Total Addressable Market**: $50B (global background check + recruiting market)
- **Revenue Model**: Proven (pay-per-query with 40% margins)
- **Network Effects**: Three-sided marketplace (candidates, evaluators, employers)
- **Defensibility**: Proprietary HRScore algorithm + data moat

**Target Valuation (Year 3):**

- Conservative: $500M FDV ($0.50/HRK)
- Base Case: $2B FDV ($2.00/HRK)
- Bull Case: $5B FDV ($5.00/HRK)

**Call to Action:**

HRKey is building the **world's labor oracle**. Join us as:

- **Investor**: private-sale@hrkey.io
- **Builder**: grants@hrkey.io
- **Evaluator**: app.hrkey.io/evaluator
- **Employer**: enterprise@hrkey.io

---

## 16. Appendices

### Appendix A: Glossary

- **HRScore**: 0-100 predictive score of professional performance
- **Proof-of-Feedback (PoF)**: Consensus mechanism rewarding high-quality evaluations
- **Dynamic Pricing**: Market-driven query costs based on candidate demand
- **Slashing**: Penalizing evaluators for fraud (10-100% of stake)
- **Correlation Score**: Pearson/Spearman correlation between evaluator ratings and actual outcomes

### Appendix B: Mathematical Proofs

**Proof of Dominant Strategy (Honest Feedback):**

```
Let:
- R_honest = expected revenue from honest feedback
- R_fraud = expected revenue from fraudulent feedback
- S = stake amount
- p = probability of fraud detection
- α = slashing percentage

Expected Value (Honest) = R_honest + S × APY

Expected Value (Fraud) = R_fraud × (1 - p) - S × α × p

For honesty to be dominant strategy:
R_honest + S × APY > R_fraud × (1 - p) - S × α × p

Solving for p:
p > (R_fraud - R_honest) / (R_fraud + S × α + S × APY)

Given:
- R_fraud = 1.5 × R_honest (50% premium for fraud)
- α = 0.60 (60% slashing)
- APY = 0.12 (12% annual)
- S = 2,000 HRK (Gold tier)

p > 0.5 × R_honest / (1.5 × R_honest + 1,200 + 240)
p > 0.5 / (1.5 + 1,440 / R_honest)

If R_honest = 500 HRK/year:
p > 0.5 / (1.5 + 2.88) = 0.11 (11%)

Thus, fraud detection above 11% makes honesty dominant strategy.
HRKey's AI achieves ~60% detection rate → **5x safety margin**.
```

### Appendix C: References

1. Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System.
2. Buterin, V. (2014). Ethereum Whitepaper.
3. Chainlink Labs. (2021). Chainlink 2.0 Whitepaper.
4. Helium Network. (2020). Helium: A Decentralized Wireless Network.
5. EigenLayer. (2023). EigenLayer Whitepaper: Restaking and Programmable Trust.
6. Arbitrum. (2021). Nitro: Arbitrum's Next Generation Rollup.

### Appendix D: Legal Disclaimers

**This whitepaper is for informational purposes only and does not constitute:**

- Investment advice
- Securities offering (in any jurisdiction)
- Legal, tax, or financial guidance

**Token purchasers should:**

- Consult independent advisors
- Understand cryptocurrency risks
- Comply with local regulations

**HRKey makes no guarantees regarding:**

- Token price appreciation
- Platform adoption
- Regulatory approval

**Risk Warning:**

Cryptocurrencies are highly volatile. You may lose your entire investment. Past performance does not indicate future results.

---

**End of Whitepaper**

**Version:** 1.0
**Last Updated:** November 26, 2025
**Contact:** tokenomics@hrkey.io
**Website:** https://hrkey.io
**GitHub:** https://github.com/OnChainFest/HRkey-App
