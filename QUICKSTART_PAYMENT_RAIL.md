# HRKey Payment Rail - Quick Start Guide

Get the HRKey Web3 payment infrastructure running in 15 minutes.

---

## ⚡ Quick Deploy (Testnet)

### 1. Configure Environment (2 min)

```bash
# Copy environment template
cp .env.payment-rail.example .env

# Edit .env and fill in:
# - BASE_SEPOLIA_RPC (get from https://base.org)
# - PRIVATE_KEY (testnet wallet with test ETH)
# - SUPABASE_URL and SUPABASE_SERVICE_KEY
# - RLUSD_TOKEN_ADDRESS (or deploy mock RLUSD for testing)
```

### 2. Install Dependencies (2 min)

```bash
npm install
```

### 3. Compile Contracts (1 min)

```bash
npm run compile
```

### 4. Deploy to Base Sepolia (3 min)

```bash
npx hardhat run scripts/deploy-payment-rail.ts --network baseSepolia
```

**Copy the contract addresses** from output and update `.env`:
```env
PAYMENT_SPLITTER_ADDRESS=0x...
REPUTATION_REGISTRY_ADDRESS=0x...
```

### 5. Run Database Migration (2 min)

```bash
# Open Supabase SQL Editor
# Copy contents of database/migrations/create_payment_tables.sql
# Paste and run
```

### 6. Start Backend Services (2 min)

```bash
# Terminal 1: Payment Listener
ts-node backend/services/payments/rlusd-listener.ts

# Terminal 2: Backend API (if not already running)
cd backend && npm run dev
```

### 7. Test Payment Flow (3 min)

```bash
# Create a test payment
curl -X POST http://localhost:3001/api/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "referenceId": "test_ref_001",
    "amount": 100,
    "providerEmail": "provider@test.com",
    "candidateEmail": "candidate@test.com"
  }'

# Copy the paymentId from response

# Check payment status
curl http://localhost:3001/api/payments/status/<paymentId>
```

---

## 📊 Architecture At a Glance

```
Enterprise User
      ↓ pays 100 RLUSD
┌─────────────────┐
│ PaymentSplitter │
└─────────────────┘
      ↓ splits atomically
   ┌──┴──┬───────┬──────┐
   ↓     ↓       ↓      ↓
  60    20      15     5
 RLUSD RLUSD  RLUSD  RLUSD
   ↓     ↓       ↓      ↓
Provider Candidate Treasury Staking
```

**Payment Split:**
- 60% → Reference Provider
- 20% → Candidate (profile owner)
- 15% → HRKey Treasury
- 5% → HRK Staking Rewards Pool

---

## 🔧 Key Files

| File | Purpose |
|------|---------|
| `/contracts/ReferencePaymentSplitter.sol` | Main payment contract |
| `/contracts/ReputationRegistry.sol` | Audit trail for references |
| `/contracts/HRKStaking.sol` | Staking with RLUSD rewards |
| `/backend/services/payments/rlusd-listener.ts` | Listen for payment events |
| `/backend/services/payments/payment-processor.ts` | Create payment intents |
| `/backend/controllers/payments.controller.ts` | Payment API endpoints |
| `/backend/controllers/staking.controller.ts` | Staking API endpoints |
| `/database/migrations/create_payment_tables.sql` | Database schema |
| `/scripts/deploy-payment-rail.ts` | Deployment script |

---

## 📡 API Endpoints

### Payments

```bash
# Create payment
POST /api/payments/create
Body: { referenceId, amount, providerEmail, candidateEmail }

# Check status
GET /api/payments/status/:paymentId

# Payment history
GET /api/payments/history

# Statistics
GET /api/payments/stats?timeframe=24h

# Cross-border (XRP bridge)
POST /api/payments/cross-border
```

### Staking

```bash
# Create stake
POST /api/staking/stake
Body: { amount, lockPeriod, tier }

# View positions
GET /api/staking/positions

# Claim rewards
POST /api/staking/claim-rewards
Body: { stakeId }

# Initiate unstake
POST /api/staking/unstake
Body: { stakeId, emergency }

# Statistics
GET /api/staking/stats
```

---

## 🧪 Test Scenarios

### Scenario 1: Basic Payment

```javascript
// 1. Create payment intent
const response = await fetch('/api/payments/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceId: 'ref_test_001',
    amount: 100,
    providerEmail: 'john@test.com',
    candidateEmail: 'jane@test.com'
  })
});

const { paymentId, qrCode, paymentUrl } = await response.json();

// 2. User scans QR code or clicks paymentUrl
// 3. Wallet prompts for 100 RLUSD approval + payment
// 4. Transaction confirms on-chain
// 5. Payment listener catches event
// 6. Database updated, notifications sent
```

### Scenario 2: HRK Staking

```javascript
// 1. Stake 1000 HRK for 12 months (Silver tier)
const stakeResponse = await fetch('/api/staking/stake', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 1000,
    lockPeriod: 12,
    tier: 'Silver'
  })
});

const { stakeId, estimatedRewards } = await stakeResponse.json();
// estimatedRewards: 80 RLUSD (8% APY × 12 months)

// 2. After some time, check rewards
const positionsResponse = await fetch('/api/staking/positions');
const { pendingRewards } = await positionsResponse.json();

// 3. Claim rewards
await fetch('/api/staking/claim-rewards', {
  method: 'POST',
  body: JSON.stringify({ stakeId })
});
```

### Scenario 3: Cross-Border Payment

```javascript
// US company paying Costa Rica reference provider
const crossBorderResponse = await fetch('/api/payments/cross-border', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceId: 'ref_intl_001',
    amount: 1500,  // $1500 (meets $1000 minimum)
    fromCountry: 'US',
    toCountry: 'CR',
    recipientAddress: '0x...'
  })
});

// Flow:
// 1. Lock 1500 RLUSD on Base
// 2. Convert to ~3000 XRP
// 3. Transfer XRP via XRPL (3-5 seconds)
// 4. Convert back to 1499 RLUSD (after 0.1% fee)
// 5. Release to recipient
// Total time: <10 seconds
```

---

## 🔒 Security Checklist

Before deploying to mainnet:

- [ ] Professional security audit
- [ ] Bug bounty program ($10K+)
- [ ] Multi-sig wallet for admin/treasury (3/5 or 4/7)
- [ ] Timelock on contract upgrades (48 hours)
- [ ] Monitor all contract events
- [ ] Rate limiting on APIs
- [ ] Input validation everywhere
- [ ] Regular dependency updates
- [ ] Incident response plan
- [ ] Insurance policy for smart contracts

---

## 📈 Monitoring

### Key Metrics to Watch

```sql
-- Payment success rate (should be >99%)
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate
FROM payments
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Average payment time (should be <30 seconds)
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
FROM payments
WHERE status = 'completed';

-- Total staking TVL
SELECT SUM(amount_hrk) as total_staked
FROM hrk_stakes
WHERE status = 'active';

-- Failed payments (should be <1%)
SELECT COUNT(*) FROM failed_payments
WHERE status = 'pending_retry';
```

---

## 🚨 Common Issues

### Issue: "Contract deployment failed"

**Cause:** Insufficient test ETH for gas
**Fix:**
```bash
# Get test ETH from Base Sepolia faucet
# https://www.base.org/faucet
```

### Issue: "Payment listener not detecting events"

**Cause:** Incorrect contract address or RPC URL
**Fix:**
```bash
# Verify addresses in .env
echo $PAYMENT_SPLITTER_ADDRESS
echo $BASE_RPC_URL

# Restart listener
pm2 restart payment-listener
```

### Issue: "Database connection failed"

**Cause:** Incorrect Supabase credentials
**Fix:**
```bash
# Verify Supabase URL and key
# Make sure RLS policies allow service role
```

---

## 🎯 Next Steps

1. **Testnet Testing (Week 1)**
   - Deploy to Base Sepolia
   - Test all payment flows
   - Verify database sync
   - Test frontend integration

2. **Security Audit (Week 2-3)**
   - Smart contract audit
   - Backend security review
   - Penetration testing
   - Fix all findings

3. **Mainnet Preparation (Week 4)**
   - Deploy to Base Mainnet
   - Set up multi-sig wallets
   - Configure monitoring
   - Load test backend

4. **Go Live (Week 5)**
   - Soft launch with small payments
   - Monitor closely for 48 hours
   - Gradual ramp up
   - Full launch

---

## 📚 Resources

- **Full Documentation:** `/PAYMENT_RAIL_README.md`
- **Contract Code:** `/contracts/`
- **Backend Services:** `/backend/services/payments/`
- **Database Schema:** `/database/migrations/create_payment_tables.sql`
- **Environment Config:** `/.env.payment-rail.example`

- **Base Network Docs:** https://docs.base.org
- **RLUSD Information:** https://ripple.com/rlusd
- **Supabase Docs:** https://supabase.com/docs

---

## 💬 Support

- **Technical Issues:** Open GitHub issue
- **Security Issues:** security@hrkey.com (DO NOT open public issue)
- **General Questions:** tech@hrkey.com

---

**Happy Building! 🚀**

*Last Updated: January 18, 2026*
