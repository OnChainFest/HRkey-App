# HRKey Tokenomics: Current State Analysis

**Document Purpose**: Comprehensive, neutral description of existing HRKey tokenomics design and implementation as of January 2026.

**Scope**: Based on smart contract implementations, documentation, and prior design decisions. No new proposals or redesigns.

---

## 1. Primary Purpose of the HRK Token

### What HRK Is For

The HRK token serves as a **multi-utility protocol token** designed to:

1. **Facilitate access to verified professional data** - Employers pay HRK to query candidate references and employment verification
2. **Align economic incentives** - Stake-based quality assurance where evaluators (managers/colleagues) lock HRK to participate in the Proof-of-Feedback system
3. **Prevent fraud and enforce quality** - Economic penalties (slashing) for low-quality or fraudulent references
4. **Distribute protocol value** - Revenue sharing mechanism for data creators, evaluators, and protocol treasury

### What HRK Is NOT For

Based on current implementation:

- **Not explicitly a security token** - Documentation avoids investment language and focuses on utility
- **Not a pure medium of exchange** - Cannot be used arbitrarily; tied to specific protocol functions (queries, staking, governance)
- **Not a store of value by design** - While deflationary mechanics exist, no explicit "hold to appreciate" narrative in core documentation
- **Not a data pricing unit** - Though used for payments, the token itself doesn't determine intrinsic data value (see ambiguities in Section 7)

---

## 2. Current and Intended Utilities of HRK

### Implemented Utilities (On-Chain)

#### A. Query Payment Medium
- **Function**: Employers pay HRK to access verified reference data
- **Implementation**: `HRKPriceOracle.sol::queryCandidate()`
- **Pricing**: Dynamic (5-500 HRK per query) based on candidate attributes
- **Status**: ✅ Fully implemented in smart contracts

#### B. Evaluator Staking Collateral
- **Function**: Managers/colleagues stake HRK to submit references
- **Implementation**: `HRKStaking.sol` with 4-tier system (Bronze: 100 HRK, Silver: 500 HRK, Gold: 2,000 HRK, Platinum: 10,000 HRK)
- **Purpose**: Economic bond ensuring quality feedback
- **Status**: ✅ Fully implemented

#### C. Staking Rewards Distribution
- **Function**: Stakers earn yield from protocol revenue
- **Base APY**: 5-15% depending on tier
- **Max APY**: Up to 90% with quality/volume/lockup multipliers
- **Reward Sources**:
  - 60% of token transfer fees (2.5% fee → 1.5% to treasury → 50% to stakers)
  - 20% of query revenue
  - 50% of slashed penalties
- **Status**: ✅ Fully implemented

#### D. Fraud Prevention (Slashing Collateral)
- **Function**: Staked HRK can be slashed for violations
- **Tiers**: 10% (Minor), 30% (Moderate), 60% (Major), 100% (Fraud)
- **Implementation**: `HRKSlashing.sol` with appeals process
- **Status**: ✅ Fully implemented

#### E. Transaction Fee Token
- **Function**: 2.5% fee on all HRK transfers (max 5%)
- **Distribution**: 40% burned, 60% to treasury
- **Exemptions**: Staking contract, treasury, burn address
- **Status**: ✅ Implemented in `HRKToken.sol`

### Intended But Not Yet Implemented

#### F. Governance Voting
- **Function**: Vote on protocol parameters, treasury allocations, constitutional changes
- **Voting Power Formula**: `staked_HRK × sqrt(stake_duration_days)`
- **Proposal Types**: Constitutional, Technical, Treasury, Emergency
- **Status**: ⏳ Planned for Q4 2025 (not in codebase)
- **Contract**: `HRKGovernance.sol` (not found)

#### G. Employer Volume Discounts
- **Function**: Stake HRK to receive discounts on query pricing
- **Tiers**:
  - 1,000 HRK → 5% discount
  - 5,000 HRK → 10% discount
  - 20,000 HRK → 20% discount
  - 100,000 HRK → 30% discount
  - 500,000+ HRK → 40% discount
- **Status**: ⏳ Documented but not implemented in contracts

#### H. Premium Access Subscriptions
- **Analytics Dashboard**: 500 HRK/month
- **API Access**: 2,000 HRK/month
- **White-label Solutions**: Custom pricing
- **Status**: ⏳ Conceptual (not implemented)

### Utilities Outside Core Token Mechanics

#### I. Revenue Sharing (Parallel System)
- **Implementation**: `HRKeyRevenueShare.sol`
- **Payment Token**: USDC (not HRK)
- **Split**: 40% platform, 40% data owner, 20% reference creator
- **Relationship to HRK**: Unclear; operates independently
- **Status**: ✅ Implemented but economically separate

---

## 3. How HRK Enters Circulation

### Fixed Total Supply
- **Maximum Supply**: 1,000,000,000 HRK (hard-coded constant)
- **Minting**: Limited to total supply cap; no infinite minting

### Initial Distribution Allocation

| Allocation | Amount | % | Vesting | Purpose |
|-----------|--------|---|---------|---------|
| **Ecosystem Incentives** | 350M | 35% | 48 months linear | Proof-of-Feedback rewards |
| **Community Treasury** | 200M | 20% | DAO-controlled | Development, grants |
| **Team & Advisors** | 150M | 15% | 48M linear, 12M cliff | Team alignment |
| **Early Evaluators** | 100M | 10% | 24M linear, 6M cliff | Retroactive airdrop |
| **Liquidity Provision** | 80M | 8% | Immediate, locked 12M | DEX pools (Uniswap V3) |
| **Private Sale** | 70M | 7% | 18M linear, 6M cliff | VC funding |
| **Public Sale (TGE)** | 30M | 3% | Immediate | Launch (CoinList/Base) |
| **Grant Programs** | 20M | 2% | 36 months linear | Developer grants |

### Circulation Timeline
```
TGE (Month 0):     110M HRK (11%)
Month 6:           150M HRK
Month 12:          260M HRK (26%)
Month 24:          450M HRK (45%)
Month 48:          1,000M HRK (100%)
```

### How Users Acquire HRK

#### Primary Market (Initial)
1. **Public Sale**: TGE launch (30M HRK, 3%)
2. **Airdrops**: Early evaluators (100M HRK over 24 months)
3. **Grants**: Developers/researchers (20M HRK over 36 months)

#### Secondary Market (Ongoing)
1. **DEX Trading**: Uniswap V3 on Base (80M HRK liquidity)
2. **CEX Listing**: Planned (Coinbase, Binance mentioned in docs)

#### Earning HRK (Protocol Activity)
1. **Staking Rewards**: 5-90% APY for evaluators
2. **Query Revenue**: 20% of query fees split among evaluators
3. **Data Sales**: 40% of query price goes to candidate
4. **Slash Redistribution**: 50% of slashed stakes to honest evaluators

### Minting Controls

**Smart Contract Implementation**:
```solidity
// HRKToken.sol
uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;

function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
    require(totalSupply() + amount <= TOTAL_SUPPLY, "Cap exceeded");
    _mint(to, amount);
}
```

**Role Assignment**:
- `MINTER_ROLE`: Assigned to HRKStaking contract for rewards
- Governance can reassign (via `UPGRADER_ROLE`)

---

## 4. How HRK Leaves Circulation

### Burn Mechanisms (Deflationary)

#### A. Transaction Fee Burns
- **Rate**: 1% of all HRK transfers (40% of 2.5% fee)
- **Implementation**: `HRKToken.sol::_update()` hook
- **Destination**: `0x000000000000000000000000000000000000dEaD`
- **Projected Annual Burn**: ~2M HRK in Year 1 (assuming 200M HRK transfer volume)

#### B. Slash Penalty Burns
- **Rate**: 50% of all slashed stakes
- **Implementation**: `HRKSlashing.sol::executeSlash()`
- **Trigger**: Fraud, collusion, low correlation scores
- **Projected Annual Burn**: ~250K HRK (0.5% slash rate on 100M staked)

#### C. High-Demand Profile Burns (Documented, Not Implemented)
- **Trigger**: Profiles with 100+ queries/month
- **Rate**: Additional 5% burn on query fees
- **Status**: ⏳ Mentioned in whitepaper, not in contracts

#### D. Emergency Unstake Penalties
- **Rate**: 50% of staked amount for instant unstake
- **Distribution**: 50% burned, 50% to rewards pool
- **Implementation**: `HRKStaking.sol::emergencyUnstake()`

### 5-Year Burn Projection (From Whitepaper)
```
Year 1:   2M HRK burned
Year 2:   12.5M burned (cumulative: 14.5M, 1.45%)
Year 3:   45M burned (cumulative: 59.5M, 5.95%)
Year 4:   105M burned (cumulative: 164.5M, 16.45%)
Year 5:   200M burned (cumulative: 364.5M, 36.45%)

Effective Supply (Year 5): 635.5M HRK
```

### Non-Burn Token Sinks (Locked, Not Destroyed)

#### E. Staking Lockups
- **Current Locked**: Unknown (not tracked in static analysis)
- **Mechanism**: Tokens locked in `HRKStaking.sol`
- **Duration**: 1-48 months per stake
- **Withdrawal**: Subject to cooldown periods (7-90 days)
- **Impact**: Reduces circulating supply temporarily

#### F. Liquidity Pool Locks
- **Amount**: 80M HRK (8% of supply)
- **Lock Period**: 12 months minimum
- **Platform**: Uniswap V3 (HRK/ETH, HRK/USDC pairs)
- **Unlock**: Gradual, DAO-controlled

#### G. Vesting Contracts
- **Team/Advisors**: 150M HRK (48-month linear)
- **Early Evaluators**: 100M HRK (24-month linear)
- **Private Sale**: 70M HRK (18-month linear)
- **Implementation**: Not visible in codebase (assumed TimelockController)

---

## 5. Value Capture Design: Protocol vs. Data vs. Access

### Critical Ambiguity: Dual Economic Models

The current design **mixes two distinct economic systems**:

#### Model A: HRK as Protocol Utility Token
- **Value Proposition**: HRK captures protocol activity (queries, staking, governance)
- **Revenue Flows**: Query fees → 40% treasury, 20% evaluators (in HRK)
- **Staking Yield**: Funded by protocol fees (in HRK)
- **Token Demand**: Driven by need to access protocol services

#### Model B: Data Marketplace with Fiat Settlement
- **Value Proposition**: Data has intrinsic USD value ($5-$250 per query)
- **Revenue Flows**: Query fees → 40% platform, 40% data owner, 20% evaluator (in USDC)
- **Implementation**: `HRKeyRevenueShare.sol` (operates independently)
- **Token Demand**: None (can bypass HRK entirely with USDC payments)

### Current State: Hybrid Without Clear Separation

#### What HRK Captures

**1. Protocol Value (Implemented)**
- **Transaction fees**: 2.5% of all HRK transfers → 60% to treasury
- **Query fees**: 40% of HRK-denominated queries → treasury
- **Governance rights**: Control over protocol parameters (planned)

**2. Data Value (Partially)**
- **Query pricing**: Dynamic HRK pricing (5-500 HRK) based on data attributes
- **Revenue share**: 40% of query fees to candidate, 20% to evaluators
- **Problem**: Pricing formula (`P = 5 HRK × multipliers`) conflates:
  - Market value of data (should be in USD or market-determined)
  - Protocol access cost (metering/spam prevention)

**3. Network Effects (Indirect)**
- **Staking requirement**: Creates artificial demand (must hold to participate)
- **Discount tiers**: Incentivizes HRK accumulation by employers
- **Burn deflation**: Scarcity model implies value appreciation

### What HRK Does NOT Capture

**1. Off-Chain Revenue**
- USDC payments in `HRKeyRevenueShare.sol` don't flow through HRK
- Platform's 40% share accumulates in fiat, not HRK
- No mechanism to buy back HRK with USD revenue

**2. Data Network Effects**
- More users/data doesn't directly increase HRK demand
- Data value scales independently of token price
- Quality improvements don't require more HRK

**3. Competitor-Resistant Moat**
- Nothing prevents fork with different token economics
- Data portability (references are user-owned) limits lock-in

---

## 6. Price Appreciation Assumptions

### Explicit Price Appreciation Mechanisms

#### A. Deflationary Burn Model
**Assumption**: Reducing supply while demand grows → price increase

**Implementation**:
- 40% of transfer fees burned
- 50% of slashed stakes burned
- Projected 36.5% supply reduction in 5 years

**Implication**: Design assumes scarcity creates value

#### B. Valuation Targets (From Executive Summary)

| Scenario | FDV | Price/HRK | Year 3 Assumption |
|----------|-----|-----------|-------------------|
| **Conservative** | $500M | $0.50 | 0.5x Arweave comparables |
| **Base Case** | $2B | $2.00 | 2.2x protocol revenue |
| **Bull Case** | $5B | $5.00 | 0.6x Helium comparables |

**Quote from EXECUTIVE_SUMMARY.md**:
> "With protocol revenue scaling to $2.25B by Year 3, a conservative 2.2x revenue multiple yields a $5B FDV at a $5 HRK price."

**Interpretation**: Explicitly models token price appreciation based on revenue multiples.

#### C. Staking Yield as Investment Return
**APY Structure**: 5-90% annual returns

**Game Theory Framing** (from whitepaper):
> "Honest Evaluator (1 year): 2,440 HRK earned
> Fraudulent Evaluator EV: -693 HRK"

**Assumption**: High yields attract rational economic actors seeking returns.

#### D. Employer Discount Tiers
**Structure**: Hold 500K+ HRK → 40% discount on queries

**Economic Effect**:
- Large employers incentivized to buy and hold HRK
- Creates price floor from institutional demand
- Discount value scales with query volume (more queries = higher HRK value)

### Implicit Price Appreciation Signals

#### E. "Investment" Framing in Documentation
Despite claiming utility focus, language includes:
- "Valuation targets" and "FDV projections"
- Comparisons to Arweave, Helium (investor comps)
- "5-year ROI analysis" for early participants
- "Treasury diversification into BTC/ETH" (value preservation)

#### F. Liquidity Pool Strategy
- 8% of supply (80M HRK) allocated to DEX pools
- Implies expectation of trading volume
- Price discovery mechanism assumes speculative interest

#### G. CEX Listing Roadmap
**Targets**: Coinbase, Binance (per whitepaper)

**Implication**: Anticipates retail speculation and price volatility.

### Areas Where Design Does NOT Assume Appreciation

#### H. Query Pricing Bounds
- **Fixed Range**: 5-500 HRK (100x spread)
- **USD Equivalent**: Assumes stable HRK/USD ratio ($0.005 - $0.50 per HRK implied)
- **Problem**: If HRK appreciates to $5, queries would cost $25-$2,500 (broken UX)

**Mitigation**: Not addressed in current design (oracle could adjust bounds, but not implemented)

#### I. Staking Minimums
- Bronze tier: 100 HRK (~$100-$500 at target prices)
- **No dynamic adjustment**: If HRK reaches $50, Bronze = $5,000 stake (inaccessible)

**Interpretation**: Design assumes relatively stable or capped appreciation.

### Contradictory Signals

**Conservative Claim** (from whitepaper):
> "HRK is not a security. It is a utility token for accessing decentralized labor verification."

**Aggressive Reality**:
- Revenue multiples used for valuation
- Burn mechanics marketed as "deflationary premium"
- Staking yields framed as "passive income"

**Conclusion**: Design implicitly assumes and encourages price appreciation, despite nominal utility-only positioning.

---

## 7. Areas Where Tokenomics and Data Economics Are Mixed

### Critical Design Ambiguities

#### Ambiguity 1: HRK-Denominated Data Pricing

**Current State**:
```solidity
// HRKPriceOracle.sol
uint256 public constant P_MIN = 5 * 10**18;      // 5 HRK
uint256 public constant P_MAX = 500 * 10**18;    // 500 HRK

function calculatePrice(Candidate candidate) returns (uint256 priceHRK) {
    uint256 basePrice = 5 * 10**18;
    uint256 multiplier = calculateMultipliers(candidate); // 1x to 20x
    return basePrice * multiplier; // Result in HRK
}
```

**Problems**:
1. **Data value expressed in volatile token**: If HRK price doubles, data costs double in USD terms
2. **Circular dependency**: Token price affects data affordability, which affects protocol usage, which affects token demand
3. **No USD anchor**: Unlike stablecoins, HRK price floats freely

**Example Scenario**:
- Year 1: HRK = $0.10 → Senior engineer query = 50 HRK = $5 ✅
- Year 3: HRK = $5.00 → Senior engineer query = 50 HRK = $250 ❌ (too expensive)
- Mitigation: Oracle could adjust base price from 5 HRK to 0.1 HRK, but no automatic mechanism exists

#### Ambiguity 2: Dual Revenue Systems

**System A: HRK-Based Queries** (`HRKPriceOracle.sol`)
```solidity
queryCandidate(candidate, priceHRK, merkleProof) {
    // Employer pays in HRK
    HRK.transferFrom(employer, address(this), priceHRK);

    // Distribute: 40% candidate, 40% treasury, 20% evaluators (all HRK)
    distributeRevenue(candidate, evaluators, priceHRK);
}
```

**System B: USDC-Based Access** (`HRKeyRevenueShare.sol`)
```solidity
distributePayment(requestId, profileOwner, refCreator, USDC, totalAmount) {
    // Employer pays in USDC
    USDC.transferFrom(employer, address(this), totalAmount);

    // Distribute: 40% owner, 40% platform, 20% creator (all USDC)
}
```

**Unresolved Questions**:
1. When does System A apply vs. System B?
2. Can employers choose payment method?
3. If USDC is accepted, why require HRK at all?
4. Do prices sync between systems? (50 HRK query = $5 USDC equivalent?)

#### Ambiguity 3: Staking Requirements for Evaluators

**Current Design**: Evaluators must stake HRK to submit references

**Token Utility or Data Quality Mechanism?**
- **Argument A (Utility)**: Staking creates HRK demand → token value capture ✅
- **Argument B (Quality)**: Economic bond prevents fraud → data quality ✅
- **Argument C (Mixed)**: Could use USDC stake + HRK for rewards (separates concerns)

**Problem**: If HRK price crashes (e.g., $0.01), 100 HRK stake = $1 → insufficient fraud deterrent

**Current Mitigation**: None (stake amounts are fixed in HRK, not USD-equivalent)

#### Ambiguity 4: Query Revenue as Staking Yield

**Flow**:
```
Employer pays 100 HRK for query
 ├─> 40 HRK to candidate (data owner)
 ├─> 40 HRK to treasury
 └─> 20 HRK to evaluators (split among stakers)
```

**Economic Interpretation**:
- **Data marketplace view**: Evaluators earn for creating valuable references (labor payment)
- **Staking yield view**: Evaluators earn passive income on locked capital (investment return)

**Blurred Line**: Is 20% evaluator share:
- Compensation for work (creating reference)?
- Yield on stake (capital allocation)?
- Both?

**Implication**: If both, then HRK tokenomics subsidizes data production costs (not neutral utility token)

#### Ambiguity 5: Treasury Revenue Allocation

**Inflows to Treasury** (40% of query fees):
- Year 1: $40M (projected)
- Year 5: $4B (projected)

**Whitepaper Plan**:
> "Treasury will diversify 30% into BTC, 30% into ETH, 40% remain HRK"

**Questions**:
1. Does treasury sell HRK for BTC/ETH (selling pressure)?
2. Is treasury revenue meant to fund development or return to HRK holders?
3. If DAO-controlled, could voters distribute to themselves (value extraction)?

**Current State**: Treasury management not implemented (no contracts for diversification)

---

## 8. Open Design Questions and Incomplete Areas

### Category A: Unimplemented Core Features

#### 1. Governance Mechanism
- **Status**: Documented (16-page governance section in whitepaper), not coded
- **Missing**: `HRKGovernance.sol`, voting contracts, proposal execution
- **Critical Gap**: Who controls ORACLE_ROLE, UPGRADER_ROLE, treasury allocation today?
- **Interim Solution**: Presumed multisig (not documented)

#### 2. Employer Discount System
- **Status**: Documented (500K HRK → 40% discount), not in contracts
- **Missing**: Discount verification logic in `HRKPriceOracle.sol`
- **Impact**: Reduces large-holder incentive until implemented

#### 3. Cross-Chain Bridge (Solana)
- **Status**: Planned Q4 2025 (Wormhole NTT), not started
- **Missing**: Bridge contracts, rate limits, Guardian network
- **Risk**: Two-token supply (HRK on Base + SPL on Solana) complicates burns/minting

#### 4. Premium Subscriptions (Analytics, API)
- **Status**: Conceptual only
- **Missing**: Subscription contracts, payment logic, access control
- **Question**: Would these be HRK-denominated or fiat (same pricing ambiguity as queries)?

### Category B: Economic Parameter Gaps

#### 5. HRK Price Volatility Handling
- **Problem**: All pricing in HRK, but no HRK/USD stability mechanism
- **Current Band**: 5-500 HRK per query (100x range)
- **If HRK = $0.01**: Query costs $0.05-$5 (too cheap, not sustainable)
- **If HRK = $100**: Query costs $500-$50,000 (too expensive, unusable)
- **Missing**: Dynamic base price adjustment, USD-denominated option, or stablecoin integration

#### 6. Reward Pool Sustainability
- **Staking Yield Sources**:
  1. Transfer fees: 60% → treasury → 50% → stakers
  2. Query fees: 40% → treasury → ??? → stakers
  3. Slash redistribution: 50% → slash pool → stakers
- **Question**: At 90% max APY, if 50% of supply is staked (500M HRK), annual rewards = 450M HRK
- **Math**: Need 450M HRK/year in protocol revenue to sustain
- **Year 1 Projection**: 200M HRK query volume → insufficient
- **Missing**: Reward pool depletion model, APY adjustment mechanism, treasury backstop commitment

#### 7. Slash Oracle Governance
- **Current**: ORACLE_ROLE can propose slashes (3/5 multisig assumed)
- **Missing**:
  - Oracle selection process
  - Oracle incentives (paid in HRK? How much?)
  - Oracle slashing (who polices the police?)
  - Dispute resolution beyond appeals (if DAO vote ties?)

#### 8. Liquidity Bootstrapping
- **Allocation**: 80M HRK (8%) to Uniswap V3
- **Missing**:
  - Initial HRK/ETH ratio (launch price)
  - LP range parameters (concentrated liquidity bounds)
  - Fee tier (0.05%, 0.3%, 1%?)
  - Rebalancing strategy if price moves

### Category C: Regulatory and Compliance Gaps

#### 9. Securities Law Classification
- **Claim**: "HRK is a utility token, not a security"
- **Howey Test Risks**:
  - ✅ Investment of money (users buy HRK)
  - ✅ Common enterprise (HRKey protocol)
  - ✅ Expectation of profit (staking yields, valuation targets)
  - ✅ Efforts of others (team builds protocol)
- **Missing**: Legal opinion, compliance framework, jurisdictional analysis
- **Risk**: If deemed security, retroactive enforcement, delisting, founder liability

#### 10. GDPR Right to Deletion
- **Current**: Suppress references (sets `status = Suppressed`), but data remains on-chain
- **Problem**: Immutable blockchain conflicts with GDPR Article 17 (right to be forgotten)
- **Mitigation**: Only hashes on-chain, PII in Supabase (deletable)
- **Gap**: If employer already paid HRK and downloaded data, how to force deletion?

#### 11. FCRA Compliance (US Employment Screening)
- **Requirement**: Candidates must consent to background checks
- **Implementation**: Consent flow in frontend (not verified in contracts)
- **Gap**: No on-chain proof of consent (oracle could query unconsented data)
- **Risk**: FCRA violations carry $1,000/violation + class action exposure

### Category D: Market and Competitive Risks

#### 12. Oracle Centralization
- **Dependency**: Off-chain pricing engine calculates all multipliers
- **Current**: TypeScript service (not decentralized)
- **Risks**:
  - Single point of failure
  - Manipulation (oracle could inflate prices)
  - Censorship (oracle could blacklist candidates)
- **Missing**: Decentralized oracle network (Chainlink alternative), multi-source verification

#### 13. Query Price Discovery
- **Current**: Prices set by formula (6 multipliers × base price)
- **Alternative**: Market-based (candidates set ask, employers bid)
- **Gap**: No mechanism to discover true market-clearing price
- **Risk**: Formula may overprice (low queries) or underprice (data dumping)

#### 14. Competitor Bypass
- **Scenario**: Company builds identical protocol, accepts USDC only, 50% cheaper fees
- **HRKey Lock-In**:
  - References are portable (user owns data)
  - Evaluators can migrate stakes (just unstake)
  - Employers have no switching cost
- **Missing**: Network effects beyond first-mover advantage, data exclusivity, patent moat

#### 15. HRK Token Unnecessary Thesis
- **Observation**: `HRKeyRevenueShare.sol` proves system works with USDC
- **Question**: Why not just use USDC for everything?
  - Eliminate HRK price volatility
  - Remove token launch regulatory risk
  - Simplify UX (no HRK acquisition step)
- **Counter**: HRK enables:
  - Governance decentralization
  - Value capture for early adopters
  - Permissionless participation (no KYC for HRK)
- **Gap**: No explicit justification for why HRK is necessary vs. USDC + governance NFT

### Category E: Technical and Operational Gaps

#### 16. Smart Contract Audits
- **Whitepaper Claim**: "$500K bug bounty + 3 audits (Trail of Bits, OpenZeppelin, Consensys)"
- **Current Status**: No audit reports found in repository
- **Risk**: Unaudited contracts managing millions of dollars

#### 17. Test Coverage
- **Current**: No test files found in `/contracts` or `/test` directories
- **Missing**:
  - Unit tests for staking/slashing logic
  - Integration tests for query flows
  - Fuzz testing for economic exploits
  - Formal verification (Certora)

#### 18. Upgrade Governance
- **Pattern**: UUPS (upgradeable contracts)
- **Risk**: UPGRADER_ROLE can change any contract logic
- **Missing**:
  - Timelock delay (24-48 hour warning before upgrade)
  - Multi-stage upgrade (testnet → mainnet)
  - Emergency pause vs. upgrade separation

#### 19. Treasury Multisig
- **Whitepaper**: "67% supermajority for treasury actions"
- **Implementation**: Not visible (Safe multisig? Gnosis?)
- **Signers**: Not disclosed
- **Threshold**: Not specified (3/5? 5/7? 7/9?)

#### 20. Oracle Update Frequency
- **Price Oracle**: Updates every 6 hours (hard-coded)
- **Question**: Is 6 hours too slow during market volatility?
- **Example**: HRK crashes 50% in 3 hours → queries still priced at old rate → employer overpays
- **Missing**: Dynamic update trigger (price deviation threshold)

---

## Summary: Current Tokenomics State

### Strengths (What Works)

1. **Comprehensive smart contract suite** - Core mechanics (staking, slashing, pricing) fully implemented
2. **Multi-layered utility** - HRK has 5+ distinct use cases (payments, staking, governance, discounts, yields)
3. **Economic security model** - Slashing + staking aligns incentives against fraud
4. **Deflationary mechanics** - Multiple burn sinks reduce long-term supply
5. **Revenue generation** - Clear flows from queries → candidates/evaluators/treasury

### Weaknesses (What's Broken or Missing)

1. **Token-data pricing conflation** - HRK volatility directly impacts data costs (breaks UX at price extremes)
2. **Dual economic systems** - HRK and USDC systems coexist without clear separation or conversion logic
3. **Unimplemented governance** - Critical features (DAO, discounts, cross-chain) documented but not coded
4. **Reward pool sustainability unclear** - 90% APY requires massive query volume; no fallback if adoption lags
5. **Regulatory ambiguity** - Utility token claims conflict with yield/appreciation framing
6. **Centralization risks** - Oracle, multisig, upgrade authority not decentralized
7. **No audits or tests** - Production-ready code missing quality assurance

### Critical Contradictions

| Design Element | Utility Token Interpretation | Investment Token Interpretation |
|----------------|------------------------------|--------------------------------|
| **Deflationary burns** | Spam prevention | Supply shock → price pump |
| **Staking yields** | Evaluator compensation | Passive income investment |
| **Valuation targets** | N/A (utility has no FDV) | $5B target = speculative asset |
| **Query pricing in HRK** | Access metering | Token demand driver |
| **Governance rights** | Coordination tool | Security (equity-like voting) |

**Conclusion**: The current design **simultaneously optimizes for utility (access control) and value capture (investment returns)**, creating internal tension that may require resolution to avoid regulatory classification as a security or UX breakdown from price volatility.

---

## Appendix: Key Metrics Snapshot

### On-Chain Contracts (Implemented)
- ✅ HRKToken.sol (ERC-20, 1B supply, 2.5% tx fee)
- ✅ HRKStaking.sol (4 tiers, 5-90% APY)
- ✅ HRKSlashing.sol (10-100% penalties, appeals)
- ✅ HRKPriceOracle.sol (dynamic 5-500 HRK pricing)
- ✅ HRKeyRevenueShare.sol (USDC splits: 40/40/20)
- ✅ PeerProofRegistry.sol (reference immutability)

### Off-Chain Components
- ✅ Pricing engine (TypeScript, 6-multiplier formula)
- ✅ Supabase backend (PostgreSQL, 5 new tables)
- ✅ API endpoints (9 endpoints for revenue ledger)
- ⏳ DAO governance UI (not implemented)
- ⏳ Merkle tree generator (documented, unclear if built)

### Documentation Completeness
- ✅ Whitepaper (2,266 lines, comprehensive)
- ✅ Executive Summary (400 lines, investor-focused)
- ✅ Dynamic Pricing Spec (1,209 lines, technical)
- ✅ Revenue Sharing Spec (976 lines, bilingual)
- ❌ Audit reports (missing)
- ❌ Legal opinion (missing)
- ❌ Economic simulations (missing)

### Economic Assumptions (Year 3 Projections)
- Queries: 150M/year
- Avg price: 30 HRK ($3 USD implied)
- Gross revenue: $2.25B
- HRK price: $2-$5 (base to bull case)
- Tokens burned: 59.5M (5.95% of supply)
- Total staked: ~300M HRK (30% of supply, assumed)

---

**Document Status**: ✅ Complete
**Last Updated**: January 15, 2026
**Codebase Analyzed**: `/home/user/HRkey-App` (commit 15c9e46)
**Purpose**: Faithful description of existing tokenomics for comparative analysis against refined designs
