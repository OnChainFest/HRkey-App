#!/usr/bin/env python3
"""
HRKey - Export Model Configuration to JSON
===========================================

Este script exporta un modelo entrenado (Ridge regression) a un archivo JSON
con toda la configuración necesaria para realizar inferencia desde el backend
Node.js sin necesidad de ejecutar Python.

Exporta:
- Coeficientes del modelo
- Intercept
- Lista de features (KPIs) en orden
- Estadísticas del target (min, max, mean, std)
- Métricas de entrenamiento

Autor: HRKey Data Team
Fecha: 2025-11-22

Uso:
    python ml/export_hrkey_model_config.py
    python ml/export_hrkey_model_config.py --model_path ml/models/ridge_global.pkl
    python ml/export_hrkey_model_config.py --role_id <UUID>
"""

import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv

# Importar funciones del script de entrenamiento
# (asumiendo que están en el mismo directorio)
try:
    from baseline_predictive_model import load_data_from_supabase, build_ml_dataset
except ImportError:
    print("⚠️  No se pudo importar baseline_predictive_model.py")
    print("   Asegúrate de que está en el mismo directorio.")
    # Definir versiones simplificadas si es necesario
    load_data_from_supabase = None
    build_ml_dataset = None

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

load_dotenv()

MODELS_DIR = Path(__file__).parent / 'models'
OUTPUT_DIR = Path(__file__).parent / 'output'

# ============================================================================
# 1. CARGA Y EXTRACCIÓN DE CONFIGURACIÓN DEL MODELO
# ============================================================================

def load_model_and_extract_config(
    model_path: Path,
    role_id: Optional[str] = None
) -> Dict:
    """
    Carga un modelo entrenado y extrae su configuración completa.

    Args:
        model_path: Path al archivo .pkl del modelo
        role_id: ID del rol (None = global)

    Returns:
        Dict: Configuración completa del modelo en formato JSON-serializable

    Raises:
        FileNotFoundError: Si el modelo no existe
        ValueError: Si el modelo no tiene la estructura esperada
    """
    print("="*80)
    print("EXPORTANDO CONFIGURACIÓN DEL MODELO HRKEY")
    print("="*80)
    print(f"Modelo: {model_path}")
    print(f"Role ID: {role_id if role_id else 'Global'}")
    print("")

    # ========================================
    # 1. Cargar el modelo
    # ========================================
    if not model_path.exists():
        raise FileNotFoundError(
            f"Modelo no encontrado: {model_path}\n"
            "Ejecuta primero: python ml/baseline_predictive_model.py"
        )

    print("📦 Cargando modelo...")
    pipeline = joblib.load(model_path)
    print(f"   ✅ Modelo cargado: {type(pipeline)}")

    # Validar que sea un pipeline con regressor
    if not hasattr(pipeline, 'named_steps'):
        raise ValueError("El modelo debe ser un Pipeline de scikit-learn")

    regressor = pipeline.named_steps.get('regressor')
    if regressor is None:
        raise ValueError("El pipeline no contiene un paso 'regressor'")

    print(f"   Tipo de regresor: {type(regressor).__name__}")

    # ========================================
    # 2. Obtener coeficientes e intercept
    # ========================================
    if not hasattr(regressor, 'coef_') or not hasattr(regressor, 'intercept_'):
        raise ValueError(
            f"El modelo {type(regressor).__name__} no es un modelo lineal "
            "con coef_ e intercept_"
        )

    coef = regressor.coef_
    intercept = float(regressor.intercept_)

    print(f"\n📊 Coeficientes extraídos:")
    print(f"   Número de features: {len(coef)}")
    print(f"   Intercept: {intercept:.6f}")

    # ========================================
    # 3. Reconstruir dataset para obtener features y estadísticas
    # ========================================
    print("\n📊 Reconstruyendo dataset para extraer metadata...")

    # Cargar datos desde Supabase
    if load_data_from_supabase is None or build_ml_dataset is None:
        raise ImportError(
            "No se pudieron importar funciones de baseline_predictive_model.py.\n"
            "Asegúrate de que el archivo existe en ml/"
        )

    df_raw = load_data_from_supabase(role_id=role_id)
    X, y = build_ml_dataset(df_raw)

    # Obtener nombres de features
    feature_names = list(X.columns)

    # Validar que el número de features coincida
    if len(feature_names) != len(coef):
        raise ValueError(
            f"Mismatch en número de features:\n"
            f"  Modelo: {len(coef)} coeficientes\n"
            f"  Dataset: {len(feature_names)} features\n"
            f"Puede que el modelo se haya entrenado con datos diferentes."
        )

    print(f"   ✅ Features identificados: {len(feature_names)}")
    print(f"   Features: {feature_names[:5]}...")

    # ========================================
    # 4. Calcular estadísticas del target
    # ========================================
    target_stats = {
        'min': float(y.min()),
        'max': float(y.max()),
        'mean': float(y.mean()),
        'std': float(y.std())
    }

    print(f"\n📊 Estadísticas del target (outcome_value):")
    print(f"   Min:  {target_stats['min']:,.2f}")
    print(f"   Max:  {target_stats['max']:,.2f}")
    print(f"   Mean: {target_stats['mean']:,.2f}")
    print(f"   Std:  {target_stats['std']:,.2f}")

    # ========================================
    # 5. Cargar métricas si existen
    # ========================================
    suffix = f"role_{role_id}" if role_id else "global"
    metrics_path = OUTPUT_DIR / f"baseline_metrics_{suffix}.json"

    metrics = None
    if metrics_path.exists():
        with open(metrics_path, 'r') as f:
            metrics_data = json.load(f)
            # Obtener métricas del modelo correspondiente
            model_name = model_path.stem.replace(f"_{suffix}", "")
            if model_name in metrics_data.get('models', {}):
                metrics = metrics_data['models'][model_name]['test']
                print(f"\n📊 Métricas de evaluación cargadas:")
                print(f"   MAE:  {metrics['mae']:.4f}")
                print(f"   RMSE: {metrics['rmse']:.4f}")
                print(f"   R²:   {metrics['r2']:.4f}")

    # ========================================
    # 6. Construir configuración JSON
    # ========================================
    config = {
        "model_type": type(regressor).__name__.lower(),
        "trained_at": datetime.now().isoformat(),
        "role_scope": role_id if role_id else "global",
        "version": "1.0.0",

        # Features con sus coeficientes
        "features": [
            {
                "name": feature_names[i],
                "coef": float(coef[i]),
                "abs_coef": float(abs(coef[i]))
            }
            for i in range(len(feature_names))
        ],

        # Intercept del modelo
        "intercept": intercept,

        # Estadísticas del target para normalización
        "target_stats": target_stats,

        # Información de entrenamiento
        "train_info": {
            "n_samples": len(X),
            "n_features": len(feature_names),
            "metrics": metrics if metrics else {
                "mae": None,
                "rmse": None,
                "r2": None
            }
        },

        # Configuración de scoring
        "scoring_config": {
            "min_observations_required": 3,
            "default_imputation_value": 0.0,
            "normalization_method": "min_max",
            "confidence_calculation": "sqrt_n_over_20"
        }
    }

    print("\n✅ Configuración construida exitosamente")

    return config


# ============================================================================
# 2. GUARDAR CONFIGURACIÓN
# ============================================================================

def save_config(config: Dict, output_path: Path):
    """
    Guarda la configuración del modelo en JSON.

    Args:
        config: Diccionario con la configuración
        output_path: Path donde guardar el JSON
    """
    print("\n" + "="*80)
    print("GUARDANDO CONFIGURACIÓN")
    print("="*80)

    # Crear directorio si no existe
    output_path.parent.mkdir(exist_ok=True)

    # Guardar JSON con formato legible
    with open(output_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"✅ Configuración guardada en: {output_path}")
    print(f"   Tamaño: {output_path.stat().st_size:,} bytes")

    # Mostrar preview
    print("\n📄 Preview de la configuración:")
    print(f"   Model type: {config['model_type']}")
    print(f"   Role scope: {config['role_scope']}")
    print(f"   Features: {config['train_info']['n_features']}")
    print(f"   Intercept: {config['intercept']:.6f}")
    print(f"   R²: {config['train_info']['metrics'].get('r2', 'N/A')}")

    # Mostrar top 5 features más importantes
    features_sorted = sorted(
        config['features'],
        key=lambda x: x['abs_coef'],
        reverse=True
    )

    print("\n🔝 Top 5 features más importantes (por coeficiente absoluto):")
    for i, feat in enumerate(features_sorted[:5], 1):
        sign = "+" if feat['coef'] > 0 else ""
        print(f"   {i}. {feat['name']}: {sign}{feat['coef']:.4f}")


# ============================================================================
# 3. VALIDAR CONFIGURACIÓN (OPCIONAL)
# ============================================================================

def validate_config(config: Dict):
    """
    Valida que la configuración tenga todos los campos requeridos.

    Args:
        config: Diccionario de configuración

    Raises:
        ValueError: Si falta algún campo crítico
    """
    required_fields = [
        'model_type',
        'trained_at',
        'role_scope',
        'features',
        'intercept',
        'target_stats',
        'train_info'
    ]

    missing = [field for field in required_fields if field not in config]
    if missing:
        raise ValueError(f"Campos faltantes en la configuración: {missing}")

    # Validar que features tenga al menos una entrada
    if not config['features'] or len(config['features']) == 0:
        raise ValueError("La configuración debe tener al menos una feature")

    # Validar que cada feature tenga name y coef
    for i, feat in enumerate(config['features']):
        if 'name' not in feat or 'coef' not in feat:
            raise ValueError(f"Feature {i} está malformada: {feat}")

    print("✅ Configuración validada correctamente")


# ============================================================================
# 4. FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """
    Función principal del script.
    """
    # ========================================
    # Parse argumentos CLI
    # ========================================
    parser = argparse.ArgumentParser(
        description='HRKey - Export Model Configuration to JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Exportar modelo global (Ridge)
  python ml/export_hrkey_model_config.py

  # Exportar modelo de un rol específico
  python ml/export_hrkey_model_config.py --role_id abc123-def456-...

  # Exportar un modelo específico
  python ml/export_hrkey_model_config.py --model_path ml/models/linear_regression_global.pkl
        """
    )

    parser.add_argument(
        '--model_path',
        type=str,
        default=None,
        help='Path al modelo .pkl (default: ml/models/ridge_global.pkl)'
    )

    parser.add_argument(
        '--role_id',
        type=str,
        default=None,
        help='UUID del rol (si se omite, usa modelo global)'
    )

    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path de salida del JSON (default: ml/output/hrkey_model_config_*.json)'
    )

    args = parser.parse_args()

    # ========================================
    # Determinar paths
    # ========================================
    # Path del modelo
    if args.model_path:
        model_path = Path(args.model_path)
    else:
        suffix = f"role_{args.role_id}" if args.role_id else "global"
        model_path = MODELS_DIR / f"ridge_{suffix}.pkl"

    # Path de salida
    if args.output:
        output_path = Path(args.output)
    else:
        suffix = f"role_{args.role_id}" if args.role_id else "global"
        output_path = OUTPUT_DIR / f"hrkey_model_config_{suffix}.json"

    # ========================================
    # Ejecutar exportación
    # ========================================
    try:
        # Extraer configuración
        config = load_model_and_extract_config(model_path, role_id=args.role_id)

        # Validar
        validate_config(config)

        # Guardar
        save_config(config, output_path)

        # ========================================
        # Resumen final
        # ========================================
        print("\n" + "="*80)
        print("✅ EXPORTACIÓN COMPLETADA EXITOSAMENTE")
        print("="*80)

        print("\n📦 Archivos generados:")
        print(f"   {output_path}")

        print("\n🎯 Próximos pasos:")
        print("   1. El backend puede cargar este JSON para calcular scores")
        print("   2. Usa el endpoint POST /api/hrkey-score con:")
        print("      { \"subject_wallet\": \"0xABC\", \"role_id\": \"uuid\" }")
        print("   3. El score se calculará sin necesidad de Python en producción")

        print("\n💡 Ejemplo de uso en Node.js:")
        print("   const config = require('./ml/output/hrkey_model_config_global.json');")
        print("   const score = intercept + features.reduce((sum, f, i) => sum + f.coef * x[i], 0);")

    except FileNotFoundError as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ ERROR INESPERADO: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    main()
