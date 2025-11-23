# 🚀 HRKey - Production Deployment Guide

This guide covers deploying HRKey to production using modern cloud platforms.

**Recommended Stack:**
- **Frontend**: Vercel (Next.js optimized)
- **Backend**: Railway or Render (Node.js/Express)
- **Database**: Supabase (Managed PostgreSQL + Auth)
- **Payments**: Stripe
- **Emails**: Resend
- **ML Pipeline**: GitHub Actions (scheduled) or separate Python server

---

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#-pre-deployment-checklist)
2. [Database Setup (Supabase)](#-database-setup-supabase)
3. [Backend Deployment (Railway)](#-backend-deployment-railway)
4. [Frontend Deployment (Vercel)](#-frontend-deployment-vercel)
5. [ML Pipeline Setup](#-ml-pipeline-setup)
6. [Stripe Configuration](#-stripe-configuration)
7. [Post-Deployment Verification](#-post-deployment-verification)
8. [Troubleshooting](#-troubleshooting)

---

## ✅ Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] **GitHub repository** with latest code
- [ ] **Supabase account** ([sign up](https://supabase.com))
- [ ] **Vercel account** (free tier available)
- [ ] **Railway or Render account** (free tier available)
- [ ] **Stripe account** (test mode OK for staging)
- [ ] **Resend account** (free tier: 100 emails/day)
- [ ] **Domain name** (optional, but recommended)

---

## 🗄️ Database Setup (Supabase)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose organization and fill in:
   - **Project name**: `hrkey-production` (or similar)
   - **Database password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### Step 2: Run SQL Migrations

Once your project is ready:

1. Go to **SQL Editor** in left sidebar
2. Run each migration file in order:

**Migration 1: Identity & Permissions**
```sql
-- Copy/paste contents of: sql/001_identity_and_permissions.sql
```

**Migration 2: Data Access & Revenue**
```sql
-- Copy/paste contents of: sql/002_data_access_and_revenue_sharing.sql
```

**Migration 3: Correlation Engine**
```sql
-- Copy/paste contents of: sql/003_correlation_engine_schema.sql
```

**Migration 4: KPI Observations**
```sql
-- Copy/paste contents of: sql/004_kpi_observations.sql
```

3. Verify tables were created:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see:
- `users`, `user_wallets`, `user_plans`
- `references`, `reference_invites`
- `companies`, `company_signers`
- `kpi_observations`
- `data_access_requests`, `revenue_shares`
- etc.

### Step 3: Get API Credentials

1. Go to **Settings** → **API** in Supabase dashboard
2. Copy these values (you'll need them for backend/frontend):
   - **Project URL**: `https://yourproject.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR...` (for frontend)
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR...` (for backend, **KEEP SECRET!**)

### Step 4: Configure Row Level Security (RLS)

RLS policies are already defined in the SQL migrations. Verify they're enabled:

1. Go to **Authentication** → **Policies**
2. Check that tables like `companies`, `company_signers`, `data_access_requests` have policies enabled

---

## 🖥️ Backend Deployment (Railway)

### Option A: Railway (Recommended)

#### Step 1: Connect GitHub Repository

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select **`HRkey-App`** repository
4. Railway will detect `package.json` but we need to configure root directory

#### Step 2: Configure Service

1. Click on the deployed service
2. Go to **Settings** tab:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Click **"Save"**

#### Step 3: Set Environment Variables

Go to **Variables** tab and add:

```bash
# URLs
PUBLIC_BASE_URL=https://hrkey.xyz  # Your frontend domain
API_BASE_URL=https://your-backend.railway.app  # Railway will provide this

# Database
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR...  # SERVICE ROLE KEY

# Email
RESEND_API_KEY=re_your_key_here

# Stripe
STRIPE_SECRET_KEY=sk_live_your_key_here  # Use sk_live_ for production!
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Admin
HRKEY_SUPERADMIN_EMAIL=admin@yourcompany.com

# Server
PORT=3001  # Railway might override this
```

#### Step 4: Deploy

1. Railway auto-deploys on every push to `main`
2. Check **Deployments** tab to see build logs
3. Once deployed, Railway provides a public URL: `https://hrkey-backend-production.up.railway.app`
4. Save this URL - you'll need it for frontend configuration

#### Step 5: Verify Backend

Visit your Railway URL + `/health`:
```
https://your-backend.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "service": "HRKey Backend Service",
  "timestamp": "2025-11-22T...",
  "email": "configured",
  "app_url": "https://hrkey.xyz",
  "backend_url": "https://your-backend.railway.app"
}
```

---

### Option B: Render (Alternative)

#### Step 1: Create Web Service

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `hrkey-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for production)

#### Step 2: Environment Variables

In Render dashboard, add same environment variables as Railway (see above).

#### Step 3: Deploy

Render auto-deploys. Check logs for any errors.

Your backend URL will be: `https://hrkey-backend.onrender.com`

---

## 🌐 Frontend Deployment (Vercel)

### Step 1: Connect GitHub Repository

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your **`HRkey-App`** repository

### Step 2: Configure Project

Vercel auto-detects Next.js. Configure:

- **Framework Preset**: Next.js
- **Root Directory**: `.` (leave as root)
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)

### Step 3: Environment Variables

Click **"Environment Variables"** and add:

```bash
# Frontend URLs
NEXT_PUBLIC_BASE_URL=https://hrkey.xyz  # Your custom domain
PUBLIC_BASE_URL=https://hrkey.xyz

# Backend API
API_BASE_URL=https://your-backend.railway.app  # From Railway deployment

# Supabase (Frontend)
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...  # ANON KEY, not service key!

# Stripe (Frontend - optional for client-side SDK)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

**Important**: Only variables starting with `NEXT_PUBLIC_` are exposed to the browser!

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel builds and deploys automatically
3. Once complete, you'll get a URL: `https://hrkey-app.vercel.app`

### Step 5: Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain: `hrkey.xyz`
3. Update DNS records as instructed by Vercel:
   - **A Record**: `76.76.21.21`
   - **CNAME**: `cname.vercel-dns.com`
4. Wait for DNS propagation (~5-60 minutes)

### Step 6: Update Backend CORS

Since frontend is now on a different domain, update backend CORS settings:

In `backend/server.js`:
```javascript
app.use(cors({
  origin: [
    'https://hrkey.xyz',
    'https://hrkey-app.vercel.app',
    'http://localhost:3000'  // For local development
  ],
  credentials: true
}));
```

Redeploy backend after this change.

---

## 🤖 ML Pipeline Setup

You have **two options** for running the ML pipeline:

### Option A: GitHub Actions (Recommended for MVP)

Run ML scripts on a schedule using GitHub Actions.

#### Step 1: Create Workflow File

Create `.github/workflows/ml-pipeline.yml`:

```yaml
name: ML Pipeline - HRKey Score Model Training

on:
  schedule:
    # Run every Sunday at 2 AM UTC
    - cron: '0 2 * * 0'
  workflow_dispatch:  # Allow manual trigger

jobs:
  train-model:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'

      - name: Install dependencies
        run: |
          cd ml
          pip install -r requirements.txt

      - name: Run correlation analysis
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          cd ml
          python correlation_analysis.py

      - name: Train baseline model
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          cd ml
          python baseline_predictive_model.py

      - name: Export model config
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          cd ml
          python export_hrkey_model_config.py

      - name: Commit updated model config
        run: |
          git config user.name "GitHub Actions Bot"
          git config user.email "actions@github.com"
          git add ml/output/hrkey_model_config_global.json
          git diff-index --quiet HEAD || git commit -m "chore: update ML model config [skip ci]"
          git push
```

#### Step 2: Add GitHub Secrets

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add repository secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

#### Step 3: Trigger Workflow

- **Automatic**: Runs every Sunday at 2 AM UTC
- **Manual**: Go to **Actions** tab → **ML Pipeline** → **Run workflow**

---

### Option B: Dedicated ML Server (For Production Scale)

Deploy Python scripts as a FastAPI service on Railway/Render.

#### Step 1: Create ML API

Create `ml/api_server.py`:

```python
from fastapi import FastAPI, BackgroundTasks
import subprocess

app = FastAPI()

@app.post("/train")
async def train_model(background_tasks: BackgroundTasks):
    """Trigger ML pipeline in background"""
    background_tasks.add_task(run_ml_pipeline)
    return {"status": "training started"}

def run_ml_pipeline():
    subprocess.run(["python", "correlation_analysis.py"])
    subprocess.run(["python", "baseline_predictive_model.py"])
    subprocess.run(["python", "export_hrkey_model_config.py"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

#### Step 2: Deploy to Railway

Same process as backend, but:
- **Root Directory**: `ml`
- **Start Command**: `uvicorn api_server:app --host 0.0.0.0 --port $PORT`

#### Step 3: Trigger from Backend

Add endpoint in `backend/server.js`:

```javascript
app.post('/api/admin/retrain-model', requireSuperadmin, async (req, res) => {
  const ML_SERVER_URL = process.env.ML_SERVER_URL;
  await fetch(`${ML_SERVER_URL}/train`, { method: 'POST' });
  res.json({ success: true, message: 'Model retraining started' });
});
```

---

## 💳 Stripe Configuration

### Step 1: Create Stripe Account

1. Sign up at [stripe.com](https://stripe.com)
2. Complete business verification (required for live mode)

### Step 2: Get API Keys

1. Go to **Developers** → **API keys**
2. Copy:
   - **Publishable key**: `pk_live_...` (safe to expose in frontend)
   - **Secret key**: `sk_live_...` (**NEVER expose publicly!**)

### Step 3: Create Products & Prices

1. Go to **Products** → **Add product**
2. Create pricing tiers:
   - **Free Plan**: $0
   - **Pro Lifetime**: $99 (one-time)
   - **Pro Annual**: $49/year (recurring)
3. Copy **Price IDs** (e.g., `price_1234567890`)

### Step 4: Configure Webhooks

1. Go to **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://your-backend.railway.app/webhook`
3. Events to listen to:
   - `payment_intent.succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy **Signing secret**: `whsec_...`
5. Add to backend environment: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Step 5: Test Webhooks

Use Stripe CLI to test locally:
```bash
stripe listen --forward-to localhost:3001/webhook
stripe trigger payment_intent.succeeded
```

---

## ✅ Post-Deployment Verification

### 1. Test Frontend

Visit your production URL: `https://hrkey.xyz`

- [ ] **Landing page loads**
- [ ] **Auth flow works** (sign up, login)
- [ ] **Dashboard loads** after login
- [ ] **KPI selector** populates from JSON
- [ ] **References** can be requested
- [ ] **HRKey Score panel** is visible

### 2. Test Backend API

**Health Check:**
```bash
curl https://your-backend.railway.app/health
```

**Create Test KPI Observation:**
```bash
curl -X POST https://your-backend.railway.app/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xTEST123",
    "observer_wallet": "0xTEST456",
    "role_id": "uuid-test",
    "role_name": "Backend Developer",
    "observations": [{
      "kpi_name": "deployment_frequency",
      "rating_value": 4,
      "outcome_value": 120
    }]
  }'
```

**Get Model Info:**
```bash
curl https://your-backend.railway.app/api/hrkey-score/model-info
```

### 3. Test End-to-End Score Calculation

1. Add sample KPI observations via API or frontend
2. Run ML pipeline (manually or via GitHub Actions)
3. Verify `ml/output/hrkey_model_config_global.json` is generated
4. Commit and deploy updated config
5. Try calculating a score via frontend dashboard

### 4. Test Stripe Payments

1. Use Stripe test mode first: `sk_test_...`
2. Use test card: `4242 4242 4242 4242`
3. Complete checkout flow
4. Verify webhook received in backend logs
5. Check user plan upgraded in database

---

## 🔧 Troubleshooting

### Frontend Issues

**Problem**: "Failed to fetch" errors when calling backend
- **Solution**: Check `API_BASE_URL` is set correctly in Vercel environment variables
- **Solution**: Verify CORS is configured in backend to allow your frontend domain

**Problem**: Supabase auth not working
- **Solution**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- **Solution**: Check Supabase dashboard → Authentication → URL Configuration

### Backend Issues

**Problem**: 500 Internal Server Error
- **Solution**: Check Railway/Render logs for error details
- **Solution**: Verify all environment variables are set correctly

**Problem**: "SUPABASE_SERVICE_KEY not configured"
- **Solution**: Add `SUPABASE_SERVICE_KEY` to backend environment variables
- **Solution**: Make sure you're using the **service_role** key, not anon key

**Problem**: HRKey Score returns "MODEL_NOT_CONFIGURED"
- **Solution**: Run ML pipeline to generate `hrkey_model_config_global.json`
- **Solution**: Ensure `ml/output/hrkey_model_config_global.json` exists in repo
- **Solution**: Redeploy backend after adding model config file

### ML Pipeline Issues

**Problem**: "Not enough data to train model"
- **Solution**: Add more KPI observations (minimum ~20-50 with outcome_value)
- **Solution**: Check `kpi_observations` table in Supabase has data

**Problem**: GitHub Action fails with "Module not found"
- **Solution**: Ensure `requirements.txt` is in `ml/` directory
- **Solution**: Check Python version is 3.9+ in workflow file

### Database Issues

**Problem**: "relation kpi_observations does not exist"
- **Solution**: Run SQL migration `004_kpi_observations.sql` in Supabase SQL Editor

**Problem**: Row Level Security blocking queries
- **Solution**: Backend should use `SUPABASE_SERVICE_KEY` (bypasses RLS)
- **Solution**: Check RLS policies in Supabase dashboard

---

## 🎉 Next Steps

After successful deployment:

1. **Monitor logs** for errors (Railway/Render dashboards)
2. **Set up alerts** (e.g., Sentry for error tracking)
3. **Configure backups** (Supabase auto-backups daily on paid plans)
4. **Add analytics** (Plausible, PostHog, or Google Analytics)
5. **Enable production mode Stripe** (switch from `sk_test_` to `sk_live_`)
6. **Schedule ML pipeline** (weekly or monthly depending on data volume)
7. **Create admin dashboard** for monitoring HRKey scores, users, revenue

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Supabase Documentation](https://supabase.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

**Questions or issues?** Check the main [README.md](README.md) or open a GitHub issue.
