# 🚀 HRKey Cloud Deployment Guide

Complete guide to deploy HRKey to production using **Render** (backend) + **Vercel** (frontend).

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Backend Deployment (Render)](#backend-deployment-render)
4. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
5. [Environment Variables](#environment-variables)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                           │
│                          ↓                                   │
│              https://hrkey.vercel.app                        │
│                          ↓                                   │
│                  Vercel (Frontend)                           │
│              • Static HTML/JS/CSS                            │
│              • API calls → Backend                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              https://hrkey-backend.onrender.com             │
│                          ↓                                   │
│                  Render (Backend)                            │
│              • Node.js Express server                        │
│              • ML model (JSON config)                        │
│              • API endpoints                                 │
│              • ↓ Supabase (Postgres DB)                      │
│              • ↓ Stripe (Payments)                           │
│              • ↓ Resend (Emails)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Prerequisites

### 1. Accounts Required

- ✅ [GitHub](https://github.com) - Code repository
- ✅ [Render](https://render.com) - Backend hosting (free tier available)
- ✅ [Vercel](https://vercel.com) - Frontend hosting (free tier available)
- ✅ [Supabase](https://supabase.com) - Database (free tier available)
- ✅ [Stripe](https://stripe.com) - Payments (test mode free)
- ✅ [Resend](https://resend.com) - Emails (free tier: 3k emails/month)

### 2. Repository Setup

```bash
# Push your code to GitHub
git remote add origin https://github.com/YOUR_USERNAME/HRkey-App.git
git branch -M main
git push -u origin main
```

---

## 🔧 Backend Deployment (Render)

### Step 1: Create Render Account

1. Go to [https://dashboard.render.com/](https://dashboard.render.com/)
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 2: Deploy Backend

#### Option A: Using Blueprint (Recommended)

1. Click **"New +"** → **"Blueprint"**
2. Select your **HRkey-App** repository
3. Render will auto-detect `backend/render.yaml`
4. Click **"Apply"**
5. Wait ~5 minutes for build to complete

#### Option B: Manual Setup

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `hrkey-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`

### Step 3: Configure Environment Variables

In Render Dashboard → **Environment** tab, add:

```env
# REQUIRED
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

RESEND_API_KEY=re_...

# REQUIRED for CORS
FRONTEND_URL=https://your-app.vercel.app

# Auto-set by Render
BACKEND_PUBLIC_URL=https://hrkey-backend.onrender.com
PORT=10000
```

### Step 4: Verify Deployment

1. Wait for build to complete (green checkmark)
2. Visit: `https://hrkey-backend.onrender.com/health`
3. Should see:
   ```json
   {
     "status": "ok",
     "service": "HRKey Backend Service",
     "timestamp": "2025-11-24T...",
     "app_url": "https://your-app.vercel.app"
   }
   ```

---

## 🎨 Frontend Deployment (Vercel)

### Step 1: Create Vercel Account

1. Go to [https://vercel.com/signup](https://vercel.com/signup)
2. Sign up with GitHub
3. Authorize Vercel

### Step 2: Deploy Frontend

1. Click **"Add New..."** → **"Project"**
2. Import **HRkey-App** repository
3. Configure:
   - **Framework Preset**: `Other`
   - **Root Directory**: `frontend`
   - **Build Command**: (leave empty)
   - **Output Directory**: `.`
   - **Install Command**: (leave empty)

### Step 3: Configure Environment Variables

In Vercel Dashboard → **Settings** → **Environment Variables**:

```env
API_BASE_URL=https://hrkey-backend.onrender.com
```

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait ~1 minute
3. Vercel will provide a URL: `https://your-app.vercel.app`

### Step 5: Update Backend CORS

1. Go back to Render dashboard
2. Update `FRONTEND_URL` environment variable:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   ```
3. Backend will auto-redeploy

---

## 🔐 Environment Variables Reference

### Backend (Render)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | ✅ | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (full access) | `eyJhbGc...` |
| `SUPABASE_ANON_KEY` | ✅ | Anonymous key (public) | `eyJhbGc...` |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret | `whsec_...` |
| `RESEND_API_KEY` | ✅ | Resend API key | `re_...` |
| `FRONTEND_URL` | ✅ | Vercel frontend URL (for CORS) | `https://hrkey.vercel.app` |
| `HRKEY_SUPERADMIN_EMAIL` | ⚪ | Auto-assign superadmin role | `admin@example.com` |
| `NODE_ENV` | ⚪ | Environment | `production` |
| `PORT` | ⚪ | Port (auto-set by Render) | `10000` |

### Frontend (Vercel)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `API_BASE_URL` | ✅ | Backend API URL | `https://hrkey-backend.onrender.com` |

---

## ✅ Post-Deployment Verification

### 1. Backend Health Check

```bash
curl https://hrkey-backend.onrender.com/health
```

Expected:
```json
{
  "status": "ok",
  "service": "HRKey Backend Service"
}
```

### 2. ML Model Check

```bash
curl https://hrkey-backend.onrender.com/api/hrkey-score/model-info
```

Expected:
```json
{
  "ok": true,
  "model_type": "ridge",
  "role_scope": "global",
  "n_features": 6
}
```

### 3. Frontend Check

1. Visit: `https://your-app.vercel.app`
2. Open browser console (F12)
3. Look for: `🔧 API Configuration: { API_BASE_URL: "https://hrkey-backend.onrender.com" }`

### 4. End-to-End Test

1. Go to: `https://your-app.vercel.app/auth.html`
2. Sign up/Login
3. Go to Dashboard: `https://your-app.vercel.app/app.html`
4. Try creating a reference or calculating HRKey Score

---

## 🐛 Troubleshooting

### Problem: Backend returns 404

**Cause**: ML model config not found

**Solution**:
```bash
# Verify model file exists in repo
ls -la ml/output/hrkey_model_config_global.json

# If missing, regenerate:
cd ml
python train_model_from_csv.py
git add output/hrkey_model_config_global.json
git commit -m "Add ML model config"
git push
```

### Problem: CORS errors in browser

**Symptoms**:
```
Access to fetch at 'https://hrkey-backend.onrender.com/api/...' 
from origin 'https://your-app.vercel.app' has been blocked by CORS policy
```

**Solution**:
1. Check `FRONTEND_URL` in Render matches your Vercel URL exactly
2. Redeploy backend after updating env vars

### Problem: Render "Service Unavailable"

**Cause**: Free tier sleeps after 15 min inactivity

**Solution**:
- Wait ~30 seconds for cold start
- Or upgrade to Starter plan ($7/mo) for 24/7 uptime

### Problem: Supabase connection errors

**Check**:
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not `SUPABASE_ANON_KEY`)
2. Test connection:
   ```bash
   curl -X POST https://your-project.supabase.co/rest/v1/kpi_observations \
     -H "apikey: YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

### Problem: Emails not sending

**Check**:
1. Verify `RESEND_API_KEY` is correct
2. Check Resend dashboard for delivery logs
3. Verify sender domain is verified in Resend

---

## 🔄 Updating Production

### Backend Updates

```bash
# Make changes to backend/
git add backend/
git commit -m "Update backend"
git push

# Render auto-deploys on push (if enabled)
# Or manually trigger in Render dashboard
```

### Frontend Updates

```bash
# Make changes to frontend/
git add frontend/
git commit -m "Update frontend"
git push

# Vercel auto-deploys on push
```

### ML Model Updates

```bash
# Regenerate model
cd ml
python train_model_from_csv.py

# Commit new model config
git add output/hrkey_model_config_global.json
git commit -m "Update ML model"
git push

# Restart backend service in Render
```

---

## 📊 Monitoring

### Render Dashboard

- Logs: Real-time backend logs
- Metrics: CPU, Memory, Requests
- Health: Service status

### Vercel Dashboard

- Deployments: Build history
- Analytics: Page views, performance
- Logs: Function logs (if using API routes)

### Supabase Dashboard

- Database: Query data directly
- Logs: Database queries
- API: Usage stats

---

## 💰 Cost Breakdown

### Free Tier Limits

| Service | Free Tier | Notes |
|---------|-----------|-------|
| **Render** | 750 hours/month | Sleeps after 15 min |
| **Vercel** | 100 GB bandwidth | Unlimited deployments |
| **Supabase** | 500 MB database | 2 GB bandwidth |
| **Resend** | 3,000 emails/month | 100 emails/day |
| **Stripe** | Unlimited (test mode) | 2.9% + $0.30 per transaction (live) |

### Upgrade Recommendations

- **Render Starter** ($7/mo): No sleep, better performance
- **Vercel Pro** ($20/mo): More bandwidth, analytics
- **Supabase Pro** ($25/mo): More storage, better performance

---

## 📝 Next Steps

1. ✅ Set up custom domain (optional)
2. ✅ Configure Stripe webhooks
3. ✅ Set up monitoring/alerts
4. ✅ Enable database backups
5. ✅ Add production SSL certificates

---

## 🆘 Support

- **GitHub Issues**: [Report bugs](https://github.com/YOUR_USERNAME/HRkey-App/issues)
- **Documentation**: See `/docs` folder
- **Backend README**: `backend/HRKEY_SCORE_README.md`
- **ML README**: `ml/README.md`

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
