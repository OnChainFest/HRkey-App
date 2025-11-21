"""
Correlation analyzer module for the HRKey Correlation Engine.

Computes Pearson and Spearman correlations between features (KPIs, cognitive scores)
and target variables (hired, performance_score).
"""

import logging
from typing import List, Dict
import pandas as pd
import numpy as np
from scipy import stats

from .config import get_config

logger = logging.getLogger(__name__)


def compute_correlation(
    x: pd.Series,
    y: pd.Series,
    method: str = "pearson"
) -> Dict[str, float]:
    """
    Compute correlation between two variables.

    Args:
        x: First variable (feature)
        y: Second variable (target)
        method: Correlation method ('pearson' or 'spearman')

    Returns:
        dict: {
            'correlation': float,
            'p_value': float,
            'n_samples': int
        }
    """
    # Remove rows with missing values
    valid_mask = x.notna() & y.notna()
    x_clean = x[valid_mask]
    y_clean = y[valid_mask]

    n_samples = len(x_clean)

    if n_samples < 2:
        return {
            "correlation": np.nan,
            "p_value": np.nan,
            "n_samples": n_samples
        }

    # Compute correlation
    if method == "pearson":
        corr, p_value = stats.pearsonr(x_clean, y_clean)
    elif method == "spearman":
        corr, p_value = stats.spearmanr(x_clean, y_clean)
    else:
        raise ValueError(f"Unknown correlation method: {method}")

    return {
        "correlation": corr,
        "p_value": p_value,
        "n_samples": n_samples
    }


def compute_basic_correlations(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute Pearson and Spearman correlations between all features and targets.

    This function:
    1. Identifies feature columns (kpi_*, cognitive_*, reference_*)
    2. Identifies target columns (hired, performance_score)
    3. Computes both Pearson and Spearman correlations
    4. Filters out correlations with insufficient samples or variance
    5. Returns a tidy DataFrame with all correlations

    Args:
        df: Training dataset from build_training_dataset()

    Returns:
        pd.DataFrame: Correlation results with columns:
            - feature_name: Name of the feature
            - target_name: Name of the target variable
            - metric_type: 'pearson' or 'spearman'
            - correlation: Correlation coefficient
            - p_value: Statistical significance
            - n_samples: Number of samples used

    Example:
        >>> correlations = compute_basic_correlations(df)
        >>> top_correlations = correlations.nlargest(10, 'correlation')
    """
    logger.info("=" * 80)
    logger.info("COMPUTING CORRELATIONS")
    logger.info("=" * 80)

    config = get_config()

    # 1. Identify feature and target columns
    logger.info("\n1. Identifying feature and target columns...")

    # Feature columns: kpi_*, cognitive_*, reference_*
    feature_cols = [
        col for col in df.columns
        if col.startswith(("kpi_", "cognitive_", "reference_"))
        and df[col].dtype in [np.float64, np.int64]
    ]

    # Target columns
    target_cols = []
    if "hired" in df.columns:
        target_cols.append("hired")
    if "performance_score" in df.columns:
        target_cols.append("performance_score")

    logger.info(f"   ✓ Found {len(feature_cols)} feature columns")
    logger.info(f"   ✓ Found {len(target_cols)} target columns: {target_cols}")

    if not feature_cols:
        logger.error("   ❌ No feature columns found!")
        return pd.DataFrame()

    if not target_cols:
        logger.error("   ❌ No target columns found!")
        return pd.DataFrame()

    # 2. Filter features with sufficient variance and samples
    logger.info("\n2. Filtering features...")

    valid_features = []
    for col in feature_cols:
        # Check variance (skip constant features)
        if df[col].var() == 0:
            logger.warning(f"   ⚠️  Skipping {col}: zero variance")
            continue

        # Check sample size
        non_null_count = df[col].notna().sum()
        if non_null_count < config.min_samples_for_correlation:
            logger.warning(f"   ⚠️  Skipping {col}: only {non_null_count} samples (min: {config.min_samples_for_correlation})")
            continue

        valid_features.append(col)

    logger.info(f"   ✓ Valid features after filtering: {len(valid_features)}")

    # 3. Compute correlations
    logger.info("\n3. Computing correlations...")

    correlation_results = []

    for feature in valid_features:
        for target in target_cols:
            # Convert hired to numeric if boolean
            if target == "hired" and df[target].dtype == bool:
                target_series = df[target].astype(int)
            else:
                target_series = df[target]

            # Pearson correlation
            try:
                pearson_result = compute_correlation(df[feature], target_series, method="pearson")
                correlation_results.append({
                    "feature_name": feature,
                    "target_name": target,
                    "metric_type": "pearson",
                    "correlation": pearson_result["correlation"],
                    "p_value": pearson_result["p_value"],
                    "n_samples": pearson_result["n_samples"]
                })
            except Exception as e:
                logger.warning(f"   ⚠️  Failed to compute Pearson correlation for {feature} vs {target}: {e}")

            # Spearman correlation
            try:
                spearman_result = compute_correlation(df[feature], target_series, method="spearman")
                correlation_results.append({
                    "feature_name": feature,
                    "target_name": target,
                    "metric_type": "spearman",
                    "correlation": spearman_result["correlation"],
                    "p_value": spearman_result["p_value"],
                    "n_samples": spearman_result["n_samples"]
                })
            except Exception as e:
                logger.warning(f"   ⚠️  Failed to compute Spearman correlation for {feature} vs {target}: {e}")

    # 4. Create results DataFrame
    results_df = pd.DataFrame(correlation_results)

    if results_df.empty:
        logger.error("   ❌ No correlations computed!")
        return results_df

    logger.info(f"   ✓ Computed {len(results_df)} correlations")

    # 5. Filter by significance
    logger.info("\n4. Filtering by statistical significance...")

    significant_mask = results_df["p_value"] <= config.significance_threshold
    significant_results = results_df[significant_mask].copy()

    logger.info(f"   ✓ Significant correlations (p < {config.significance_threshold}): {len(significant_results)} / {len(results_df)}")

    # 6. Summary statistics
    logger.info("\n5. Correlation summary statistics:")

    for target in target_cols:
        logger.info(f"\n   Target: {target}")
        target_results = significant_results[significant_results["target_name"] == target]

        if target_results.empty:
            logger.info(f"      No significant correlations found")
            continue

        # Top positive correlations
        top_positive = target_results.nlargest(5, "correlation")
        logger.info(f"      Top 5 positive correlations:")
        for _, row in top_positive.iterrows():
            logger.info(f"         {row['feature_name']:40} {row['metric_type']:10} {row['correlation']:+.4f} (p={row['p_value']:.4f}, n={row['n_samples']})")

        # Top negative correlations
        top_negative = target_results.nsmallest(5, "correlation")
        if not top_negative.empty and top_negative.iloc[0]["correlation"] < 0:
            logger.info(f"      Top 5 negative correlations:")
            for _, row in top_negative.iterrows():
                logger.info(f"         {row['feature_name']:40} {row['metric_type']:10} {row['correlation']:+.4f} (p={row['p_value']:.4f}, n={row['n_samples']})")

    logger.info("\n" + "=" * 80)
    logger.info("CORRELATION ANALYSIS COMPLETE")
    logger.info("=" * 80)

    return results_df


if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # This module requires a dataset to be built first
    from .dataset_builder import build_training_dataset

    logger.info("Building training dataset...")
    df = build_training_dataset()

    if not df.empty:
        logger.info("\nComputing correlations...")
        correlations = compute_basic_correlations(df)

        print("\n" + "=" * 80)
        print("CORRELATION RESULTS")
        print("=" * 80)
        print(correlations.to_string())
    else:
        logger.error("Cannot compute correlations: no training data available")
