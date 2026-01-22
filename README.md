# 🔑 HRKey - Professional Identity & Performance Scoring Platform

> **AI-powered professional scoring system combining verifiable references, KPI observations, and machine learning to predict job performance.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-000000?logo=next.js)](https://nextjs.org/)
[![Powered by Supabase](https://img.shields.io/badge/Powered%20by-Supabase-3ECF8E?logo=supabase)](https://supabase.com/)
[![ML: scikit-learn](https://img.shields.io/badge/ML-scikit--learn-F7931E?logo=scikit-learn)](https://scikit-learn.org/)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
- [Project Structure](#-project-structure)
- [Usage](#-usage)
  - [Frontend Dashboard](#frontend-dashboard)
  - [Backend API](#backend-api)
  - [ML Pipeline](#ml-pipeline)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**HRKey** is a decentralized professional identity and performance scoring platform that combines:

1. **Verifiable Professional References** - Blockchain-backed references from colleagues, managers, and clients
2. **KPI Observations** - Structured evaluations of job-specific Key Performance Indicators
3. **ML-Powered Scoring** - Predictive models that calculate a 0-100 "HRKey Score" based on historical KPI data
4. **Data Access Controls** - Companies request access to professional data in a consented flow

### The Problem

Traditional hiring relies on subjective references and unverified claims. Candidates have no way to:
- Prove their professional track record quantitatively
- Share verified data only with approved companies
- Share verifiable performance metrics with potential employers

### The Solution

HRKey creates a **proof-of-performance system** where:
- **Observers** (managers, colleagues) submit structured KPI evaluations
- **Machine learning models** correlate KPI ratings with measurable job outcomes
- **Candidates** receive a predictive **HRKey Score** (0-100) that forecasts their performance
- **Companies** pay in USDC to access candidate data after explicit consent

---

## ✨ Key Features

### 🔐 Professional Identity Management
- **Web3 Wallet Integration** - Custodial wallets created automatically for users
- **Identity Verification** - KYC integration (Phase 2: ZK-proofs for privacy)
- **Company Signers** - Authorized company representatives can verify employee data

### 📊 KPI Observations & Correlation Engine
- **Structured Evaluations** - Capture KPI ratings (1-5 scale) + measurable outcomes
- **Correlation Analysis** - Python scripts calculate Pearson/Spearman correlations
- **Proof of Correlation** - Statistical validation that KPIs predict job outcomes

### 🤖 ML-Powered HRKey Score
- **Predictive Modeling** - Ridge regression models trained on KPI observations
- **Real-time Scoring** - REST API calculates scores on-demand
- **Confidence Metrics** - Transparency about prediction reliability
- **Interactive Dashboard** - Circular gauge, KPI breakdown, model metadata

### 💰 Data Access & Pricing
- **Pay-per-Query** - Companies pay to access candidate references/profiles in USDC
- **Consent-first Access** - Access is granted only after candidate approval
- **Stripe Integration** - Secure payment processing

### 🌐 Blockchain Foundation (Phase 2)
- **Base Network** - Deployment on Ethereum L2 for low-cost transactions
- **Smart Contracts** - PeerProofRegistry for immutable reference storage
- **Hardhat Development** - Smart contract testing and deployment tools

### 🔒 Permissions & Consent Model (P0)
- **Consent as First-Class Object** - Granular consent management for all data access
- **Server-Side Enforcement** - Middleware validates consent before returning sensitive data
- **Institutional Audit Trail** - Records all access attempts (allowed and denied) with purpose
- **GDPR/Legal Compliance** - Consent includes scope, purpose, expiration, and revocation
- **Fail-Closed Security** - Access denied by default unless explicit consent exists

**Key Components:**
- `consents` table: Tracks granular permissions with subject, grantee, resource, scope, purpose, expiration
- `audit_events` table: Immutable log of all data access attempts with result (allowed/denied)
- `validateConsent` middleware: Server-side enforcement before data is returned
- Consent lifecycle: active → revoked/expired with immediate effect

**Example:**
```javascript
// Protected endpoint with consent validation
app.get('/api/references/:referenceId',
  requireAuth,
  validateConsent({
    resourceType: 'references',
    getTargetOwnerId: async (req) => {
      const ref = await getReference(req.params.referenceId);
      return ref.owner_id;
    },
    getGrantee: (req) => ({ companyId: req.user.companyId })
  }),
  controller.getReference
);
```

**Security guarantees:**
- ✅ No data access without explicit consent
- ✅ All access attempts logged (allowed + denied)
- ✅ Consent can be revoked with immediate effect
- ✅ Row-level security (RLS) enabled on sensitive tables
- ✅ Superadmin actions audited with override reason

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Dashboard  │  │   Company    │  │   Data Access Requests   │  │
│  │  (app.html)  │  │   Portal     │  │   Earnings Dashboard     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                  │                       │                │
└─────────┼──────────────────┼───────────────────────┼────────────────┘
          │                  │                       │
          ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  API Endpoints                                               │   │
│  │  • /api/kpi-observations     (POST/GET - KPI data capture)  │   │
│  │  • /api/hrkey-score          (POST - ML scoring)            │   │
│  │  • /api/references           (POST/GET - references)        │   │
│  │  • /api/data-access          (POST/GET - requests)          │   │
│  │  • /api/revenue              (GET - earnings)               │   │
│  │  • /api/identity, /api/company, /api/signers, etc.         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │                               │                           │
│         ▼                               ▼                           │
│  ┌──────────────┐              ┌────────────────────┐              │
│  │ Controllers  │              │ HRKey Score Service│              │
│  │ (Business    │              │ (ML inference)     │              │
│  │  Logic)      │              └────────────────────┘              │
│  └──────────────┘                       │                           │
└────────┼────────────────────────────────┼───────────────────────────┘
         │                                │
         ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE (Supabase/PostgreSQL)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐    │
│  │ kpi_observations│  │   references    │  │  companies       │    │
│  │ (KPI ratings +  │  │   (peer refs)   │  │  (orgs & signers)│    │
│  │  outcomes)      │  │                 │  │                  │    │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐    │
│  │ data_access_    │  │ revenue_shares  │  │  users, wallets  │    │
│  │ requests        │  │ (earnings)      │  │  audit_logs      │    │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ML PIPELINE (Python)                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 1: correlation_analysis.py                            │   │
│  │          → Calculates KPI vs Outcome correlations           │   │
│  │          → Outputs: kpi_correlations.csv/json               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 2: baseline_predictive_model.py                       │   │
│  │          → Trains Ridge/Linear regression models            │   │
│  │          → Saves models to ml/models/*.pkl                  │   │
│  │          → Outputs metrics: baseline_metrics_ridge.json     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 3: export_hrkey_model_config.py                       │   │
│  │          → Exports model config for backend inference       │   │
│  │          → Outputs: hrkey_model_config_global.json          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Optional: dashboard_kpi_correlations.py (Streamlit visualization)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User submits professional references** → Stored in `references` table
2. **Observers submit KPI evaluations** → Stored in `kpi_observations` table
3. **ML pipeline runs periodically** → Trains models, exports config JSON
4. **Frontend requests HRKey Score** → Backend loads model config, calculates score
5. **Companies request data access** → Payment processed, revenue split recorded
6. **Users track earnings** → Earnings dashboard shows balance & payouts

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with server-side rendering
- **HTML5 + Vanilla JS** - Static pages in `/public/WebDapp/`
- **Supabase JS Client** - Authentication & real-time data
- **Stripe Checkout** - Payment processing

### Backend
- **Node.js 18+** - Runtime environment
- **Express.js 5** - Web framework
- **Supabase (PostgreSQL)** - Database & authentication
- **Resend** - Transactional emails
- **Stripe** - Payment processing & webhooks

### Machine Learning
- **Python 3.9+** - ML runtime
- **pandas** - Data manipulation
- **scikit-learn** - Ridge regression, feature engineering
- **scipy** - Statistical correlations
- **Streamlit** - Interactive dashboards (optional)

### Blockchain (Phase 2)
- **Hardhat** - Ethereum development environment
- **ethers.js** - Web3 library
- **Base (Ethereum L2)** - Deployment network
- **Solidity 0.8.20** - Smart contract language

### DevOps
- **Vercel** - Frontend hosting
- **Railway / Render** - Backend hosting
- **Supabase Cloud** - Managed PostgreSQL + Auth
- **GitHub Actions** - CI/CD (planned)

---

## 🚀 Getting Started

### Prerequisites

Before running HRKey locally, ensure you have:

- **Node.js 18+** and **npm** installed
- **Python 3.9+** and **pip** installed (for ML pipeline)
- **Supabase account** ([sign up free](https://supabase.com))
- **Stripe account** (for payments, optional for development)
- **Resend API key** (for emails, optional for development)

### Local Development

#### 1️⃣ Clone the Repository

```bash
git clone https://github.com/OnChainFest/HRkey-App.git
cd HRkey-App
```

#### 2️⃣ Install Dependencies

**Frontend & Backend:**

```bash
# Root (Next.js frontend)
npm install

# Backend (Express server)
cd backend
npm install
cd ..
```

**ML Pipeline (Python):**

```bash
cd ml
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

#### 3️⃣ Configure Environment Variables

Create `.env` files in the root directory:

**Root `.env` (for frontend & backend):**

```bash
# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Frontend URL (public-facing)
PUBLIC_BASE_URL=http://localhost:3000

# Backend URL (if different from frontend)
API_BASE_URL=http://localhost:3001

# Email Service (Resend)
RESEND_API_KEY=re_your_key_here

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Admin
HRKEY_SUPERADMIN_EMAIL=admin@yourcompany.com

# Server Port
PORT=3001
```

**ML `.env` (for Python scripts):**

```bash
# ml/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

> 📝 **Template**: Copy `.env.example` to `.env` and fill in your credentials.

#### 4️⃣ Set Up Database Schema

Run the SQL migrations in your Supabase dashboard (SQL Editor):

```bash
sql/001_identity_and_permissions.sql
sql/002_data_access_and_revenue_sharing.sql
sql/003_correlation_engine_schema.sql
sql/004_kpi_observations.sql
```

Or use the Supabase CLI:

```bash
supabase db reset  # Warning: This will reset your database!
```

#### 5️⃣ Start the Development Servers

**Terminal 1 - Frontend (Next.js):**

```bash
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2 - Backend (Express):**

```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**Terminal 3 - ML Pipeline (optional, for testing):**

```bash
cd ml
source venv/bin/activate
python correlation_analysis.py
python baseline_predictive_model.py
python export_hrkey_model_config.py
```

#### 6️⃣ Access the Application

- **Frontend Dashboard**: http://localhost:3000/WebDapp/app.html
- **Auth Page**: http://localhost:3000/WebDapp/auth.html
- **Backend Health**: http://localhost:3001/health
- **Backend API Docs**: See [backend/HRKEY_SCORE_README.md](backend/HRKEY_SCORE_README.md)

---

## 📁 Project Structure

```
HRkey-App/
├── 📂 backend/                  # Express.js backend server
│   ├── server.js               # Main server entry point
│   ├── hrkeyScoreService.js    # ML scoring service
│   ├── controllers/            # API route controllers
│   ├── middleware/             # Auth & validation middleware
│   ├── utils/                  # Helper utilities
│   ├── HRKEY_SCORE_README.md   # Scoring system docs
│   └── KPI_OBSERVATIONS_README.md # KPI capture docs
│
├── 📂 public/WebDapp/          # Frontend static HTML/JS
│   ├── app.html               # Main dashboard
│   ├── auth.html              # Login/signup
│   ├── company_dashboard.html # Company portal
│   ├── data-access-requests.html
│   ├── earnings-dashboard.html
│   ├── Roles_All_Industries_KPIs.json  # KPI definitions
│   └── js/                    # Frontend JavaScript modules
│
├── 📂 pages/api/               # Next.js API routes (TypeScript)
│   ├── checkout.ts            # Stripe checkout
│   ├── portal.ts              # Stripe customer portal
│   └── webhook.ts             # Stripe webhooks
│
├── 📂 ml/                      # Python ML pipeline
│   ├── correlation_analysis.py
│   ├── baseline_predictive_model.py
│   ├── export_hrkey_model_config.py
│   ├── dashboard_kpi_correlations.py
│   ├── requirements.txt
│   ├── README.md              # ML pipeline documentation
│   └── output/                # Generated model configs & metrics
│
├── 📂 analytics/proof_of_correlation/  # Advanced correlation engine
│   ├── api/main.py            # FastAPI REST API
│   ├── correlation_analyzer.py
│   ├── baseline_models.py
│   ├── dataset_builder.py
│   └── README.md
│
├── 📂 sql/                     # Database migrations
│   ├── 001_identity_and_permissions.sql
│   ├── 002_data_access_and_revenue_sharing.sql
│   ├── 003_correlation_engine_schema.sql
│   └── 004_kpi_observations.sql
│
├── 📂 contracts/               # Solidity smart contracts
│   └── PeerProofRegistry.sol
│
├── 📂 scripts/                 # Deployment scripts
│   └── deploy.js              # Hardhat deployment
│
├── hardhat.config.js          # Hardhat configuration
├── next.config.cjs            # Next.js configuration
├── vercel.json                # Vercel deployment config
├── package.json               # Root dependencies
└── README.md                  # This file
```

---

## 💻 Usage

### Frontend Dashboard

1. **Navigate to**: http://localhost:3000/WebDapp/app.html
2. **Sign up/Login** using Supabase authentication
3. **Select KPIs**: Choose your professional family → role → KPIs
4. **Request References**: Invite colleagues to provide references
5. **Calculate HRKey Score**:
   - Enter candidate wallet address
   - Select role
   - Click "Calculate HRKey Score"
   - View score (0-100), confidence, and KPI breakdown

### Backend API

**Base URL**: `http://localhost:3001`

#### Key Endpoints:

**Health Check:**
```bash
curl http://localhost:3001/health
```

**Create KPI Observations:**
```bash
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xSUBJECT_ADDRESS",
    "observer_wallet": "0xOBSERVER_ADDRESS",
    "role_id": "uuid-of-role",
    "role_name": "Backend Developer",
    "observations": [
      {
        "kpi_name": "deployment_frequency",
        "rating_value": 4,
        "outcome_value": 120,
        "context_notes": "Deployed 120 times in Q1 2024"
      }
    ]
  }'
```

**Calculate HRKey Score:**
```bash
curl -X POST http://localhost:3001/api/hrkey-score \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xSUBJECT_ADDRESS",
    "role_id": "UUID_OF_ROLE"
  }'
```

**Get Model Info:**
```bash
curl http://localhost:3001/api/hrkey-score/model-info
```

📖 **Full API Documentation**: See [backend/HRKEY_SCORE_README.md](backend/HRKEY_SCORE_README.md)

### ML Pipeline

#### Step 1: Capture KPI Observations

Use the frontend or API to submit KPI observations. You need at least **20-50 observations** with `outcome_value` to train a meaningful model.

#### Step 2: Run Correlation Analysis

```bash
cd ml
source venv/bin/activate
python correlation_analysis.py
```

**Outputs**:
- `ml/output/kpi_correlations.csv` - Correlation matrix
- `ml/output/kpi_correlations.json` - JSON format for APIs

#### Step 3: Train Predictive Model

```bash
python baseline_predictive_model.py
```

**Outputs**:
- `ml/models/hrkey_model_ridge.pkl` - Trained Ridge model
- `ml/output/baseline_metrics_ridge.json` - Model performance (MAE, RMSE, R²)
- `ml/output/kpi_feature_importance_ridge.csv` - Feature importance

#### Step 4: Export Model Config for Backend

```bash
python export_hrkey_model_config.py
```

**Outputs**:
- `ml/output/hrkey_model_config_global.json` - Model config used by backend

#### Step 5: Visualize Correlations (Optional)

```bash
streamlit run dashboard_kpi_correlations.py
```

Opens interactive dashboard at http://localhost:8501

---

## 🌐 Deployment

### Frontend (Vercel)

1. **Connect GitHub repo** to Vercel
2. **Configure Build Settings**:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
3. **Set Environment Variables** in Vercel dashboard (copy from `.env`)
4. **Deploy**: Push to `main` branch triggers auto-deployment

### Backend (Railway / Render)

**Option A: Railway**

1. Create new project from GitHub repo
2. Select `backend/` as root directory
3. Set Environment Variables
4. Railway auto-detects `package.json` and runs `npm start`

**Option B: Render**

1. Create new Web Service
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add Environment Variables

### Database (Supabase)

1. **Create project** at [supabase.com](https://supabase.com)
2. **Run SQL migrations** in SQL Editor (copy from `sql/` folder)
3. **Get credentials**:
   - Project URL: `https://yourproject.supabase.co`
   - Anon key: Settings → API → `anon` key
   - Service key: Settings → API → `service_role` key
4. **Update `.env`** with Supabase credentials

### ML Pipeline

**Option A: Scheduled Cron Job**

- Use GitHub Actions to run ML pipeline weekly
- Commit updated `hrkey_model_config_global.json` back to repo

**Option B: Dedicated ML Server**

- Deploy Python scripts to separate server (e.g., Railway)
- Expose FastAPI endpoint for on-demand training
- Backend triggers re-training via API call

📖 **Detailed Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) _(coming soon)_

---

## 📚 Documentation

### Core Documentation

- **[README.md](README.md)** - This file (overview & setup)
- **[backend/HRKEY_SCORE_README.md](backend/HRKEY_SCORE_README.md)** - HRKey Score system (405 lines)
- **[backend/KPI_OBSERVATIONS_README.md](backend/KPI_OBSERVATIONS_README.md)** - KPI observation capture (682 lines)
- **[ml/README.md](ml/README.md)** - ML pipeline documentation (477 lines)
- **[analytics/proof_of_correlation/README.md](analytics/proof_of_correlation/README.md)** - Advanced correlation engine (583 lines)

### Additional Guides

- **[QUICKSTART_DATA_ACCESS.md](QUICKSTART_DATA_ACCESS.md)** - Data access quickstart
- **[README-REFERRAL-STRIPE.md](README-REFERRAL-STRIPE.md)** - Stripe referral integration
- **[STRIPE_CONFIG.md](STRIPE_CONFIG.md)** - Stripe configuration guide

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** and commit: `git commit -m "Add feature X"`
4. **Push to your fork**: `git push origin feature/your-feature-name`
5. **Open a Pull Request** on GitHub

### Development Guidelines

- **Code Style**: Follow existing patterns (ESLint for JS, Black for Python)
- **Commit Messages**: Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- **Testing**: Add tests for new features (backend: Jest, ML: pytest)
- **Documentation**: Update relevant README files

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Supabase** - Database & authentication infrastructure
- **Vercel** - Frontend hosting
- **Stripe** - Payment processing
- **Base Network** - Ethereum L2 blockchain
- **scikit-learn** - Machine learning library
- **OpenZeppelin** - Smart contract libraries

---

## 📧 Contact & Support

- **Website**: [hrkey.xyz](https://hrkey.xyz)
- **GitHub Issues**: [Report bugs or request features](https://github.com/OnChainFest/HRkey-App/issues)
- **Email**: support@hrkey.com _(if applicable)_
- **Twitter**: [@HRKeyPlatform](https://twitter.com/HRKeyPlatform) _(if applicable)_

---

<div align="center">

**Built with ❤️ by the HRKey Team**

[⬆ Back to Top](#-hrkey---professional-identity--performance-scoring-platform)

</div>
