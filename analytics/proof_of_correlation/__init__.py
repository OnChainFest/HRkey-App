"""
HRKey Correlation Engine - Phase I: Proof of Correlation

This package implements the MVP correlation engine that analyzes relationships
between KPIs, cognitive scores, references, and job outcomes.

Modules:
- config: Configuration management and environment variables
- database: Database connection utilities
- schema_inspector: Database schema inspection tools
- dataset_builder: Build clean analytic datasets from Supabase
- correlation_analyzer: Compute correlations between features and outcomes
- baseline_models: Train baseline ML models
- results_storage: Store results back to Supabase
- run: CLI entry point for running the full pipeline
"""

__version__ = "1.0.0"
__author__ = "HRKey Data Engineering Team"

from .config import Config
from .database import get_db_connection, test_connection
from .dataset_builder import build_training_dataset
from .correlation_analyzer import compute_basic_correlations
from .baseline_models import train_baseline_models
from .results_storage import store_correlation_results, store_model_results

__all__ = [
    "Config",
    "get_db_connection",
    "test_connection",
    "build_training_dataset",
    "compute_basic_correlations",
    "train_baseline_models",
    "store_correlation_results",
    "store_model_results",
]
