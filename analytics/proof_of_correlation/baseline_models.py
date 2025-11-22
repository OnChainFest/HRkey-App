"""
Baseline ML models for the HRKey Correlation Engine.

Trains simple baseline models (Logistic Regression, Linear Regression, Random Forest)
to predict job outcomes from KPIs and other features.
"""

import logging
from typing import Dict, List, Tuple
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score, roc_auc_score, precision_score, recall_score, f1_score,
    r2_score, mean_absolute_error, mean_squared_error
)
import warnings

from .config import get_config

logger = logging.getLogger(__name__)
warnings.filterwarnings('ignore')


def prepare_features_and_targets(
    df: pd.DataFrame,
    target: str
) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    """
    Prepare features (X) and target (y) for modeling.

    Args:
        df: Training dataset
        target: Target variable name ('hired' or 'performance_score')

    Returns:
        Tuple of (X, y, feature_names)
    """
    # Identify feature columns
    feature_cols = [
        col for col in df.columns
        if col.startswith(("kpi_", "cognitive_", "reference_"))
        and df[col].dtype in [np.float64, np.int64]
    ]

    # Select features and target
    X = df[feature_cols].copy()
    y = df[target].copy()

    # Remove rows with missing target
    valid_mask = y.notna()
    X = X[valid_mask]
    y = y[valid_mask]

    # Convert hired to int if boolean
    if target == "hired" and y.dtype == bool:
        y = y.astype(int)

    # Fill missing values in features
    for col in X.columns:
        if X[col].isna().any():
            X[col] = X[col].fillna(X[col].median())

    # Remove features with zero variance
    variance = X.var()
    non_zero_var_cols = variance[variance > 0].index.tolist()
    X = X[non_zero_var_cols]

    return X, y, non_zero_var_cols


def train_classification_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    model_type: str = "logistic_regression"
) -> Dict:
    """
    Train a classification model and return metrics.

    Args:
        X_train, y_train: Training data
        X_test, y_test: Test data
        model_type: 'logistic_regression' or 'random_forest'

    Returns:
        dict: Model metrics and feature importances
    """
    logger.info(f"   Training {model_type} classifier...")

    # Train model
    if model_type == "logistic_regression":
        model = LogisticRegression(random_state=42, max_iter=1000, class_weight='balanced')
    elif model_type == "random_forest":
        model = RandomForestClassifier(random_state=42, n_estimators=100, max_depth=5, class_weight='balanced')
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    model.fit(X_train, y_train)

    # Predictions
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1] if hasattr(model, 'predict_proba') else None

    # Metrics
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
    }

    # ROC AUC (only if we have both classes)
    if len(y_test.unique()) == 2 and y_pred_proba is not None:
        try:
            metrics["roc_auc"] = roc_auc_score(y_test, y_pred_proba)
        except:
            metrics["roc_auc"] = np.nan

    # Feature importances
    if model_type == "logistic_regression":
        importances = dict(zip(X_train.columns, model.coef_[0]))
    elif model_type == "random_forest":
        importances = dict(zip(X_train.columns, model.feature_importances_))
    else:
        importances = {}

    logger.info(f"      Accuracy: {metrics['accuracy']:.4f}")
    logger.info(f"      Precision: {metrics['precision']:.4f}")
    logger.info(f"      Recall: {metrics['recall']:.4f}")
    logger.info(f"      F1: {metrics['f1']:.4f}")
    if "roc_auc" in metrics and not np.isnan(metrics["roc_auc"]):
        logger.info(f"      ROC-AUC: {metrics['roc_auc']:.4f}")

    return {
        "metrics": metrics,
        "feature_importances": importances,
        "model": model
    }


def train_regression_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    model_type: str = "linear_regression"
) -> Dict:
    """
    Train a regression model and return metrics.

    Args:
        X_train, y_train: Training data
        X_test, y_test: Test data
        model_type: 'linear_regression' or 'random_forest'

    Returns:
        dict: Model metrics and feature importances
    """
    logger.info(f"   Training {model_type} regressor...")

    # Train model
    if model_type == "linear_regression":
        model = LinearRegression()
    elif model_type == "random_forest":
        model = RandomForestRegressor(random_state=42, n_estimators=100, max_depth=5)
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    model.fit(X_train, y_train)

    # Predictions
    y_pred = model.predict(X_test)

    # Metrics
    metrics = {
        "r2": r2_score(y_test, y_pred),
        "mae": mean_absolute_error(y_test, y_pred),
        "rmse": np.sqrt(mean_squared_error(y_test, y_pred)),
    }

    # Feature importances
    if model_type == "linear_regression":
        importances = dict(zip(X_train.columns, model.coef_))
    elif model_type == "random_forest":
        importances = dict(zip(X_train.columns, model.feature_importances_))
    else:
        importances = {}

    logger.info(f"      R²: {metrics['r2']:.4f}")
    logger.info(f"      MAE: {metrics['mae']:.4f}")
    logger.info(f"      RMSE: {metrics['rmse']:.4f}")

    return {
        "metrics": metrics,
        "feature_importances": importances,
        "model": model
    }


def train_baseline_models(df: pd.DataFrame) -> Dict:
    """
    Train baseline models for both classification (hired) and regression (performance_score).

    This function:
    1. Splits data into train/test sets
    2. Standardizes features
    3. Trains Logistic Regression and Random Forest for 'hired' prediction
    4. Trains Linear Regression and Random Forest for 'performance_score' prediction
    5. Returns all metrics and feature importances

    Args:
        df: Training dataset from build_training_dataset()

    Returns:
        dict: {
            'classification_results': {
                'logistic_regression': {...metrics...},
                'random_forest': {...metrics...}
            },
            'regression_results': {
                'linear_regression': {...metrics...},
                'random_forest': {...metrics...}
            },
            'used_features': [...list of features...]
        }

    Example:
        >>> results = train_baseline_models(df)
        >>> print(results['classification_results']['logistic_regression']['metrics'])
    """
    logger.info("=" * 80)
    logger.info("TRAINING BASELINE MODELS")
    logger.info("=" * 80)

    config = get_config()
    results = {
        "classification_results": {},
        "regression_results": {},
        "used_features": []
    }

    # ==========================================================================
    # 1. CLASSIFICATION: Predict 'hired'
    # ==========================================================================

    if "hired" in df.columns and df["hired"].notna().sum() > 0:
        logger.info("\n" + "=" * 80)
        logger.info("CLASSIFICATION TASK: Predicting 'hired'")
        logger.info("=" * 80)

        # Prepare data
        X, y, feature_names = prepare_features_and_targets(df, "hired")
        logger.info(f"\n1. Data preparation:")
        logger.info(f"   ✓ Features: {len(feature_names)}")
        logger.info(f"   ✓ Samples: {len(X)}")
        logger.info(f"   ✓ Class distribution: {y.value_counts().to_dict()}")

        if len(X) < 10:
            logger.error(f"   ❌ Insufficient samples ({len(X)}) for classification")
        else:
            # Train/test split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=1-config.train_test_split, random_state=config.random_state, stratify=y
            )

            logger.info(f"\n2. Train/test split:")
            logger.info(f"   ✓ Train samples: {len(X_train)}")
            logger.info(f"   ✓ Test samples: {len(X_test)}")

            # Standardize features
            scaler = StandardScaler()
            X_train_scaled = pd.DataFrame(
                scaler.fit_transform(X_train),
                columns=X_train.columns,
                index=X_train.index
            )
            X_test_scaled = pd.DataFrame(
                scaler.transform(X_test),
                columns=X_test.columns,
                index=X_test.index
            )

            logger.info(f"\n3. Training models:")

            # Logistic Regression
            lr_results = train_classification_model(
                X_train_scaled, y_train, X_test_scaled, y_test, "logistic_regression"
            )
            results["classification_results"]["logistic_regression"] = {
                "metrics": lr_results["metrics"],
                "feature_importances": lr_results["feature_importances"],
                "n_train_samples": len(X_train),
                "n_test_samples": len(X_test),
                "used_features": feature_names
            }

            # Random Forest
            rf_results = train_classification_model(
                X_train, y_train, X_test, y_test, "random_forest"
            )
            results["classification_results"]["random_forest"] = {
                "metrics": rf_results["metrics"],
                "feature_importances": rf_results["feature_importances"],
                "n_train_samples": len(X_train),
                "n_test_samples": len(X_test),
                "used_features": feature_names
            }

            # Top features
            logger.info(f"\n4. Top 10 important features (Random Forest):")
            top_features = sorted(
                rf_results["feature_importances"].items(),
                key=lambda x: abs(x[1]),
                reverse=True
            )[:10]
            for feature, importance in top_features:
                logger.info(f"      {feature:40} {importance:+.4f}")

            results["used_features"] = feature_names

    else:
        logger.warning("\n⚠️  Skipping classification: 'hired' column not found or has no data")

    # ==========================================================================
    # 2. REGRESSION: Predict 'performance_score'
    # ==========================================================================

    if "performance_score" in df.columns and df["performance_score"].notna().sum() > 0:
        logger.info("\n" + "=" * 80)
        logger.info("REGRESSION TASK: Predicting 'performance_score'")
        logger.info("=" * 80)

        # Prepare data
        X, y, feature_names = prepare_features_and_targets(df, "performance_score")
        logger.info(f"\n1. Data preparation:")
        logger.info(f"   ✓ Features: {len(feature_names)}")
        logger.info(f"   ✓ Samples: {len(X)}")
        logger.info(f"   ✓ Target distribution: mean={y.mean():.2f}, std={y.std():.2f}")

        if len(X) < 10:
            logger.error(f"   ❌ Insufficient samples ({len(X)}) for regression")
        else:
            # Train/test split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=1-config.train_test_split, random_state=config.random_state
            )

            logger.info(f"\n2. Train/test split:")
            logger.info(f"   ✓ Train samples: {len(X_train)}")
            logger.info(f"   ✓ Test samples: {len(X_test)}")

            # Standardize features
            scaler = StandardScaler()
            X_train_scaled = pd.DataFrame(
                scaler.fit_transform(X_train),
                columns=X_train.columns,
                index=X_train.index
            )
            X_test_scaled = pd.DataFrame(
                scaler.transform(X_test),
                columns=X_test.columns,
                index=X_test.index
            )

            logger.info(f"\n3. Training models:")

            # Linear Regression
            lr_results = train_regression_model(
                X_train_scaled, y_train, X_test_scaled, y_test, "linear_regression"
            )
            results["regression_results"]["linear_regression"] = {
                "metrics": lr_results["metrics"],
                "feature_importances": lr_results["feature_importances"],
                "n_train_samples": len(X_train),
                "n_test_samples": len(X_test),
                "used_features": feature_names
            }

            # Random Forest
            rf_results = train_regression_model(
                X_train, y_train, X_test, y_test, "random_forest"
            )
            results["regression_results"]["random_forest"] = {
                "metrics": rf_results["metrics"],
                "feature_importances": rf_results["feature_importances"],
                "n_train_samples": len(X_train),
                "n_test_samples": len(X_test),
                "used_features": feature_names
            }

            # Top features
            logger.info(f"\n4. Top 10 important features (Random Forest):")
            top_features = sorted(
                rf_results["feature_importances"].items(),
                key=lambda x: abs(x[1]),
                reverse=True
            )[:10]
            for feature, importance in top_features:
                logger.info(f"      {feature:40} {importance:+.4f}")

    else:
        logger.warning("\n⚠️  Skipping regression: 'performance_score' column not found or has no data")

    logger.info("\n" + "=" * 80)
    logger.info("BASELINE MODEL TRAINING COMPLETE")
    logger.info("=" * 80)

    return results


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
        logger.info("\nTraining baseline models...")
        results = train_baseline_models(df)
    else:
        logger.error("Cannot train models: no training data available")
