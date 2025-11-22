#!/usr/bin/env python3
"""
HRKey - KPI Correlation Analysis
=================================

Este script analiza correlaciones entre ratings de KPIs y outcomes medibles
para el Proof of Correlation MVP.

Flujo:
1. Conectar a Supabase y cargar datos de kpi_observations
2. Limpiar datos (validar ratings 1-5, quitar NULLs)
3. Calcular correlaciones Pearson y Spearman por KPI
4. Exportar resultados a CSV y JSON

Autor: HRKey Data Team
Fecha: 2025-11-22
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

import pandas as pd
import numpy as np
from scipy import stats
from dotenv import load_dotenv

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
MIN_OBSERVATIONS_PER_KPI = 10  # Mínimo de observaciones para considerar correlación válida
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
CSV_OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'kpi_correlations.csv')
JSON_OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'kpi_correlations.json')

# ============================================================================
# 1. CONEXIÓN A SUPABASE Y CARGA DE DATOS
# ============================================================================

def get_supabase_connection():
    """
    Obtiene la conexión a Supabase.

    Intenta primero con supabase-py, si no está disponible usa requests directo.

    Returns:
        dict: Configuración de conexión con 'method', 'url', 'key'
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


def load_data() -> pd.DataFrame:
    """
    Carga observaciones de KPI desde Supabase.

    Returns:
        pd.DataFrame: DataFrame con columnas:
            - id, subject_wallet, observer_wallet, role_id, kpi_id,
            - kpi_name, rating_value, outcome_value, observed_at, etc.

    Raises:
        Exception: Si falla la conexión o query a Supabase
    """
    logger.info("=" * 80)
    logger.info("CARGANDO DATOS DESDE SUPABASE")
    logger.info("=" * 80)

    conn_config = get_supabase_connection()

    # ========================================
    # Opción 1: Usar supabase-py
    # ========================================
    if conn_config['method'] == 'supabase-py':
        client = conn_config['client']

        logger.info("Ejecutando query a tabla kpi_observations...")

        try:
            response = client.table('kpi_observations').select('*').execute()
            data = response.data

            if not data:
                logger.warning("⚠️  No se encontraron datos en kpi_observations")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} observaciones desde Supabase")

        except Exception as e:
            logger.error(f"❌ Error al cargar datos con supabase-py: {e}")
            raise

    # ========================================
    # Opción 2: Usar requests directo (fallback)
    # ========================================
    else:
        import requests

        url = f"{conn_config['url']}/rest/v1/kpi_observations"
        headers = {
            'apikey': conn_config['key'],
            'Authorization': f"Bearer {conn_config['key']}",
            'Content-Type': 'application/json'
        }

        logger.info(f"Ejecutando GET request a {url}...")

        try:
            response = requests.get(url, headers=headers, params={'select': '*'})
            response.raise_for_status()

            data = response.json()

            if not data:
                logger.warning("⚠️  No se encontraron datos en kpi_observations")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} observaciones desde Supabase")

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Error al cargar datos con requests: {e}")
            raise

    # ========================================
    # Inspección inicial
    # ========================================
    logger.info("\n📊 INFORMACIÓN DEL DATASET:")
    logger.info(f"   Shape: {df.shape}")
    logger.info(f"   Columnas: {list(df.columns)}")

    logger.info("\n🔍 PRIMERAS FILAS:")
    print(df.head())

    logger.info("\n📈 ESTADÍSTICAS BÁSICAS:")
    logger.info(f"   Total observaciones: {len(df)}")
    logger.info(f"   KPIs únicos: {df['kpi_name'].nunique() if 'kpi_name' in df.columns else 'N/A'}")
    logger.info(f"   Subjects únicos: {df['subject_wallet'].nunique() if 'subject_wallet' in df.columns else 'N/A'}")
    logger.info(f"   Observers únicos: {df['observer_wallet'].nunique() if 'observer_wallet' in df.columns else 'N/A'}")

    return df


# ============================================================================
# 2. LIMPIEZA DE DATOS
# ============================================================================

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Limpia y valida el DataFrame de observaciones.

    Pasos:
    1. Quita filas con rating_value NULL
    2. Valida que rating_value esté entre 1-5
    3. Convierte tipos numéricos correctamente
    4. Quita filas sin outcome_value (necesario para correlación)

    Args:
        df: DataFrame raw de Supabase

    Returns:
        pd.DataFrame: DataFrame limpio y validado
    """
    logger.info("\n" + "=" * 80)
    logger.info("LIMPIANDO DATOS")
    logger.info("=" * 80)

    original_count = len(df)
    logger.info(f"Observaciones originales: {original_count}")

    if df.empty:
        logger.warning("⚠️  DataFrame vacío, no hay nada que limpiar")
        return df

    # ========================================
    # 1. Validar columnas necesarias
    # ========================================
    required_cols = ['rating_value', 'outcome_value', 'kpi_name']
    missing_cols = [col for col in required_cols if col not in df.columns]

    if missing_cols:
        raise ValueError(f"Columnas faltantes en el dataset: {missing_cols}")

    logger.info(f"✅ Columnas requeridas presentes: {required_cols}")

    # ========================================
    # 2. Quitar filas con rating_value NULL
    # ========================================
    null_ratings_before = df['rating_value'].isnull().sum()
    df = df[df['rating_value'].notna()].copy()
    logger.info(f"   Removidas {null_ratings_before} filas con rating_value NULL")

    # ========================================
    # 3. Convertir tipos numéricos
    # ========================================
    df['rating_value'] = pd.to_numeric(df['rating_value'], errors='coerce')
    df['outcome_value'] = pd.to_numeric(df['outcome_value'], errors='coerce')

    # Quitar filas donde la conversión falló (NaN)
    before_numeric_clean = len(df)
    df = df[df['rating_value'].notna()].copy()
    removed_numeric = before_numeric_clean - len(df)
    if removed_numeric > 0:
        logger.info(f"   Removidas {removed_numeric} filas con rating_value no numérico")

    # ========================================
    # 4. Validar rango 1-5 para rating_value
    # ========================================
    invalid_ratings = df[(df['rating_value'] < 1) | (df['rating_value'] > 5)]
    if len(invalid_ratings) > 0:
        logger.warning(f"   ⚠️  Encontradas {len(invalid_ratings)} filas con rating fuera de rango 1-5")
        logger.warning(f"       Valores únicos fuera de rango: {invalid_ratings['rating_value'].unique()}")
        df = df[(df['rating_value'] >= 1) & (df['rating_value'] <= 5)].copy()
        logger.info(f"   Removidas {len(invalid_ratings)} filas con rating fuera de rango")

    # ========================================
    # 5. Quitar filas sin outcome_value
    # ========================================
    # Para calcular correlación rating_value vs outcome_value,
    # necesitamos ambos valores presentes
    null_outcomes_before = df['outcome_value'].isnull().sum()
    df = df[df['outcome_value'].notna()].copy()
    logger.info(f"   Removidas {null_outcomes_before} filas con outcome_value NULL")
    logger.info(f"   (Necesario: ambos valores presentes para correlación)")

    # ========================================
    # 6. Resumen final
    # ========================================
    final_count = len(df)
    removed_total = original_count - final_count

    logger.info("\n📊 RESUMEN DE LIMPIEZA:")
    logger.info(f"   Observaciones originales: {original_count}")
    logger.info(f"   Observaciones limpias: {final_count}")
    logger.info(f"   Removidas: {removed_total} ({removed_total/original_count*100:.1f}%)")

    if final_count == 0:
        logger.error("❌ No quedan observaciones después de la limpieza!")
        logger.error("   Verifica que tengas datos con rating_value Y outcome_value válidos")
    else:
        logger.info("✅ Datos limpios y listos para análisis")

        # Estadísticas de los datos limpios
        logger.info("\n📈 ESTADÍSTICAS DE DATOS LIMPIOS:")
        logger.info(f"   rating_value - min: {df['rating_value'].min()}, "
                   f"max: {df['rating_value'].max()}, "
                   f"mean: {df['rating_value'].mean():.2f}")
        logger.info(f"   outcome_value - min: {df['outcome_value'].min()}, "
                   f"max: {df['outcome_value'].max()}, "
                   f"mean: {df['outcome_value'].mean():.2f}")

    return df


# ============================================================================
# 3. CÁLCULO DE CORRELACIONES
# ============================================================================

def compute_correlations(df: pd.DataFrame) -> List[Dict]:
    """
    Calcula correlaciones Pearson y Spearman por KPI.

    Para cada KPI único, calcula la correlación entre:
    - rating_value (eje X)
    - outcome_value (eje Y)

    Args:
        df: DataFrame limpio con columnas rating_value, outcome_value, kpi_name

    Returns:
        List[Dict]: Lista de resultados con formato:
            [
                {
                    "kpi_id": "uuid" o None,
                    "kpi_name": "deployment_frequency",
                    "pearson_corr": 0.38,
                    "pearson_pvalue": 0.002,
                    "spearman_corr": 0.41,
                    "spearman_pvalue": 0.001,
                    "n_observations": 62,
                    "sufficient_data": true
                },
                ...
            ]
    """
    logger.info("\n" + "=" * 80)
    logger.info("CALCULANDO CORRELACIONES POR KPI")
    logger.info("=" * 80)

    if df.empty:
        logger.error("❌ DataFrame vacío, no se pueden calcular correlaciones")
        return []

    results = []

    # Agrupar por KPI
    kpi_groups = df.groupby('kpi_name')
    total_kpis = len(kpi_groups)

    logger.info(f"\n📊 Analizando {total_kpis} KPIs únicos...\n")

    for kpi_name, group in kpi_groups:
        n_obs = len(group)

        logger.info(f"{'─' * 80}")
        logger.info(f"KPI: {kpi_name}")
        logger.info(f"   Observaciones: {n_obs}")

        # Extraer kpi_id si existe (puede ser NULL)
        kpi_id = group['kpi_id'].iloc[0] if 'kpi_id' in group.columns else None

        # ========================================
        # Validar cantidad mínima de observaciones
        # ========================================
        if n_obs < MIN_OBSERVATIONS_PER_KPI:
            logger.warning(f"   ⚠️  INSUFICIENTE: Se necesitan al menos {MIN_OBSERVATIONS_PER_KPI} observaciones")
            results.append({
                'kpi_id': str(kpi_id) if kpi_id else None,
                'kpi_name': kpi_name,
                'pearson_corr': None,
                'pearson_pvalue': None,
                'spearman_corr': None,
                'spearman_pvalue': None,
                'n_observations': n_obs,
                'sufficient_data': False,
                'warning': f'Insuficientes datos (min: {MIN_OBSERVATIONS_PER_KPI})'
            })
            continue

        # ========================================
        # Extraer variables
        # ========================================
        x = group['rating_value'].values
        y = group['outcome_value'].values

        # Validar que no haya varianza cero
        if x.std() == 0 or y.std() == 0:
            logger.warning(f"   ⚠️  Varianza cero en rating_value o outcome_value")
            results.append({
                'kpi_id': str(kpi_id) if kpi_id else None,
                'kpi_name': kpi_name,
                'pearson_corr': None,
                'pearson_pvalue': None,
                'spearman_corr': None,
                'spearman_pvalue': None,
                'n_observations': n_obs,
                'sufficient_data': True,
                'warning': 'Varianza cero (valores constantes)'
            })
            continue

        # ========================================
        # Calcular Pearson
        # ========================================
        try:
            pearson_corr, pearson_pval = stats.pearsonr(x, y)
        except Exception as e:
            logger.error(f"   ❌ Error calculando Pearson: {e}")
            pearson_corr, pearson_pval = None, None

        # ========================================
        # Calcular Spearman
        # ========================================
        try:
            spearman_corr, spearman_pval = stats.spearmanr(x, y)
        except Exception as e:
            logger.error(f"   ❌ Error calculando Spearman: {e}")
            spearman_corr, spearman_pval = None, None

        # ========================================
        # Log resultados
        # ========================================
        if pearson_corr is not None:
            logger.info(f"   ✅ Pearson:  r = {pearson_corr:+.4f}  (p = {pearson_pval:.4f})")
        if spearman_corr is not None:
            logger.info(f"   ✅ Spearman: ρ = {spearman_corr:+.4f}  (p = {spearman_pval:.4f})")

        # Interpretación simple
        if pearson_corr is not None:
            strength = (
                "muy fuerte" if abs(pearson_corr) >= 0.7 else
                "fuerte" if abs(pearson_corr) >= 0.5 else
                "moderada" if abs(pearson_corr) >= 0.3 else
                "débil"
            )
            direction = "positiva" if pearson_corr > 0 else "negativa"
            logger.info(f"   📊 Correlación {strength} {direction}")

        # ========================================
        # Guardar resultado
        # ========================================
        results.append({
            'kpi_id': str(kpi_id) if kpi_id else None,
            'kpi_name': kpi_name,
            'pearson_corr': float(pearson_corr) if pearson_corr is not None else None,
            'pearson_pvalue': float(pearson_pval) if pearson_pval is not None else None,
            'spearman_corr': float(spearman_corr) if spearman_corr is not None else None,
            'spearman_pvalue': float(spearman_pval) if spearman_pval is not None else None,
            'n_observations': int(n_obs),
            'sufficient_data': True,
            'warning': None
        })

    # ========================================
    # Resumen final
    # ========================================
    logger.info("\n" + "=" * 80)
    logger.info("RESUMEN DE CORRELACIONES")
    logger.info("=" * 80)

    valid_results = [r for r in results if r['sufficient_data'] and r['pearson_corr'] is not None]
    insufficient_results = [r for r in results if not r['sufficient_data']]

    logger.info(f"\n✅ KPIs con datos suficientes: {len(valid_results)}")
    logger.info(f"⚠️  KPIs con datos insuficientes: {len(insufficient_results)}")

    if valid_results:
        # Top 5 correlaciones positivas
        top_positive = sorted(valid_results, key=lambda x: x['pearson_corr'], reverse=True)[:5]
        logger.info("\n🔝 TOP 5 CORRELACIONES POSITIVAS (Pearson):")
        for i, r in enumerate(top_positive, 1):
            logger.info(f"   {i}. {r['kpi_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

        # Top 5 correlaciones negativas
        top_negative = sorted(valid_results, key=lambda x: x['pearson_corr'])[:5]
        if top_negative[0]['pearson_corr'] < 0:
            logger.info("\n🔻 TOP 5 CORRELACIONES NEGATIVAS (Pearson):")
            for i, r in enumerate(top_negative, 1):
                if r['pearson_corr'] < 0:
                    logger.info(f"   {i}. {r['kpi_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

    if insufficient_results:
        logger.info("\n⚠️  KPIs CON DATOS INSUFICIENTES:")
        for r in insufficient_results:
            logger.info(f"   - {r['kpi_name']}: {r['n_observations']} obs (min: {MIN_OBSERVATIONS_PER_KPI})")

    return results


# ============================================================================
# 4. EXPORTACIÓN DE RESULTADOS
# ============================================================================

def export_results(results: List[Dict]) -> None:
    """
    Exporta resultados a CSV y JSON.

    Args:
        results: Lista de diccionarios con resultados de correlaciones
    """
    logger.info("\n" + "=" * 80)
    logger.info("EXPORTANDO RESULTADOS")
    logger.info("=" * 80)

    if not results:
        logger.warning("⚠️  No hay resultados para exportar")
        return

    # Crear directorio de salida si no existe
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ========================================
    # 1. Exportar a CSV
    # ========================================
    try:
        df_results = pd.DataFrame(results)
        df_results.to_csv(CSV_OUTPUT_PATH, index=False)
        logger.info(f"✅ CSV guardado en: {CSV_OUTPUT_PATH}")
        logger.info(f"   Filas: {len(df_results)}")
        logger.info(f"   Columnas: {list(df_results.columns)}")
    except Exception as e:
        logger.error(f"❌ Error al guardar CSV: {e}")

    # ========================================
    # 2. Exportar a JSON
    # ========================================
    try:
        # Añadir metadata
        output_data = {
            'metadata': {
                'analysis_date': datetime.now().isoformat(),
                'total_kpis': len(results),
                'kpis_with_sufficient_data': len([r for r in results if r['sufficient_data']]),
                'min_observations_threshold': MIN_OBSERVATIONS_PER_KPI
            },
            'results': results
        }

        with open(JSON_OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        logger.info(f"✅ JSON guardado en: {JSON_OUTPUT_PATH}")
        logger.info(f"   Total KPIs: {len(results)}")
    except Exception as e:
        logger.error(f"❌ Error al guardar JSON: {e}")

    # ========================================
    # 3. Mostrar preview del CSV
    # ========================================
    logger.info("\n📄 PREVIEW DEL CSV (primeras 5 filas):")
    try:
        df_preview = pd.read_csv(CSV_OUTPUT_PATH)
        print(df_preview.head().to_string())
    except Exception as e:
        logger.error(f"Error al leer CSV preview: {e}")


# ============================================================================
# 5. FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """
    Función principal que ejecuta el pipeline completo de análisis de correlaciones.
    """
    logger.info("\n" + "=" * 80)
    logger.info("HRKEY - ANÁLISIS DE CORRELACIONES KPI")
    logger.info("=" * 80)
    logger.info(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Output directory: {OUTPUT_DIR}")
    logger.info(f"Min observations per KPI: {MIN_OBSERVATIONS_PER_KPI}")

    try:
        # Paso 1: Cargar datos
        df = load_data()

        if df.empty:
            logger.error("\n❌ ANÁLISIS CANCELADO: No hay datos disponibles")
            logger.error("   Verifica que:")
            logger.error("   1. La tabla kpi_observations tenga datos")
            logger.error("   2. Las credenciales de Supabase sean correctas")
            logger.error("   3. El archivo .env esté configurado correctamente")
            return 1

        # Paso 2: Limpiar datos
        df_clean = clean_data(df)

        if df_clean.empty:
            logger.error("\n❌ ANÁLISIS CANCELADO: No hay datos válidos después de limpieza")
            logger.error("   Verifica que:")
            logger.error("   1. rating_value esté entre 1-5")
            logger.error("   2. outcome_value no sea NULL")
            logger.error("   3. Los datos sean numéricos")
            return 1

        # Paso 3: Calcular correlaciones
        results = compute_correlations(df_clean)

        if not results:
            logger.error("\n❌ ANÁLISIS CANCELADO: No se pudieron calcular correlaciones")
            return 1

        # Paso 4: Exportar resultados
        export_results(results)

        # ========================================
        # Resumen final
        # ========================================
        logger.info("\n" + "=" * 80)
        logger.info("✅ ANÁLISIS COMPLETADO EXITOSAMENTE")
        logger.info("=" * 80)
        logger.info(f"\n📊 RESULTADOS:")
        logger.info(f"   Total KPIs analizados: {len(results)}")
        logger.info(f"   KPIs con datos suficientes: {len([r for r in results if r['sufficient_data']])}")
        logger.info(f"   KPIs con datos insuficientes: {len([r for r in results if not r['sufficient_data']])}")
        logger.info(f"\n📁 ARCHIVOS GENERADOS:")
        logger.info(f"   CSV: {CSV_OUTPUT_PATH}")
        logger.info(f"   JSON: {JSON_OUTPUT_PATH}")

        return 0

    except Exception as e:
        logger.error(f"\n❌ ERROR CRÍTICO: {e}", exc_info=True)
        return 1


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    sys.exit(main())
