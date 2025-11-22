#!/usr/bin/env python3
"""
CLI entry point for the HRKey Correlation Engine.

Runs the complete pipeline:
1. Connect to Supabase
2. Build training dataset
3. Compute correlations
4. Train baseline models
5. Store results
6. Print summary

Usage:
    python -m analytics.proof_of_correlation.run [--inspect-schema]

Options:
    --inspect-schema    Inspect and print database schema before running
    --skip-models       Skip model training (only compute correlations)
    --skip-storage      Skip storing results in database
    --help              Show this help message
"""

import sys
import argparse
import logging

from .config import get_config
from .database import test_connection, close_pool
from .schema_inspector import print_schema_summary
from .dataset_builder import build_training_dataset
from .correlation_analyzer import compute_basic_correlations
from .baseline_models import train_baseline_models
from .results_storage import store_correlation_results, store_model_results


def setup_logging(verbose: bool = True):
    """Set up logging configuration."""
    level = logging.INFO if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def print_banner():
    """Print ASCII banner."""
    banner = """
    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                                                                           ║
    ║              HRKey Correlation Engine - Phase I: MVP                      ║
    ║                                                                           ║
    ║              Proving correlations between KPIs and job outcomes           ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    """
    print(banner)


def main():
    """Main entry point for the correlation engine pipeline."""
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="HRKey Correlation Engine - Phase I MVP",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m analytics.proof_of_correlation.run
  python -m analytics.proof_of_correlation.run --inspect-schema
  python -m analytics.proof_of_correlation.run --skip-models
        """
    )
    parser.add_argument(
        "--inspect-schema",
        action="store_true",
        help="Inspect database schema before running"
    )
    parser.add_argument(
        "--skip-models",
        action="store_true",
        help="Skip model training (only compute correlations)"
    )
    parser.add_argument(
        "--skip-storage",
        action="store_true",
        help="Skip storing results in database"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Reduce logging verbosity"
    )

    args = parser.parse_args()

    # Setup
    setup_logging(verbose=not args.quiet)
    logger = logging.getLogger(__name__)

    print_banner()

    try:
        # Load configuration
        logger.info("Loading configuration...")
        config = get_config()
        logger.info(f"✓ Configuration loaded")
        logger.info(f"  - Min samples for correlation: {config.min_samples_for_correlation}")
        logger.info(f"  - Significance threshold: {config.significance_threshold}")
        logger.info(f"  - Train/test split: {config.train_test_split}")

        # Test database connection
        logger.info("\nTesting database connection...")
        if not test_connection():
            logger.error("❌ Database connection failed!")
            logger.error("Please check your SUPABASE_DB_URL environment variable")
            return 1
        logger.info("✓ Database connection successful")

        # Optional: Inspect schema
        if args.inspect_schema:
            logger.info("\n" + "=" * 80)
            logger.info("SCHEMA INSPECTION")
            logger.info("=" * 80)
            print_schema_summary()
            logger.info("\nContinuing with pipeline...\n")

        # Step 1: Build training dataset
        logger.info("\n" + "=" * 80)
        logger.info("STEP 1: Build Training Dataset")
        logger.info("=" * 80)
        df = build_training_dataset()

        if df.empty:
            logger.error("\n❌ PIPELINE FAILED: No training data available")
            logger.error("Please ensure your database has:")
            logger.error("  1. job_outcomes table with verified outcomes")
            logger.error("  2. user_kpis table with KPI data")
            logger.error("  3. references table with reference data")
            logger.error("  4. cognitive_game_scores table with game scores (optional)")
            return 1

        logger.info(f"\n✓ Successfully built dataset with {len(df)} rows")

        # Step 2: Compute correlations
        logger.info("\n" + "=" * 80)
        logger.info("STEP 2: Compute Correlations")
        logger.info("=" * 80)
        correlations = compute_basic_correlations(df)

        if correlations.empty:
            logger.warning("\n⚠️  No correlations computed")
        else:
            logger.info(f"\n✓ Computed {len(correlations)} correlations")

        # Step 3: Train baseline models (optional)
        model_results = {}
        if not args.skip_models:
            logger.info("\n" + "=" * 80)
            logger.info("STEP 3: Train Baseline Models")
            logger.info("=" * 80)
            model_results = train_baseline_models(df)

            if model_results:
                logger.info("\n✓ Successfully trained baseline models")
        else:
            logger.info("\n⊘ Skipping model training (--skip-models flag)")

        # Step 4: Store results (optional)
        if not args.skip_storage:
            logger.info("\n" + "=" * 80)
            logger.info("STEP 4: Store Results")
            logger.info("=" * 80)

            # Store correlations
            if not correlations.empty:
                corr_inserted = store_correlation_results(correlations)
                logger.info(f"\n✓ Stored {corr_inserted} correlation results")
            else:
                logger.info("\n⊘ No correlations to store")

            # Store model results
            if model_results:
                model_inserted = store_model_results(model_results)
                logger.info(f"\n✓ Stored {model_inserted} model results")
            else:
                logger.info("\n⊘ No model results to store")
        else:
            logger.info("\n⊘ Skipping result storage (--skip-storage flag)")

        # Step 5: Print summary
        logger.info("\n" + "=" * 80)
        logger.info("PIPELINE SUMMARY")
        logger.info("=" * 80)

        print("\n📊 RESULTS SUMMARY")
        print("=" * 80)
        print(f"Dataset rows: {len(df)}")
        print(f"Correlations computed: {len(correlations)}")

        if not correlations.empty:
            significant = correlations[correlations['p_value'] <= config.significance_threshold]
            print(f"Significant correlations (p < {config.significance_threshold}): {len(significant)}")

            # Top correlations
            print("\n🔝 TOP 5 CORRELATIONS FOR EACH TARGET:")
            for target in ['hired', 'performance_score']:
                target_corrs = significant[
                    (significant['target_name'] == target) &
                    (significant['metric_type'] == 'pearson')
                ].nlargest(5, 'correlation')

                if not target_corrs.empty:
                    print(f"\n  {target.upper()}:")
                    for idx, row in target_corrs.iterrows():
                        print(f"    • {row['feature_name']:40} r={row['correlation']:+.4f} (p={row['p_value']:.4f})")

        if model_results:
            print("\n🤖 MODEL PERFORMANCE:")

            if 'classification_results' in model_results:
                print("\n  CLASSIFICATION (predicting 'hired'):")
                for model_type, results in model_results['classification_results'].items():
                    metrics = results['metrics']
                    print(f"    {model_type}:")
                    for metric, value in metrics.items():
                        if not pd.isna(value):
                            print(f"      - {metric}: {value:.4f}")

            if 'regression_results' in model_results:
                print("\n  REGRESSION (predicting 'performance_score'):")
                for model_type, results in model_results['regression_results'].items():
                    metrics = results['metrics']
                    print(f"    {model_type}:")
                    for metric, value in metrics.items():
                        print(f"      - {metric}: {value:.4f}")

        print("\n" + "=" * 80)
        print("✅ PIPELINE COMPLETED SUCCESSFULLY")
        print("=" * 80)

        return 0

    except KeyboardInterrupt:
        logger.warning("\n\n⚠️  Pipeline interrupted by user")
        return 130

    except Exception as e:
        logger.error(f"\n\n❌ PIPELINE FAILED with error: {e}", exc_info=True)
        return 1

    finally:
        # Clean up
        logger.info("\nClosing database connections...")
        close_pool()
        logger.info("✓ Cleanup complete")


if __name__ == "__main__":
    import pandas as pd  # Import here to avoid circular import
    sys.exit(main())
