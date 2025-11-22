# HRKey Correlation Engine - Phase I: Proof of Correlation (MVP)

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Scientific MVP**: Proving correlations between verifiable professional data (KPIs, references, cognitive scores) and actual job outcomes.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Usage](#usage)
  - [CLI Pipeline](#cli-pipeline)
  - [Schema Inspection](#schema-inspection)
  - [API Server](#api-server)
- [Module Documentation](#module-documentation)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Data Flow](#data-flow)
- [Assumptions and Adaptability](#assumptions-and-adaptability)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## 🎯 Overview

The **HRKey Correlation Engine** is the scientific core of HRKey's verifiable professional identity platform. This Phase I implementation provides a clean, production-ready pipeline that:

1. **Fetches data** from Supabase (users, KPIs, cognitive scores, references, job outcomes)
2. **Builds analytic datasets** by joining and aggregating multiple tables
3. **Computes correlations** (Pearson and Spearman) between features and outcomes
4. **Trains baseline ML models** (Logistic Regression, Random Forest) to predict hiring and performance
5. **Stores results** back into Supabase for consumption by dashboards
6. **Exposes HTTP API** for frontend integration

### Key Features

✅ **Database-first design**: Works with existing Supabase schema
✅ **Clean architecture**: Modular, typed, well-documented Python code
✅ **Statistical rigor**: Proper significance testing, train/test splits, standardization
✅ **Production-ready**: Connection pooling, error handling, logging
✅ **Flexible**: Easy to adapt as schema evolves
✅ **Tested**: Unit tests for core functions

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase Postgres                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │  users   │ │  roles   │ │user_kpis │ │cognitive_game_    │ │
│  └──────────┘ └──────────┘ └──────────┘ │    scores         │ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ └───────────────────┘ │
│  │references│ │ companies│ │  job_    │                        │
│  └──────────┘ └──────────┘ │ outcomes │                        │
│                             └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│          Correlation Engine (Python + scikit-learn)             │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Dataset       │→ │ Correlation    │→ │ Baseline         │  │
│  │ Builder       │  │ Analyzer       │  │ Models           │  │
│  └───────────────┘  └────────────────┘  └──────────────────┘  │
│         ↓                   ↓                      ↓            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Results Storage (back to Supabase)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI HTTP Server                        │
│  GET /api/correlation-summary                                   │
│  GET /api/model-summary                                         │
│  GET /api/feature-importance                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Frontend Dashboard (Next.js)
```

---

## ✅ Prerequisites

### Required

- **Python 3.8+** (tested with 3.10)
- **Supabase account** with Postgres database
- **Database tables** (see [Database Setup](#database-setup))

### Recommended

- Virtual environment tool (venv, conda, poetry)
- PostgreSQL client (for manual queries)
- Node.js 18+ (if running alongside the main HRKey app)

---

## 📦 Installation

### 1. Navigate to the project directory

```bash
cd analytics/proof_of_correlation
```

### 2. Create and activate a virtual environment

```bash
# Using venv
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Or using conda
conda create -n hrkey-analytics python=3.10
conda activate hrkey-analytics
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Verify installation

```bash
python -c "import pandas, sklearn, psycopg2; print('✓ All dependencies installed')"
```

---

## 🗄️ Database Setup

### 1. Apply SQL migrations

The correlation engine requires specific tables. Run the migration:

```bash
# Connect to your Supabase database
psql postgresql://postgres:YOUR_PASSWORD@YOUR_PROJECT.supabase.co:5432/postgres

# Run migration
\i ../../sql/003_correlation_engine_schema.sql
```

This creates:
- `roles` - Job roles by industry and seniority
- `user_kpis` - KPI values for users
- `cognitive_game_scores` - Cognitive assessment results
- `job_outcomes` - Hiring outcomes and performance data
- `correlation_results` - Correlation analysis results
- `model_baseline_results` - ML model performance metrics

### 2. Extend existing tables

The migration also extends the `references` table with SARA fields if they don't exist.

### 3. Verify schema

```bash
python -m analytics.proof_of_correlation.run --inspect-schema
```

---

## ⚙️ Configuration

### 1. Copy environment template

```bash
cp .env.example .env
```

### 2. Edit `.env` with your Supabase credentials

```bash
# Required
SUPABASE_DB_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_PROJECT.supabase.co:5432/postgres

# Optional
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
MIN_SAMPLES_FOR_CORRELATION=30
SIGNIFICANCE_THRESHOLD=0.05
TRAIN_TEST_SPLIT=0.7
```

### 3. Test connection

```bash
python -c "from analytics.proof_of_correlation.database import test_connection; print('✓ Connected!' if test_connection() else '✗ Failed')"
```

---

## 🚀 Usage

### CLI Pipeline

Run the complete correlation engine pipeline:

```bash
# Full pipeline (inspect → build dataset → correlations → models → storage)
python -m analytics.proof_of_correlation.run

# With schema inspection first
python -m analytics.proof_of_correlation.run --inspect-schema

# Skip model training (faster, only correlations)
python -m analytics.proof_of_correlation.run --skip-models

# Skip storing results in DB (dry run)
python -m analytics.proof_of_correlation.run --skip-storage

# Quiet mode (less verbose output)
python -m analytics.proof_of_correlation.run --quiet
```

**Expected output:**

```
╔═══════════════════════════════════════════════════════════════╗
║              HRKey Correlation Engine - Phase I: MVP          ║
╚═══════════════════════════════════════════════════════════════╝

Loading configuration...
✓ Configuration loaded

Testing database connection...
✓ Database connection successful

================================================================================
STEP 1: Build Training Dataset
================================================================================
1. Fetching job outcomes (target variables)...
   ✓ Found 150 job outcomes
   ...

📊 RESULTS SUMMARY
================================================================================
Dataset rows: 150
Correlations computed: 240
Significant correlations (p < 0.05): 87

🔝 TOP 5 CORRELATIONS FOR EACH TARGET:
  HIRED:
    • kpi_deployment_frequency                r=+0.4523 (p=0.0012)
    • cognitive_memory                        r=+0.3891 (p=0.0045)
    ...

✅ PIPELINE COMPLETED SUCCESSFULLY
```

### Schema Inspection

Inspect your database schema to verify tables exist:

```bash
python -m analytics.proof_of_correlation.schema_inspector
```

### API Server

Start the FastAPI server to expose results via HTTP:

```bash
# Development server with auto-reload
uvicorn analytics.proof_of_correlation.api.main:app --reload --port 8000

# Production server
uvicorn analytics.proof_of_correlation.api.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/correlation-summary` | GET | Top correlations for each target |
| `/api/model-summary` | GET | ML model performance metrics |
| `/api/correlation-details` | GET | Detailed correlation results with filters |
| `/api/feature-importance` | GET | Feature importance from trained models |

**Example requests:**

```bash
# Get top 10 correlations
curl http://localhost:8000/api/correlation-summary?limit=10

# Get correlations for 'hired' only
curl http://localhost:8000/api/correlation-summary?target=hired

# Get model performance summary
curl http://localhost:8000/api/model-summary

# Get feature importance from Random Forest
curl "http://localhost:8000/api/feature-importance?target=hired&model_type=random_forest&top_n=10"
```

---

## 📚 Module Documentation

### Core Modules

| Module | Description | Key Functions |
|--------|-------------|---------------|
| `config.py` | Configuration management | `get_config()` |
| `database.py` | Database connection pooling | `get_db_connection()`, `test_connection()` |
| `schema_inspector.py` | Schema inspection utilities | `print_schema_summary()` |
| `dataset_builder.py` | Build analytic datasets | `build_training_dataset()` |
| `correlation_analyzer.py` | Correlation computation | `compute_basic_correlations()` |
| `baseline_models.py` | ML baseline models | `train_baseline_models()` |
| `results_storage.py` | Store results to DB | `store_correlation_results()`, `store_model_results()` |
| `run.py` | CLI entry point | `main()` |

### API Module

| File | Description |
|------|-------------|
| `api/main.py` | FastAPI application with endpoints |

### Tests

| File | Description |
|------|-------------|
| `tests/test_dataset_builder.py` | Unit tests for dataset building |
| `tests/test_correlation_analyzer.py` | Unit tests for correlation computation |

---

## 🧪 Testing

Run unit tests:

```bash
# Run all tests
pytest analytics/proof_of_correlation/tests/ -v

# Run with coverage
pytest analytics/proof_of_correlation/tests/ --cov=analytics.proof_of_correlation --cov-report=html

# Run specific test file
pytest analytics/proof_of_correlation/tests/test_dataset_builder.py -v
```

---

## 📁 Project Structure

```
analytics/proof_of_correlation/
├── __init__.py                  # Package initialization
├── config.py                    # Configuration management
├── database.py                  # Database connection utilities
├── schema_inspector.py          # Schema inspection tool
├── dataset_builder.py           # Build training datasets
├── correlation_analyzer.py      # Correlation computation
├── baseline_models.py           # ML baseline models
├── results_storage.py           # Store results to Supabase
├── run.py                       # CLI entry point
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment template
├── README.md                    # This file
├── api/
│   ├── __init__.py
│   └── main.py                  # FastAPI application
└── tests/
    ├── __init__.py
    ├── test_dataset_builder.py
    └── test_correlation_analyzer.py
```

---

## 🔄 Data Flow

### 1. Dataset Building

```python
from analytics.proof_of_correlation.dataset_builder import build_training_dataset

df = build_training_dataset()
# Returns DataFrame with:
#   - user_id, role_id (identifiers)
#   - hired, performance_score (targets)
#   - kpi_* (KPI features, normalized)
#   - cognitive_* (cognitive scores)
#   - reference_* (reference aggregates)
```

### 2. Correlation Analysis

```python
from analytics.proof_of_correlation.correlation_analyzer import compute_basic_correlations

correlations = compute_basic_correlations(df)
# Returns DataFrame with:
#   - feature_name, target_name
#   - metric_type ('pearson' or 'spearman')
#   - correlation, p_value, n_samples
```

### 3. Model Training

```python
from analytics.proof_of_correlation.baseline_models import train_baseline_models

results = train_baseline_models(df)
# Returns dict with:
#   - classification_results (for 'hired')
#   - regression_results (for 'performance_score')
#   - metrics, feature_importances, used_features
```

### 4. Results Storage

```python
from analytics.proof_of_correlation.results_storage import (
    store_correlation_results,
    store_model_results
)

store_correlation_results(correlations)
store_model_results(results)
# Inserts into correlation_results and model_baseline_results tables
```

---

## 🔧 Assumptions and Adaptability

### Current Assumptions

The pipeline makes the following assumptions about the database schema:

1. **Tables exist**: `users`, `roles`, `references`, `user_kpis`, `cognitive_game_scores`, `job_outcomes`
2. **Key columns**:
   - `job_outcomes.hired` (boolean): Whether candidate was hired
   - `job_outcomes.performance_score` (1-5): Performance rating
   - `user_kpis.kpi_name`, `user_kpis.normalized_value`: KPI data
   - `cognitive_game_scores.game_type`, `cognitive_game_scores.normalized_score`: Cognitive scores
3. **Verified data**: Only uses `job_outcomes` where `verified = true`

### Adapting to Schema Changes

If your schema differs, you can adapt by:

**1. Editing SQL queries** in `dataset_builder.py`:

```python
# Example: Change the job_outcomes query
def fetch_job_outcomes() -> pd.DataFrame:
    query = """
        SELECT
            jo.id,
            jo.user_id,
            jo.hired,
            jo.your_custom_column  -- Add your columns here
        FROM job_outcomes jo
        WHERE jo.your_custom_filter = true
    """
    # ...
```

**2. Modifying feature column selection** in `correlation_analyzer.py`:

```python
# Example: Add custom feature prefix
feature_cols = [
    col for col in df.columns
    if col.startswith(("kpi_", "cognitive_", "reference_", "custom_"))  # Add "custom_"
]
```

**3. Documenting assumptions** clearly in code comments

---

## 🐛 Troubleshooting

### Issue: "No job outcomes found"

**Cause**: The `job_outcomes` table is empty or has no verified outcomes.

**Solution**:
1. Check if table exists: `python -m analytics.proof_of_correlation.run --inspect-schema`
2. Insert sample data or ensure `verified = true` for some outcomes

### Issue: "Database connection failed"

**Cause**: Incorrect `SUPABASE_DB_URL` or network issues.

**Solution**:
1. Verify connection string format: `postgresql://user:pass@host:port/db`
2. Test connection manually: `psql $SUPABASE_DB_URL`
3. Check Supabase project status (not paused)

### Issue: "ModuleNotFoundError: No module named 'analytics'"

**Cause**: Python path not set correctly.

**Solution**:
```bash
# Run from project root
cd /path/to/HRkey-App
python -m analytics.proof_of_correlation.run
```

### Issue: "No correlations computed"

**Cause**: Insufficient data or zero variance features.

**Solution**:
1. Lower `MIN_SAMPLES_FOR_CORRELATION` in `.env`
2. Check that KPI/cognitive score tables have data
3. Review logs for "Skipping X: zero variance" warnings

---

## 🚀 Next Steps

### Phase II Enhancements

1. **Advanced Models**: XGBoost, neural networks, ensemble methods
2. **Feature Engineering**: Interaction terms, polynomial features, domain-specific transformations
3. **Time-Series Analysis**: Track correlation evolution over time
4. **Segmentation**: Industry-specific, role-specific, seniority-specific models
5. **Explainability**: SHAP values, LIME, partial dependence plots
6. **Real-Time Predictions**: Serve models via API for live candidate scoring
7. **A/B Testing**: Compare model versions in production
8. **Data Drift Monitoring**: Detect when retraining is needed

### Integration with Frontend

```typescript
// Example: Fetch correlation summary in Next.js
const response = await fetch('http://localhost:8000/api/correlation-summary?target=hired&limit=10');
const data = await response.json();

// Display top correlations in dashboard
data.data.hired.forEach(corr => {
  console.log(`${corr.feature_name}: r=${corr.correlation}`);
});
```

---

## 📄 License

MIT License - see LICENSE file for details

---

## 👥 Contributors

- HRKey Data Engineering Team
- Built with ❤️ for the future of verifiable professional identity

---

## 📞 Support

For questions or issues:
1. Check this README
2. Review code comments (heavily documented)
3. Open an issue in the repo
4. Contact the data engineering team

---

**Ready to prove correlations? Let's go! 🚀**

```bash
python -m analytics.proof_of_correlation.run
```
