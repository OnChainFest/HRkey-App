#!/usr/bin/env python3
"""
Train HRKey ML Model from CSV
==============================

Trains Ridge regression model using synthetic CSV data.
Simplified version for environments without Supabase access.

Author: HRKey ML Team
Date: 2025-11-24
"""

import os
import sys
import json
import csv
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_DIR = Path(__file__).parent
CSV_FILE = BASE_DIR / "data" / "synthetic_kpi_observations.csv"
MODELS_DIR = BASE_DIR / "models"
OUTPUT_DIR = BASE_DIR / "output"

# Create directories
MODELS_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Model parameters
TEST_SIZE = 0.2
RANDOM_STATE = 42
MIN_SAMPLES_FOR_TRAINING = 20

# ============================================================================
# 1. LOAD DATA FROM CSV
# ============================================================================

def load_data_from_csv() -> pd.DataFrame:
    """Load KPI observations from CSV file."""

    if not CSV_FILE.exists():
        raise FileNotFoundError(
            f"CSV file not found: {CSV_FILE}\n"
            "Run: python ml/data/generate_synthetic_data.py"
        )

    print(f"📄 Loading data from: {CSV_FILE}")
    df = pd.read_csv(CSV_FILE)

    print(f"✅ Loaded {len(df)} observations")
    print(f"\n📊 Data Summary:")
    print(f"   Subjects: {df['subject_wallet'].nunique()}")
    print(f"   Observers: {df['observer_wallet'].nunique()}")
    print(f"   Roles: {df['role_id'].nunique()}")
    print(f"   KPIs: {df['kpi_name'].nunique()}")

    return df

# ============================================================================
# 2. BUILD ML DATASET
# ============================================================================

def build_ml_dataset(df: pd.DataFrame, role_id: str = None) -> pd.DataFrame:
    """
    Build ML dataset: pivot KPIs as features.

    Each row = (subject_wallet, role_id)
    Columns = KPI names (aggregated by mean rating)
    Target = mean outcome_value
    """

    print("\n🔨 Building ML dataset...")

    # Filter by role if specified
    if role_id:
        df = df[df['role_id'] == role_id].copy()
        print(f"   Filtered to role_id: {role_id}")

    # Group by (subject, role) and aggregate
    # For each KPI, take the mean rating_value
    # For outcome, take the mean outcome_value

    # First, pivot KPIs to columns
    kpi_pivot = df.pivot_table(
        index=['subject_wallet', 'role_id'],
        columns='kpi_name',
        values='rating_value',
        aggfunc='mean'
    ).reset_index()

    # Calculate mean outcome per subject+role
    outcome_agg = df.groupby(['subject_wallet', 'role_id'])['outcome_value']\
        .mean()\
        .reset_index()\
        .rename(columns={'outcome_value': 'target_outcome'})

    # Merge
    ml_dataset = kpi_pivot.merge(outcome_agg, on=['subject_wallet', 'role_id'])

    print(f"✅ ML dataset shape: {ml_dataset.shape}")
    print(f"   Samples: {len(ml_dataset)}")
    print(f"   Features (KPIs): {len(ml_dataset.columns) - 3}")  # -3 for subject, role, target

    return ml_dataset

# ============================================================================
# 3. TRAIN MODEL
# ============================================================================

def train_model(ml_dataset: pd.DataFrame) -> Dict:
    """Train Ridge regression model."""

    print("\n🤖 Training Ridge Regression model...")

    # Separate features and target
    feature_cols = [col for col in ml_dataset.columns
                    if col not in ['subject_wallet', 'role_id', 'target_outcome']]

    X = ml_dataset[feature_cols].fillna(0)  # Fill NaN with 0 (missing KPIs)
    y = ml_dataset['target_outcome']

    print(f"   Features: {feature_cols}")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")

    # Check minimum samples
    if len(X) < MIN_SAMPLES_FOR_TRAINING:
        raise ValueError(
            f"Not enough samples for training. "
            f"Need at least {MIN_SAMPLES_FOR_TRAINING}, got {len(X)}"
        )

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )

    print(f"   Train samples: {len(X_train)}")
    print(f"   Test samples: {len(X_test)}")

    # Train model
    model = Ridge(alpha=1.0, random_state=RANDOM_STATE)
    model.fit(X_train, y_train)

    print(f"✅ Model trained!")

    # Evaluate
    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)

    train_metrics = {
        'mae': mean_absolute_error(y_train, y_pred_train),
        'rmse': np.sqrt(mean_squared_error(y_train, y_pred_train)),
        'r2': r2_score(y_train, y_pred_train)
    }

    test_metrics = {
        'mae': mean_absolute_error(y_test, y_pred_test),
        'rmse': np.sqrt(mean_squared_error(y_test, y_pred_test)),
        'r2': r2_score(y_test, y_pred_test)
    }

    print(f"\n📊 Model Performance:")
    print(f"   Train - MAE: {train_metrics['mae']:.2f}, RMSE: {train_metrics['rmse']:.2f}, R²: {train_metrics['r2']:.4f}")
    print(f"   Test  - MAE: {test_metrics['mae']:.2f}, RMSE: {test_metrics['rmse']:.2f}, R²: {test_metrics['r2']:.4f}")

    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': feature_cols,
        'coefficient': model.coef_,
        'abs_coefficient': np.abs(model.coef_)
    }).sort_values('abs_coefficient', ascending=False)

    print(f"\n🎯 Feature Importance (Top KPIs):")
    for idx, row in feature_importance.iterrows():
        print(f"   {row['feature']:<30} {row['coefficient']:>10.2f}")

    return {
        'model': model,
        'feature_cols': feature_cols,
        'train_metrics': train_metrics,
        'test_metrics': test_metrics,
        'feature_importance': feature_importance,
        'target_stats': {
            'min': float(y.min()),
            'max': float(y.max()),
            'mean': float(y.mean()),
            'std': float(y.std())
        }
    }

# ============================================================================
# 4. SAVE MODEL AND METADATA
# ============================================================================

def save_model(result: Dict, role_scope: str = "global"):
    """Save model, metrics, and feature importance."""

    print(f"\n💾 Saving model artifacts...")

    # Save model as .pkl
    model_path = MODELS_DIR / f"ridge_{role_scope}.pkl"
    joblib.dump(result['model'], model_path)
    print(f"   ✅ Model saved: {model_path}")

    # Save metrics
    metrics_path = OUTPUT_DIR / f"baseline_metrics_{role_scope}.json"
    metrics_data = {
        'model_type': 'ridge',
        'role_scope': role_scope,
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'train_metrics': result['train_metrics'],
        'test_metrics': result['test_metrics'],
        'target_stats': result['target_stats'],
        'n_features': len(result['feature_cols']),
        'features': result['feature_cols']
    }

    with open(metrics_path, 'w') as f:
        json.dump(metrics_data, f, indent=2)
    print(f"   ✅ Metrics saved: {metrics_path}")

    # Save feature importance
    importance_path = OUTPUT_DIR / f"kpi_feature_importance_{role_scope}.csv"
    result['feature_importance'].to_csv(importance_path, index=False)
    print(f"   ✅ Feature importance saved: {importance_path}")

    return model_path, metrics_path, importance_path

# ============================================================================
# 5. EXPORT MODEL CONFIG FOR NODE.JS
# ============================================================================

def export_model_config(result: Dict, role_scope: str = "global"):
    """Export model configuration as JSON for Node.js backend."""

    print(f"\n📤 Exporting model config for backend...")

    model = result['model']
    feature_cols = result['feature_cols']

    # Build features array with coefficients
    features = []
    for i, feature_name in enumerate(feature_cols):
        coef = float(model.coef_[i])
        features.append({
            'name': feature_name,
            'coef': coef,
            'abs_coef': abs(coef)
        })

    # Sort by absolute coefficient (importance)
    features.sort(key=lambda x: x['abs_coef'], reverse=True)

    # Build config
    config = {
        'model_type': 'ridge',
        'version': '1.0.0',
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'role_scope': role_scope,
        'intercept': float(model.intercept_),
        'features': features,
        'target_stats': result['target_stats'],
        'train_info': {
            'n_features': len(feature_cols),
            'n_samples': None,  # Not available from sklearn model
            'metrics': result['test_metrics']
        },
        'scoring_config': {
            'min_observations_required': 3,
            'default_imputation_value': 0.0
        }
    }

    # Save
    config_path = OUTPUT_DIR / f"hrkey_model_config_{role_scope}.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"   ✅ Config exported: {config_path}")
    print(f"\n🎉 Backend can now use: {config_path.relative_to(BASE_DIR.parent)}")

    return config_path

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main training pipeline."""

    print("="*80)
    print("HRKEY ML MODEL TRAINING (CSV MODE)")
    print("="*80)
    print()

    try:
        # 1. Load data
        df = load_data_from_csv()

        # 2. Build ML dataset
        ml_dataset = build_ml_dataset(df, role_id=None)  # None = global model

        # 3. Train model
        result = train_model(ml_dataset)

        # 4. Save artifacts
        save_model(result, role_scope="global")

        # 5. Export config for backend
        config_path = export_model_config(result, role_scope="global")

        print()
        print("="*80)
        print("✅ TRAINING COMPLETE")
        print("="*80)
        print()
        print("📋 Next Steps:")
        print(f"   1. Verify config: cat {config_path}")
        print(f"   2. Start backend: cd backend && npm start")
        print(f"   3. Test endpoint: POST http://localhost:3001/api/hrkey-score")
        print()

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
