# ⚡ HRKey - Local Development Quickstart

Get HRKey running locally in **under 10 minutes**.

---

## 🎯 What You'll Need

- **Node.js 18+** ([download](https://nodejs.org/))
- **Python 3.9+** ([download](https://python.org/)) - for ML pipeline
- **Supabase account** (free) - [sign up](https://supabase.com)
- **Git** installed

---

## 🚀 Quick Setup (5 Steps)

### 1️⃣ Clone & Install

```bash
# Clone repository
git clone https://github.com/OnChainFest/HRkey-App.git
cd HRkey-App

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install ML dependencies (optional for basic testing)
cd ml
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2️⃣ Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Fill in:
   - Name: `hrkey-dev`
   - Database password: (save this!)
   - Region: Choose closest to you
3. Wait ~2 minutes for project creation

### 3️⃣ Run Database Migrations

Once Supabase is ready:

1. Open **SQL Editor** in left sidebar
2. Copy/paste and run each migration in order:
   - `sql/001_identity_and_permissions.sql`
   - `sql/002_data_access_and_revenue_sharing.sql`
   - `sql/003_correlation_engine_schema.sql`
   - `sql/004_kpi_observations.sql`

### 4️⃣ Configure Environment

1. Go to Supabase → **Settings** → **API**
2. Copy your credentials
3. Create `.env` file in root directory:

```bash
# Copy template
cp .env.example .env
```

4. Edit `.env` and fill in:

```bash
# Database (from Supabase Settings → API)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...  # ⚠️ Keep this secret!

# Frontend public vars
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# URLs (for local development)
PUBLIC_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001
PORT=3001

# Optional (for testing emails/payments)
RESEND_API_KEY=re_...  # Get from resend.com
STRIPE_SECRET_KEY=sk_test_...  # Get from stripe.com
```

**For ML scripts**, create `ml/.env`:

```bash
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
```

### 5️⃣ Start Development Servers

Open **three terminal windows**:

**Terminal 1 - Frontend:**
```bash
npm run dev
# Starts Next.js on http://localhost:3000
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
# Starts Express on http://localhost:3001
```

**Terminal 3 - (Optional) ML Dashboard:**
```bash
cd ml
source venv/bin/activate
streamlit run dashboard_kpi_correlations.py
# Starts Streamlit on http://localhost:8501
```

---

## ✅ Verify Setup

### Test Frontend
Visit http://localhost:3000/WebDapp/app.html

You should see:
- ✅ HRKey Dashboard loads
- ✅ Sign up/Login form works
- ✅ KPI Selector dropdowns populate

### Test Backend
```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "ok",
  "service": "HRKey Backend Service",
  "timestamp": "2025-11-22T..."
}
```

### Test Smart Contracts (Hardhat)
Online (initial cache seed):
```bash
npx hardhat compile
npx hardhat test
```

Offline (when compiler download is unavailable):
```bash
npx hardhat test --no-compile
```

If you hit `HHE905`, use the helper script (falls back to `--no-compile` when cached artifacts exist):
```bash
./scripts/hardhat-test.sh
```

**CI cache paths (recommended):**
- `~/.cache/hardhat-nodejs`
- `artifacts`
- `cache`

### Test Database Connection
Try creating a test user:

1. Go to http://localhost:3000/WebDapp/auth.html
2. Sign up with email + password
3. Check Supabase → **Authentication** → **Users** to see new user

---

## 🎮 Try the Full Flow

### Step 1: Create User & Wallet

1. **Sign up** at http://localhost:3000/WebDapp/auth.html
2. After login, your wallet is auto-created
3. Dashboard shows your wallet address

### Step 2: Add Test KPI Observations

Use the API to add sample data:

```bash
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xYOUR_WALLET_FROM_DASHBOARD",
    "observer_wallet": "0xTEST_OBSERVER",
    "role_id": "550e8400-e29b-41d4-a716-446655440000",
    "role_name": "Backend Developer",
    "observations": [
      {
        "kpi_name": "deployment_frequency",
        "rating_value": 4,
        "outcome_value": 120,
        "context_notes": "120 deployments in Q1"
      },
      {
        "kpi_name": "code_quality",
        "rating_value": 5,
        "outcome_value": 95,
        "context_notes": "95% code coverage"
      },
      {
        "kpi_name": "api_response_time",
        "rating_value": 4,
        "outcome_value": 150,
        "context_notes": "150ms avg response time"
      }
    ]
  }'
```

Repeat with different subjects/roles to build up data (minimum ~20-50 observations recommended).

### Step 3: Train ML Model

Once you have data:

```bash
cd ml
source venv/bin/activate

# Step 1: Analyze correlations
python correlation_analysis.py
# Output: ml/output/kpi_correlations.csv

# Step 2: Train predictive model
python baseline_predictive_model.py
# Output: ml/models/hrkey_model_ridge.pkl

# Step 3: Export model config for backend
python export_hrkey_model_config.py
# Output: ml/output/hrkey_model_config_global.json
```

### Step 4: Calculate HRKey Score

1. Restart backend to load new model config:
   ```bash
   cd backend
   npm run dev
   ```

2. Go to dashboard: http://localhost:3000/WebDapp/app.html

3. Scroll to **"HRKey Score"** section

4. Enter:
   - **Candidate Wallet**: `0xYOUR_WALLET`
   - **Role**: Select from dropdown

5. Click **"Calculate HRKey Score"**

6. You should see:
   - ✅ Circular gauge (0-100)
   - ✅ Confidence meter
   - ✅ KPI breakdown
   - ✅ Model metadata

---

## 🐛 Common Issues

### "Module not found" errors

**Solution**: Make sure you ran `npm install` in both root AND `backend/` directories.

```bash
npm install
cd backend && npm install
```

### "SUPABASE_SERVICE_KEY not configured"

**Solution**: Check `.env` file has `SUPABASE_SERVICE_KEY` set (not `SUPABASE_ANON_KEY`).

### Frontend can't connect to backend

**Solution**: Ensure backend is running on port 3001:
```bash
cd backend
npm run dev
```

Check terminal output says: `🚀 HRKey Backend running on port 3001`

### KPI Selector dropdowns empty

**Solution**: Verify `public/WebDapp/Roles_All_Industries_KPIs.json` exists and is valid JSON.

### "Not enough data to train model"

**Solution**: Add more KPI observations. You need at least 20-50 observations with `outcome_value` set.

### HRKey Score returns "MODEL_NOT_CONFIGURED"

**Solution**:
1. Run ML pipeline: `python ml/export_hrkey_model_config.py`
2. Verify `ml/output/hrkey_model_config_global.json` exists
3. Restart backend

---

## 📁 Project Structure (Quick Reference)

```
HRkey-App/
├── backend/              # Express.js backend (port 3001)
│   ├── server.js        # Main entry point
│   └── hrkeyScoreService.js  # ML scoring
├── public/WebDapp/      # Frontend HTML/JS
│   └── app.html         # Main dashboard
├── ml/                  # Python ML pipeline
│   ├── correlation_analysis.py
│   ├── baseline_predictive_model.py
│   └── export_hrkey_model_config.py
├── sql/                 # Database migrations
└── .env                 # Your config (DO NOT COMMIT!)
```

---

## 🔗 Next Steps

- **Add references**: Try the reference request flow
- **Explore company features**: Create a company, add signers
- **Test data access**: Request access to user data
- **Review pricing**: Confirm USDC pricing and consent flow
- **Deploy to production**: See [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📚 Full Documentation

- **[README.md](README.md)** - Complete project overview
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide
- **[backend/HRKEY_SCORE_README.md](backend/HRKEY_SCORE_README.md)** - Scoring system docs
- **[ml/README.md](ml/README.md)** - ML pipeline documentation

---

## 💬 Need Help?

- **GitHub Issues**: [Report bugs](https://github.com/OnChainFest/HRkey-App/issues)
- **Documentation**: Check the docs above
- **Community**: (Add Discord/Slack link if you have one)

---

**Happy coding! 🚀**
