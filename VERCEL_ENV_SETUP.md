# Vercel Environment Variables Setup

## Required Environment Variables for Production

The following environment variables **must be configured** in your Vercel project settings for the app to work correctly.

### How to Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on **Settings** → **Environment Variables**
3. Add each variable below with its corresponding value
4. Make sure to select **Production**, **Preview**, and **Development** for each variable

---

## Critical Variables (Required for Core Functionality)

### Supabase Configuration
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your_service_role_key_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Where to find these:**
- Login to [Supabase Dashboard](https://app.supabase.com)
- Select your project
- Go to **Settings** → **API**
- Copy the URL and keys

### Stripe Configuration
```bash
STRIPE_SECRET_KEY=sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PRICE_ID_ANNUAL=price_...
```

**Where to find these:**
- Login to [Stripe Dashboard](https://dashboard.stripe.com)
- **STRIPE_SECRET_KEY**: Developers → API Keys → Secret key
- **PRICE_ID_ANNUAL**: Products → Your annual subscription product → Copy price ID
- **STRIPE_WEBHOOK_SECRET**: Developers → Webhooks → Add endpoint → Copy signing secret
  - Webhook URL should be: `https://your-domain.vercel.app/api/webhook`
  - Events to listen: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## Optional Variables (For Enhanced Features)

### Email Service (Resend)
```bash
RESEND_API_KEY=re_...
```

### Base Network (Blockchain)
```bash
PRIVATE_KEY=your_wallet_private_key
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=your_basescan_api_key
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

### Backend URL
```bash
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
BACKEND_PUBLIC_URL=https://your-backend-domain.com
```

---

## Verification Steps

After adding all environment variables:

1. **Redeploy** your Vercel project:
   - Go to **Deployments** tab
   - Click the **...** menu on the latest deployment
   - Select **Redeploy**

2. **Test the Upgrade Pro button**:
   - Login to your dashboard
   - Click "Upgrade Pro"
   - Should redirect to Stripe checkout (not show an error)

3. **Check Vercel logs** if errors persist:
   - Go to **Deployments** → Select latest deployment → **Functions** → `/api/checkout`
   - Look for error messages about missing environment variables

---

## Common Issues

### "Stripe is not configured" error
- **Cause**: `STRIPE_SECRET_KEY` or `PRICE_ID_ANNUAL` is missing
- **Solution**: Add both variables in Vercel Settings → Environment Variables → Redeploy

### "Unexpected end of JSON input" error
- **Cause**: API endpoint crashes before returning JSON (usually missing env vars)
- **Solution**: Check Vercel function logs to see which variable is missing

### Checkout works in development but not production
- **Cause**: Environment variables are only set for Development environment
- **Solution**: Make sure to check **Production** and **Preview** when adding each variable

---

## Testing Locally

To test with the same environment variables locally:

1. Create a `.env.local` file in the project root
2. Copy all the variables from Vercel
3. Run `npm run dev`
4. Test the Upgrade Pro flow

**Note**: Never commit `.env.local` to git (it's already in `.gitignore`)
