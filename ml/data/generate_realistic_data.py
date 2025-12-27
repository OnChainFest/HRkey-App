#!/usr/bin/env python3
"""
Generate Realistic KPI Observations for HRKey ML Training
==========================================================

Creates a larger, more realistic synthetic dataset with:
- 100 subjects (employees)
- 1200+ observations
- Strong, realistic correlations between KPIs and outcomes
- Realistic noise and variation

Author: HRKey ML Team (Production Training Data)
Date: 2025-12-23
"""

import csv
import random
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================================
# CONFIGURATION
# ============================================================================

OUTPUT_FILE = Path(__file__).parent / "realistic_kpi_observations.csv"

# Role definitions (5 distinct roles)
ROLES = [
    {"id": "role-backend-dev", "name": "Backend Developer"},
    {"id": "role-frontend-dev", "name": "Frontend Developer"},
    {"id": "role-devops-eng", "name": "DevOps Engineer"},
    {"id": "role-qa-engineer", "name": "QA Engineer"},
    {"id": "role-product-manager", "name": "Product Manager"}
]

# KPI definitions (6 core KPIs that predict job performance)
KPIS = [
    "code_quality",
    "test_coverage",
    "deployment_frequency",
    "bug_resolution_time",
    "api_response_time",
    "documentation_quality"
]

# Subjects (300 employees being evaluated for better ML training)
NUM_SUBJECTS = 300
SUBJECTS = [f"0xSUBJECT_{str(i).zfill(4)}" for i in range(1, NUM_SUBJECTS + 1)]

# Observers (15 managers/colleagues)
NUM_OBSERVERS = 15
OBSERVERS = [f"0xOBSERVER_{str(i).zfill(3)}" for i in range(1, NUM_OBSERVERS + 1)]

# Date range (last 12 months)
START_DATE = datetime.now() - timedelta(days=365)
END_DATE = datetime.now()

# ============================================================================
# REALISTIC CORRELATION LOGIC
# ============================================================================

def calculate_job_performance_outcome(kpi_ratings, role_name):
    """
    Calculate job performance outcome based on multiple KPI ratings.

    This simulates how different KPIs contribute to overall job performance.
    Uses weighted sum with realistic noise.

    Args:
        kpi_ratings: dict of {kpi_name: rating_value (1-5)}
        role_name: role of the employee

    Returns:
        float: Job performance score (50-200 range)
    """

    # KPI weights (how much each KPI contributes to job performance)
    # These differ by role
    kpi_weights = {
        "Backend Developer": {
            "code_quality": 0.30,
            "test_coverage": 0.25,
            "bug_resolution_time": 0.20,
            "api_response_time": 0.15,
            "deployment_frequency": 0.05,
            "documentation_quality": 0.05
        },
        "Frontend Developer": {
            "code_quality": 0.25,
            "test_coverage": 0.15,
            "bug_resolution_time": 0.20,
            "api_response_time": 0.10,
            "deployment_frequency": 0.10,
            "documentation_quality": 0.20
        },
        "DevOps Engineer": {
            "deployment_frequency": 0.35,
            "api_response_time": 0.25,
            "bug_resolution_time": 0.15,
            "code_quality": 0.10,
            "test_coverage": 0.10,
            "documentation_quality": 0.05
        },
        "QA Engineer": {
            "test_coverage": 0.35,
            "bug_resolution_time": 0.30,
            "code_quality": 0.15,
            "documentation_quality": 0.10,
            "deployment_frequency": 0.05,
            "api_response_time": 0.05
        },
        "Product Manager": {
            "documentation_quality": 0.30,
            "deployment_frequency": 0.25,
            "bug_resolution_time": 0.20,
            "code_quality": 0.10,
            "test_coverage": 0.10,
            "api_response_time": 0.05
        }
    }

    weights = kpi_weights.get(role_name, kpi_weights["Backend Developer"])

    # Base score calculation (weighted average of ratings)
    # Rating scale: 1-5, we map to outcome scale: 50-200
    weighted_sum = 0
    for kpi, rating in kpi_ratings.items():
        weight = weights.get(kpi, 0)
        # Map rating 1-5 to contribution: 1->10, 2->20, 3->30, 4->40, 5->50
        contribution = rating * 10
        weighted_sum += contribution * weight

    # Base outcome (this gives us roughly 50-250 range)
    base_outcome = 50 + (weighted_sum * 3)

    # Add realistic noise (±10%)
    noise = np.random.normal(0, base_outcome * 0.10)
    final_outcome = base_outcome + noise

    # Clamp to valid range (50-200)
    return round(max(50, min(200, final_outcome)), 2)


def generate_employee_profile(subject_id):
    """
    Generate a consistent employee profile with inherent skill levels.

    Returns:
        dict: {
            'subject_id': str,
            'role': dict,
            'base_skill_level': float (0-1),
            'kpi_strengths': dict {kpi_name: modifier (-0.2 to +0.2)}
        }
    """
    role = random.choice(ROLES)

    # Employee's overall skill level (some are just better than others)
    # This creates consistency: good employees get better ratings across KPIs
    base_skill_level = np.random.beta(5, 2)  # Skewed toward higher skills

    # Each employee has strengths and weaknesses
    kpi_strengths = {}
    for kpi in KPIS:
        # Small random modifier for each KPI
        kpi_strengths[kpi] = np.random.normal(0, 0.15)

    return {
        'subject_id': subject_id,
        'role': role,
        'base_skill_level': base_skill_level,
        'kpi_strengths': kpi_strengths
    }


def generate_kpi_rating(employee_profile, kpi_name):
    """
    Generate a realistic KPI rating for an employee.

    Takes into account:
    - Employee's base skill level
    - Their strength/weakness in this specific KPI
    - Random variation (observer subjectivity)

    Returns:
        int: Rating 1-5
    """
    base_skill = employee_profile['base_skill_level']
    kpi_modifier = employee_profile['kpi_strengths'].get(kpi_name, 0)

    # Combine factors
    # base_skill: 0-1 → map to 1-5 range
    skill_rating = 1 + (base_skill * 4)
    adjusted_rating = skill_rating + kpi_modifier

    # Add observer noise (±0.5)
    observer_noise = np.random.normal(0, 0.5)
    final_rating = adjusted_rating + observer_noise

    # Clamp to 1-5 and round
    return int(max(1, min(5, round(final_rating))))


# ============================================================================
# DATA GENERATION
# ============================================================================

def generate_realistic_dataset():
    """Generate realistic KPI observations with strong correlations."""

    print(f"🔧 Generating realistic training data...")
    print(f"   Subjects: {NUM_SUBJECTS}")
    print(f"   Target observations: ~3600+")

    observations = []

    # Create consistent employee profiles
    employee_profiles = {
        subject: generate_employee_profile(subject)
        for subject in SUBJECTS
    }

    # Generate observations
    for subject in SUBJECTS:
        profile = employee_profiles[subject]
        role = profile['role']

        # Each employee gets 10-15 observations (KPI ratings from different observers)
        num_obs = random.randint(10, 15)

        for _ in range(num_obs):
            # Random KPI
            kpi_name = random.choice(KPIS)

            # Random observer
            observer = random.choice(OBSERVERS)

            # Generate rating based on employee profile
            rating_value = generate_kpi_rating(profile, kpi_name)

            # Collect all KPIs for this employee (for outcome calculation)
            # Simulate their average ratings across all KPIs
            employee_kpi_ratings = {
                kpi: generate_kpi_rating(profile, kpi)
                for kpi in KPIS
            }

            # Calculate correlated outcome
            outcome_value = calculate_job_performance_outcome(
                employee_kpi_ratings,
                role['name']
            )

            # Random date in last 12 months
            days_ago = random.randint(0, 365)
            observed_at = (datetime.now() - timedelta(days=days_ago)).isoformat() + "Z"

            # Context notes
            context_templates = [
                f"Q{random.randint(1,4)} 2024 performance review",
                f"{random.choice(['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'])} 2024 observation",
                "Multi-sprint performance analysis",
                f"{random.randint(2,6)} month observation period",
                "Peer and manager feedback synthesis",
                "Project delivery assessment",
                "Cross-functional collaboration review"
            ]
            context_notes = random.choice(context_templates)

            # Source and verification
            source = random.choice(["manager_review", "peer_review", "self_assessment", "project_retrospective"])
            verified = random.choice([True, True, True, False])  # 75% verified

            observation = {
                'subject_wallet': subject,
                'observer_wallet': observer,
                'role_id': role['id'],
                'role_name': role['name'],
                'kpi_name': kpi_name,
                'rating_value': rating_value,
                'outcome_value': outcome_value,
                'context_notes': context_notes,
                'observed_at': observed_at,
                'source': source,
                'verified': verified
            }

            observations.append(observation)

    print(f"✅ Generated {len(observations)} observations")

    # Write to CSV
    fieldnames = [
        'subject_wallet', 'observer_wallet', 'role_id', 'role_name',
        'kpi_name', 'rating_value', 'outcome_value', 'context_notes',
        'observed_at', 'source', 'verified'
    ]

    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(observations)

    print(f"💾 Saved to: {OUTPUT_FILE}")

    # Statistics
    df_stats = {
        'subjects': len(set(obs['subject_wallet'] for obs in observations)),
        'observers': len(set(obs['observer_wallet'] for obs in observations)),
        'roles': len(set(obs['role_name'] for obs in observations)),
        'kpis': len(set(obs['kpi_name'] for obs in observations)),
        'avg_rating': np.mean([obs['rating_value'] for obs in observations]),
        'avg_outcome': np.mean([obs['outcome_value'] for obs in observations])
    }

    print(f"\n📊 Dataset Statistics:")
    print(f"   Total observations: {len(observations)}")
    print(f"   Unique subjects: {df_stats['subjects']}")
    print(f"   Unique observers: {df_stats['observers']}")
    print(f"   Roles: {df_stats['roles']}")
    print(f"   KPIs: {df_stats['kpis']}")
    print(f"   Avg rating: {df_stats['avg_rating']:.2f}/5")
    print(f"   Avg outcome: {df_stats['avg_outcome']:.2f}")
    print(f"\n✅ Ready for model training!")


if __name__ == "__main__":
    random.seed(42)  # For reproducibility
    np.random.seed(42)
    generate_realistic_dataset()
