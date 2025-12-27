#!/usr/bin/env python3
"""
Generate Hardened Synthetic KPI Observations for HRKey ML Training
===================================================================

SYNTHETIC DATA NOTICE:
This is synthetic data designed to simulate real-world complexity.
It is NOT real employee data. It is used for model training only.

Hardening Features:
- Latent variables (not exposed to model)
- Rater bias and calibration drift
- Missing data and sparsity
- Non-linear effects and interactions
- Label noise and confounding
- Gaming/adversarial subjects
- Time-based evaluation safety

Author: HRKey ML Team
Date: 2025-12-23 (Hardened)
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

# Hardening parameters
MISSING_RATE = 0.30  # 30% of KPI ratings dropped
GAMING_SUBJECTS_PCT = 0.07  # 7% of subjects game the system
LABEL_NOISE_STD = 0.20  # 20% noise in outcomes


# ============================================================================
# LATENT VARIABLES & OBSERVER BIAS
# ============================================================================

def generate_observer_profile(observer_id):
    """
    Generate observer bias profile (LATENT - not in CSV).

    Real-world raters have:
    - Consistent bias (some are lenient, some harsh)
    - Different consistency levels
    - Calibration drift over time

    Returns:
        dict: {
            'observer_id': str,
            'mean_bias': float (-1 to +1, shift in ratings),
            'variance': float (0.3 to 0.8, rating consistency),
            'drift_rate': float (-0.002 to +0.002, ratings inflation/deflation per day)
        }
    """
    return {
        'observer_id': observer_id,
        'mean_bias': np.random.normal(0, 0.4),  # Some raters consistently rate higher/lower
        'variance': np.random.uniform(0.3, 0.8),  # Rating consistency
        'drift_rate': np.random.normal(0, 0.001)  # Calibration drift (ratings slowly change)
    }


def generate_employee_profile(subject_id):
    """
    Generate employee profile with LATENT variables.

    Latent variables (NOT exposed to model):
    - true_skill: actual ability (vs. observed KPIs)
    - team_environment: team quality (affects outcomes)
    - is_gaming: whether employee optimizes visible KPIs

    Returns:
        dict: employee profile with latent factors
    """
    role = random.choice(ROLES)

    # LATENT: True skill level (not directly observable)
    true_skill = np.random.beta(5, 2)  # Skewed toward higher skills

    # LATENT: Team environment quality (confounding factor)
    team_environment = np.random.normal(0, 1)  # Can be negative (bad team) or positive (good team)

    # LATENT: Gaming behavior (7% of subjects optimize KPIs but underperform)
    is_gaming = random.random() < GAMING_SUBJECTS_PCT

    # KPI-specific strengths (small modifiers)
    kpi_strengths = {}
    for kpi in KPIS:
        kpi_strengths[kpi] = np.random.normal(0, 0.15)

    # If gaming: artificially boost visible KPIs but reduce true performance
    if is_gaming:
        for kpi in ["code_quality", "test_coverage", "documentation_quality"]:
            kpi_strengths[kpi] += 0.5  # Game these KPIs
        true_skill *= 0.75  # But actual performance is worse

    return {
        'subject_id': subject_id,
        'role': role,
        'true_skill': true_skill,  # LATENT
        'team_environment': team_environment,  # LATENT
        'is_gaming': is_gaming,  # LATENT
        'kpi_strengths': kpi_strengths
    }


# ============================================================================
# RATING GENERATION WITH RATER BIAS
# ============================================================================

def generate_kpi_rating(employee_profile, kpi_name, observer_profile, days_ago):
    """
    Generate KPI rating with rater bias and calibration drift.

    Factors:
    - Employee's true skill + KPI strength
    - Observer's mean bias
    - Observer's variance (consistency)
    - Observer's drift over time
    - Random noise

    Returns:
        int: Rating 1-5 (or None if missing)
    """
    # Base rating from employee's true skill
    true_skill = employee_profile['true_skill']
    kpi_modifier = employee_profile['kpi_strengths'].get(kpi_name, 0)

    # Map true_skill (0-1) to rating scale (1-5)
    skill_rating = 1 + (true_skill * 4)
    adjusted_rating = skill_rating + kpi_modifier

    # Apply observer bias
    observer_bias = observer_profile['mean_bias']
    observer_variance = observer_profile['variance']
    drift = observer_profile['drift_rate'] * days_ago  # Drift over time

    # Combine all factors
    final_rating = adjusted_rating + observer_bias + drift
    final_rating += np.random.normal(0, observer_variance)  # Observer noise

    # Clamp to 1-5 and round
    return int(max(1, min(5, round(final_rating))))


def should_drop_observation(kpi_name, role_name, subject_profile):
    """
    Simulate missing data patterns.

    Real-world missingness:
    - Random dropout (30% baseline)
    - Systematic underreporting (some KPIs for some roles)
    - Cold start (some subjects have very few observations)

    Returns:
        bool: True if observation should be dropped
    """
    # Base missing rate
    if random.random() < MISSING_RATE:
        return True

    # Systematic missingness: some KPIs underreported for certain roles
    role_kpi_missing = {
        "Backend Developer": {"documentation_quality": 0.4},  # Devs don't document as much
        "Frontend Developer": {"api_response_time": 0.3},
        "DevOps Engineer": {"code_quality": 0.3},
        "QA Engineer": {"deployment_frequency": 0.5},
        "Product Manager": {"test_coverage": 0.6}  # PMs rarely have this measured
    }

    extra_missing = role_kpi_missing.get(role_name, {}).get(kpi_name, 0)
    if random.random() < extra_missing:
        return True

    return False


# ============================================================================
# OUTCOME CALCULATION WITH NON-LINEAR EFFECTS
# ============================================================================

def calculate_job_performance_outcome(employee_profile, kpi_ratings_dict, role_name):
    """
    Calculate job performance with non-linear effects and confounding.

    Hardening features:
    1. Threshold effects (KPIs only help above minimum)
    2. Diminishing returns (more is not always better)
    3. Tradeoffs (speed vs quality)
    4. Confounding (team environment affects outcome)
    5. Label noise (random shocks)

    Args:
        employee_profile: dict with latent variables
        kpi_ratings_dict: dict of {kpi_name: rating or None}
        role_name: role of the employee

    Returns:
        float: Job performance score (50-200 range)
    """

    # Base weights (starting point)
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

    # Start with baseline from latent true skill
    true_skill = employee_profile['true_skill']
    base_outcome = 100 + (true_skill * 80)  # 100-180 range from skill

    # Apply KPI effects (with non-linearities)
    kpi_contribution = 0

    for kpi, weight in weights.items():
        rating = kpi_ratings_dict.get(kpi)
        if rating is None:
            continue  # Missing KPI

        # NON-LINEAR EFFECT 1: Threshold (test_coverage only helps above 3)
        if kpi == "test_coverage":
            if rating < 3:
                contribution = 0  # Below threshold, no benefit
            else:
                contribution = (rating - 2) * 10  # Above threshold, strong benefit

        # NON-LINEAR EFFECT 2: Diminishing returns (deployment_frequency)
        elif kpi == "deployment_frequency":
            # Square root for diminishing returns
            contribution = np.sqrt(rating) * 15

        # NON-LINEAR EFFECT 3: Tradeoff (speed vs quality)
        elif kpi == "api_response_time":
            # Fast API but low code quality? Penalize
            code_quality_rating = kpi_ratings_dict.get("code_quality", 3)
            if rating >= 4 and code_quality_rating <= 2:
                contribution = rating * 5  # Reduced benefit (tradeoff)
            else:
                contribution = rating * 10

        else:
            # Linear for others
            contribution = rating * 10

        kpi_contribution += contribution * weight

    # CONFOUNDING: Team environment (latent variable affects outcome)
    team_effect = employee_profile['team_environment'] * 15  # ±15 points from team

    # INTERACTION: Good employees on bad teams still do okay
    if true_skill > 0.7 and team_effect < 0:
        team_effect *= 0.5  # Halve penalty for high-skill on bad team

    # Combine all effects
    outcome = base_outcome + kpi_contribution + team_effect

    # LABEL NOISE: Random shocks (economic conditions, project luck, etc.)
    label_noise = np.random.normal(0, outcome * LABEL_NOISE_STD)
    outcome += label_noise

    # Clamp to valid range (50-200)
    return round(max(50, min(200, outcome)), 2)


# ============================================================================
# DATA GENERATION WITH HARDENING
# ============================================================================

def generate_realistic_dataset():
    """Generate hardened synthetic KPI observations."""

    print(f"🔧 Generating HARDENED synthetic training data...")
    print(f"   Subjects: {NUM_SUBJECTS}")
    print(f"   Target observations: ~3600+ (before missingness)")
    print(f"   Hardening: latent vars, rater bias, missing data, non-linear, noise")

    # Create latent profiles
    employee_profiles = {
        subject: generate_employee_profile(subject)
        for subject in SUBJECTS
    }

    observer_profiles = {
        observer: generate_observer_profile(observer)
        for observer in OBSERVERS
    }

    observations = []

    # Track subjects with very few observations (cold start)
    cold_start_subjects = set(random.sample(SUBJECTS, k=int(NUM_SUBJECTS * 0.1)))  # 10% cold start

    # Generate observations
    for subject in SUBJECTS:
        profile = employee_profiles[subject]
        role = profile['role']

        # Cold start: some subjects get very few observations
        if subject in cold_start_subjects:
            num_obs = random.randint(2, 5)  # Very sparse
        else:
            num_obs = random.randint(10, 15)  # Normal

        # Generate observations over time (for time-based splits)
        for obs_idx in range(num_obs):
            # Time distribution: more recent observations more common
            days_ago = int(np.random.exponential(180))  # Exponential distribution
            days_ago = min(days_ago, 365)  # Cap at 1 year

            observed_at = START_DATE + timedelta(days=(365 - days_ago))

            # Random KPI
            kpi_name = random.choice(KPIS)

            # Random observer
            observer = random.choice(OBSERVERS)
            observer_profile = observer_profiles[observer]

            # Check if this observation should be dropped (missingness)
            if should_drop_observation(kpi_name, role['name'], profile):
                continue  # Skip this observation

            # Generate rating with rater bias
            rating_value = generate_kpi_rating(profile, kpi_name, observer_profile, days_ago)

            # Collect KPI ratings for outcome calculation
            # Simulate employee's typical ratings (with missingness)
            employee_kpi_ratings = {}
            for kpi in KPIS:
                if not should_drop_observation(kpi, role['name'], profile):
                    employee_kpi_ratings[kpi] = generate_kpi_rating(
                        profile, kpi, observer_profile, days_ago
                    )
                # else: KPI is missing (None)

            # Calculate outcome with non-linear effects and confounding
            outcome_value = calculate_job_performance_outcome(
                profile,
                employee_kpi_ratings,
                role['name']
            )

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
                'observed_at': observed_at.isoformat() + "Z",
                'source': source,
                'verified': verified
            }

            observations.append(observation)

    # Sort by time (for time-based evaluation)
    observations.sort(key=lambda x: x['observed_at'])

    print(f"✅ Generated {len(observations)} observations (after {int(MISSING_RATE*100)}% missingness)")

    # Count gaming subjects in data
    gaming_count = sum(1 for s in SUBJECTS if employee_profiles[s]['is_gaming'])
    cold_start_count = len(cold_start_subjects)

    print(f"\n🔬 Hardening Statistics:")
    print(f"   Gaming subjects: {gaming_count} ({gaming_count/len(SUBJECTS)*100:.1f}%)")
    print(f"   Cold start subjects: {cold_start_count} ({cold_start_count/len(SUBJECTS)*100:.1f}%)")
    print(f"   Avg observations per subject: {len(observations)/len(SUBJECTS):.1f}")

    # Write to CSV (same schema as before)
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
    subjects_with_data = set(obs['subject_wallet'] for obs in observations)

    print(f"\n📊 Dataset Statistics:")
    print(f"   Total observations: {len(observations)}")
    print(f"   Subjects with data: {len(subjects_with_data)}/{len(SUBJECTS)}")
    print(f"   Observers: {len(set(obs['observer_wallet'] for obs in observations))}")
    print(f"   Roles: {len(set(obs['role_name'] for obs in observations))}")
    print(f"   KPIs: {len(set(obs['kpi_name'] for obs in observations))}")
    print(f"   Avg rating: {np.mean([obs['rating_value'] for obs in observations]):.2f}/5")
    print(f"   Avg outcome: {np.mean([obs['outcome_value'] for obs in observations]):.2f}")
    print(f"   Time range: {observations[0]['observed_at'][:10]} to {observations[-1]['observed_at'][:10]}")
    print(f"\n⚠️  SYNTHETIC DATA - Not real employee data")
    print(f"✅ Ready for model training!")


if __name__ == "__main__":
    random.seed(42)  # For reproducibility
    np.random.seed(42)
    generate_realistic_dataset()
