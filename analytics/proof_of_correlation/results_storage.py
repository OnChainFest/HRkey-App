"""
Results storage module for the HRKey Correlation Engine.

Stores correlation results and model performance metrics back into Supabase.
"""

import logging
from typing import Dict, List
import json
import pandas as pd
from datetime import datetime

from .database import get_db_connection, execute_many

logger = logging.getLogger(__name__)


def store_correlation_results(correlations_df: pd.DataFrame) -> int:
    """
    Store correlation results in the correlation_results table.

    Args:
        correlations_df: DataFrame with columns:
            - feature_name
            - target_name
            - metric_type
            - correlation
            - p_value
            - n_samples

    Returns:
        int: Number of rows inserted

    Example:
        >>> correlations = compute_basic_correlations(df)
        >>> inserted = store_correlation_results(correlations)
    """
    logger.info("=" * 80)
    logger.info("STORING CORRELATION RESULTS")
    logger.info("=" * 80)

    if correlations_df.empty:
        logger.warning("No correlation results to store")
        return 0

    # Filter out NaN correlations
    valid_df = correlations_df[correlations_df["correlation"].notna()].copy()

    if valid_df.empty:
        logger.warning("No valid correlation results to store (all NaN)")
        return 0

    logger.info(f"\n1. Preparing to insert {len(valid_df)} correlation results...")

    # Clear existing results (optional - you may want to keep historical results)
    # For MVP, we'll delete old results and insert new ones
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM correlation_results WHERE analysis_version = %s", ('v1.0',))
        deleted_count = cursor.rowcount
        logger.info(f"   ✓ Deleted {deleted_count} old correlation results")

    # Prepare insert query
    insert_query = """
        INSERT INTO correlation_results (
            feature_name,
            target_name,
            metric_type,
            correlation,
            p_value,
            n_samples,
            analysis_version,
            computed_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    # Prepare data tuples
    current_time = datetime.utcnow()
    data_tuples = []

    for _, row in valid_df.iterrows():
        data_tuples.append((
            row["feature_name"],
            row["target_name"],
            row["metric_type"],
            float(row["correlation"]),
            float(row["p_value"]),
            int(row["n_samples"]),
            "v1.0",  # analysis_version
            current_time
        ))

    # Execute batch insert
    logger.info(f"\n2. Inserting {len(data_tuples)} correlation results...")
    execute_many(insert_query, data_tuples)
    logger.info(f"   ✓ Successfully inserted {len(data_tuples)} correlation results")

    logger.info("\n" + "=" * 80)
    logger.info("CORRELATION STORAGE COMPLETE")
    logger.info("=" * 80)

    return len(data_tuples)


def store_model_results(model_results: Dict) -> int:
    """
    Store model performance metrics in the model_baseline_results table.

    Args:
        model_results: Dict from train_baseline_models() with structure:
            {
                'classification_results': {
                    'logistic_regression': {
                        'metrics': {...},
                        'feature_importances': {...},
                        'n_train_samples': int,
                        'n_test_samples': int,
                        'used_features': [...]
                    },
                    'random_forest': {...}
                },
                'regression_results': {
                    'linear_regression': {...},
                    'random_forest': {...}
                }
            }

    Returns:
        int: Number of rows inserted

    Example:
        >>> results = train_baseline_models(df)
        >>> inserted = store_model_results(results)
    """
    logger.info("=" * 80)
    logger.info("STORING MODEL RESULTS")
    logger.info("=" * 80)

    # Clear existing results
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM model_baseline_results WHERE model_version = %s", ('v1.0',))
        deleted_count = cursor.rowcount
        logger.info(f"\n1. Deleted {deleted_count} old model results")

    # Prepare insert query
    insert_query = """
        INSERT INTO model_baseline_results (
            target_name,
            model_type,
            model_version,
            metric_name,
            metric_value,
            used_features,
            n_train_samples,
            n_test_samples,
            train_test_split_ratio,
            feature_importances,
            computed_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    data_tuples = []
    current_time = datetime.utcnow()

    # Process classification results (target: 'hired')
    if "classification_results" in model_results:
        logger.info(f"\n2. Processing classification results...")

        for model_type, results in model_results["classification_results"].items():
            metrics = results["metrics"]
            feature_importances = results["feature_importances"]
            used_features = results["used_features"]
            n_train = results["n_train_samples"]
            n_test = results["n_test_samples"]

            # Insert one row per metric
            for metric_name, metric_value in metrics.items():
                if pd.notna(metric_value):  # Skip NaN values
                    data_tuples.append((
                        "hired",
                        model_type,
                        "v1.0",
                        metric_name,
                        float(metric_value),
                        json.dumps(used_features),
                        n_train,
                        n_test,
                        0.7,  # train_test_split_ratio
                        json.dumps(feature_importances),
                        current_time
                    ))

        logger.info(f"   ✓ Prepared {len([t for t in data_tuples if t[0] == 'hired'])} classification metrics")

    # Process regression results (target: 'performance_score')
    if "regression_results" in model_results:
        logger.info(f"\n3. Processing regression results...")

        for model_type, results in model_results["regression_results"].items():
            metrics = results["metrics"]
            feature_importances = results["feature_importances"]
            used_features = results["used_features"]
            n_train = results["n_train_samples"]
            n_test = results["n_test_samples"]

            # Insert one row per metric
            for metric_name, metric_value in metrics.items():
                if pd.notna(metric_value):  # Skip NaN values
                    data_tuples.append((
                        "performance_score",
                        model_type,
                        "v1.0",
                        metric_name,
                        float(metric_value),
                        json.dumps(used_features),
                        n_train,
                        n_test,
                        0.7,  # train_test_split_ratio
                        json.dumps(feature_importances),
                        current_time
                    ))

        logger.info(f"   ✓ Prepared {len([t for t in data_tuples if t[0] == 'performance_score'])} regression metrics")

    if not data_tuples:
        logger.warning("   ⚠️  No model results to store")
        return 0

    # Execute batch insert
    logger.info(f"\n4. Inserting {len(data_tuples)} model results...")
    execute_many(insert_query, data_tuples)
    logger.info(f"   ✓ Successfully inserted {len(data_tuples)} model results")

    logger.info("\n" + "=" * 80)
    logger.info("MODEL STORAGE COMPLETE")
    logger.info("=" * 80)

    return len(data_tuples)


def get_correlation_summary(limit: int = 10) -> Dict:
    """
    Retrieve a summary of top correlations from the database.

    Args:
        limit: Number of top correlations to return

    Returns:
        dict: {
            'hired': [top correlations for hired prediction],
            'performance_score': [top correlations for performance prediction]
        }
    """
    query = """
        SELECT
            feature_name,
            target_name,
            metric_type,
            correlation,
            p_value,
            n_samples,
            computed_at
        FROM correlation_results
        WHERE target_name = %s
          AND metric_type = 'pearson'
        ORDER BY ABS(correlation) DESC
        LIMIT %s;
    """

    summary = {}

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Get top correlations for 'hired'
        cursor.execute(query, ('hired', limit))
        hired_results = cursor.fetchall()
        summary['hired'] = [
            {
                'feature_name': row[0],
                'correlation': float(row[3]),
                'p_value': float(row[4]),
                'n_samples': row[5]
            }
            for row in hired_results
        ]

        # Get top correlations for 'performance_score'
        cursor.execute(query, ('performance_score', limit))
        perf_results = cursor.fetchall()
        summary['performance_score'] = [
            {
                'feature_name': row[0],
                'correlation': float(row[3]),
                'p_value': float(row[4]),
                'n_samples': row[5]
            }
            for row in perf_results
        ]

    return summary


def get_model_summary() -> Dict:
    """
    Retrieve a summary of model performance from the database.

    Returns:
        dict: Model performance metrics grouped by target and model type
    """
    query = """
        SELECT
            target_name,
            model_type,
            metric_name,
            metric_value,
            n_train_samples,
            n_test_samples,
            computed_at
        FROM model_baseline_results
        WHERE model_version = 'v1.0'
        ORDER BY target_name, model_type, metric_name;
    """

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        results = cursor.fetchall()

    # Group by target and model type
    summary = {}
    for row in results:
        target = row[0]
        model_type = row[1]
        metric_name = row[2]
        metric_value = float(row[3])

        if target not in summary:
            summary[target] = {}
        if model_type not in summary[target]:
            summary[target][model_type] = {}

        summary[target][model_type][metric_name] = metric_value

    return summary


if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Example: Retrieve and print correlation summary
    logger.info("Retrieving correlation summary from database...")
    summary = get_correlation_summary(limit=10)

    print("\n" + "=" * 80)
    print("TOP CORRELATIONS (from database)")
    print("=" * 80)

    for target, correlations in summary.items():
        print(f"\nTarget: {target}")
        for i, corr in enumerate(correlations, 1):
            print(f"  {i}. {corr['feature_name']:40} r={corr['correlation']:+.4f} (p={corr['p_value']:.4f}, n={corr['n_samples']})")

    # Example: Retrieve and print model summary
    logger.info("\nRetrieving model summary from database...")
    model_summary = get_model_summary()

    print("\n" + "=" * 80)
    print("MODEL PERFORMANCE SUMMARY (from database)")
    print("=" * 80)

    for target, models in model_summary.items():
        print(f"\nTarget: {target}")
        for model_type, metrics in models.items():
            print(f"  Model: {model_type}")
            for metric_name, metric_value in metrics.items():
                print(f"    {metric_name}: {metric_value:.4f}")
