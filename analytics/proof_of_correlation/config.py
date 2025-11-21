"""
Configuration management for the HRKey Correlation Engine.

Loads environment variables and provides configuration settings.
"""

import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


@dataclass
class Config:
    """Configuration settings for the correlation engine."""

    # Database configuration
    supabase_db_url: str
    supabase_service_role_key: Optional[str] = None

    # Analysis configuration
    min_samples_for_correlation: int = 30
    significance_threshold: float = 0.05
    train_test_split: float = 0.7
    random_state: int = 42

    # Feature engineering
    fill_missing_strategy: str = "median"  # 'median', 'mean', 'drop'
    normalize_features: bool = True

    # Model configuration
    classification_models: list = None
    regression_models: list = None

    # Logging
    log_level: str = "INFO"
    verbose: bool = True

    @classmethod
    def from_env(cls) -> "Config":
        """
        Create a Config instance from environment variables.

        Required environment variables:
        - SUPABASE_DB_URL: Full Postgres connection string
        - SUPABASE_SERVICE_ROLE_KEY: (Optional) Service role key for REST API

        Returns:
            Config: Configuration instance
        """
        supabase_db_url = os.getenv("SUPABASE_DB_URL")
        if not supabase_db_url:
            raise ValueError(
                "SUPABASE_DB_URL environment variable is required. "
                "Please set it to your Supabase Postgres connection string."
            )

        supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        # Optional configuration with defaults
        min_samples = int(os.getenv("MIN_SAMPLES_FOR_CORRELATION", "30"))
        significance = float(os.getenv("SIGNIFICANCE_THRESHOLD", "0.05"))
        train_test = float(os.getenv("TRAIN_TEST_SPLIT", "0.7"))
        random_state = int(os.getenv("RANDOM_STATE", "42"))
        log_level = os.getenv("LOG_LEVEL", "INFO")
        verbose = os.getenv("VERBOSE", "true").lower() == "true"

        return cls(
            supabase_db_url=supabase_db_url,
            supabase_service_role_key=supabase_service_role_key,
            min_samples_for_correlation=min_samples,
            significance_threshold=significance,
            train_test_split=train_test,
            random_state=random_state,
            log_level=log_level,
            verbose=verbose,
        )

    def __post_init__(self):
        """Set default values for model lists if not provided."""
        if self.classification_models is None:
            self.classification_models = ["logistic_regression", "random_forest"]

        if self.regression_models is None:
            self.regression_models = ["linear_regression", "random_forest"]


# Global config instance (lazy loaded)
_config: Optional[Config] = None


def get_config() -> Config:
    """
    Get the global configuration instance.

    Returns:
        Config: Global configuration object
    """
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config
