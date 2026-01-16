# Stripe Payment Integration Setup

This document explains how to configure Stripe for the HRKey PRO upgrade feature.

## Overview

The HRKey app uses Stripe Checkout to process PRO upgrade payments at **$0.50 USD**.

## Setup Steps

### 1. Create Stripe Account

If you don't have one already:
- Go to https://stripe.com
- Sign up for an account
- Complete verification (can take a few days for production)

### 2. Create a Product and Price

1. Go to **Stripe Dashboard** → **Products**
2. Click **Add Product**
3. Configure:
   - **Name**: HRKey PRO Upgrade
   - **Description**: Unlock unlimited references, blockchain publishing, PDF export, and more
   - **Pricing**:
     - One-time payment
     - Amount: **$0.50 USD**
   - Click **Save product**

4. Copy the **Price ID** (starts with `price_...`)

### 3. Get Your API Keys

1. Go to **Developers** → **API keys**
2. You'll see two types of keys:

   **Test Mode** (for development/preview):
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

   **Live Mode** (for production):
   - Publishable key: `pk_live_...`
   - Secret key: `sk_live_...`

3. Copy your **Publishable Key** (you'll use this in the frontend)

### 4. Configure the Frontend

Update the following file:
**`HRkey/public/WebDapp/reference-management-page.html`**

Find these lines (around line 652-653):

```javascript
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51QYourPublishableKeyHere'; // Replace with your key
const STRIPE_PRICE_ID = 'price_1QYourPriceIDHere'; // $0.50 price ID created in Stripe Dashboard
```

Replace with your actual values:

```javascript
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_ACTUAL_KEY_HERE'; // Use pk_live_... for production
const STRIPE_PRICE_ID = 'price_YOUR_ACTUAL_PRICE_ID_HERE'; // From step 2
```

### 5. Test the Payment Flow

**Using Test Mode:**

1. Use the test publishable key (`pk_test_...`)
2. Use these test card numbers:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Any future expiry date (e.g., 12/34)
   - Any 3-digit CVC
   - Any ZIP code

3. Click "Upgrade to PRO" in the app
4. Complete the test payment
5. Verify the success page appears
6. Check that PRO features are unlocked

**View Test Payments:**
- Go to **Stripe Dashboard** → **Payments** (make sure you're in Test mode)
- You'll see all test transactions

### 6. Go Live (Production)

When ready for real payments:

1. Complete Stripe account verification
2. Switch to **Live mode** in Stripe Dashboard
3. Create a new **Live Price** for $0.50 (get the live `price_...` ID)
4. Update the frontend code with:
   - Live publishable key: `pk_live_...`
   - Live price ID: `price_...`
5. Test with a small real payment
6. Deploy to production

## Payment Flow

1. User clicks "Upgrade to PRO" in reference management
2. Modal shows PRO features and $0.50 price
3. User clicks "Pay $0.50 - Upgrade to PRO"
4. Redirected to Stripe Checkout hosted page
5. User enters payment details
6. On success → redirected to `/WebDapp/payment-success.html`
7. User's plan is upgraded to PRO in localStorage
8. On cancel → redirected back to reference management page

## Security Notes

- ✅ **Publishable key** can be safely used in frontend (starts with `pk_`)
- ❌ **Secret key** should NEVER be in frontend code (keep it server-side)
- The current implementation uses client-side checkout (safe for simple use cases)
- For production, consider adding webhook verification to prevent tampering

## Webhooks (Optional but Recommended)

To track payments server-side:

1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://yourdomain.com/api/stripe-webhook`
3. Select events: `checkout.session.completed`
4. Use the webhook secret to verify events server-side

## Pricing Configuration

Current price: **$0.50 USD** (one-time payment)

To change the price:
1. Create a new Price in Stripe Dashboard
2. Update `STRIPE_PRICE_ID` in the code
3. Update the displayed price in `showUpgradeModal()` function

## Support

- Stripe Documentation: https://stripe.com/docs/payments/checkout
- Stripe Test Cards: https://stripe.com/docs/testing
- Contact Stripe Support: https://support.stripe.com

## Current Integration Status

- ✅ Stripe.js loaded
- ✅ Checkout flow configured
- ✅ Success page created
- ✅ PRO upgrade activation
- ✅ Price set to $0.50
- ⚠️ Needs actual Stripe keys (currently has placeholders)
- ⚠️ Needs actual Price ID (currently has placeholder)

## Preview/Test Mode

While in preview mode (before configuring actual keys):
- Payment buttons will appear but fail to process
- Use test keys for development
- No real charges will occur with test keys
