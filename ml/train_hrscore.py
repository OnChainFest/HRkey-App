#!/usr/bin/env python3
"""
HRScore ML - Model Training Pipeline
=====================================

Pipeline de entrenamiento reproducible para el modelo de HRScore.

Basado en dataset extraído por ml/extract_dataset.py

Flujo:
1. Carga dataset CSV
2. Preprocesa y valida datos
3. Split train/test estratificado
4. Entrena múltiples modelos (Ridge, RandomForest, XGBoost)
5. Evalúa con cross-validation
6. Selecciona mejor modelo
7. Exporta artifacts versionados (modelo + métricas + manifest)

Uso:
    # Básico (usa el dataset más reciente)
    python ml/train_hrscore.py

    # Especificar dataset
    python ml/train_hrscore.py --dataset ml/data/hrscore_dataset_20251223_120000.csv

    # Ajustar parámetros
    python ml/train_hrscore.py --test-size 0.3 --cv-folds 5 --random-state 42

    # Entrenar solo modelos específicos
    python ml/train_hrscore.py --models ridge xgboost

Autor: HRKey ML Team
Fecha: 2025-12-23
"""

import os
import sys
import json
import logging
import argparse
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge, LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Intentar importar XGBoost (opcional)
try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False
    warnings.warn("XGBoost no disponible, se omitirá del entrenamiento")

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Directorios
ML_DIR = Path(__file__).parent
DATA_DIR = ML_DIR / 'data'
MODELS_DIR = ML_DIR / 'models'
OUTPUT_DIR = ML_DIR / 'output'
ARTIFACTS_DIR = ML_DIR / 'artifacts'

# Crear directorios
for dir_path in [DATA_DIR, MODELS_DIR, OUTPUT_DIR, ARTIFACTS_DIR]:
    dir_path.mkdir(exist_ok=True)

# KPIs estándar (deben coincidir con extract_dataset.py)
STANDARD_KPIS = [
    'code_quality',
    'test_coverage',
    'deployment_frequency',
    'bug_resolution_time',
    'api_response_time',
    'documentation_quality'
]

# Configuración de modelos
MODEL_CONFIGS = {
    'ridge': {
        'class': Ridge,
        'params': {'alpha': 1.0, 'random_state': 42},
        'requires_scaling': True
    },
    'linear': {
        'class': LinearRegression,
        'params': {},
        'requires_scaling': True
    },
    'random_forest': {
        'class': RandomForestRegressor,
        'params': {
            'n_estimators': 100,
            'max_depth': 10,
            'min_samples_split': 5,
            'min_samples_leaf': 2,
            'random_state': 42,
            'n_jobs': -1
        },
        'requires_scaling': False
    }
}

# Agregar XGBoost si está disponible
if HAS_XGBOOST:
    MODEL_CONFIGS['xgboost'] = {
        'class': xgb.XGBRegressor,
        'params': {
            'n_estimators': 100,
            'max_depth': 6,
            'learning_rate': 0.1,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'random_state': 42,
            'n_jobs': -1
        },
        'requires_scaling': False
    }

# ============================================================================
# CARGA Y VALIDACIÓN DE DATOS
# ============================================================================

def find_latest_dataset(data_dir: Path) -> Path:
    """
    Encuentra el dataset más reciente en data_dir

    Args:
        data_dir: Directorio de datos

    Returns:
        Path del dataset más reciente
    """
    datasets = list(data_dir.glob('hrscore_dataset_*.csv'))

    if not datasets:
        raise FileNotFoundError(
            f"No se encontraron datasets en {data_dir}\n"
            "Ejecuta primero: python ml/extract_dataset.py"
        )

    # Ordenar por timestamp en nombre de archivo
    datasets.sort(reverse=True)
    latest = datasets[0]

    logger.info(f"📂 Dataset más reciente: {latest.name}")

    return latest


def load_dataset(dataset_path: Path) -> Tuple[pd.DataFrame, Dict]:
    """
    Carga dataset CSV y su metadata

    Args:
        dataset_path: Path del archivo CSV

    Returns:
        Tuple de (DataFrame, metadata dict)
    """
    logger.info("="*80)
    logger.info("CARGANDO DATASET")
    logger.info("="*80)

    # Cargar CSV
    df = pd.read_csv(dataset_path)
    logger.info(f"✅ Dataset cargado: {df.shape}")

    # Cargar metadata
    metadata_path = dataset_path.with_suffix('.json')

    if metadata_path.exists():
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        logger.info(f"✅ Metadata cargada: {metadata_path.name}")
    else:
        logger.warning(f"⚠️  Metadata no encontrada: {metadata_path}")
        metadata = {}

    # Validar columnas requeridas
    logger.info("\n📊 Validando estructura del dataset...")

    # Features de KPIs esperadas
    expected_kpi_features = []
    for kpi in STANDARD_KPIS:
        expected_kpi_features.extend([
            f'{kpi}_avg_rating',
            f'{kpi}_n_obs',
            f'{kpi}_n_observers',
            f'{kpi}_verified_pct'
        ])

    missing_features = [f for f in expected_kpi_features if f not in df.columns]

    if missing_features:
        logger.warning(f"⚠️  Features faltantes: {missing_features}")

    # Verificar target
    if 'target_score' not in df.columns:
        raise ValueError(
            "❌ Columna 'target_score' no encontrada en el dataset.\n"
            "El dataset debe tener una columna target_score con HRScores calculados."
        )

    # Estadísticas del target
    target_stats = df['target_score'].describe()
    logger.info(f"\n   Target (target_score):")
    logger.info(f"      Count:  {target_stats['count']:.0f}")
    logger.info(f"      Mean:   {target_stats['mean']:.2f}")
    logger.info(f"      Std:    {target_stats['std']:.2f}")
    logger.info(f"      Range:  [{target_stats['min']:.2f}, {target_stats['max']:.2f}]")

    missing_target = df['target_score'].isna().sum()
    if missing_target > 0:
        logger.warning(f"⚠️  {missing_target} filas con target_score NULL ({missing_target/len(df)*100:.1f}%)")

    return df, metadata


def prepare_features_and_target(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    """
    Prepara features (X) y target (y) para entrenamiento

    Args:
        df: DataFrame completo

    Returns:
        Tuple de (X, y, feature_names)
    """
    logger.info("="*80)
    logger.info("PREPARANDO FEATURES Y TARGET")
    logger.info("="*80)

    # Remover filas con target NULL
    initial_count = len(df)
    df_clean = df[df['target_score'].notna()].copy()
    removed = initial_count - len(df_clean)

    if removed > 0:
        logger.info(f"⚠️  Removidas {removed} filas con target NULL ({removed/initial_count*100:.1f}%)")

    if df_clean.empty:
        raise ValueError("❌ No hay filas con target_score válido")

    # Identificar columnas de features (KPI metrics)
    feature_cols = []

    for kpi in STANDARD_KPIS:
        for metric in ['_avg_rating', '_n_obs', '_n_observers', '_verified_pct']:
            col = f'{kpi}{metric}'
            if col in df_clean.columns:
                feature_cols.append(col)

    # Agregar metadata features
    metadata_features = ['total_observations', 'total_observers', 'verified_percentage',
                        'observation_span_days', 'kpis_evaluated']

    for feat in metadata_features:
        if feat in df_clean.columns:
            feature_cols.append(feat)

    logger.info(f"📊 Features seleccionadas: {len(feature_cols)}")
    logger.info(f"   KPI features: {len([f for f in feature_cols if any(kpi in f for kpi in STANDARD_KPIS)])}")
    logger.info(f"   Metadata features: {len([f for f in feature_cols if f in metadata_features])}")

    # Extraer X y y
    X = df_clean[feature_cols].copy()
    y = df_clean['target_score'].copy()

    # Reportar missing values en features
    missing_per_feature = X.isna().sum()
    if missing_per_feature.any():
        logger.info(f"\n📊 Missing values por feature:")
        for feat, count in missing_per_feature[missing_per_feature > 0].items():
            logger.info(f"   {feat}: {count} ({count/len(X)*100:.1f}%)")
        logger.info(f"   ℹ️  Se imputarán con la media durante entrenamiento")

    logger.info(f"\n✅ Dataset preparado:")
    logger.info(f"   X shape: {X.shape}")
    logger.info(f"   y shape: {y.shape}")

    return X, y, feature_cols


# ============================================================================
# ENTRENAMIENTO
# ============================================================================

def create_model_pipeline(model_name: str, config: Dict) -> Pipeline:
    """
    Crea pipeline de preprocesamiento + modelo

    Args:
        model_name: Nombre del modelo
        config: Configuración del modelo

    Returns:
        Pipeline de sklearn
    """
    steps = [
        ('imputer', SimpleImputer(strategy='mean'))
    ]

    if config['requires_scaling']:
        steps.append(('scaler', StandardScaler()))

    steps.append(('regressor', config['class'](**config['params'])))

    return Pipeline(steps)


def train_and_evaluate_model(
    model_name: str,
    pipeline: Pipeline,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    cv_folds: int = 5
) -> Dict:
    """
    Entrena y evalúa un modelo

    Args:
        model_name: Nombre del modelo
        pipeline: Pipeline del modelo
        X_train, y_train: Datos de entrenamiento
        X_test, y_test: Datos de prueba
        cv_folds: Número de folds para cross-validation

    Returns:
        Dict con métricas y modelo entrenado
    """
    logger.info(f"\n{'─'*80}")
    logger.info(f"🔧 Entrenando: {model_name}")

    # Entrenar
    pipeline.fit(X_train, y_train)
    logger.info(f"   ✅ Modelo entrenado")

    # Predecir
    y_pred_train = pipeline.predict(X_train)
    y_pred_test = pipeline.predict(X_test)

    # Métricas en test
    mae_test = mean_absolute_error(y_test, y_pred_test)
    rmse_test = np.sqrt(mean_squared_error(y_test, y_pred_test))
    r2_test = r2_score(y_test, y_pred_test)

    # Métricas en train
    mae_train = mean_absolute_error(y_train, y_pred_train)
    rmse_train = np.sqrt(mean_squared_error(y_train, y_pred_train))
    r2_train = r2_score(y_train, y_pred_train)

    # Cross-validation en train set
    cv_scores = cross_val_score(
        pipeline, X_train, y_train,
        cv=cv_folds,
        scoring='r2',
        n_jobs=-1
    )

    logger.info(f"\n   📊 MÉTRICAS (Test Set):")
    logger.info(f"      MAE:  {mae_test:.4f}")
    logger.info(f"      RMSE: {rmse_test:.4f}")
    logger.info(f"      R²:   {r2_test:.4f}")

    logger.info(f"\n   📊 MÉTRICAS (Train Set):")
    logger.info(f"      MAE:  {mae_train:.4f}")
    logger.info(f"      RMSE: {rmse_train:.4f}")
    logger.info(f"      R²:   {r2_train:.4f}")

    logger.info(f"\n   📊 CROSS-VALIDATION ({cv_folds}-fold):")
    logger.info(f"      R² mean: {cv_scores.mean():.4f}")
    logger.info(f"      R² std:  {cv_scores.std():.4f}")

    # Detectar overfitting
    overfitting_gap = r2_train - r2_test
    if overfitting_gap > 0.2:
        logger.warning(f"   ⚠️  Posible overfitting (R² gap: {overfitting_gap:.3f})")

    return {
        'model_name': model_name,
        'pipeline': pipeline,
        'metrics': {
            'test': {
                'mae': float(mae_test),
                'rmse': float(rmse_test),
                'r2': float(r2_test)
            },
            'train': {
                'mae': float(mae_train),
                'rmse': float(rmse_train),
                'r2': float(r2_train)
            },
            'cv': {
                'r2_mean': float(cv_scores.mean()),
                'r2_std': float(cv_scores.std()),
                'r2_scores': cv_scores.tolist()
            }
        },
        'overfitting_gap': float(overfitting_gap)
    }


def extract_feature_importance(pipeline: Pipeline, feature_names: List[str]) -> Optional[Dict[str, float]]:
    """
    Extrae feature importance del modelo

    Args:
        pipeline: Pipeline entrenado
        feature_names: Nombres de features

    Returns:
        Dict de {feature: importance} o None si no disponible
    """
    regressor = pipeline.named_steps['regressor']

    # Modelos lineales: usar coeficientes
    if hasattr(regressor, 'coef_'):
        return dict(zip(feature_names, regressor.coef_))

    # Random Forest / XGBoost: usar feature_importances_
    elif hasattr(regressor, 'feature_importances_'):
        return dict(zip(feature_names, regressor.feature_importances_))

    return None


# ============================================================================
# VERSIONADO DE ARTIFACTS
# ============================================================================

def create_model_manifest(
    model_result: Dict,
    feature_names: List[str],
    dataset_metadata: Dict,
    training_params: Dict
) -> Dict:
    """
    Crea manifest con metadata completa del modelo

    Args:
        model_result: Resultado de train_and_evaluate_model
        feature_names: Lista de nombres de features
        dataset_metadata: Metadata del dataset
        training_params: Parámetros de entrenamiento

    Returns:
        Dict con manifest completo
    """
    model_name = model_result['model_name']
    pipeline = model_result['pipeline']
    regressor = pipeline.named_steps['regressor']

    # Feature importance
    feature_importance = extract_feature_importance(pipeline, feature_names)

    # Metadata del modelo
    manifest = {
        'model': {
            'name': model_name,
            'version': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'type': type(regressor).__name__,
            'params': regressor.get_params(),
            'sklearn_version': __import__('sklearn').__version__
        },
        'training': {
            'date': datetime.now().isoformat(),
            'dataset': {
                'path': dataset_metadata.get('dataset_path', 'unknown'),
                'extraction_date': dataset_metadata.get('extraction_date', 'unknown'),
                'shape': dataset_metadata.get('shape', {}),
                'filters': {
                    'min_observations': dataset_metadata.get('min_observations'),
                    'min_observers': dataset_metadata.get('min_observers'),
                    'min_kpis_evaluated': dataset_metadata.get('min_kpis_evaluated')
                }
            },
            'params': training_params,
            'random_state': training_params.get('random_state', 42)
        },
        'features': {
            'names': feature_names,
            'count': len(feature_names),
            'importance': feature_importance
        },
        'performance': model_result['metrics'],
        'target': {
            'name': 'target_score',
            'description': 'HRScore (0-100)',
            'range': [0, 100]
        },
        'reproducibility': {
            'instructions': 'Ver ml/README_PIPELINE.md',
            'command': f"python ml/train_hrscore.py --dataset {dataset_metadata.get('dataset_path', 'DATASET.csv')}"
        }
    }

    return manifest


def save_model_artifacts(
    model_result: Dict,
    feature_names: List[str],
    dataset_metadata: Dict,
    training_params: Dict,
    version: Optional[str] = None
) -> Path:
    """
    Guarda todos los artifacts del modelo versionados

    Args:
        model_result: Resultado del entrenamiento
        feature_names: Lista de nombres de features
        dataset_metadata: Metadata del dataset
        training_params: Parámetros de entrenamiento
        version: Versión custom (default: timestamp)

    Returns:
        Path del directorio de artifacts
    """
    if version is None:
        version = datetime.now().strftime('%Y%m%d_%H%M%S')

    model_name = model_result['model_name']
    artifact_dir = ARTIFACTS_DIR / f"{model_name}_{version}"
    artifact_dir.mkdir(exist_ok=True)

    logger.info(f"\n💾 Guardando artifacts en: {artifact_dir}")

    # 1. Guardar pipeline completo (modelo + preprocessing)
    model_path = artifact_dir / 'model.pkl'
    joblib.dump(model_result['pipeline'], model_path)
    logger.info(f"   ✅ Modelo: {model_path.name}")

    # 2. Guardar manifest
    manifest = create_model_manifest(
        model_result,
        feature_names,
        dataset_metadata,
        training_params
    )

    manifest_path = artifact_dir / 'manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2, default=str)
    logger.info(f"   ✅ Manifest: {manifest_path.name}")

    # 3. Guardar métricas separadas
    metrics_path = artifact_dir / 'metrics.json'
    with open(metrics_path, 'w') as f:
        json.dump(model_result['metrics'], f, indent=2)
    logger.info(f"   ✅ Métricas: {metrics_path.name}")

    # 4. Guardar feature importance
    if manifest['features']['importance']:
        importance_df = pd.DataFrame([
            {'feature': k, 'importance': v}
            for k, v in manifest['features']['importance'].items()
        ]).sort_values('importance', ascending=False, key=abs)

        importance_path = artifact_dir / 'feature_importance.csv'
        importance_df.to_csv(importance_path, index=False)
        logger.info(f"   ✅ Feature importance: {importance_path.name}")

    # 5. Crear README del artifact
    readme_path = artifact_dir / 'README.md'
    readme_content = f"""# {model_name.upper()} Model Artifact

**Versión:** {version}
**Fecha de entrenamiento:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Contenido

- `model.pkl` - Pipeline completo (preprocessing + modelo)
- `manifest.json` - Metadata completa del modelo
- `metrics.json` - Métricas de evaluación
- `feature_importance.csv` - Importancia de features
- `README.md` - Este archivo

## Performance

### Test Set
- **R²:** {model_result['metrics']['test']['r2']:.4f}
- **MAE:** {model_result['metrics']['test']['mae']:.4f}
- **RMSE:** {model_result['metrics']['test']['rmse']:.4f}

### Cross-Validation ({len(model_result['metrics']['cv']['r2_scores'])}-fold)
- **R² mean:** {model_result['metrics']['cv']['r2_mean']:.4f} ± {model_result['metrics']['cv']['r2_std']:.4f}

## Uso

```python
import joblib
import pandas as pd

# Cargar modelo
model = joblib.load('{model_path}')

# Preparar datos (debe tener las {len(feature_names)} features)
X_new = pd.DataFrame({{
    # ... features ...
}})

# Predecir
predictions = model.predict(X_new)
```

## Features ({len(feature_names)})

{chr(10).join([f'- {feat}' for feat in feature_names[:10]])}
{'...' if len(feature_names) > 10 else ''}

## Reproducibilidad

Para reproducir este modelo:

```bash
{manifest['reproducibility']['command']}
```

Ver: `ml/README_PIPELINE.md`
"""

    with open(readme_path, 'w') as f:
        f.write(readme_content)
    logger.info(f"   ✅ README: {readme_path.name}")

    logger.info(f"\n✅ Artifacts guardados en: {artifact_dir.relative_to(ML_DIR)}")

    return artifact_dir


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Entrena modelo de HRScore con pipeline reproducible',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--dataset',
        type=str,
        default=None,
        help='Path del dataset CSV (default: usa el más reciente en ml/data/)'
    )

    parser.add_argument(
        '--models',
        nargs='+',
        default=None,
        help=f'Modelos a entrenar (default: todos). Opciones: {list(MODEL_CONFIGS.keys())}'
    )

    parser.add_argument(
        '--test-size',
        type=float,
        default=0.2,
        help='Proporción de datos para test (default: 0.2)'
    )

    parser.add_argument(
        '--cv-folds',
        type=int,
        default=5,
        help='Número de folds para cross-validation (default: 5)'
    )

    parser.add_argument(
        '--random-state',
        type=int,
        default=42,
        help='Semilla para reproducibilidad (default: 42)'
    )

    parser.add_argument(
        '--version',
        type=str,
        default=None,
        help='Versión custom para artifacts (default: timestamp)'
    )

    args = parser.parse_args()

    # Determinar dataset
    if args.dataset:
        dataset_path = Path(args.dataset)
    else:
        dataset_path = find_latest_dataset(DATA_DIR)

    # Determinar modelos a entrenar
    models_to_train = args.models if args.models else list(MODEL_CONFIGS.keys())

    # Validar modelos
    invalid_models = [m for m in models_to_train if m not in MODEL_CONFIGS]
    if invalid_models:
        logger.error(f"❌ Modelos inválidos: {invalid_models}")
        logger.error(f"   Opciones válidas: {list(MODEL_CONFIGS.keys())}")
        sys.exit(1)

    # Header
    print("\n" + "="*80)
    print("HRSCORE ML - MODEL TRAINING")
    print("="*80)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Dataset: {dataset_path}")
    print(f"Modelos: {models_to_train}")
    print(f"Test size: {args.test_size}")
    print(f"CV folds: {args.cv_folds}")
    print(f"Random state: {args.random_state}")
    print("")

    try:
        # 1. Cargar dataset
        df, dataset_metadata = load_dataset(dataset_path)

        # 2. Preparar features y target
        X, y, feature_names = prepare_features_and_target(df)

        # 3. Split train/test
        logger.info("="*80)
        logger.info("SPLIT TRAIN/TEST")
        logger.info("="*80)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=args.test_size,
            random_state=args.random_state
        )

        logger.info(f"✅ Train: {len(X_train)} muestras ({(1-args.test_size)*100:.0f}%)")
        logger.info(f"✅ Test:  {len(X_test)} muestras ({args.test_size*100:.0f}%)")

        # 4. Entrenar modelos
        logger.info("\n" + "="*80)
        logger.info(f"ENTRENANDO {len(models_to_train)} MODELOS")
        logger.info("="*80)

        results = []

        for model_name in models_to_train:
            config = MODEL_CONFIGS[model_name]
            pipeline = create_model_pipeline(model_name, config)

            result = train_and_evaluate_model(
                model_name,
                pipeline,
                X_train, y_train,
                X_test, y_test,
                cv_folds=args.cv_folds
            )

            results.append(result)

        # 5. Seleccionar mejor modelo
        logger.info("\n" + "="*80)
        logger.info("COMPARACIÓN DE MODELOS")
        logger.info("="*80)

        comparison_df = pd.DataFrame([
            {
                'model': r['model_name'],
                'test_r2': r['metrics']['test']['r2'],
                'test_mae': r['metrics']['test']['mae'],
                'cv_r2_mean': r['metrics']['cv']['r2_mean'],
                'cv_r2_std': r['metrics']['cv']['r2_std'],
                'overfitting_gap': r['overfitting_gap']
            }
            for r in results
        ]).sort_values('test_r2', ascending=False)

        print("\n" + comparison_df.to_string(index=False))

        best_model = results[comparison_df.index[0]]
        logger.info(f"\n🏆 MEJOR MODELO: {best_model['model_name'].upper()}")
        logger.info(f"   Test R²: {best_model['metrics']['test']['r2']:.4f}")
        logger.info(f"   CV R² mean: {best_model['metrics']['cv']['r2_mean']:.4f}")

        # 6. Guardar artifacts de todos los modelos
        logger.info("\n" + "="*80)
        logger.info("GUARDANDO ARTIFACTS")
        logger.info("="*80)

        training_params = {
            'test_size': args.test_size,
            'cv_folds': args.cv_folds,
            'random_state': args.random_state,
            'n_train': len(X_train),
            'n_test': len(X_test)
        }

        artifact_dirs = []

        for result in results:
            artifact_dir = save_model_artifacts(
                result,
                feature_names,
                dataset_metadata,
                training_params,
                version=args.version
            )
            artifact_dirs.append(artifact_dir)

        # 7. Crear symlink al mejor modelo
        best_artifact_link = ARTIFACTS_DIR / 'latest_best'
        if best_artifact_link.exists() or best_artifact_link.is_symlink():
            best_artifact_link.unlink()

        best_artifact_dir = [d for d in artifact_dirs if best_model['model_name'] in d.name][0]
        best_artifact_link.symlink_to(best_artifact_dir.name)
        logger.info(f"\n🔗 Symlink 'latest_best' -> {best_artifact_dir.name}")

        # Resumen final
        logger.info("\n" + "="*80)
        logger.info("✅ ENTRENAMIENTO COMPLETADO")
        logger.info("="*80)

        logger.info(f"\n📁 Artifacts guardados en:")
        for artifact_dir in artifact_dirs:
            logger.info(f"   {artifact_dir.relative_to(ML_DIR)}")

        logger.info(f"\n🎯 Próximos pasos:")
        logger.info(f"   1. Revisa métricas: cat {best_artifact_dir.relative_to(ML_DIR)}/metrics.json")
        logger.info(f"   2. Carga modelo: joblib.load('{best_artifact_dir.relative_to(ML_DIR)}/model.pkl')")
        logger.info(f"   3. Integra en producción: backend/hrkeyScoreService.js")

    except Exception as e:
        logger.error(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
