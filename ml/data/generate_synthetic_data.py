#!/usr/bin/env python3
"""
Generate Synthetic KPI Observations
====================================

Generates realistic synthetic data for HRKey ML model training.
Creates intentional correlations between KPIs and outcomes.

Author: HRKey ML Team
Date: 2025-11-24
"""

import csv
import random
from datetime import datetime, timedelta
from uuid import uuid4

# ============================================================================
# CONFIGURATION
# ============================================================================

OUTPUT_FILE = "synthetic_kpi_observations.csv"
NUM_ROWS = 60  # Target: 40-80 rows

# Role definitions (3 distinct roles)
ROLES = [
    {
        "id": "a1b2c3d4-1111-4444-8888-000000000001",
        "name": "Backend Developer"
    },
    {
        "id": "a1b2c3d4-2222-4444-8888-000000000002",
        "name": "Frontend Developer"
    },
    {
        "id": "a1b2c3d4-3333-4444-8888-000000000003",
        "name": "DevOps Engineer"
    }
]

# KPI definitions (6 distinct KPIs)
KPIS = [
    "deployment_frequency",
    "code_quality",
    "api_response_time",
    "test_coverage",
    "bug_resolution_time",
    "documentation_quality"
]

# Subjects (30 employees being evaluated for better ML training)
NUM_SUBJECTS = 30
SUBJECTS = [f"0xSUBJECT{str(i).zfill(3)}" for i in range(1, NUM_SUBJECTS + 1)]

# Observers (3-5 managers/colleagues)
NUM_OBSERVERS = 4
OBSERVERS = [f"0xOBSERVER{str(i).zfill(2)}" for i in range(1, NUM_OBSERVERS + 1)]

# Date range (last 6 months)
START_DATE = datetime.now() - timedelta(days=180)
END_DATE = datetime.now()

# ============================================================================
# CORRELATION LOGIC
# ============================================================================

def calculate_outcome_value(kpi_name, rating_value, noise_factor=0.15):
    """
    Calculate outcome_value with intentional correlations.

    Higher ratings → higher outcomes (with realistic noise)
    Different KPIs have different impact weights
    """

    # Base mapping: rating (1-5) to outcome range
    # We want strong positive correlation
    base_outcome = {
        1: 60,   # Low rating → low outcome
        2: 85,
        3: 110,
        4: 140,
        5: 175   # High rating → high outcome
    }[rating_value]

    # KPI-specific weights (some KPIs matter more)
    kpi_weights = {
        "deployment_frequency": 1.2,    # High impact
        "code_quality": 1.3,            # Highest impact
        "api_response_time": 0.9,       # Medium impact
        "test_coverage": 1.1,           # High impact
        "bug_resolution_time": 1.0,     # Medium impact
        "documentation_quality": 0.8    # Lower impact
    }

    weight = kpi_weights.get(kpi_name, 1.0)
    weighted_outcome = base_outcome * weight

    # Add realistic noise (±15%)
    noise = random.uniform(-noise_factor, noise_factor) * weighted_outcome
    final_outcome = weighted_outcome + noise

    # Clamp to valid range (50-200)
    return round(max(50, min(200, final_outcome)), 2)

# ============================================================================
# DATA GENERATION
# ============================================================================

def generate_synthetic_data():
    """Generate synthetic KPI observations with realistic patterns."""

    observations = []

    # Generate observations
    # Strategy: each subject gets evaluated on multiple KPIs by multiple observers
    for subject in SUBJECTS:
        # Random role for this subject
        role = random.choice(ROLES)

        # Each subject gets 6-12 observations
        num_obs = random.randint(6, 12)

        for _ in range(num_obs):
            # Random KPI
            kpi_name = random.choice(KPIS)

            # Random observer
            observer = random.choice(OBSERVERS)

            # Rating (1-5) with realistic distribution (bell curve around 3-4)
            rating_value = random.choices(
                [1, 2, 3, 4, 5],
                weights=[5, 15, 30, 35, 15]  # More 3s and 4s
            )[0]

            # Calculate correlated outcome
            outcome_value = calculate_outcome_value(kpi_name, rating_value)

            # Random date in last 6 months
            days_ago = random.randint(0, 180)
            observed_at = (datetime.now() - timedelta(days=days_ago)).isoformat() + "Z"

            # Context notes
            context_templates = [
                f"Evaluated during Q{random.randint(1,4)} 2024 performance review",
                f"Observation period: {random.choice(['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'])} 2024",
                "Consistent performance across sprint cycles",
                f"Measured over {random.randint(1,3)} month period",
                "Based on peer feedback and metrics"
            ]
            context_notes = random.choice(context_templates)

            observation = {
                "subject_wallet": subject,
                "observer_wallet": observer,
                "role_id": role["id"],
                "role_name": role["name"],
                "kpi_name": kpi_name,
                "rating_value": rating_value,
                "outcome_value": outcome_value,
                "context_notes": context_notes,
                "observed_at": observed_at,
                "source": "synthetic",
                "verified": random.choice([True, False])
            }

            observations.append(observation)

    return observations

# ============================================================================
# SAVE TO CSV
# ============================================================================

def save_to_csv(observations, filename):
    """Save observations to CSV file."""

    fieldnames = [
        "subject_wallet",
        "observer_wallet",
        "role_id",
        "role_name",
        "kpi_name",
        "rating_value",
        "outcome_value",
        "context_notes",
        "observed_at",
        "source",
        "verified"
    ]

    with open(filename, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(observations)

    print(f"✅ Generated {len(observations)} observations")
    print(f"📄 Saved to: {filename}")

    # Print summary statistics
    subjects = set(obs["subject_wallet"] for obs in observations)
    observers = set(obs["observer_wallet"] for obs in observations)
    roles = set(obs["role_id"] for obs in observations)
    kpis = set(obs["kpi_name"] for obs in observations)

    print(f"\n📊 Dataset Summary:")
    print(f"   Subjects: {len(subjects)}")
    print(f"   Observers: {len(observers)}")
    print(f"   Roles: {len(roles)}")
    print(f"   KPIs: {len(kpis)}")
    print(f"   Total Observations: {len(observations)}")

    # Check correlations (sanity check)
    avg_outcome_by_rating = {}
    for rating in range(1, 6):
        outcomes = [obs["outcome_value"] for obs in observations if obs["rating_value"] == rating]
        if outcomes:
            avg_outcome_by_rating[rating] = sum(outcomes) / len(outcomes)

    print(f"\n🔍 Correlation Check (rating → avg outcome):")
    for rating in sorted(avg_outcome_by_rating.keys()):
        print(f"   Rating {rating}: {avg_outcome_by_rating[rating]:.1f}")

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("="*80)
    print("GENERATING SYNTHETIC KPI OBSERVATIONS")
    print("="*80)
    print()

    # Set seed for reproducibility
    random.seed(42)

    # Generate data
    observations = generate_synthetic_data()

    # Save to CSV
    save_to_csv(observations, OUTPUT_FILE)

    print()
    print("="*80)
    print("✅ SYNTHETIC DATA GENERATION COMPLETE")
    print("="*80)
