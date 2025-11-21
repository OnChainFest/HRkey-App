"""
Dataset builder module for the HRKey Correlation Engine.

Fetches raw data from Supabase, joins tables, aggregates KPIs and features,
and returns a clean analytic dataset ready for correlation analysis and modeling.
"""

import logging
from typing import Optional
import pandas as pd
import numpy as np
from psycopg2.extras import RealDictCursor

from .database import get_db_connection
from .config import get_config

logger = logging.getLogger(__name__)


def fetch_job_outcomes() -> pd.DataFrame:
    """
    Fetch all job outcomes from the database.

    Returns:
        pd.DataFrame: Job outcomes with columns user_id, role_id, hired,
                      performance_score, etc.
    """
    query = """
        SELECT
            jo.id as outcome_id,
            jo.user_id,
            jo.role_id,
            jo.company_id,
            jo.hired,
            jo.performance_score,
            jo.months_in_role,
            jo.promoted,
            jo.exit_date,
            jo.would_rehire,
            jo.verified,
            r.role_name,
            r.industry,
            r.seniority_level
        FROM job_outcomes jo
        LEFT JOIN roles r ON jo.role_id = r.id
        WHERE jo.verified = true  -- Only use verified outcomes
        ORDER BY jo.created_at DESC;
    """

    with get_db_connection() as conn:
        df = pd.read_sql_query(query, conn)

    logger.info(f"Fetched {len(df)} job outcomes from database")
    return df


def fetch_user_kpis() -> pd.DataFrame:
    """
    Fetch and aggregate user KPIs by user and role.

    Returns:
        pd.DataFrame: Aggregated KPIs with one row per (user_id, role_id)
    """
    query = """
        SELECT
            user_id,
            role_id,
            kpi_name,
            AVG(kpi_value) as kpi_value_mean,
            AVG(normalized_value) as kpi_normalized_mean,
            AVG(percentile) as kpi_percentile_mean,
            COUNT(*) as kpi_count,
            MAX(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) as has_verified_kpi
        FROM user_kpis
        GROUP BY user_id, role_id, kpi_name
        ORDER BY user_id, role_id, kpi_name;
    """

    with get_db_connection() as conn:
        df = pd.read_sql_query(query, conn)

    # Pivot KPIs to wide format (one column per KPI)
    if not df.empty:
        df_pivot = df.pivot_table(
            index=["user_id", "role_id"],
            columns="kpi_name",
            values="kpi_normalized_mean",
            aggfunc="first"
        ).reset_index()

        # Rename columns to have kpi_ prefix
        kpi_columns = [col for col in df_pivot.columns if col not in ["user_id", "role_id"]]
        rename_dict = {col: f"kpi_{col}" for col in kpi_columns}
        df_pivot = df_pivot.rename(columns=rename_dict)

        logger.info(f"Aggregated KPIs for {len(df_pivot)} user-role combinations")
        logger.info(f"KPI features: {list(rename_dict.values())}")
        return df_pivot
    else:
        logger.warning("No KPI data found")
        return pd.DataFrame(columns=["user_id", "role_id"])


def fetch_cognitive_scores() -> pd.DataFrame:
    """
    Fetch and aggregate cognitive game scores by user.

    Returns:
        pd.DataFrame: Aggregated cognitive scores with one row per user_id
    """
    query = """
        SELECT
            user_id,
            game_type,
            AVG(normalized_score) as cognitive_score_mean,
            AVG(percentile) as cognitive_percentile_mean,
            AVG(accuracy_percentage) as cognitive_accuracy_mean,
            COUNT(*) as game_count
        FROM cognitive_game_scores
        GROUP BY user_id, game_type
        ORDER BY user_id, game_type;
    """

    with get_db_connection() as conn:
        df = pd.read_sql_query(query, conn)

    # Pivot cognitive scores to wide format (one column per game type)
    if not df.empty:
        df_pivot = df.pivot_table(
            index="user_id",
            columns="game_type",
            values="cognitive_score_mean",
            aggfunc="first"
        ).reset_index()

        # Rename columns to have cognitive_ prefix
        game_columns = [col for col in df_pivot.columns if col != "user_id"]
        rename_dict = {col: f"cognitive_{col}" for col in game_columns}
        df_pivot = df_pivot.rename(columns=rename_dict)

        logger.info(f"Aggregated cognitive scores for {len(df_pivot)} users")
        logger.info(f"Cognitive features: {list(rename_dict.values())}")
        return df_pivot
    else:
        logger.warning("No cognitive score data found")
        return pd.DataFrame(columns=["user_id"])


def fetch_reference_features() -> pd.DataFrame:
    """
    Fetch and aggregate reference features by user and role.

    Returns:
        pd.DataFrame: Reference features with one row per (user_id, role_id)
    """
    query = """
        SELECT
            user_id,
            role_id,
            COUNT(*) as reference_count,
            AVG(overall_rating) as reference_avg_rating,
            SUM(CASE WHEN verified = true THEN 1 ELSE 0 END) as reference_verified_count,
            MAX(overall_rating) as reference_max_rating,
            MIN(overall_rating) as reference_min_rating
        FROM references
        WHERE user_id IS NOT NULL AND role_id IS NOT NULL
        GROUP BY user_id, role_id
        ORDER BY user_id, role_id;
    """

    with get_db_connection() as conn:
        df = pd.read_sql_query(query, conn)

    logger.info(f"Aggregated reference features for {len(df)} user-role combinations")
    return df


def build_training_dataset(conn=None) -> pd.DataFrame:
    """
    Build the complete training dataset by joining all data sources.

    This is the main function that creates the analytic dataset with:
    - Target variables: hired, performance_score
    - Features: KPIs, cognitive scores, reference metrics

    Args:
        conn: Optional database connection (for testing)

    Returns:
        pd.DataFrame: Clean dataset ready for analysis with columns:
            - user_id, role_id (identifiers)
            - hired (target, boolean)
            - performance_score (target, numeric 1-5)
            - kpi_* (KPI features, normalized)
            - cognitive_* (cognitive game scores)
            - reference_* (reference aggregates)

    Example:
        >>> df = build_training_dataset()
        >>> print(df.columns)
        >>> print(df.describe())
    """
    logger.info("=" * 80)
    logger.info("BUILDING TRAINING DATASET")
    logger.info("=" * 80)

    # 1. Fetch job outcomes (target variables)
    logger.info("\n1. Fetching job outcomes (target variables)...")
    outcomes_df = fetch_job_outcomes()

    if outcomes_df.empty:
        logger.error("❌ No job outcomes found! Cannot build training dataset.")
        logger.error("   Please ensure you have data in the job_outcomes table.")
        return pd.DataFrame()

    logger.info(f"   ✓ Found {len(outcomes_df)} job outcomes")
    logger.info(f"   ✓ Hired: {outcomes_df['hired'].sum()} / Not hired: {(~outcomes_df['hired']).sum()}")
    logger.info(f"   ✓ Performance scores: {outcomes_df['performance_score'].notna().sum()} non-null values")

    # 2. Fetch KPI features
    logger.info("\n2. Fetching and aggregating KPI features...")
    kpis_df = fetch_user_kpis()

    if not kpis_df.empty:
        logger.info(f"   ✓ Found KPIs for {len(kpis_df)} user-role combinations")
        logger.info(f"   ✓ KPI features: {[col for col in kpis_df.columns if col.startswith('kpi_')]}")
    else:
        logger.warning("   ⚠️  No KPI data found")

    # 3. Fetch cognitive scores
    logger.info("\n3. Fetching and aggregating cognitive scores...")
    cognitive_df = fetch_cognitive_scores()

    if not cognitive_df.empty:
        logger.info(f"   ✓ Found cognitive scores for {len(cognitive_df)} users")
        logger.info(f"   ✓ Cognitive features: {[col for col in cognitive_df.columns if col.startswith('cognitive_')]}")
    else:
        logger.warning("   ⚠️  No cognitive score data found")

    # 4. Fetch reference features
    logger.info("\n4. Fetching and aggregating reference features...")
    references_df = fetch_reference_features()

    if not references_df.empty:
        logger.info(f"   ✓ Found reference features for {len(references_df)} user-role combinations")
    else:
        logger.warning("   ⚠️  No reference data found")

    # 5. Join all datasets
    logger.info("\n5. Joining all datasets...")
    df = outcomes_df.copy()

    # Left join KPIs
    if not kpis_df.empty:
        df = df.merge(kpis_df, on=["user_id", "role_id"], how="left")
        logger.info(f"   ✓ Joined KPIs: {len(df)} rows")

    # Left join cognitive scores
    if not cognitive_df.empty:
        df = df.merge(cognitive_df, on="user_id", how="left")
        logger.info(f"   ✓ Joined cognitive scores: {len(df)} rows")

    # Left join references
    if not references_df.empty:
        df = df.merge(references_df, on=["user_id", "role_id"], how="left")
        logger.info(f"   ✓ Joined reference features: {len(df)} rows")

    # 6. Data cleaning and preparation
    logger.info("\n6. Cleaning and preparing data...")

    # Fill missing reference counts with 0
    if "reference_count" in df.columns:
        df["reference_count"] = df["reference_count"].fillna(0)

    # Identify feature columns (exclude identifiers and metadata)
    exclude_cols = [
        "outcome_id", "user_id", "role_id", "company_id",
        "role_name", "industry", "seniority_level",
        "months_in_role", "promoted", "exit_date", "would_rehire", "verified"
    ]
    feature_cols = [col for col in df.columns if col not in exclude_cols and col not in ["hired", "performance_score"]]

    logger.info(f"   ✓ Identified {len(feature_cols)} feature columns")
    logger.info(f"   ✓ Features: {feature_cols}")

    # Handle missing values in features
    config = get_config()
    for col in feature_cols:
        if df[col].dtype in [np.float64, np.int64]:
            if config.fill_missing_strategy == "median":
                df[col] = df[col].fillna(df[col].median())
            elif config.fill_missing_strategy == "mean":
                df[col] = df[col].fillna(df[col].mean())
            # If strategy is "drop", we'll handle it later

    # 7. Final dataset statistics
    logger.info("\n7. Final dataset statistics:")
    logger.info(f"   ✓ Total rows: {len(df)}")
    logger.info(f"   ✓ Total columns: {len(df.columns)}")
    logger.info(f"   ✓ Feature columns: {len(feature_cols)}")
    logger.info(f"   ✓ Missing values per column:")

    missing_summary = df[feature_cols].isnull().sum()
    missing_summary = missing_summary[missing_summary > 0]
    if not missing_summary.empty:
        for col, count in missing_summary.items():
            logger.info(f"      - {col}: {count} ({count/len(df)*100:.1f}%)")
    else:
        logger.info("      - None!")

    # Target variable distribution
    logger.info("\n   ✓ Target variable distribution:")
    logger.info(f"      - hired: {df['hired'].value_counts().to_dict()}")
    if "performance_score" in df.columns:
        perf_dist = df["performance_score"].value_counts().sort_index().to_dict()
        logger.info(f"      - performance_score: {perf_dist}")
        logger.info(f"      - performance_score (mean): {df['performance_score'].mean():.2f}")

    logger.info("\n" + "=" * 80)
    logger.info("DATASET BUILDING COMPLETE")
    logger.info("=" * 80)

    return df


if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Build dataset
    df = build_training_dataset()

    if not df.empty:
        print("\n" + "=" * 80)
        print("DATASET PREVIEW")
        print("=" * 80)
        print(df.head(10))
        print("\n" + "=" * 80)
        print("DATASET SUMMARY STATISTICS")
        print("=" * 80)
        print(df.describe())
