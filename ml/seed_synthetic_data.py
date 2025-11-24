#!/usr/bin/env python3
"""
Seed Synthetic KPI Observations to Supabase
============================================

Inserts synthetic data from CSV into the kpi_observations table.

Requirements:
- CSV file: ml/data/synthetic_kpi_observations.csv
- Supabase credentials in .env

Author: HRKey ML Team
Date: 2025-11-24
"""

import os
import sys
import csv
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# ============================================================================
# CONFIGURATION
# ============================================================================

# Load environment variables
load_dotenv()

# Paths
BASE_DIR = Path(__file__).parent
CSV_FILE = BASE_DIR / "data" / "synthetic_kpi_observations.csv"

# Supabase connection
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# ============================================================================
# SUPABASE CLIENT
# ============================================================================

def get_supabase_client():
    """Get Supabase client (try supabase-py first, fallback to requests)."""

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env\n"
            "Example:\n"
            "  SUPABASE_URL=https://xxx.supabase.co\n"
            "  SUPABASE_SERVICE_KEY=eyJhbGc..."
        )

    # Try supabase-py
    try:
        from supabase import create_client, Client
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("✅ Using supabase-py client")
        return {"method": "supabase-py", "client": client}
    except ImportError:
        print("⚠️  supabase-py not installed, using requests fallback")
        import requests
        return {
            "method": "requests",
            "url": SUPABASE_URL,
            "key": SUPABASE_SERVICE_KEY,
            "session": requests.Session()
        }

# ============================================================================
# DATA INSERTION
# ============================================================================

def insert_observation_supabase_py(client, observation):
    """Insert observation using supabase-py client."""
    result = client.table("kpi_observations").insert(observation).execute()
    return result.data

def insert_observation_requests(conn_info, observation):
    """Insert observation using requests."""
    import requests

    url = f"{conn_info['url']}/rest/v1/kpi_observations"
    headers = {
        "apikey": conn_info['key'],
        "Authorization": f"Bearer {conn_info['key']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    response = conn_info['session'].post(url, json=observation, headers=headers)
    response.raise_for_status()
    return response.json()

def seed_data():
    """Load CSV and insert into Supabase."""

    print("="*80)
    print("SEEDING SYNTHETIC DATA TO SUPABASE")
    print("="*80)
    print()

    # ========================================
    # 1. Check CSV exists
    # ========================================
    if not CSV_FILE.exists():
        print(f"❌ CSV file not found: {CSV_FILE}")
        print("   Run: python ml/data/generate_synthetic_data.py")
        sys.exit(1)

    print(f"📄 Reading CSV: {CSV_FILE}")

    # ========================================
    # 2. Load CSV
    # ========================================
    observations = []
    with open(CSV_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Transform CSV row to DB schema
            observation = {
                "subject_wallet": row["subject_wallet"],
                "observer_wallet": row["observer_wallet"],
                "role_id": row["role_id"],
                "role_name": row["role_name"],
                "kpi_name": row["kpi_name"],
                "rating_value": float(row["rating_value"]),
                "outcome_value": float(row["outcome_value"]),
                "context_notes": row["context_notes"],
                "observed_at": row["observed_at"],
                "source": row.get("source", "synthetic"),
                "verified": row["verified"].lower() == "true"
            }
            observations.append(observation)

    print(f"✅ Loaded {len(observations)} observations from CSV")
    print()

    # ========================================
    # 3. Connect to Supabase
    # ========================================
    print("🔌 Connecting to Supabase...")
    conn = get_supabase_client()
    print(f"   URL: {SUPABASE_URL}")
    print()

    # ========================================
    # 4. Insert observations
    # ========================================
    print("💾 Inserting observations into kpi_observations table...")
    print()

    inserted_count = 0
    failed_count = 0

    for i, obs in enumerate(observations, 1):
        try:
            if conn["method"] == "supabase-py":
                insert_observation_supabase_py(conn["client"], obs)
            else:
                insert_observation_requests(conn, obs)

            inserted_count += 1

            # Progress indicator
            if i % 10 == 0:
                print(f"   Inserted {i}/{len(observations)}...")

        except Exception as e:
            failed_count += 1
            print(f"   ⚠️  Failed to insert row {i}: {e}")

    print()
    print(f"✅ Insertion complete!")
    print(f"   Success: {inserted_count}")
    print(f"   Failed: {failed_count}")
    print()

    # ========================================
    # 5. Verify insertion
    # ========================================
    print("🔍 Verifying data in Supabase...")

    try:
        if conn["method"] == "supabase-py":
            result = conn["client"].table("kpi_observations")\
                .select("id", count="exact")\
                .eq("source", "synthetic")\
                .execute()
            count = result.count
        else:
            # Requests fallback
            url = f"{conn['url']}/rest/v1/kpi_observations"
            headers = {
                "apikey": conn['key'],
                "Authorization": f"Bearer {conn['key']}",
                "Prefer": "count=exact"
            }
            params = {"source": "eq.synthetic", "select": "id"}
            response = conn["session"].get(url, headers=headers, params=params)
            count = int(response.headers.get("Content-Range", "0-0/0").split("/")[-1])

        print(f"✅ Found {count} synthetic observations in database")

        if count >= 40:
            print(f"✅ Sufficient data for ML training (minimum: 40)")
        else:
            print(f"⚠️  Only {count} observations found (minimum recommended: 40)")

    except Exception as e:
        print(f"⚠️  Could not verify count: {e}")

    print()
    print("="*80)
    print("✅ SEED COMPLETE")
    print("="*80)
    print()
    print("Next steps:")
    print("1. python ml/correlation_analysis.py")
    print("2. python ml/baseline_predictive_model.py")
    print("3. python ml/export_hrkey_model_config.py")

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    try:
        seed_data()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
