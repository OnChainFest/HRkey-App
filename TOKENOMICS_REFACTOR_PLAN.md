# HRKey Tokenomics Refactoring Plan

## Executive Summary

**Goal:** Separate marketplace pricing (USDC) from protocol utility token (HRK), removing all investment-like mechanics (yield, revenue share, price targets) and implementing bonded participation staking.

**Core Principles:**
1. HRK = Utility token for participation rights/capacity (NOT pricing currency)
2. Marketplace = USDC-denominated pricing for all access/queries
3. Staking = Bonded participation (lock for permissions), NO yield
4. Slashing = Enforcement via burns ONLY, NO redistribution to holders
5. Burns = Operational only (slashing, spam prevention), NOT deflationary rewards

---

## Phase 1: REMOVE (Priority 1)

### 1.1 Smart Contracts to REMOVE/DEPRECATE

#### ❌ HRKPriceOracle.sol (DELETE)
- **Location:** `/home/user/HRkey-App/contracts/HRKPriceOracle.sol`
- **Reason:** Uses HRK as pricing currency for queries (5-500 HRK range)
- **Replacement:** Direct USDC pricing via marketplace logic
- **Dependencies to update:**
  - `scripts/deploy-base.ts` - Remove oracle deployment
  - `backend/pricing/priceOracle.ts` - Deprecate Merkle tree generation
  - Tests referencing HRKPriceOracle

#### ❌ HRKStaking.sol (REPLACE)
- **Location:** `/home/user/HRkey-App/contracts/HRKStaking.sol`
- **Problems:**
  - 4-tier system with APY rewards (5-15% base rates)
  - `calculatePendingRewards()` generates passive yield
  - Quality/volume/lockup multipliers tied to rewards
  - `claimRewards()` distributes HRK to stakers
- **Replacement:** New `HRKBondedStaking.sol` with:
  - NO APY, NO rewards
  - Stake to unlock capacity/permissions
  - Unbonding period (e.g., 7 days)
  - Slashing for misbehavior
  - Role-based access control

### 1.2 Backend Services to MODIFY/REMOVE

#### 🔄 pricingEngine.ts (MODIFY)
- **Location:** `/home/user/HRkey-App/backend/pricing/pricingEngine.ts`
- **Current:** Calculates price in HRK (P_BASE=5, P_MIN=5, P_MAX=500 HRK)
- **Change:** Output price in USDC directly
  - Remove HRK constants
  - Set new bounds: P_BASE=$25, P_MIN=$10, P_MAX=$1000 USDC
  - Remove FX rate conversion logic

#### ❌ priceOracle.ts (DEPRECATE)
- **Location:** `/home/user/HRkey-App/backend/pricing/priceOracle.ts`
- **Reason:** Merkle tree generation for HRKPriceOracle.sol (no longer needed)
- **Action:** Archive or remove file

#### 🔄 tokenomicsPreview.service.js (MODIFY)
- **Location:** `/home/user/HRkey-App/backend/services/tokenomicsPreview.service.js`
- **Current:** Shows HRK-based pricing and staking APR estimates
- **Change:**
  - Remove `fxRate` (USD→HRK conversion)
  - Remove `baseStakingApr` calculation
  - Update preview to show:
    - USDC price for access
    - Staking capacity unlocked (not rewards)
    - Revenue split (USDC-based)

#### 🔄 tokenomicsPreparation.service.js (MODIFY)
- **Location:** `/home/user/HRkey-App/backend/services/tokenomicsPreparation.service.js`
- **Remove:**
  - `calculateTokenAmount()` - No HRK conversion needed
  - `estimateStakingRewards()` - No staking rewards
- **Keep:**
  - `splitRevenue()` - Still needed for USDC revenue split

### 1.3 Documentation to UPDATE

#### 📝 Update/Archive:
1. `docs/tokenomics/EXECUTIVE_SUMMARY.md` - Remove TGE price, FDV, "adoption→appreciation" language
2. `docs/tokenomics/HRK_TOKENOMICS_WHITEPAPER.md` - Archive old model, replace with new design
3. `docs/tokenomics/DYNAMIC_PRICING_SPEC.md` - Update to USDC pricing
4. `docs/DATA_ACCESS_REVENUE_SHARING.md` - Verify USDC-only, no HRK holder distribution

---

## Phase 2: KEEP & MODIFY

### 2.1 Smart Contracts to KEEP

#### ✅ HRKToken.sol (MODIFY)
- **Keep:** Base ERC20 functionality, burnable, pausable
- **Modify:**
  - Keep transaction fee mechanism (optional anti-spam)
  - Change fee distribution:
    - Current: 40% burn, 60% treasury
    - New: 100% burn OR 100% treasury (no holder distribution)
  - Remove any language suggesting "deflationary rewards"
  - Keep supply cap (1B HRK)

#### ✅ HRKeyRevenueShare.sol (MODIFY)
- **Keep:** Core payment distribution logic
- **Verify:**
  - Only distributes USDC (not HRK)
  - No distribution to HRK holders as a class
  - 40/40/20 split goes to: platform, data owner, reference creator (NOT token holders)
- **Modify if needed:**
  - Ensure no logic ties HRK balance to revenue entitlement

#### ✅ HRKSlashing.sol (MODIFY)
- **Keep:** 4-tier slashing system, appeal mechanism
- **Modify:**
  - Current: 50% burned, 50% redistributed to stakers
  - New: 100% burned OR sent to treasury (NO redistribution)
  - Update `executeSlash()` function:
    ```solidity
    // OLD: 50/50 split
    // NEW: burn all slashed tokens
    hrk.burn(slashAmount);
    ```
  - Keep appeal mechanism unchanged

#### ✅ PeerProofRegistry.sol (KEEP AS-IS)
- **No changes needed** - Reference registry unrelated to tokenomics

### 2.2 Backend Services to KEEP

#### ✅ revenueController.js (KEEP)
- Already tracks USDC revenue in ledger
- No changes needed if revenue is USDC-only

#### ✅ web3RevenueService.js (KEEP)
- Distributes USDC on-chain via HRKeyRevenueShare.sol
- No changes needed

#### ✅ dynamicPricing.service.js (VERIFY)
- Ensure output is USDC, not HRK
- Update if needed

---

## Phase 3: ADD (Priority 2)

### 3.1 New Smart Contract: HRKBondedStaking.sol

**Purpose:** Lock HRK to gain protocol capacity/permissions (NO yield)

**Features:**
```solidity
// State
struct Stake {
    uint256 amount;
    uint256 stakedAt;
    uint256 unstakeRequestedAt;
    bool isActive;
}

// Core functions
function stake(uint256 amount) external;
function initiateUnstake(uint256 amount) external;
function finalizeUnstake() external;

// Capacity checks
function getStakeAmount(address user) external view returns (uint256);
function hasMinimumStake(address user, uint256 required) external view returns (bool);

// Role gates (examples)
function canPerformEvaluation(address user) external view returns (bool);
function getRateLimit(address user) external view returns (uint256);
```

**Parameters:**
- Unbonding period: 7 days (configurable)
- Minimum stake tiers for capacity:
  - Basic: 100 HRK (10 queries/month)
  - Standard: 500 HRK (50 queries/month)
  - Premium: 2000 HRK (unlimited queries)
  - Enterprise: 10000 HRK (custom limits + evaluator role)

**Slashing Integration:**
- HRKSlashing.sol can call `slash(address user, uint256 amount)`
- Slashed tokens are burned immediately
- Cannot unstake while slash appeal is pending

**Invariants:**
```solidity
// Invariant 1: No rewards accrue to stakers
// Invariant 2: Unstaking requires unbonding period
// Invariant 3: Slashing burns tokens (no redistribution)
// Invariant 4: Stake amount determines capacity, not price
```

### 3.2 Backend Integration for Bonded Staking

#### New Middleware: `checkStakingCapacity.js`
- Verify user has minimum stake for operation
- Query HRKBondedStaking.sol for stake amount
- Return 403 if insufficient capacity

#### Update Routes:
- Data access requests: Check stake for rate limits
- Evaluation submissions: Require minimum stake (e.g., 500 HRK)
- Premium features: Gate behind higher stake tiers

### 3.3 Database Schema Updates

#### New Table: `staking_capacity_logs`
```sql
CREATE TABLE staking_capacity_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stake_amount NUMERIC(20, 0),
  capacity_tier TEXT, -- 'basic', 'standard', 'premium', 'enterprise'
  rate_limit INT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### New Table: `staking_events`
```sql
CREATE TABLE staking_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type TEXT, -- 'stake', 'unstake_initiated', 'unstake_finalized', 'slashed'
  amount NUMERIC(20, 0),
  tx_hash TEXT,
  block_number INT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 4: UPDATE Tests

### 4.1 Smart Contract Tests (Hardhat/Ethers)

#### New Test: `test/HRKBondedStaking.test.js`
```javascript
describe("HRKBondedStaking", () => {
  it("should allow staking without rewards");
  it("should enforce unbonding period");
  it("should prevent unstake during appeal");
  it("should burn slashed tokens");
  it("should update capacity based on stake amount");
  it("should revert early unstake attempts");
});
```

#### Update Test: `test/HRKSlashing.test.js`
```javascript
describe("HRKSlashing - Burn Only", () => {
  it("should burn 100% of slashed tokens");
  it("should NOT redistribute to stakers");
});
```

#### Remove Tests:
- Any tests for HRKPriceOracle.sol
- Staking reward calculation tests

### 4.2 Backend Tests

#### Update: `services/tokenomicsPreview.service.test.js`
```javascript
describe("Tokenomics Preview - USDC Model", () => {
  it("should return USDC price (not HRK)");
  it("should NOT include staking APY");
  it("should show capacity unlocked by staking");
});
```

#### Update: `integration/revenue.int.test.js`
```javascript
describe("Revenue Distribution", () => {
  it("should distribute in USDC only");
  it("should NOT involve HRK holders");
});
```

---

## Phase 5: Documentation & Migration

### 5.1 CHANGELOG.md

```markdown
# Tokenomics Refactoring - v2.0.0

## Breaking Changes

### Removed
- ❌ HRKPriceOracle.sol (HRK-based query pricing)
- ❌ HRKStaking.sol (APY/yield rewards)
- ❌ Staking rewards distribution
- ❌ HRK-to-USDC FX rate conversion logic

### Changed
- 🔄 All marketplace pricing now in USDC (was HRK)
- 🔄 Staking now bonded participation (was yield-generating)
- 🔄 Slashing burns 100% (was 50% burn, 50% redistribute)
- 🔄 Transaction fees: 100% burn (was 40% burn, 60% treasury)

### Added
- ✅ HRKBondedStaking.sol (capacity-based staking)
- ✅ Unbonding period (7 days)
- ✅ Stake-based rate limits and role gates
```

### 5.2 Migration Guide

```markdown
# Migration Guide: v1 → v2 Tokenomics

## For Users

**Old Model:**
- Stake HRK → Earn APY rewards
- Query pricing in HRK (5-500 HRK)

**New Model:**
- Stake HRK → Unlock capacity/permissions
- Query pricing in USDC ($10-$1000)
- No passive rewards

**Action Required:**
1. Existing stakers: Claims rewards before migration
2. Re-stake in new HRKBondedStaking contract
3. Unbonding period applies to all new unstake requests

## For Developers

**Deprecated APIs:**
- `GET /api/candidates/:userId/tokenomics-preview` (old format)
- `calculateTokenAmount()` service function
- `estimateStakingRewards()` service function

**New APIs:**
- `GET /api/staking/capacity` - Check user capacity tier
- `POST /api/staking/check-eligibility` - Verify role eligibility
```

### 5.3 Updated Docs

#### New File: `docs/tokenomics/BONDED_STAKING_SPEC.md`
- Detailed specification of bonded participation model
- Capacity tiers and rate limits
- Slashing conditions
- Unbonding mechanics

#### Update: `docs/tokenomics/EXECUTIVE_SUMMARY.md`
- Remove TGE price, FDV targets
- Add "HRK is NOT a security" disclaimer
- Emphasize utility-only nature

---

## Implementation Order

1. ✅ **Create plan** (this document)
2. 🔄 **Remove HRK pricing logic**
   - Delete HRKPriceOracle.sol
   - Update pricingEngine.ts to USDC
   - Remove oracle deployment from scripts
3. 🔄 **Implement HRKBondedStaking.sol**
   - Write contract with tests
   - Deploy script
4. 🔄 **Modify HRKSlashing.sol**
   - Change to 100% burn
   - Update tests
5. 🔄 **Update backend services**
   - Remove HRK conversion logic
   - Add capacity check middleware
6. 🔄 **Update tests**
   - Remove reward tests
   - Add capacity tests
7. 🔄 **Documentation**
   - Write CHANGELOG
   - Update whitepaper
8. 🔄 **Final validation**
   - Run full test suite
   - Security audit checklist

---

## Risk Mitigation

### Breaking Changes
- **Risk:** Existing stakers lose rewards
- **Mitigation:** Migration period with reward claims enabled

### Contract Upgrades
- **Risk:** UUPS proxy upgrade failures
- **Mitigation:** Deploy new contracts alongside old, gradual migration

### Data Integrity
- **Risk:** Revenue ledger inconsistencies during migration
- **Mitigation:** Freeze period for ledger reconciliation

---

## Success Criteria

1. ✅ Zero HRK-based pricing in any contract or service
2. ✅ Zero passive yield mechanisms
3. ✅ Zero revenue distribution to HRK holders as a class
4. ✅ All tests passing
5. ✅ Slashing burns 100% (no redistribution)
6. ✅ Staking is bonded participation only
7. ✅ Documentation clearly states "HRK is NOT an investment"

---

## Files Manifest

### DELETE
- `contracts/HRKPriceOracle.sol`
- `contracts/HRKStaking.sol`
- `backend/pricing/priceOracle.ts`

### CREATE
- `contracts/HRKBondedStaking.sol`
- `test/HRKBondedStaking.test.js`
- `docs/tokenomics/BONDED_STAKING_SPEC.md`
- `TOKENOMICS_CHANGELOG.md`

### MODIFY
- `contracts/HRKToken.sol` (fee distribution)
- `contracts/HRKSlashing.sol` (burn only)
- `contracts/HRKeyRevenueShare.sol` (verify USDC-only)
- `backend/pricing/pricingEngine.ts` (USDC output)
- `backend/services/tokenomicsPreview.service.js` (remove APY)
- `backend/services/tokenomicsPreparation.service.js` (remove HRK conversion)
- `scripts/deploy-base.ts` (remove oracle, add bonded staking)
- `docs/tokenomics/EXECUTIVE_SUMMARY.md`
- `docs/tokenomics/HRK_TOKENOMICS_WHITEPAPER.md`
- `docs/tokenomics/DYNAMIC_PRICING_SPEC.md`

### KEEP AS-IS
- `contracts/PeerProofRegistry.sol`
- `contracts/HRKeyRevenueShare.sol` (if USDC-only verified)
- `backend/controllers/revenueController.js`
- `backend/services/web3RevenueService.js`

---

**Total Files Affected:** ~20-25 files
**Estimated LOC Changed:** ~3000-4000 lines
**Test Coverage Required:** 100% for new staking contract
