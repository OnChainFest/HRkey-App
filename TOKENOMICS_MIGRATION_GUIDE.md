# HRKey Tokenomics v2.0 - Migration Guide

**Effective Date:** 2026-01-15
**Version:** v1.x → v2.0.0
**Breaking Changes:** YES

---

## Table of Contents

1. [What Changed](#what-changed)
2. [Why These Changes](#why-these-changes)
3. [Impact on Users](#impact-on-users)
4. [Impact on Developers](#impact-on-developers)
5. [Step-by-Step Migration](#step-by-step-migration)
6. [FAQ](#faq)
7. [Support](#support)

---

## What Changed

### High-Level Summary

**Old Model (v1.x):**
- Query prices in HRK tokens
- Staking generates 5-15% APY rewards
- Slashed tokens redistributed to stakers

**New Model (v2.0):**
- Query prices in USDC stablecoin
- Staking unlocks capacity (NO rewards)
- Slashed tokens 100% burned

### Key Differences Table

| Feature | v1.x (Old) | v2.0 (New) | Impact |
|---------|------------|------------|--------|
| **Marketplace Pricing** | HRK (5-500) | USDC ($10-$1000) | 🔴 Breaking |
| **Staking Purpose** | Generate yield | Unlock capacity | 🔴 Breaking |
| **Staking APY** | 5-15% | 0% (NO YIELD) | 🔴 Breaking |
| **Unbonding Period** | Instant/short | 7 days | 🔴 Breaking |
| **Slashing Distribution** | 50% burn, 50% redistribute | 100% burn | 🟡 Changed |
| **Revenue Currency** | USDC | USDC | ✅ No change |
| **HRK Purpose** | Pricing + utility | Utility only | 🔴 Breaking |

---

## Why These Changes

### Regulatory Clarity
- **Old problem:** HRK used for pricing could be viewed as valuing human capital
- **New solution:** Strict separation of marketplace (USDC) from utility token (HRK)

### Security Classification
- **Old problem:** Yield + revenue share resemble investment mechanics
- **New solution:** HRK is purely functional (capacity/permissions), NOT an investment

### Economic Coherence
- **Old problem:** Contradictory dual models (HRK pricing vs USDC revenue)
- **New solution:** Single clear model—USDC for marketplace, HRK for protocol

---

## Impact on Users

### For Candidates (Data Owners)

#### What Stays the Same ✅
- Your profile data and references remain unchanged
- Revenue share percentages unchanged (40% platform, 40% you, 20% reference creator)
- Payment in USDC (as before)
- PeerProof reference system unchanged

#### What Changes 🔄
- **Query prices now shown in USDC** instead of HRK
  - Example: "50 HRK" → "$50 USDC"
- **No HRK tokens paid for queries** (was never fully implemented anyway)
- **If you staked HRK for rewards:** NO MORE REWARDS
  - Old: Stake 500 HRK → earn 5-15% APY
  - New: Stake 500 HRK → unlock "Standard" tier capacity (50 queries/month)

#### Action Required 📋
1. **If you have staked HRK in old contract:**
   - Check if contract is still active (testnet vs mainnet)
   - Claim any pending rewards BEFORE migration deadline
   - Unstake tokens from old contract
   - Re-stake in new HRKBondedStaking if you want capacity benefits

2. **Update expectations:**
   - Staking HRK no longer generates passive income
   - Staking now unlocks protocol features (rate limits, evaluator role, etc.)

### For Companies (Data Buyers)

#### What Stays the Same ✅
- Pay in USDC for candidate references
- Same access approval flow
- Same data quality guarantees

#### What Changes 🔄
- **Prices displayed in USDC** (not HRK)
- **No HRK purchase required** to access data (if this was ever planned)

#### Action Required 📋
- Update budgets/forecasts to reflect USDC pricing
- No code changes needed on your end

### For Evaluators (Reference Providers)

#### What Stays the Same ✅
- Submit references as before
- Earn 20% of query fees in USDC
- PeerProof reputation system unchanged

#### What Changes 🔄
- **Staking HRK unlocks evaluator role** (capacity-based, not reward-based)
  - Standard tier (500 HRK staked) = evaluator eligibility
  - Premium tier (2000 HRK) = priority features
- **Slashed tokens are burned** (not redistributed to you)
  - Old: 50% of slashed tokens went to honest stakers
  - New: 100% burned (enforcement only)

#### Action Required 📋
1. **To become/remain evaluator:**
   - Stake minimum 500 HRK in HRKBondedStaking contract
   - Maintain stake to keep role active
2. **Understand slashing:**
   - Fraud still results in slashing
   - But no "reward pool" from slashed tokens

### For HRK Token Holders

#### What Stays the Same ✅
- HRK token still exists (1B supply cap)
- Can still transfer, trade on DEXs
- Can still use for protocol functions

#### What Changes 🔄
- **NO YIELD from staking** (was 5-15% APY)
- **NO REVENUE SHARE** (if you were expecting this)
- **HRK is purely utility:**
  - Stake to unlock capacity
  - Stake to access higher rate limits
  - Stake to qualify for evaluator role
  - Subject to slashing if misbehave

#### Action Required 📋
1. **Adjust investment thesis:**
   - HRK is NOT an investment token
   - Value comes from protocol utility, not yield
2. **If staked in old contract:**
   - Unstake and claim rewards
   - Decide if you want capacity benefits
   - Re-stake in new contract if yes

---

## Impact on Developers

### Smart Contract Changes

#### Deprecated Contracts
```solidity
// ❌ DO NOT USE (moved to /deprecated)
HRKStaking.sol       // Old yield-based staking
HRKPriceOracle.sol   // HRK-based pricing oracle
```

#### New/Updated Contracts
```solidity
// ✅ USE THESE
HRKBondedStaking.sol // New capacity-based staking
HRKSlashing.sol      // Updated to 100% burn
HRKToken.sol         // Unchanged
HRKeyRevenueShare.sol // Unchanged (already USDC)
```

### API Changes

#### Breaking Endpoint Changes

**Tokenomics Preview:**
```diff
GET /api/candidates/:userId/tokenomics-preview

- Response v1.x:
- {
-   "priceUsd": 50,
-   "tokens": { "rawTokens": 500, "clampedTokens": 500 },
-   "stakingPreview": { "effectiveApr": 0.12, "estimatedRewardsHrk": 60 }
- }

+ Response v2.0:
+ {
+   "priceUSDC": 50,
+   "stakingCapacity": {
+     "basicTier": { "minStakeHRK": 100, "rateLimit": "10 queries/month" },
+     "standardTier": { "minStakeHRK": 500, "rateLimit": "50 queries/month" },
+     "premiumTier": { "minStakeHRK": 2000, "rateLimit": "Unlimited queries" }
+   }
+ }
```

#### New Endpoints (To Implement)

```javascript
// Check user's staking capacity tier
GET /api/staking/capacity/:walletAddress
Response: { "tier": 2, "tierName": "standard", "stakeAmount": "500" }

// Get detailed stake info
GET /api/staking/info/:walletAddress
Response: {
  "amount": "500",
  "stakedAt": 1234567890,
  "isActive": true,
  "unstakeRequestedAt": 0,
  "canUnstakeAt": 0
}

// Check if user can perform action
POST /api/staking/check-eligibility
Body: { "walletAddress": "0x...", "requiredStake": 500 }
Response: { "eligible": true }
```

### Backend Integration Changes

#### Old Code (v1.x)
```typescript
// ❌ DEPRECATED
import { calculateTokenAmount, estimateStakingRewards } from './tokenomicsPreparation.service.js';

// HRK-based pricing
const pricing = await pricingEngine.calculateCandidatePrice(wallet);
console.log(`Price: ${pricing.priceHRK} HRK`);

// Calculate staking rewards
const rewards = estimateStakingRewards({
  stakeAmountHrk: 500,
  baseApr: 0.12,
  lockMonths: 12
});
console.log(`Estimated rewards: ${rewards.estimatedRewardsHrk} HRK`);
```

#### New Code (v2.0)
```typescript
// ✅ UPDATED
import { splitRevenue } from './tokenomicsPreparation.service.js';

// USDC-based pricing
const pricing = await pricingEngine.calculateCandidatePrice(wallet);
console.log(`Price: $${pricing.priceUSDC} USDC`);

// Check staking capacity (NO rewards)
const tier = await bondedStakingContract.getCapacityTier(wallet);
const capacityMap = {
  0: 'None',
  1: 'Basic (10 queries/mo)',
  2: 'Standard (50 queries/mo)',
  3: 'Premium (unlimited)',
  4: 'Enterprise (custom)'
};
console.log(`Capacity: ${capacityMap[tier]}`);
```

### Database Schema Changes

#### Migration SQL
```sql
-- Rename price column
ALTER TABLE candidate_prices
RENAME COLUMN price_hrk TO price_usdc;

-- Add comment
COMMENT ON COLUMN candidate_prices.price_usdc IS
  'Marketplace price in USDC (stablecoin). HRK is NOT used for pricing.';

-- Optional: Create staking tables
CREATE TABLE staking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT CHECK (event_type IN ('stake', 'unstake_initiated', 'unstake_finalized', 'slashed')),
  amount NUMERIC(20, 0),
  tx_hash TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Frontend Changes

#### Price Display
```jsx
// ❌ Old
<div>Price: {price.priceHRK} HRK</div>

// ✅ New
<div>Price: ${price.priceUSDC} USDC</div>
```

#### Staking UI
```jsx
// ❌ Old
<div>
  <p>Stake {amount} HRK</p>
  <p>Estimated APY: {apr}%</p>
  <p>Yearly rewards: {rewards} HRK</p>
</div>

// ✅ New
<div>
  <p>Stake {amount} HRK</p>
  <p>Unlock capacity tier: {tier}</p>
  <p>Benefits: {benefits}</p>
  <p className="note">No rewards - staking is for protocol access only</p>
</div>
```

---

## Step-by-Step Migration

### Phase 1: Pre-Migration (Before Deployment)

#### For Dev Team
1. [ ] Review TOKENOMICS_CHANGELOG.md thoroughly
2. [ ] Test new contracts on testnet
3. [ ] Update environment variables
4. [ ] Run migration scripts on testnet database
5. [ ] Deploy contracts to testnet
6. [ ] Verify all flows work on testnet

#### For Users
1. [ ] Announce upcoming changes via email/Discord
2. [ ] Provide 2-week notice for stakers to claim rewards
3. [ ] Create educational content (blog post, video)

### Phase 2: Migration Day

#### For Dev Team
1. [ ] Deploy HRKBondedStaking to mainnet
2. [ ] Deploy updated HRKSlashing to mainnet
3. [ ] Update backend .env with new contract addresses
4. [ ] Run database migration (price_hrk → price_usdc)
5. [ ] Deploy backend updates
6. [ ] Verify smoke tests pass
7. [ ] Update frontend with new contract addresses
8. [ ] Monitor logs for errors

#### For Users
1. [ ] **CRITICAL:** Claim any pending rewards from old HRKStaking
2. [ ] Unstake from old contract (if applicable)
3. [ ] Decide if you want capacity benefits
4. [ ] If yes, stake in new HRKBondedStaking

### Phase 3: Post-Migration (First Week)

#### For Dev Team
1. [ ] Monitor staking adoption
2. [ ] Track slashing events (verify 100% burn)
3. [ ] Verify USDC pricing in all flows
4. [ ] Collect user feedback
5. [ ] Fix any critical bugs

#### For Users
1. [ ] Test new staking flow
2. [ ] Verify capacity tier unlocks
3. [ ] Report any issues
4. [ ] Adjust to new 7-day unbonding period

---

## FAQ

### General Questions

**Q: Why remove staking rewards?**
A: To clearly position HRK as a utility token (NOT an investment). Yield + revenue share mechanics can trigger securities classification. The new model is purely functional: stake = capacity.

**Q: Will HRK price drop without yield?**
A: Utility-driven tokens can maintain value through demand for protocol access. However, HRK should NOT be purchased as an investment expecting passive returns.

**Q: Can I still trade HRK?**
A: Yes, HRK remains tradeable on DEXs. But it's a utility token, not an investment.

### Staking Questions

**Q: What happens to my existing stake?**
A: If you have HRK staked in the old contract, you must unstake and re-stake in the new contract to access capacity benefits.

**Q: Do I lose rewards when migrating?**
A: Old contract rewards must be claimed BEFORE you unstake. Check with contract owner if old contract is still active.

**Q: What if I don't want to re-stake?**
A: That's fine! You'll just have basic (non-staked) access to the protocol. Staking is optional.

**Q: Why 7-day unbonding period?**
A: Prevents instant stake/unstake abuse. Ensures users are committed participants, not just farming protocol benefits.

**Q: Can I cancel an unstake?**
A: Yes! Call `cancelUnstake()` before the 7-day period ends.

### Pricing Questions

**Q: Why USDC instead of HRK for pricing?**
A: Using HRK to price people/data creates legal and ethical issues (commodifying human capital). USDC is a neutral unit of account.

**Q: Do I need HRK to access queries?**
A: No! Queries are paid in USDC. HRK is optional (for capacity benefits only).

**Q: Will prices be the same in USDC?**
A: Prices are re-calibrated: old 5-500 HRK → new $10-$1000 USDC range.

### Slashing Questions

**Q: What happens to slashed tokens now?**
A: 100% burned (sent to 0xdead address). Previously 50% was redistributed to stakers.

**Q: Why not redistribute to honest stakers?**
A: Slashing should be enforcement, not a reward mechanism. Redistribution creates perverse incentives.

### Developer Questions

**Q: Are there breaking API changes?**
A: Yes. `tokenomics-preview` endpoint returns different structure. See API Changes section.

**Q: Do I need to update smart contract integrations?**
A: Yes, if you were using HRKStaking or HRKPriceOracle. Switch to HRKBondedStaking.

**Q: What about existing database data?**
A: Run migration to rename `price_hrk` → `price_usdc`. Historical data meaning changes (was HRK, now represents USDC equivalent).

---

## Support

### Contact Channels

- **Technical Issues:** GitHub Issues - https://github.com/OnChainFest/HRkey-App/issues
- **Migration Help:** Discord #tokenomics-migration
- **General Questions:** support@hrkey.io

### Resources

- **Full Changelog:** `TOKENOMICS_CHANGELOG.md`
- **Technical Plan:** `TOKENOMICS_REFACTOR_PLAN.md`
- **Contract Docs:** `docs/contracts/`
- **API Docs:** `docs/api/`

### Emergency Contacts

- **Contract Bugs:** security@hrkey.io
- **Migration Issues:** devops@hrkey.io
- **User Support:** support@hrkey.io

---

## Timeline

| Date | Milestone |
|------|-----------|
| **2026-01-15** | v2.0 deployed to testnet |
| **2026-01-22** | User announcement & education |
| **2026-02-01** | Deadline to claim old staking rewards |
| **2026-02-05** | v2.0 deployed to mainnet |
| **2026-02-12** | Old contracts deprecated (read-only) |
| **2026-03-05** | End of migration support period |

---

## Acknowledgments

This migration represents a fundamental improvement in the HRKey tokenomics model, ensuring regulatory compliance, economic coherence, and ethical clarity in how we value human capital data.

Special thanks to:
- Protocol design team
- Smart contract auditors
- Community feedback participants

---

**Last Updated:** 2026-01-15
**Version:** 1.0
**Authors:** HRKey Protocol Team
