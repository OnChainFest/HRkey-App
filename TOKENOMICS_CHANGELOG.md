# HRKey Tokenomics v2.0 - Refactoring Changelog

**Date:** 2026-01-15
**Version:** v2.0.0 (Breaking Changes)
**Summary:** Complete separation of marketplace pricing (USDC) from protocol utility token (HRK). Removed all investment-like mechanics (yield, revenue share, HRK-based pricing).

---

## Executive Summary

### Before (v1.x)
- **HRK-priced queries:** Marketplace access priced in HRK tokens (5-500 HRK range)
- **Yield staking:** 4-tier staking system with 5-15% APY rewards
- **Revenue share:** 50% of slashed tokens redistributed to stakers
- **Dual economic model:** Conflicting HRK pricing vs USDC revenue sharing

### After (v2.0)
- **USDC-only pricing:** ALL marketplace access priced in USDC ($10-$1000 range)
- **Bonded participation:** Staking unlocks capacity/permissions, NO yield/APY
- **100% burn:** Slashed tokens fully burned, NO redistribution
- **Clear separation:** Marketplace (USDC) vs Protocol utility (HRK)

---

## Core Design Principles

### ✅ IMPLEMENTED
1. **HRK = Utility Token**
   - Purpose: Participation rights, capacity gates, protocol permissions
   - NOT used for: Pricing people, identity value, marketplace transactions

2. **USDC = Marketplace Currency**
   - ALL query/access pricing in USDC (stablecoin)
   - Revenue distribution in USDC
   - NO HRK required for pricing calculations

3. **Staking = Bonded Participation**
   - Lock HRK to unlock higher rate limits, roles, permissions
   - NO passive rewards, NO APY, NO yield
   - Slashing risk enforces good behavior

4. **Slashing = Enforcement Only**
   - 100% of slashed tokens burned
   - NOT redistributed to holders
   - Purely enforcement mechanism

### ❌ REMOVED
1. HRK-priced query logic
2. HRKPriceOracle.sol contract
3. Yield/APY staking rewards
4. Revenue share to HRK holders
5. "Adoption → appreciation" mechanics

---

## File-by-File Changes

### SMART CONTRACTS

#### 🗑️ DELETED/DEPRECATED

1. **contracts/HRKPriceOracle.sol** → `contracts/deprecated/HRKPriceOracle.sol.deprecated`
   - Reason: Used HRK for marketplace pricing (5-500 HRK range)
   - Replacement: Direct USDC pricing in backend

2. **contracts/HRKStaking.sol** → `contracts/deprecated/HRKStaking.sol.deprecated`
   - Reason: Implemented yield-based staking with APY (5-15%)
   - Replacement: HRKBondedStaking.sol (capacity-only)

#### ✨ CREATED

3. **contracts/HRKBondedStaking.sol** (NEW)
   - Bonded participation staking (NO yield)
   - Capacity tiers: Basic (100), Standard (500), Premium (2000), Enterprise (10000 HRK)
   - 7-day unbonding period
   - Slashing integration
   - Functions:
     - `stake(amount)` - Lock HRK for capacity
     - `initiateUnstake(amount)` - Start unbonding
     - `finalizeUnstake()` - Claim after 7 days
     - `cancelUnstake()` - Cancel pending unstake
     - `slash(user, amount, reason)` - Burn slashed tokens
     - `getCapacityTier(user)` - Get user's tier (0-4)
     - `hasMinimumStake(user, required)` - Check eligibility
   - Invariants:
     - NO rewards calculation
     - NO APY mechanisms
     - Slashing burns tokens (not redistributes)

#### 🔄 MODIFIED

4. **contracts/HRKSlashing.sol**
   - Changed: `BURN_PERCENTAGE` from 50 to 100
   - Removed: `slashPool` variable
   - Removed: `distributeSlashPool()` function
   - Updated: `executeSlash()` to burn 100%
   - Updated: `resolveAppeal()` to burn 100%
   - Comments: Added "CRITICAL INVARIANT: Slashed tokens 100% BURNED"

5. **contracts/HRKToken.sol** (No changes in this refactor)
   - Keep: Base ERC20 functionality
   - Note: Transaction fee distribution may need future update (currently 40% burn, 60% treasury)

6. **contracts/HRKeyRevenueShare.sol** (Verified USDC-only)
   - No changes needed
   - Already distributes in USDC, not HRK
   - 40/40/20 split: platform, data owner, reference creator

7. **contracts/PeerProofRegistry.sol** (No changes)
   - Unrelated to tokenomics

---

### BACKEND SERVICES

#### 🗑️ DEPRECATED

8. **backend/pricing/priceOracle.ts** → `backend/pricing/deprecated/priceOracle.ts.deprecated`
   - Reason: Generated Merkle trees for HRKPriceOracle.sol
   - No longer needed (no on-chain HRK pricing)

#### 🔄 MODIFIED

9. **backend/pricing/pricingEngine.ts**
   - Changed constants:
     - `P_BASE`: 5 HRK → $25 USDC
     - `P_MIN`: 5 HRK → $10 USDC
     - `P_MAX`: 500 HRK → $1000 USDC
   - Changed interface:
     - `PricingResult.priceHRK` → `PricingResult.priceUSDC`
   - Updated all functions to return USDC prices
   - Database: `price_hrk` → `price_usdc` column
   - Comments: "HRK is NOT used for pricing - it's a utility token only"

10. **backend/services/tokenomicsPreview.service.js**
    - Removed:
      - `fxRateUsdToHrk` config
      - `calculateTokenAmount()` import
      - `estimateStakingRewards()` import
      - `tokens` field from result
      - `stakingPreview.effectiveApr` field
    - Changed:
      - `priceUsd` → `priceUSDC`
      - Added `stakingCapacity` tiers (Basic/Standard/Premium)
      - Added note: "HRK is a utility token for participation rights"
    - Updated typedefs to reflect USDC-only model

11. **backend/services/tokenomicsPreparation.service.js**
    - Removed:
      - `calculateTokenAmount()` function
      - `estimateStakingRewards()` function
    - Kept:
      - `splitRevenue()` (still needed for USDC split)
    - Comments: "USDC-only revenue splitting"

12. **backend/controllers/tokenomicsPreview.controller.js** (No direct changes)
    - Uses updated service layer
    - Returns new USDC-based preview format

13. **backend/controllers/revenueController.js** (No changes)
    - Already USDC-based
    - No HRK holder distribution

14. **backend/services/web3RevenueService.js** (No changes)
    - Already distributes USDC on-chain

---

### DEPLOYMENT SCRIPTS

#### 🔄 MODIFIED

15. **scripts/deploy-base.ts**
    - Removed: HRKPriceOracle deployment
    - Removed: HRKStaking deployment
    - Added: HRKBondedStaking deployment
    - Updated: Role assignments
      - Removed: `REWARD_MANAGER_ROLE`
      - Removed: Oracle role on PriceOracle
      - Added: `SLASHER_ROLE` to bonded staking
    - Updated: Deployment summary
      - Shows v2.0 tokenomics model
      - Lists removed contracts
    - Deployment order: HRKToken → HRKBondedStaking → HRKSlashing

---

### TESTS

#### ⚠️ TO UPDATE (Not modified in this commit)

16. **backend/tests/services/tokenomicsPreview.service.test.js**
    - Needs update: Remove HRK conversion tests
    - Needs update: Remove staking rewards tests
    - Needs update: Add capacity tier tests

17. **backend/tests/services/tokenomicsPreparation.service.test.js**
    - Needs update: Remove `calculateTokenAmount()` tests
    - Needs update: Remove `estimateStakingRewards()` tests

18. **contracts/test/** (Contract tests need creation)
    - TODO: Create `HRKBondedStaking.test.js`
    - TODO: Update `HRKSlashing.test.js` (100% burn)
    - TODO: Remove `HRKPriceOracle.test.js`
    - TODO: Remove `HRKStaking.test.js` (yield tests)

---

### DOCUMENTATION

#### 📝 TO UPDATE

19. **docs/tokenomics/EXECUTIVE_SUMMARY.md**
    - Remove: TGE price ($0.10), FDV ($100M)
    - Remove: "Adoption → appreciation" language
    - Add: "HRK is NOT a security" disclaimer
    - Update: To reflect utility-only nature

20. **docs/tokenomics/HRK_TOKENOMICS_WHITEPAPER.md**
    - Archive: Old v1.x model
    - Rewrite: v2.0 bonded participation model
    - Emphasize: Utility vs marketplace separation

21. **docs/tokenomics/DYNAMIC_PRICING_SPEC.md**
    - Update: All examples to USDC
    - Remove: HRK pricing ranges
    - Update: Formula outputs

22. **docs/DATA_ACCESS_REVENUE_SHARING.md**
    - Verify: USDC-only
    - Add: Note on NO HRK holder distribution

---

## Database Schema Changes

### REQUIRED MIGRATIONS

#### Supabase Table: `candidate_prices`
```sql
-- Rename column
ALTER TABLE candidate_prices
RENAME COLUMN price_hrk TO price_usdc;

-- Update column comment
COMMENT ON COLUMN candidate_prices.price_usdc IS 'Marketplace price in USDC (NOT HRK)';
```

#### New Table: `staking_capacity_logs` (Optional)
```sql
CREATE TABLE IF NOT EXISTS staking_capacity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  stake_amount NUMERIC(20, 0),
  capacity_tier TEXT CHECK (capacity_tier IN ('none', 'basic', 'standard', 'premium', 'enterprise')),
  rate_limit INT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staking_capacity_user ON staking_capacity_logs(user_id);
```

#### New Table: `staking_events` (Optional)
```sql
CREATE TABLE IF NOT EXISTS staking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT CHECK (event_type IN ('stake', 'unstake_initiated', 'unstake_finalized', 'unstake_cancelled', 'slashed')),
  amount NUMERIC(20, 0),
  tx_hash TEXT,
  block_number BIGINT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staking_events_user ON staking_events(user_id);
CREATE INDEX idx_staking_events_type ON staking_events(event_type);
```

---

## API Changes

### Breaking Changes

#### Tokenomics Preview Endpoint
**Endpoint:** `GET /api/candidates/:userId/tokenomics-preview`

**Before (v1.x):**
```json
{
  "userId": "...",
  "priceUsd": 50,
  "tokens": {
    "rawTokens": 500,
    "clampedTokens": 500
  },
  "stakingPreview": {
    "effectiveApr": 0.12,
    "estimatedRewardsHrk": 60,
    "stakeAmountHrk": 500
  }
}
```

**After (v2.0):**
```json
{
  "userId": "...",
  "priceUSDC": 50,
  "stakingCapacity": {
    "basicTier": {
      "minStakeHRK": 100,
      "rateLimit": "10 queries/month"
    },
    "standardTier": {
      "minStakeHRK": 500,
      "rateLimit": "50 queries/month"
    },
    "premiumTier": {
      "minStakeHRK": 2000,
      "rateLimit": "Unlimited queries"
    }
  },
  "note": "HRK is a utility token for participation rights. Marketplace pricing is USDC-only."
}
```

### New Endpoints (To Implement)

1. **GET /api/staking/capacity** - Check user capacity tier
2. **GET /api/staking/info/:walletAddress** - Get stake info
3. **POST /api/staking/check-eligibility** - Verify role eligibility

---

## Migration Guide

### For Users

#### Old Workflow (v1.x)
1. Query price displayed in HRK (e.g., 50 HRK)
2. Stake HRK → Earn APY rewards (5-15%)
3. Slashed tokens partially redistributed to stakers

#### New Workflow (v2.0)
1. Query price displayed in USDC (e.g., $50 USDC)
2. Stake HRK → Unlock capacity/permissions (NO rewards)
3. Slashed tokens 100% burned (NO redistribution)

#### Action Required for Existing Users
1. **Claim any pending rewards** from old HRKStaking contract (if deployed)
2. **Unstake from old contract** (if migrating)
3. **Re-stake in HRKBondedStaking** to unlock capacity
4. **Understand:** No more passive rewards, staking is for capacity only
5. **Unbonding:** New 7-day waiting period for unstaking

### For Developers

#### Backend Integration Changes

**Old pricing call:**
```typescript
const result = await calculateCandidatePrice(wallet);
console.log(`Price: ${result.priceHRK} HRK`);
```

**New pricing call:**
```typescript
const result = await calculateCandidatePrice(wallet);
console.log(`Price: $${result.priceUSDC} USDC`);
```

**Old staking check:**
```typescript
const rewards = await stakingContract.calculatePendingRewards(user);
console.log(`Pending rewards: ${rewards} HRK`);
```

**New staking check:**
```typescript
const tier = await bondedStakingContract.getCapacityTier(user);
console.log(`Capacity tier: ${tier}`); // 0-4
```

#### Contract Interaction Changes

**Old staking contract:**
```solidity
HRKStaking.stake(amount) → accrues rewards over time
HRKStaking.claimRewards() → claims APY rewards
```

**New bonded staking contract:**
```solidity
HRKBondedStaking.stake(amount) → unlocks capacity (NO rewards)
HRKBondedStaking.initiateUnstake(amount) → starts 7-day unbonding
HRKBondedStaking.finalizeUnstake() → claims after unbonding period
```

---

## Security & Invariants

### Critical Invariants (Enforced in Code)

1. **Marketplace Pricing = USDC Only**
   - Invariant: `priceUSDC > 0 AND priceUSDC >= P_MIN AND priceUSDC <= P_MAX`
   - Location: `pricingEngine.ts:250`
   - Test: Verify NO HRK price calculations

2. **No HRK-Based Pricing**
   - Invariant: `pricingEngine NEVER outputs HRK values`
   - Location: `PricingResult` interface
   - Test: Grep for `priceHRK` should return 0 results in active code

3. **Staking = NO Rewards**
   - Invariant: `HRKBondedStaking NEVER calculates APY or distributes rewards`
   - Location: `HRKBondedStaking.sol` (no reward functions exist)
   - Test: Verify `claimRewards()` does NOT exist

4. **Slashing = 100% Burn**
   - Invariant: `slashed_amount == burned_amount`
   - Location: `HRKSlashing.sol:231, 269`
   - Test: `totalBurned == totalSlashed` at all times

5. **No HRK Holder Revenue Distribution**
   - Invariant: Revenue share goes to [platform, data owner, ref creator], NOT token holders
   - Location: `HRKeyRevenueShare.sol`
   - Test: Verify no `distributeToHolders()` function

---

## Testing Checklist

### Unit Tests

- [ ] `pricingEngine.ts` returns USDC, not HRK
- [ ] `tokenomicsPreview.service.js` returns `priceUSDC` and `stakingCapacity`
- [ ] `tokenomicsPreparation.service.js` has NO `calculateTokenAmount()`
- [ ] `HRKBondedStaking.sol` stake/unstake flow works
- [ ] `HRKBondedStaking.sol` enforces unbonding period
- [ ] `HRKBondedStaking.sol` slashing burns tokens
- [ ] `HRKSlashing.sol` burns 100% of slashed tokens

### Integration Tests

- [ ] Query pricing flow returns USDC values
- [ ] Revenue distribution uses USDC, not HRK
- [ ] Staking does NOT generate rewards
- [ ] Capacity checks based on stake amount work
- [ ] Slashing flow burns tokens (NOT redistributes)

### Manual Testing

- [ ] Deploy HRKBondedStaking to testnet
- [ ] Stake HRK → verify capacity tier increases
- [ ] Initiate unstake → verify 7-day lock
- [ ] Finalize unstake → verify tokens returned
- [ ] Slash user → verify tokens burned (check burn address balance)

---

## Rollback Plan

If critical issues arise:

1. **Keep old contracts deployed** (HRKStaking, HRKPriceOracle)
2. **Revert backend changes:**
   ```bash
   git revert <commit-hash>
   git push origin claude/refactor-hrkey-tokenomics-2H6sr
   ```
3. **Database migration rollback:**
   ```sql
   ALTER TABLE candidate_prices RENAME COLUMN price_usdc TO price_hrk;
   ```
4. **Frontend:** Switch contract addresses back to v1.x in `.env`

---

## Post-Deployment Checklist

### Immediate (Day 1)
- [ ] Verify all contracts deployed successfully
- [ ] Verify role assignments (SLASHER_ROLE, ORACLE_ROLE)
- [ ] Test stake/unstake flow on testnet
- [ ] Update `.env` with new contract addresses
- [ ] Run smoke tests on all API endpoints

### Short-term (Week 1)
- [ ] Update frontend to show USDC prices
- [ ] Update docs with new tokenomics model
- [ ] Announce migration to users
- [ ] Monitor staking adoption
- [ ] Monitor slashing events (should burn 100%)

### Long-term (Month 1)
- [ ] Audit smart contracts (HRKBondedStaking, HRKSlashing)
- [ ] Verify no HRK-based pricing in any flow
- [ ] Collect user feedback on new model
- [ ] Optimize unbonding period if needed
- [ ] Consider capacity tier adjustments based on usage

---

## Known Issues & Limitations

1. **Breaking Change:** Existing stakers need to migrate manually
2. **No Automatic Migration:** Old HRKStaking stakes must be manually unstaked
3. **Unbonding Period:** New 7-day delay may frustrate users initially
4. **Test Coverage:** Contract tests need to be written/updated
5. **Database Schema:** `candidate_prices` table needs `price_hrk` → `price_usdc` migration

---

## References

- **Design Doc:** `TOKENOMICS_REFACTOR_PLAN.md`
- **Codebase Analysis:** `CURRENT_TOKENOMICS_ANALYSIS.md` (if exists)
- **New Contract:** `contracts/HRKBondedStaking.sol`
- **Modified Contract:** `contracts/HRKSlashing.sol`
- **Deployment Script:** `scripts/deploy-base.ts`

---

## Approval & Sign-off

**Reviewed by:** [Protocol Team]
**Approved by:** [Technical Lead]
**Deployed by:** [DevOps]
**Date:** 2026-01-15

---

**END OF CHANGELOG**
