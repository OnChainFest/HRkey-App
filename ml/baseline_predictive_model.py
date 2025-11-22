#!/usr/bin/env python3
"""
HRKey - Baseline Predictive Model
==================================

Este script entrena modelos de regresión baseline que predicen el outcome_value
(desempeño numérico) a partir de ratings de KPIs por persona y rol.

Flujo:
1. Cargar observaciones de KPI desde Supabase
2. Construir dataset ML a nivel (subject_wallet, role_id) con KPIs como features
3. Dividir en train/test (80/20)
4. Entrenar modelos baseline: LinearRegression y Ridge
5. Evaluar con métricas: MAE, RMSE, R²
6. Extraer feature importance (coeficientes)
7. Exportar modelos, métricas y feature importance

Autor: HRKey Data Team
Fecha: 2025-11-22

Uso:
    # Entrenar modelo global (todos los roles)
    python ml/baseline_predictive_model.py

    # Entrenar modelo específico para un rol
    python ml/baseline_predictive_model.py --role_id <UUID_DEL_ROL>

    # Ajustar parámetros
    python ml/baseline_predictive_model.py --test_size 0.3 --random_state 123
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import numpy as np
from dotenv import load_dotenv

# Scikit-learn imports
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

# Cargar variables de entorno
load_dotenv()

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constantes
MIN_SAMPLES_FOR_TRAINING = 20  # Mínimo de muestras para entrenar modelos
MODELS_DIR = Path(__file__).parent / 'models'
OUTPUT_DIR = Path(__file__).parent / 'output'

# Crear directorios si no existen
MODELS_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


# ============================================================================
# 1. CONEXIÓN A SUPABASE Y CARGA DE DATOS
# ============================================================================

def get_supabase_connection():
    """
    Obtiene la conexión a Supabase.

    Intenta primero con supabase-py, si no está disponible usa requests directo.

    Returns:
        dict: Configuración de conexión con 'method', 'url', 'key'

    Raises:
        ValueError: Si las credenciales no están configuradas
    """
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')

    if not supabase_url or not supabase_key:
        raise ValueError(
            "SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar definidos en .env\n"
            "Ejemplo:\n"
            "  SUPABASE_URL=https://xxx.supabase.co\n"
            "  SUPABASE_SERVICE_KEY=eyJhbGc..."
        )

    # Intentar importar supabase-py
    try:
        from supabase import create_client, Client
        client = create_client(supabase_url, supabase_key)
        logger.info("✅ Conectado a Supabase usando supabase-py")
        return {'method': 'supabase-py', 'client': client}
    except ImportError:
        logger.info("⚠️  supabase-py no disponible, usando requests directo")
        return {
            'method': 'requests',
            'url': supabase_url,
            'key': supabase_key
        }


def load_data_from_supabase(role_id: Optional[str] = None) -> pd.DataFrame:
    """
    Carga observaciones de KPI desde Supabase.

    Args:
        role_id: Si se especifica, filtra solo observaciones de ese rol

    Returns:
        pd.DataFrame: DataFrame con columnas:
            - subject_wallet, observer_wallet, role_id, kpi_id, kpi_name,
            - rating_value, outcome_value, observed_at, etc.

    Raises:
        RuntimeError: Si no se pueden cargar los datos
        ValueError: Si no hay datos en la tabla
    """
    logger.info("="*80)
    logger.info("CARGANDO DATOS DESDE SUPABASE")
    logger.info("="*80)

    conn = get_supabase_connection()

    try:
        if conn['method'] == 'supabase-py':
            # Usar cliente de supabase-py
            query = conn['client'].table('kpi_observations').select('*')

            # Filtrar por role_id si se especifica
            if role_id:
                query = query.eq('role_id', role_id)
                logger.info(f"📊 Filtrando por role_id: {role_id}")

            response = query.execute()
            data = response.data

        else:
            # Usar requests directo
            import requests

            url = f"{conn['url']}/rest/v1/kpi_observations"
            headers = {
                'apikey': conn['key'],
                'Authorization': f"Bearer {conn['key']}",
                'Content-Type': 'application/json'
            }

            params = {}
            if role_id:
                params['role_id'] = f'eq.{role_id}'
                logger.info(f"📊 Filtrando por role_id: {role_id}")

            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

        # Convertir a DataFrame
        df = pd.DataFrame(data)

        if df.empty:
            raise ValueError(
                "No se encontraron datos en kpi_observations.\n"
                "Asegúrate de haber insertado observaciones usando:\n"
                "  POST /api/kpi-observations"
            )

        logger.info(f"✅ Cargadas {len(df)} observaciones desde Supabase")
        logger.info(f"\n📊 INFORMACIÓN DEL DATASET:")
        logger.info(f"   Shape: {df.shape}")
        logger.info(f"   Columnas: {list(df.columns)}")

        return df

    except Exception as e:
        logger.error(f"❌ Error al cargar datos: {e}")
        raise RuntimeError(f"No se pudo cargar datos desde Supabase: {e}")


# ============================================================================
# 2. CONSTRUCCIÓN DEL DATASET PARA ML
# ============================================================================

def build_ml_dataset(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Construye el dataset ML a nivel (subject_wallet, role_id).

    Agrega los datos a nivel de persona+rol, pivoteando los KPIs como columnas
    y usando outcome_value como target.

    Args:
        df_raw: DataFrame con observaciones individuales

    Returns:
        Tuple[pd.DataFrame, pd.Series]: (X, y)
            - X: Features (KPIs pivoteados)
            - y: Target (avg outcome_value)

    Raises:
        ValueError: Si no hay datos suficientes después de limpiar
    """
    logger.info("="*80)
    logger.info("CONSTRUYENDO DATASET ML")
    logger.info("="*80)

    df = df_raw.copy()

    # Validar columnas requeridas
    required_cols = ['subject_wallet', 'role_id', 'kpi_name', 'rating_value', 'outcome_value']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Columnas faltantes en el dataset: {missing_cols}")

    # ========================================
    # Paso 1: Limpiar datos
    # ========================================
    logger.info(f"📊 Observaciones originales: {len(df)}")

    # Remover filas con valores nulos en columnas críticas
    initial_count = len(df)
    df = df.dropna(subset=['subject_wallet', 'role_id', 'kpi_name', 'rating_value', 'outcome_value'])
    dropped_count = initial_count - len(df)

    if dropped_count > 0:
        logger.info(f"   ⚠️  Removidas {dropped_count} filas con valores NULL ({dropped_count/initial_count*100:.1f}%)")

    if df.empty:
        raise ValueError(
            "No hay datos suficientes después de eliminar NULLs.\n"
            "Asegúrate de que las observaciones tengan rating_value y outcome_value."
        )

    # Validar rating_value en rango 1-5
    invalid_ratings = df[(df['rating_value'] < 1) | (df['rating_value'] > 5)]
    if len(invalid_ratings) > 0:
        logger.warning(f"   ⚠️  Encontradas {len(invalid_ratings)} observaciones con rating fuera de rango 1-5")
        df = df[(df['rating_value'] >= 1) & (df['rating_value'] <= 5)]

    logger.info(f"✅ Datos limpios: {len(df)} observaciones")

    # ========================================
    # Paso 2: Agregar por (subject, role, kpi)
    # ========================================
    logger.info("\n📊 Agregando por (subject_wallet, role_id, kpi_name)...")

    # Agrupar y calcular promedios
    agg_df = df.groupby(['subject_wallet', 'role_id', 'kpi_name']).agg({
        'rating_value': 'mean',
        'outcome_value': 'mean'
    }).reset_index()

    # Renombrar para claridad
    agg_df = agg_df.rename(columns={
        'rating_value': 'avg_rating',
        'outcome_value': 'avg_outcome'
    })

    logger.info(f"   Agregadas a {len(agg_df)} combinaciones únicas de (subject, role, kpi)")

    # ========================================
    # Paso 3: Pivotear KPIs como columnas
    # ========================================
    logger.info("\n📊 Pivoteando KPIs como features...")

    # Pivotear: índice = (subject, role), columnas = kpi_name, valores = avg_rating
    pivot_df = agg_df.pivot_table(
        index=['subject_wallet', 'role_id'],
        columns='kpi_name',
        values='avg_rating',
        aggfunc='mean'  # Por si hay duplicados (no debería)
    )

    # Resetear índice para tener subject_wallet y role_id como columnas
    pivot_df = pivot_df.reset_index()

    logger.info(f"   Dataset pivoteado: {pivot_df.shape}")
    logger.info(f"   KPIs como features: {list(pivot_df.columns[2:])}")  # Excluir subject_wallet y role_id

    # ========================================
    # Paso 4: Calcular target (y)
    # ========================================
    logger.info("\n📊 Calculando variable target (outcome_value promedio)...")

    # Calcular avg_outcome por (subject, role)
    target_df = agg_df.groupby(['subject_wallet', 'role_id'])['avg_outcome'].mean().reset_index()
    target_df = target_df.rename(columns={'avg_outcome': 'target_outcome'})

    logger.info(f"   Calculado outcome promedio para {len(target_df)} combinaciones (subject, role)")

    # ========================================
    # Paso 5: Merge features + target
    # ========================================
    final_df = pivot_df.merge(
        target_df,
        on=['subject_wallet', 'role_id'],
        how='inner'
    )

    logger.info(f"\n✅ Dataset final: {final_df.shape}")

    # Verificar que tengamos suficientes muestras
    if len(final_df) < MIN_SAMPLES_FOR_TRAINING:
        raise ValueError(
            f"Dataset demasiado pequeño: {len(final_df)} muestras.\n"
            f"Se requieren al menos {MIN_SAMPLES_FOR_TRAINING} muestras para entrenar.\n"
            "Inserta más observaciones de KPI."
        )

    # ========================================
    # Paso 6: Separar X (features) y y (target)
    # ========================================
    # Features: todas las columnas excepto subject_wallet, role_id, target_outcome
    feature_cols = [col for col in final_df.columns if col not in ['subject_wallet', 'role_id', 'target_outcome']]

    X = final_df[feature_cols]
    y = final_df['target_outcome']

    # Guardar metadata para referencia
    metadata = {
        'subject_wallet': final_df['subject_wallet'].tolist(),
        'role_id': final_df['role_id'].tolist()
    }

    logger.info(f"\n📊 DATASET ML LISTO:")
    logger.info(f"   Features (X): {X.shape}")
    logger.info(f"   Target (y): {y.shape}")
    logger.info(f"   Feature names: {list(X.columns)}")
    logger.info(f"   Target range: [{y.min():.2f}, {y.max():.2f}]")
    logger.info(f"   Target mean: {y.mean():.2f}")

    return X, y


# ============================================================================
# 3. ENTRENAMIENTO Y EVALUACIÓN DE MODELOS
# ============================================================================

def train_and_evaluate_models(
    X: pd.DataFrame,
    y: pd.Series,
    role_id: Optional[str] = None,
    test_size: float = 0.2,
    random_state: int = 42
) -> Dict:
    """
    Entrena y evalúa modelos baseline de regresión.

    Args:
        X: Features (KPIs)
        y: Target (outcome_value)
        role_id: ID del rol (None = global)
        test_size: Proporción de datos para test
        random_state: Semilla para reproducibilidad

    Returns:
        Dict: Resultados con métricas, modelos y feature importance
    """
    logger.info("="*80)
    logger.info("ENTRENANDO MODELOS BASELINE")
    logger.info("="*80)

    # ========================================
    # Paso 1: Split train/test
    # ========================================
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=test_size,
        random_state=random_state
    )

    logger.info(f"📊 Split train/test:")
    logger.info(f"   Train: {X_train.shape[0]} muestras ({(1-test_size)*100:.0f}%)")
    logger.info(f"   Test:  {X_test.shape[0]} muestras ({test_size*100:.0f}%)")

    # ========================================
    # Paso 2: Definir modelos con pipelines
    # ========================================
    models = {
        'linear_regression': Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('scaler', StandardScaler()),
            ('regressor', LinearRegression())
        ]),
        'ridge': Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('scaler', StandardScaler()),
            ('regressor', Ridge(alpha=1.0))
        ])
    }

    logger.info(f"\n📊 Modelos a entrenar: {list(models.keys())}")

    # ========================================
    # Paso 3: Entrenar y evaluar cada modelo
    # ========================================
    results = {
        'role_id': role_id if role_id else 'global',
        'n_samples': len(X),
        'n_features': X.shape[1],
        'n_train': len(X_train),
        'n_test': len(X_test),
        'feature_names': list(X.columns),
        'models': {}
    }

    for model_name, pipeline in models.items():
        logger.info(f"\n{'─'*80}")
        logger.info(f"🔧 Entrenando: {model_name}")

        # Entrenar
        pipeline.fit(X_train, y_train)
        logger.info(f"   ✅ Modelo entrenado")

        # Predecir
        y_pred_train = pipeline.predict(X_train)
        y_pred_test = pipeline.predict(X_test)

        # Calcular métricas en test
        mae = mean_absolute_error(y_test, y_pred_test)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
        r2 = r2_score(y_test, y_pred_test)

        # Métricas en train (para detectar overfitting)
        mae_train = mean_absolute_error(y_train, y_pred_train)
        rmse_train = np.sqrt(mean_squared_error(y_train, y_pred_train))
        r2_train = r2_score(y_train, y_pred_train)

        logger.info(f"\n   📊 MÉTRICAS (Test Set):")
        logger.info(f"      MAE:  {mae:.4f}")
        logger.info(f"      RMSE: {rmse:.4f}")
        logger.info(f"      R²:   {r2:.4f}")

        logger.info(f"\n   📊 MÉTRICAS (Train Set):")
        logger.info(f"      MAE:  {mae_train:.4f}")
        logger.info(f"      RMSE: {rmse_train:.4f}")
        logger.info(f"      R²:   {r2_train:.4f}")

        # Detectar overfitting
        if r2_train - r2 > 0.2:
            logger.warning(f"   ⚠️  Posible overfitting detectado (R² train-test gap: {r2_train - r2:.3f})")

        # Guardar resultados
        results['models'][model_name] = {
            'pipeline': pipeline,
            'metrics_test': {
                'mae': float(mae),
                'rmse': float(rmse),
                'r2': float(r2)
            },
            'metrics_train': {
                'mae': float(mae_train),
                'rmse': float(rmse_train),
                'r2': float(r2_train)
            }
        }

    logger.info(f"\n{'─'*80}")
    logger.info("✅ Todos los modelos entrenados")

    return results


# ============================================================================
# 4. EXTRACCIÓN DE FEATURE IMPORTANCE
# ============================================================================

def extract_feature_importance(results: Dict) -> pd.DataFrame:
    """
    Extrae los coeficientes (feature importance) de los modelos lineales.

    Args:
        results: Diccionario de resultados de train_and_evaluate_models()

    Returns:
        pd.DataFrame: DataFrame con feature importance por modelo
    """
    logger.info("="*80)
    logger.info("EXTRAYENDO FEATURE IMPORTANCE")
    logger.info("="*80)

    feature_names = results['feature_names']
    importance_data = {'kpi_name': feature_names}

    for model_name, model_data in results['models'].items():
        pipeline = model_data['pipeline']

        # Obtener el regresor del pipeline
        regressor = pipeline.named_steps['regressor']

        # Extraer coeficientes
        if hasattr(regressor, 'coef_'):
            coefs = regressor.coef_

            # Guardar coeficientes
            importance_data[f'coef_{model_name}'] = coefs

            # Guardar valor absoluto (para ordenar por importancia)
            importance_data[f'abs_coef_{model_name}'] = np.abs(coefs)

            logger.info(f"✅ Coeficientes extraídos de {model_name}")
        else:
            logger.warning(f"⚠️  {model_name} no tiene coeficientes (modelo no lineal)")

    # Crear DataFrame
    importance_df = pd.DataFrame(importance_data)

    # Ordenar por la suma de coeficientes absolutos (promedio de importancia)
    abs_cols = [col for col in importance_df.columns if col.startswith('abs_coef_')]
    if abs_cols:
        importance_df['total_abs_importance'] = importance_df[abs_cols].sum(axis=1)
        importance_df = importance_df.sort_values('total_abs_importance', ascending=False)

    logger.info(f"\n📊 TOP 10 KPIs MÁS IMPORTANTES:")
    for idx, row in importance_df.head(10).iterrows():
        kpi = row['kpi_name']
        # Mostrar coeficiente del primer modelo
        first_coef_col = [col for col in importance_df.columns if col.startswith('coef_')][0]
        coef = row[first_coef_col]
        logger.info(f"   {idx+1}. {kpi}: {coef:+.4f}")

    return importance_df


# ============================================================================
# 5. GUARDAR MODELOS Y RESULTADOS
# ============================================================================

def save_metrics_and_models(
    results: Dict,
    importance_df: pd.DataFrame,
    role_id: Optional[str] = None
):
    """
    Guarda modelos entrenados, métricas y feature importance.

    Args:
        results: Diccionario de resultados de entrenamiento
        importance_df: DataFrame con feature importance
        role_id: ID del rol (None = global)
    """
    logger.info("="*80)
    logger.info("GUARDANDO MODELOS Y RESULTADOS")
    logger.info("="*80)

    # Definir sufijo para archivos
    suffix = f"role_{role_id}" if role_id else "global"

    # ========================================
    # 1. Guardar métricas en JSON
    # ========================================
    metrics_path = OUTPUT_DIR / f"baseline_metrics_{suffix}.json"

    metrics_json = {
        'metadata': {
            'analysis_date': datetime.now().isoformat(),
            'role_id': results['role_id'],
            'n_samples': results['n_samples'],
            'n_features': results['n_features'],
            'n_train': results['n_train'],
            'n_test': results['n_test'],
            'feature_names': results['feature_names']
        },
        'models': {}
    }

    for model_name, model_data in results['models'].items():
        metrics_json['models'][model_name] = {
            'test': model_data['metrics_test'],
            'train': model_data['metrics_train']
        }

    with open(metrics_path, 'w') as f:
        json.dump(metrics_json, f, indent=2)

    logger.info(f"✅ Métricas guardadas en: {metrics_path}")

    # ========================================
    # 2. Guardar feature importance en CSV
    # ========================================
    importance_path = OUTPUT_DIR / f"kpi_feature_importance_{suffix}.csv"
    importance_df.to_csv(importance_path, index=False)

    logger.info(f"✅ Feature importance guardada en: {importance_path}")

    # ========================================
    # 3. Guardar modelos con joblib
    # ========================================
    for model_name, model_data in results['models'].items():
        model_path = MODELS_DIR / f"{model_name}_{suffix}.pkl"

        # Guardar pipeline completo
        joblib.dump(model_data['pipeline'], model_path)

        logger.info(f"✅ Modelo guardado en: {model_path}")

    logger.info("\n📦 ARCHIVOS GENERADOS:")
    logger.info(f"   Métricas:           {metrics_path}")
    logger.info(f"   Feature Importance: {importance_path}")
    for model_name in results['models'].keys():
        model_path = MODELS_DIR / f"{model_name}_{suffix}.pkl"
        logger.info(f"   Modelo ({model_name}):      {model_path}")

    # ========================================
    # 4. Ejemplo de cómo cargar modelos
    # ========================================
    logger.info("\n💡 CÓMO CARGAR MODELOS PARA INFERENCIA:")
    logger.info("   ```python")
    logger.info("   import joblib")
    logger.info("   import pandas as pd")
    logger.info("")
    logger.info(f"   # Cargar modelo")
    logger.info(f"   model = joblib.load('{MODELS_DIR}/{list(results['models'].keys())[0]}_{suffix}.pkl')")
    logger.info("")
    logger.info("   # Preparar datos (mismo formato que entrenamiento)")
    logger.info("   X_new = pd.DataFrame({")
    for i, feat in enumerate(results['feature_names'][:3]):
        logger.info(f"       '{feat}': [4.5],")
    logger.info("       ...")
    logger.info("   })")
    logger.info("")
    logger.info("   # Predecir")
    logger.info("   predictions = model.predict(X_new)")
    logger.info("   print(f'Predicted outcome: {predictions[0]:.2f}')")
    logger.info("   ```")


# ============================================================================
# 6. FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """
    Función principal del script.
    """
    # ========================================
    # Parse argumentos CLI
    # ========================================
    parser = argparse.ArgumentParser(
        description='HRKey - Baseline Predictive Model',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Entrenar modelo global
  python ml/baseline_predictive_model.py

  # Entrenar para un rol específico
  python ml/baseline_predictive_model.py --role_id abc123-def456-...

  # Ajustar parámetros de train/test
  python ml/baseline_predictive_model.py --test_size 0.3 --random_state 123
        """
    )

    parser.add_argument(
        '--role_id',
        type=str,
        default=None,
        help='UUID del rol (si se omite, entrena modelo global)'
    )

    parser.add_argument(
        '--test_size',
        type=float,
        default=0.2,
        help='Proporción de datos para test (default: 0.2)'
    )

    parser.add_argument(
        '--random_state',
        type=int,
        default=42,
        help='Semilla para reproducibilidad (default: 42)'
    )

    args = parser.parse_args()

    # ========================================
    # Header
    # ========================================
    print("\n" + "="*80)
    print("HRKEY - MODELO PREDICTIVO BASELINE")
    print("="*80)
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Role ID: {args.role_id if args.role_id else 'Global (todos los roles)'}")
    print(f"Test size: {args.test_size}")
    print(f"Random state: {args.random_state}")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Models directory: {MODELS_DIR}")
    print("")

    try:
        # ========================================
        # 1. Cargar datos
        # ========================================
        df_raw = load_data_from_supabase(role_id=args.role_id)

        # ========================================
        # 2. Construir dataset ML
        # ========================================
        X, y = build_ml_dataset(df_raw)

        # ========================================
        # 3. Entrenar y evaluar modelos
        # ========================================
        results = train_and_evaluate_models(
            X, y,
            role_id=args.role_id,
            test_size=args.test_size,
            random_state=args.random_state
        )

        # ========================================
        # 4. Extraer feature importance
        # ========================================
        importance_df = extract_feature_importance(results)

        # ========================================
        # 5. Guardar resultados
        # ========================================
        save_metrics_and_models(results, importance_df, role_id=args.role_id)

        # ========================================
        # Resumen final
        # ========================================
        logger.info("\n" + "="*80)
        logger.info("✅ ANÁLISIS COMPLETADO EXITOSAMENTE")
        logger.info("="*80)

        logger.info("\n📊 RESUMEN DE MÉTRICAS:")
        for model_name, model_data in results['models'].items():
            metrics = model_data['metrics_test']
            logger.info(f"\n   {model_name.upper()}:")
            logger.info(f"      MAE:  {metrics['mae']:.4f}")
            logger.info(f"      RMSE: {metrics['rmse']:.4f}")
            logger.info(f"      R²:   {metrics['r2']:.4f}")

        logger.info("\n🎯 Próximos pasos:")
        logger.info("   1. Revisa las métricas en ml/output/baseline_metrics_*.json")
        logger.info("   2. Analiza feature importance en ml/output/kpi_feature_importance_*.csv")
        logger.info("   3. Usa los modelos guardados en ml/models/*.pkl para inferencia")
        logger.info("   4. Considera entrenar modelos más complejos (RandomForest, XGBoost)")

    except ValueError as e:
        logger.error(f"\n❌ ERROR DE VALIDACIÓN: {e}")
        sys.exit(1)

    except Exception as e:
        logger.error(f"\n❌ ERROR INESPERADO: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    main()
