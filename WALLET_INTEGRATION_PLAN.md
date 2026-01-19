# HRKey Web3 Wallet Integration Plan

## Executive Summary

This document outlines the integration plan for connecting the existing Web3 payment rail infrastructure to the HRKey user experience. The payment infrastructure (smart contracts, listeners, processors) is already built but not connected to user flows.

**Current State:**
- ✅ ReferencePaymentSplitter.sol deployed
- ✅ RLUSD listener service exists
- ✅ Payment processor service exists
- ✅ Payment database tables exist
- ❌ Users don't have wallets during onboarding
- ❌ Reference verification doesn't trigger payments
- ❌ No notification system
- ❌ No wallet dashboard

**Target State:**
- ✅ Every user has a wallet (custodial or connected)
- ✅ References trigger automatic payments when verified
- ✅ Users receive notifications (email + in-app)
- ✅ Users can view earnings in wallet dashboard

---

## Technology Stack Analysis

### Frontend (Next.js 15)
- **Location:** `/home/user/HRkey-App/HRkey/src/`
- **Framework:** Next.js 15.5.7 (App Router)
- **React:** 19.1.0
- **Styling:** Tailwind CSS 4.1.13
- **Web3:** OnChainKit 1.0.2, Wagmi 2.17.0, Viem 2.37.6
- **State:** No centralized state management (React state + Server Components)
- **Database:** Supabase JS 2.57.4

### Backend (Express.js)
- **Location:** `/home/user/HRkey-App/backend/`
- **Framework:** Express.js 4.18.2
- **Auth:** Supabase Auth (JWT tokens)
- **Database:** Supabase JS 2.45.0
- **Email:** Resend 3.2.0
- **Logging:** Winston 3.19.0 + Sentry 10.29.0

### Database (Supabase PostgreSQL)
- **Users table:** Already has `wallet_address` column (line 18 of 001_identity_and_permissions.sql)
- **Payments table:** Already exists with full structure
- **Payment_splits table:** Already exists
- **Need to add:** `notifications` table, `user_wallets` table (optional)

---

## Current User Flows

### 1. User Dashboard Flow (`/HRkey/src/app/dashboard/page.tsx`)
```
User logs in → Dashboard loads references → Can create new reference draft →
Can send invite (generates mailto link) → Referee receives email manually
```

**Key findings:**
- References have status: `draft`, `submitted`, `active`, `deleted`
- No wallet checks before sending invites
- Manual email invitation via mailto links
- No payment trigger mechanism

### 2. Reference Creation (`/HRkey/src/components/CreateRefButton.jsx`)
```
User connects MetaMask → Creates on-chain reference → Stores in Supabase
```

**Key findings:**
- Already has wallet connection logic
- Only works with MetaMask
- Hardcoded to Base Sepolia testnet
- Not integrated with dashboard flow

### 3. Backend Reference Flow (`/backend/controllers/referencesController.js`)
```
POST /api/references/request → Create invite → Send to referee →
POST /api/references/respond/:token → Referee submits → Reference marked active
```

**Key findings:**
- No payment trigger on verification
- No wallet validation
- No notification system integration

---

## Integration Plan - Phase by Phase

## PHASE 1: Database Schema Extensions

**File:** `/database/migrations/002_wallet_integration.sql`

**Changes:**
1. Add wallet metadata columns to `users` table:
   - `wallet_type` (custodial | non_custodial | null)
   - `wallet_created_at` (timestamp)
   - `encrypted_private_key` (for custodial wallets only)

2. Create `user_wallets` table (for future multi-wallet support):
   - Links user_id to wallet addresses
   - Stores wallet type (custodial, metamask, coinbase, etc.)
   - Stores encrypted private keys (custodial only)

3. Create `notifications` table:
   - In-app notifications for payments, verifications, etc.
   - Real-time updates via Supabase subscriptions

4. Extend `references` table:
   - Add `payment_id` (FK to payments table)
   - Add `payment_status` ('pending' | 'paid' | 'failed')
   - Add `paid_at` timestamp

**Estimated changes:** ~150 lines SQL

---

## PHASE 2: Backend Services

### 2.1 Wallet Management Service

**New File:** `/backend/services/wallet/wallet-manager.ts`

**Responsibilities:**
- Create custodial wallets (generate keypair, encrypt private key)
- Link non-custodial wallets (validate address, save to DB)
- Retrieve wallet info by user ID
- Get wallet balance from blockchain
- Validate wallet addresses (checksum validation)

**Key functions:**
```typescript
- createCustodialWallet(userId, userEmail)
- linkExistingWallet(userId, walletAddress)
- getWalletByUserId(userId)
- getUserBalance(userId)
- validateWalletAddress(address)
```

**Dependencies:**
- ethers.js for wallet generation
- crypto for encryption (AES-256-GCM)
- Supabase for persistence

**Estimated:** ~300 lines TypeScript

---

### 2.2 Notification Manager Service

**New File:** `/backend/services/notifications/notification-manager.ts`

**Responsibilities:**
- Create in-app notifications
- Send email notifications (via Resend)
- Send push notifications (optional - future)
- Mark notifications as read
- Get user notifications

**Key functions:**
```typescript
- createNotification({ userId, type, title, message, data, sendEmail })
- sendEmailNotification({ to, subject, template, data })
- markAsRead(notificationId)
- getUserNotifications(userId, limit)
```

**Email templates needed:**
- Payment received
- Payment request (to employer)
- Reference verified
- Stake reward received

**Estimated:** ~400 lines TypeScript

---

### 2.3 Modify Existing Services

#### A. Payment Processor (`/backend/services/payments/payment-processor.ts`)

**Current:** Creates payment intents, generates QR codes
**Add:** Email notification to payer with payment QR

**Changes:**
- Lines 86-169: Add email sending to `createPaymentIntent()`
- Send payment request email with QR code and payment URL
- Include expiry time (15 minutes)

**Estimated:** +50 lines

---

#### B. RLUSD Listener (`/backend/services/payments/rlusd-listener.ts`)

**Current:** Listens to blockchain, syncs to DB
**Add:** Create in-app and email notifications

**Changes:**
- Lines 306-338: Replace TODO comment with actual notification logic
- Create notification for provider (60% recipient)
- Create notification for candidate (20% recipient)
- Send email notifications via NotificationManager
- Update reference.payment_status = 'paid'

**Estimated:** +80 lines

---

#### C. References Service (`/backend/services/references.service.js`)

**Changes needed:**
- Validate wallet addresses before creating reference invites
- Add wallet validation to `createReferenceRequest()`

**Estimated:** +30 lines

---

## PHASE 3: Backend API Endpoints

### 3.1 Wallet API Routes

**New File:** `/backend/api/wallet/setup.ts`
```
POST /api/wallet/setup
- Body: { userId, walletType, existingAddress? }
- Creates custodial or links non-custodial wallet
- Returns wallet info
```

**New File:** `/backend/api/wallet/balance.ts`
```
GET /api/wallet/balance/:userId
- Returns RLUSD balance from blockchain
- Caches for 30 seconds
```

**New File:** `/backend/api/wallet/info.ts`
```
GET /api/wallet/info/:userId
- Returns wallet details from DB
- Used by frontend to check if user has wallet
```

**Estimated:** ~200 lines total

---

### 3.2 Notifications API Routes

**New File:** `/backend/api/notifications/index.ts`
```
GET /api/notifications
- Query params: limit, offset, unreadOnly
- Returns user's notifications

PATCH /api/notifications/:id/read
- Marks notification as read

GET /api/notifications/unread-count
- Returns count of unread notifications
```

**Estimated:** ~150 lines

---

### 3.3 Modify Reference Verification Endpoint

**File:** `/backend/controllers/referencesController.js`

**Function:** `respondToReferenceInvite()` (lines 375-424)

**Current flow:**
```
Referee submits reference → Validate token → Submit to DB → Return success
```

**New flow:**
```
Referee submits reference → Validate token → Validate wallets exist →
Create payment intent → Send payment QR to employer → Submit to DB →
Link payment to reference → Return success with payment info
```

**Changes needed:**
1. After line 408 (successful submission), add:
   - Get reference provider and candidate wallets
   - Validate both have wallets
   - Create payment intent via PaymentProcessor
   - Link payment_id to reference
   - Send payment request email to employer
   - Return payment info in response

**Edge cases to handle:**
- Provider doesn't have wallet → Return 400 with requiresWallet flag
- Candidate doesn't have wallet → Return 400 with requiresWallet flag
- Payment creation fails → Still save reference, mark payment_status as 'failed'

**Estimated:** +100 lines

---

## PHASE 4: Frontend Components

### 4.1 Wallet Setup Flow

**New File:** `/HRkey/src/components/wallet/WalletSetup.tsx`

**UI Flow:**
```
Step 1: Choose wallet type
  ├─ Custodial Wallet (Easy - We manage)
  └─ Connect Wallet (Advanced - MetaMask, Coinbase)

Step 2a: Custodial Creation
  └─ Click "Create Wallet" → Generate → Show success + address

Step 2b: External Connection
  └─ Show wallet options → Connect via OnChainKit → Save address
```

**Features:**
- Uses OnChainKit for wallet connections
- Supports MetaMask, Coinbase Wallet, WalletConnect
- Shows wallet address after creation
- Option to skip (can set up later)
- Exports seed phrase for custodial (optional)

**Estimated:** ~250 lines TSX

---

### 4.2 Wallet Dashboard Page

**New File:** `/HRkey/src/app/wallet/page.tsx`

**Sections:**
1. **Balance Card**
   - Shows RLUSD balance
   - Shows USD equivalent
   - Shows wallet address (truncated)
   - Withdraw button

2. **Payment History**
   - List of received payments
   - Shows reference ID, amount, date
   - Link to view on BaseScan
   - Filter by status

3. **Withdrawal (Future)**
   - Transfer RLUSD to external wallet
   - Convert to fiat (optional)

**Data fetching:**
- Uses React Query for balance polling
- Fetches payment history from `/api/payments/history`
- Real-time balance updates via Supabase subscriptions

**Estimated:** ~200 lines TSX

---

### 4.3 Wallet Balance Component

**New File:** `/HRkey/src/components/wallet/WalletBalance.tsx`

**Features:**
- Displays current RLUSD balance
- Shows wallet address (with copy button)
- Shows USD equivalent
- Withdrawal button
- Refresh button

**Uses:**
- OnChainKit for wallet connection status
- React Query for balance fetching
- Ethers.js for blockchain balance queries

**Estimated:** ~150 lines TSX

---

### 4.4 Payment History Component

**New File:** `/HRkey/src/components/wallet/PaymentHistory.tsx`

**Features:**
- Table/list of payments received
- Columns: Date, Reference ID, Amount, Status, TX Hash
- Links to BaseScan for transaction details
- Pagination for long lists
- Status badges (completed, pending, failed)

**Estimated:** ~200 lines TSX

---

### 4.5 Notification System

**New File:** `/HRkey/src/components/notifications/NotificationBell.tsx`

**Features:**
- Bell icon in navbar with badge count
- Dropdown showing recent notifications
- Mark as read on click
- Real-time updates via Supabase subscriptions
- Toast notifications for new payments

**Uses:**
- Supabase real-time subscriptions
- React Query for notification fetching
- Tailwind for styling

**Estimated:** ~250 lines TSX

---

**New File:** `/HRkey/src/components/notifications/NotificationToast.tsx`

**Features:**
- Toast popup for new notifications
- Auto-dismiss after 5 seconds
- Click to open relevant page
- Icons for different notification types

**Estimated:** ~100 lines TSX

---

### 4.6 Modify Existing Components

#### A. Dashboard (`/HRkey/src/app/dashboard/page.tsx`)

**Current:** Manual mailto link for invites
**New:** Check for wallets before sending invite

**Changes:**
- Lines 159-186 (`sendInvite` function):
  - Add wallet validation before creating invite
  - Show error if user doesn't have wallet
  - Prompt to create wallet if missing
  - Proceed with invite if wallet exists

**Estimated:** +40 lines

---

#### B. Layout (`/HRkey/src/app/layout.tsx`)

**Current:** Simple layout with Providers
**New:** Add navigation header with wallet and notifications

**Changes:**
- Add `<Navbar />` component inside Providers
- Navbar shows: Logo, Wallet link, Notification bell, User menu

**Estimated:** +20 lines

---

#### C. Create New Navbar Component

**New File:** `/HRkey/src/components/Navbar.tsx`

**Features:**
- Logo (links to home)
- Navigation links (Dashboard, Wallet, References)
- Notification bell with badge
- Wallet address (truncated) with connect button
- User dropdown menu

**Uses:**
- OnChainKit for wallet display
- NotificationBell component
- Link from next/link

**Estimated:** ~150 lines TSX

---

## PHASE 5: Integration Points

### 5.1 Onboarding Flow

**Modify:** `/HRkey/src/app/onboarding/page.tsx` (if exists) OR create new

**Current flow:**
```
User signs up → Email verification → Profile setup → Dashboard
```

**New flow:**
```
User signs up → Email verification → Profile setup →
Wallet setup (new step) → Dashboard
```

**Changes:**
- Add wallet setup step after profile creation
- Use `<WalletSetup />` component
- Allow skip (can set up later from settings)
- Save wallet_address to users table

**If onboarding doesn't exist:**
- Add wallet setup prompt on first dashboard visit
- Show modal with `<WalletSetup />`
- Don't allow reference creation until wallet set up

**Estimated:** ~100 lines TSX

---

### 5.2 Reference Verification Flow

**Current flow (Backend):**
```
POST /api/references/respond/:token →
Validate token → Submit reference → Return success
```

**New flow:**
```
POST /api/references/respond/:token →
Validate token → Check wallets → Submit reference →
Create payment intent → Send payment email → Return payment info
```

**Frontend changes:**
None needed - payment happens server-side

**Backend changes:**
Already covered in Phase 3.3

---

### 5.3 Payment Notification Flow

**Trigger:** RLUSD Listener detects `PaymentProcessed` event

**Flow:**
```
Payment event → Insert payment record → Insert splits →
Update reference status → Create notifications →
Send emails → Show toast in UI
```

**Frontend integration:**
- Supabase real-time subscription in NotificationBell
- Listens to `notifications` table inserts
- Shows toast when new notification arrives
- Updates notification badge count

**Backend:**
Already covered in Phase 2.2 and 2.3B

---

## PHASE 6: Email Templates

### 6.1 Payment Received Email

**New File:** `/backend/emails/templates/payment-received.tsx`

**Content:**
- Subject: "💰 You received [amount] RLUSD from HRKey"
- Shows amount received
- Shows reference ID
- Shows transaction hash with BaseScan link
- CTA: "View in Your Wallet"

**Uses:** @react-email/components (need to install)

**Estimated:** ~100 lines TSX

---

### 6.2 Payment Request Email

**New File:** `/backend/emails/templates/payment-request.tsx`

**Content:**
- Subject: "Reference Verification Payment - [amount] RLUSD"
- Shows candidate name
- Shows amount due
- Shows QR code for mobile wallet
- Shows expiry time (15 minutes)
- CTA: "Pay with Wallet" button
- Explains payment split breakdown

**Estimated:** ~150 lines TSX

---

### 6.3 Wallet Created Email

**New File:** `/backend/emails/templates/wallet-created.tsx`

**Content:**
- Subject: "Welcome to HRKey Wallet"
- Shows wallet address
- Explains how payments work
- Security tips (for custodial wallets)
- CTA: "View Your Wallet"

**Estimated:** ~100 lines TSX

---

## PHASE 7: Testing & Deployment

### 7.1 Integration Tests

**New File:** `/backend/__tests__/wallet-integration.test.ts`

**Test scenarios:**
1. User creates custodial wallet
2. User connects MetaMask wallet
3. Reference verification triggers payment
4. Payment listener creates notifications
5. User receives email on payment
6. Wallet balance updates correctly

**Uses:** Jest, Supertest

**Estimated:** ~300 lines

---

### 7.2 Deployment Checklist

**File:** `/WALLET_INTEGRATION_DEPLOYMENT.md`

**Sections:**
- Pre-deployment checks
- Environment variables needed
- Database migration steps
- Service startup order
- Monitoring setup
- Rollback plan

**Estimated:** ~100 lines Markdown

---

## File Structure Summary

### New Files to Create (21 files)

**Database:**
- `/database/migrations/002_wallet_integration.sql`

**Backend Services:**
- `/backend/services/wallet/wallet-manager.ts`
- `/backend/services/notifications/notification-manager.ts`

**Backend API:**
- `/backend/api/wallet/setup.ts`
- `/backend/api/wallet/balance.ts`
- `/backend/api/wallet/info.ts`
- `/backend/api/notifications/index.ts`

**Email Templates:**
- `/backend/emails/templates/payment-received.tsx`
- `/backend/emails/templates/payment-request.tsx`
- `/backend/emails/templates/wallet-created.tsx`

**Frontend Components:**
- `/HRkey/src/components/wallet/WalletSetup.tsx`
- `/HRkey/src/components/wallet/WalletBalance.tsx`
- `/HRkey/src/components/wallet/PaymentHistory.tsx`
- `/HRkey/src/components/wallet/WithdrawRLUSD.tsx`
- `/HRkey/src/components/notifications/NotificationBell.tsx`
- `/HRkey/src/components/notifications/NotificationToast.tsx`
- `/HRkey/src/components/Navbar.tsx`

**Frontend Pages:**
- `/HRkey/src/app/wallet/page.tsx`
- `/HRkey/src/app/onboarding/page.tsx` (if doesn't exist)

**Tests & Docs:**
- `/backend/__tests__/wallet-integration.test.ts`
- `/WALLET_INTEGRATION_DEPLOYMENT.md`

---

### Files to Modify (6 files)

**Backend:**
- `/backend/services/payments/payment-processor.ts` (~50 lines added)
- `/backend/services/payments/rlusd-listener.ts` (~80 lines added)
- `/backend/services/references.service.js` (~30 lines added)
- `/backend/controllers/referencesController.js` (~100 lines added)

**Frontend:**
- `/HRkey/src/app/dashboard/page.tsx` (~40 lines added)
- `/HRkey/src/app/layout.tsx` (~20 lines added)

---

## Environment Variables Needed

**Add to `.env`:**
```bash
# Wallet Encryption
WALLET_ENCRYPTION_KEY=<32-byte-hex-string>

# Email Service (Resend)
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=noreply@hrkey.com

# WalletConnect (for OnChainKit)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<project-id>

# Base Network
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Contract Addresses
PAYMENT_SPLITTER_ADDRESS=<deployed-contract-address>
RLUSD_TOKEN_ADDRESS=<rlusd-token-address>
```

---

## Estimated Total Work

**Lines of Code:**
- Database: ~150 lines SQL
- Backend: ~1,390 lines TypeScript/JavaScript
- Frontend: ~1,560 lines TSX/TypeScript
- Tests: ~300 lines
- **Total: ~3,400 lines of code**

**Time Estimate:**
- Phase 1 (Database): 2 hours
- Phase 2 (Backend Services): 8 hours
- Phase 3 (Backend API): 6 hours
- Phase 4 (Frontend Components): 12 hours
- Phase 5 (Integration): 4 hours
- Phase 6 (Email Templates): 3 hours
- Phase 7 (Testing): 5 hours
- **Total: ~40 hours** (1 week for 1 engineer)

---

## Critical Success Factors

1. **Wallet Security:** Proper encryption of custodial wallet private keys
2. **Payment Validation:** Ensure both parties have wallets before verification
3. **Notification Reliability:** Use Supabase real-time + polling fallback
4. **Error Handling:** Graceful failures, retry logic for blockchain operations
5. **User Experience:** Clear error messages, loading states, confirmations

---

## Rollback Plan

**If issues occur:**
1. Stop RLUSD listener service
2. Disable wallet setup in onboarding (allow skip)
3. Revert reference verification endpoint (remove payment trigger)
4. Investigate and fix issues
5. Re-enable services one by one

**Database rollback:**
```sql
-- Remove added columns
ALTER TABLE users DROP COLUMN wallet_type;
ALTER TABLE users DROP COLUMN wallet_created_at;
ALTER TABLE users DROP COLUMN encrypted_private_key;

-- Drop new tables
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS user_wallets;

-- Remove reference payment columns
ALTER TABLE references DROP COLUMN payment_id;
ALTER TABLE references DROP COLUMN payment_status;
```

---

## Next Steps

1. ✅ **Review this plan** - Confirm approach and architecture
2. ⏳ **Phase 1: Database** - Create migration, run on staging
3. ⏳ **Phase 2: Backend Services** - Build wallet manager and notification system
4. ⏳ **Phase 3: Backend API** - Create endpoints and modify controllers
5. ⏳ **Phase 4: Frontend Components** - Build UI components
6. ⏳ **Phase 5: Integration** - Connect all pieces
7. ⏳ **Phase 6: Email Templates** - Design and test emails
8. ⏳ **Phase 7: Testing** - Integration tests and QA
9. ⏳ **Deploy to Staging** - Test full flow on testnet
10. ⏳ **Deploy to Production** - Go live on Base mainnet

---

## Questions for Review

1. **Wallet Strategy:** Should we support only custodial, only non-custodial, or both?
2. **Email Service:** Confirm Resend is the email provider (already in package.json)
3. **Onboarding:** Is there an existing onboarding flow, or should we add to dashboard?
4. **Payment Trigger:** Should payment be required BEFORE verification or AFTER?
5. **Withdrawal:** Should we support withdrawals to external wallets in Phase 1?

---

**Document Version:** 1.0
**Author:** Claude (AI Assistant)
**Date:** 2026-01-19
**Status:** Awaiting Review
