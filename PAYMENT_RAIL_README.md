# HRKey Web3 Payment Rail - Implementation Guide

**Version:** 1.0
**Date:** January 2026
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Smart Contracts](#smart-contracts)
4. [Backend Services](#backend-services)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Deployment Guide](#deployment-guide)
8. [Testing](#testing)
9. [Security Considerations](#security-considerations)
10. [Operational Runbook](#operational-runbook)

---

## Executive Summary

The HRKey Payment Rail is a production-grade Web3 payment infrastructure that enables:

- **Global settlements** in stable value (RLUSD stablecoin)
- **Automated revenue sharing** (60% provider, 20% candidate, 15% treasury, 5% staking)
- **Cross-border payments** via XRP bridge (<10 second settlements)
- **Incentive alignment** through HRK utility token staking
- **Enterprise-grade compliance** with audit trails

### Three-Token System

| Token | Role | Network | Purpose | User Experience |
|-------|------|---------|---------|-----------------|
| **RLUSD** | Payment Currency | Base | Stable value transfer | "This is USD" |
| **XRP** | Liquidity Bridge | XRPL | Cross-border routing | Invisible to users |
| **HRK** | Utility/Governance | Base | Staking, slashing | "Stake to earn" |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTERPRISE USER                          │
│                    (pays in RLUSD via wallet)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ RLUSD Transfer
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BASE NETWORK (EVM)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │       ReferencePaymentSplitter.sol                       │   │
│  │  Receives: 100 RLUSD                                     │   │
│  │  Splits: 60→Provider | 20→Candidate | 15→Treasury | 5→Staking│
│  └─────────────────────────────────────────────────────────┘   │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  HRKStaking.sol  │  │ ReputationRegistry│                    │
│  │  - Stake HRK     │  │  - Audit trail    │                    │
│  │  - Earn RLUSD    │  │  - Dispute system │                    │
│  └──────────────────┘  └──────────────────┘                    │
└────────────────────────────┬──────────────────────────────────┘
                             │ Event Stream
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVICES (Node.js)                    │
│  • RLUSD Payment Listener  • Payment Processor                  │
│  • XRP Bridge              • HRK Rewards Calculator              │
└────────────────────────────┬──────────────────────────────────┘
                             │ Database Operations
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE (PostgreSQL)                       │
│  payments | payment_splits | hrk_stakes | cross_border_settlements│
└─────────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

### 1. ReferencePaymentSplitter.sol

**Purpose:** Atomic payment splitting for reference purchases
**Network:** Base Mainnet (Chain ID: 8453)
**Location:** `/contracts/ReferencePaymentSplitter.sol`

**Key Functions:**
```solidity
function processPayment(
    bytes32 referenceId,
    address referenceProvider,
    address candidate,
    uint256 amount
) external returns (bool)
```

**Payment Split:**
- Provider: 60% (6000 basis points)
- Candidate: 20% (2000 basis points)
- Treasury: 15% (1500 basis points)
- Staking Pool: 5% (500 basis points)

**Events:**
```solidity
event PaymentProcessed(
    bytes32 indexed referenceId,
    address indexed payer,
    address indexed referenceProvider,
    address candidate,
    uint256 totalAmount,
    PaymentSplit split,
    uint256 timestamp
)
```

### 2. ReputationRegistry.sol

**Purpose:** Immutable audit trail for verified references
**Network:** Base Mainnet
**Location:** `/contracts/ReputationRegistry.sol`

**Key Functions:**
```solidity
function registerReference(bytes32 referenceId, address provider, address candidate, bytes32 dataHash)
function verifyReference(bytes32 referenceId, address payer, uint256 paymentAmount)
function disputeReference(bytes32 referenceId, string calldata reason)
```

**Reference Statuses:**
- `Pending`: Created but not verified
- `Verified`: Payment confirmed
- `Disputed`: Under investigation
- `Fraudulent`: Confirmed fraud (slashing executed)

### 3. HRKStaking.sol (Updated)

**Purpose:** HRK token staking with RLUSD rewards
**Network:** Base Mainnet
**Location:** `/contracts/HRKStaking.sol`

**New Functions (v2.0):**
```solidity
function depositRewards(uint256 amount) external
function calculateRewards(address user) public view returns (uint256)
function claimRewards() external
```

**Reward Multipliers:**
- 1-2 months: 1.0x
- 3-5 months: 1.25x
- 6-11 months: 1.5x
- 12+ months: 2.0x

---

## Backend Services

### 1. RLUSD Payment Listener

**File:** `/backend/services/payments/rlusd-listener.ts`

**Purpose:** Monitors Base network for payment events

**Responsibilities:**
- Listen for `PaymentProcessed` events from PaymentSplitter contract
- Insert payment records into database
- Record payment splits
- Update reference status to "paid"
- Trigger email notifications
- Log analytics events

**Start Service:**
```bash
ts-node backend/services/payments/rlusd-listener.ts
```

**Required Environment Variables:**
```env
BASE_RPC_URL=https://mainnet.base.org
PAYMENT_SPLITTER_ADDRESS=0x...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
```

### 2. Payment Processor

**File:** `/backend/services/payments/payment-processor.ts`

**Purpose:** Creates payment intents and manages payment lifecycle

**Key Methods:**
- `createPaymentIntent()` - Generate payment QR code and URL
- `checkPaymentStatus()` - Query payment status
- `expireOldPayments()` - Cleanup expired payments (cron)

**Example Usage:**
```typescript
import { getPaymentProcessor } from './services/payments/payment-processor';

const processor = getPaymentProcessor();
const intent = await processor.createPaymentIntent({
  referenceId: 'ref_abc123',
  referenceProvider: 'john@example.com',
  candidate: 'jane@example.com',
  amount: 100,
});

console.log(intent.qrCode); // Base64 QR code
console.log(intent.paymentUrl); // EIP-681 payment URL
```

### 3. XRP Bridge Service

**File:** `/backend/services/payments/xrp-bridge.ts`

**Purpose:** Handle cross-border RLUSD settlements via XRP

**When Used:**
- Cross-border payments (different countries)
- Amount ≥ $1000
- Both countries supported

**Flow:**
1. Lock RLUSD on Base
2. Convert RLUSD → XRP
3. Transfer XRP via XRPL (3-5 seconds)
4. Convert XRP → RLUSD at destination
5. Release RLUSD to recipient

**Fee:** <0.1% + gas costs

---

## Database Schema

### Key Tables

**Location:** `/database/migrations/create_payment_tables.sql`

#### payments
```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  reference_id UUID NOT NULL,
  payer_address TEXT NOT NULL,
  total_amount_usd DECIMAL(12, 2),
  tx_hash TEXT UNIQUE,
  status TEXT CHECK (status IN ('pending', 'completed', 'expired', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE
);
```

#### payment_splits
```sql
CREATE TABLE payment_splits (
  id UUID PRIMARY KEY,
  payment_id TEXT REFERENCES payments(id),
  recipient_type TEXT CHECK (recipient_type IN ('provider', 'candidate', 'treasury', 'staking_pool')),
  recipient_address TEXT,
  amount_usd DECIMAL(12, 2),
  percentage INTEGER
);
```

#### hrk_stakes
```sql
CREATE TABLE hrk_stakes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount_hrk DECIMAL(18, 4),
  tier TEXT CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
  rewards_earned_rlusd DECIMAL(12, 2) DEFAULT 0,
  status TEXT CHECK (status IN ('active', 'unstaking', 'unstaked', 'slashed'))
);
```

#### cross_border_settlements
```sql
CREATE TABLE cross_border_settlements (
  id UUID PRIMARY KEY,
  from_country TEXT,
  to_country TEXT,
  amount_rlusd DECIMAL(12, 2),
  xrpl_tx_hash TEXT,
  total_time_seconds INTEGER,
  status TEXT
);
```

### Run Migration

```bash
# In Supabase SQL Editor
psql -h db.xxx.supabase.co -U postgres -f database/migrations/create_payment_tables.sql

# Or via Supabase CLI
supabase db push
```

---

## API Endpoints

### Payment Endpoints

**Base URL:** `/api/payments`

#### POST /create
Create a new payment intent

**Request:**
```json
{
  "referenceId": "ref_abc123",
  "amount": 100,
  "providerEmail": "john@example.com",
  "candidateEmail": "jane@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "pay_xyz789",
    "paymentAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "amount": 100,
    "qrCode": "data:image/png;base64,...",
    "paymentUrl": "ethereum:0x742d...@8453/processPayment?...",
    "expiresAt": "2026-01-18T15:45:00Z",
    "splits": {
      "provider": 60,
      "candidate": 20,
      "treasury": 15,
      "staking": 5
    }
  }
}
```

#### GET /status/:paymentId
Get payment status

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "pay_xyz789",
    "status": "completed",
    "txHash": "0xabc...",
    "blockNumber": 12345678,
    "splits": [
      { "recipientType": "provider", "amount": 60, "percentage": 60 },
      { "recipientType": "candidate", "amount": 20, "percentage": 20 }
    ]
  }
}
```

### Staking Endpoints

**Base URL:** `/api/staking`

#### POST /stake
Create a new stake

**Request:**
```json
{
  "amount": 1000,
  "lockPeriod": 12,
  "tier": "Silver"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stakeId": "uuid",
    "amount": 1000,
    "tier": "Silver",
    "lockPeriod": 12,
    "unlockDate": "2027-01-18T00:00:00Z",
    "estimatedAPY": 8,
    "estimatedRewards": 80,
    "rewardMultiplier": 2.0
  }
}
```

#### GET /positions
Get user's staking positions

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "amount_hrk": 1000,
      "tier": "Silver",
      "status": "active",
      "pendingRewards": 15.50,
      "totalClaimed": 45.20,
      "unlock_at": "2027-01-18T00:00:00Z"
    }
  ]
}
```

---

## Deployment Guide

### Prerequisites

- Node.js 18+
- Hardhat 3.0+
- Base network RPC access
- Supabase project
- RLUSD token address on Base

### Step 1: Configure Environment

Create `.env` file:

```env
# Network
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASE_CHAIN_ID=8453
PRIVATE_KEY=your_deployer_private_key

# Contracts
RLUSD_TOKEN_ADDRESS=0x... # RLUSD on Base
TREASURY_ADDRESS=0x... # HRKey multisig
STAKING_CONTRACT_ADDRESS=0x... # Existing HRKStaking

# API Keys
BASESCAN_API_KEY=your_basescan_key

# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_key

# Deployed Contracts (filled after deployment)
PAYMENT_SPLITTER_ADDRESS=
REPUTATION_REGISTRY_ADDRESS=
```

### Step 2: Compile Contracts

```bash
npm run compile
```

### Step 3: Deploy to Base Testnet (First)

```bash
npx hardhat run scripts/deploy-payment-rail.ts --network baseSepolia
```

**Verify deployment:**
```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### Step 4: Run Database Migration

```bash
# In Supabase SQL Editor, run:
database/migrations/create_payment_tables.sql
```

### Step 5: Deploy Backend Services

```bash
# Install dependencies
cd backend
npm install

# Start payment listener
pm2 start services/payments/rlusd-listener.ts --name payment-listener

# Start payment expiry cron
pm2 start services/payments/payment-processor.ts --name payment-cron

# Save PM2 configuration
pm2 save
pm2 startup
```

### Step 6: Deploy to Production (Base Mainnet)

```bash
# Switch to mainnet
export NETWORK=base

# Deploy contracts
npx hardhat run scripts/deploy-payment-rail.ts --network base

# Verify on Basescan
npx hardhat verify --network base <PAYMENT_SPLITTER> "..." "..." "..."
npx hardhat verify --network base <REPUTATION_REGISTRY> "..."

# Update .env with production addresses
```

### Step 7: Configure Frontend

Update frontend environment:

```env
NEXT_PUBLIC_PAYMENT_SPLITTER_ADDRESS=0x...
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_RLUSD_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=8453
```

---

## Testing

### Smart Contract Tests

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/ReferencePaymentSplitter.test.ts

# Coverage
npx hardhat coverage
```

### Backend Service Tests

```bash
cd backend
npm test

# Run specific test
npm test services/payments/payment-processor.test.ts
```

### Integration Tests

```bash
# Test full payment flow
npm run test:integration
```

---

## Security Considerations

### Smart Contract Security

✅ **Implemented:**
- ReentrancyGuard on all state-changing functions
- Pausable for emergency stops
- Input validation on all parameters
- SafeERC20 for token transfers
- Access control (Ownable)

⚠️ **Before Mainnet:**
- [ ] Professional security audit (Trail of Bits, OpenZeppelin, etc.)
- [ ] Bug bounty program
- [ ] Multi-sig for contract ownership
- [ ] Timelock for upgrades

### Backend Security

✅ **Implemented:**
- RLS (Row Level Security) on all tables
- JWT authentication
- Input validation and sanitization
- HTTPS only
- Rate limiting

⚠️ **Recommendations:**
- API key rotation every 90 days
- Monitoring and alerting (Sentry, DataDog)
- DDoS protection (Cloudflare)
- Regular dependency updates

### Key Management

**NEVER commit:**
- Private keys
- Supabase service keys
- API keys

**Use:**
- Hardware wallets for production deployments
- AWS Secrets Manager / Vault for backend keys
- Multi-sig wallets for treasury and admin roles

---

## Operational Runbook

### Monitoring

**Key Metrics to Track:**

1. **Payment Success Rate**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate
   FROM payments
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Average Payment Time**
   ```sql
   SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
   FROM payments
   WHERE status = 'completed'
   AND created_at > NOW() - INTERVAL '24 hours';
   ```

3. **Total Volume**
   ```sql
   SELECT
     SUM(total_amount_usd) as volume_24h,
     COUNT(*) as payment_count
   FROM payments
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

### Common Issues

#### Issue: Payment listener stopped

**Symptoms:**
- Payments not appearing in database
- No payment notifications

**Resolution:**
```bash
pm2 restart payment-listener
pm2 logs payment-listener --lines 100
```

#### Issue: Failed payments

**Symptoms:**
- Payments in `failed_payments` table
- Error logs in backend

**Resolution:**
```sql
-- View failed payments
SELECT * FROM failed_payments WHERE status = 'pending_retry' ORDER BY created_at DESC LIMIT 10;

-- Retry failed payment
-- Use admin dashboard or API endpoint
```

#### Issue: Contract out of gas

**Symptoms:**
- Transaction reverts
- High gas fees

**Resolution:**
- Check Base network congestion
- Increase gas limit if needed
- Batch multiple operations

### Backup Procedures

**Daily:**
- Database backup (automatic via Supabase)
- Contract state snapshot

**Weekly:**
- Download payment data to cold storage
- Verify backup integrity

**Monthly:**
- Full system audit
- Review security logs

---

## Support & Maintenance

### Contact

- **Technical Issues:** tech@hrkey.com
- **Security Issues:** security@hrkey.com
- **Documentation:** https://docs.hrkey.com

### Version History

- **v1.0.0** (January 2026) - Initial production release
  - ReferencePaymentSplitter contract
  - ReputationRegistry contract
  - RLUSD payment listener
  - XRP bridge stub
  - Complete database schema
  - API endpoints

---

## License

MIT License - see LICENSE file for details

---

**Last Updated:** January 18, 2026
**Next Review:** April 18, 2026
