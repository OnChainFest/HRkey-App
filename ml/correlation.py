#!/usr/bin/env python3
"""
HRKey - Proof of Correlation MVP (Simplified)
==============================================

Script simplificado para el MVP del Proof of Correlation.
Solo usa dos tablas: user_kpis y user_outcomes.
NO depende de la tabla users.

Flujo:
1. Cargar datos de user_kpis y user_outcomes
2. Hacer merge por user_id
3. Calcular correlaciones entre KPIs y outcomes
4. Exportar resultados

Autor: HRKey Data Team
Fecha: 2025-11-22 (Simplificado)
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import Dict, List

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

# ============================================================================
# CONSTANTES
# ============================================================================

# Tablas de Supabase
TABLE_KPIS = "user_kpis"
TABLE_OUTCOMES = "user_outcomes"

# Columnas de KPIs (ajusta según tu schema real)
KPI_COLS = [
    "deployment_frequency",
    "code_quality",
    "api_response_time",
    "error_rate",
    "test_coverage",
    "lead_time",
    "mttr",
    "customer_satisfaction"
]

# Columna de outcome
OUTCOME_COL = "performance_outcome"

# Configuración de análisis
MIN_OBSERVATIONS_PER_KPI = 10
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

# ============================================================================
# CONEXIÓN A SUPABASE
# ============================================================================

def get_supabase_connection():
    """
    Obtiene la conexión a Supabase.

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


def fetch_table(table_name: str) -> pd.DataFrame:
    """
    Carga una tabla completa desde Supabase.

    Args:
        table_name: Nombre de la tabla (user_kpis o user_outcomes)

    Returns:
        pd.DataFrame: DataFrame con todos los datos de la tabla
    """
    logger.info(f"📥 Cargando tabla: {table_name}")

    conn_config = get_supabase_connection()

    # Opción 1: Usar supabase-py
    if conn_config['method'] == 'supabase-py':
        client = conn_config['client']
        try:
            response = client.table(table_name).select('*').execute()
            data = response.data

            if not data:
                logger.warning(f"⚠️  Tabla {table_name} está vacía")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} filas de {table_name}")
            return df

        except Exception as e:
            logger.error(f"❌ Error al cargar {table_name}: {e}")
            raise

    # Opción 2: Usar requests directo (fallback)
    else:
        import requests

        url = f"{conn_config['url']}/rest/v1/{table_name}"
        headers = {
            'apikey': conn_config['key'],
            'Authorization': f"Bearer {conn_config['key']}",
            'Content-Type': 'application/json'
        }

        try:
            response = requests.get(url, headers=headers, params={'select': '*'})
            response.raise_for_status()
            data = response.json()

            if not data:
                logger.warning(f"⚠️  Tabla {table_name} está vacía")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} filas de {table_name}")
            return df

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Error al cargar {table_name}: {e}")
            raise


# ============================================================================
# CONSTRUCCIÓN DEL DATASET
# ============================================================================

def build_dataset() -> pd.DataFrame:
    """
    Crea un DataFrame donde cada fila es un usuario con:
      - KPIs (user_kpis)
      - outcome de desempeño (user_outcomes)

    Returns:
        pd.DataFrame: Dataset limpio con user_id, KPIs y outcome
    """
    logger.info("\n" + "=" * 80)
    logger.info("CONSTRUYENDO DATASET")
    logger.info("=" * 80)

    # Cargar tablas
    kpis = fetch_table(TABLE_KPIS)
    outcomes = fetch_table(TABLE_OUTCOMES)

    if kpis.empty or outcomes.empty:
        raise RuntimeError(
            "Alguna de las tablas user_kpis / user_outcomes está vacía. "
            f"Verifica que ya tengas datos en {TABLE_KPIS} y {TABLE_OUTCOMES}."
        )

    # Ambas tablas deben tener 'user_id'
    for df, name in [(kpis, TABLE_KPIS), (outcomes, TABLE_OUTCOMES)]:
        if "user_id" not in df.columns:
            raise RuntimeError(f"Falta la columna 'user_id' en {name}.")

    # Merge básico solo entre KPIs y outcomes
    logger.info(f"\n🔗 Haciendo merge de {TABLE_KPIS} y {TABLE_OUTCOMES} por user_id...")
    df = kpis.merge(outcomes, on="user_id", suffixes=("_kpi", "_outcome"))
    logger.info(f"   Filas después del merge: {len(df)}")

    # Filtrar solo columnas relevantes
    cols_to_keep = ["user_id"]

    # Agregar columnas de KPIs que existan
    for kpi in KPI_COLS:
        if kpi in df.columns:
            cols_to_keep.append(kpi)
        else:
            logger.warning(f"   ⚠️  KPI '{kpi}' no encontrado en el dataset")

    # Verificar que exista la columna de outcome
    if OUTCOME_COL not in df.columns:
        raise RuntimeError(
            f"No se encontró la columna de outcome '{OUTCOME_COL}' en la tabla {TABLE_OUTCOMES}."
        )
    cols_to_keep.append(OUTCOME_COL)

    df = df[cols_to_keep].copy()

    # Limpieza básica
    logger.info("\n🧹 Limpiando datos...")

    # Quitar filas sin outcome
    original_count = len(df)
    df = df.dropna(subset=[OUTCOME_COL])
    removed_outcome = original_count - len(df)
    if removed_outcome > 0:
        logger.info(f"   Removidas {removed_outcome} filas sin outcome")

    # Quitar filas donde TODOS los KPIs son NULL
    kpi_cols_present = [c for c in KPI_COLS if c in df.columns]
    original_count = len(df)
    df = df.dropna(subset=kpi_cols_present, how="all")
    removed_kpis = original_count - len(df)
    if removed_kpis > 0:
        logger.info(f"   Removidas {removed_kpis} filas sin ningún KPI")

    logger.info(f"\n🧮 Dataset final: {df.shape[0]} filas x {df.shape[1]} columnas.")
    logger.info(f"   Columnas: {list(df.columns)}")
    logger.info(f"   KPIs disponibles: {kpi_cols_present}")

    return df


# ============================================================================
# CÁLCULO DE CORRELACIONES
# ============================================================================

def compute_correlations(df: pd.DataFrame) -> List[Dict]:
    """
    Calcula correlaciones entre cada KPI y el outcome.

    Args:
        df: DataFrame con columnas de KPIs y OUTCOME_COL

    Returns:
        List[Dict]: Lista de resultados con correlaciones por KPI
    """
    logger.info("\n" + "=" * 80)
    logger.info("CALCULANDO CORRELACIONES")
    logger.info("=" * 80)

    if df.empty:
        logger.error("❌ DataFrame vacío, no se pueden calcular correlaciones")
        return []

    results = []
    kpi_cols_present = [c for c in KPI_COLS if c in df.columns]

    logger.info(f"\n📊 Analizando {len(kpi_cols_present)} KPIs...\n")

    for kpi_name in kpi_cols_present:
        logger.info(f"{'─' * 80}")
        logger.info(f"KPI: {kpi_name}")

        # Extraer datos válidos (sin NaN)
        valid_data = df[[kpi_name, OUTCOME_COL]].dropna()
        n_obs = len(valid_data)

        logger.info(f"   Observaciones válidas: {n_obs}")

        # Validar cantidad mínima
        if n_obs < MIN_OBSERVATIONS_PER_KPI:
            logger.warning(f"   ⚠️  INSUFICIENTE: Se necesitan al menos {MIN_OBSERVATIONS_PER_KPI}")
            results.append({
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

        # Extraer arrays
        x = valid_data[kpi_name].values
        y = valid_data[OUTCOME_COL].values

        # Validar varianza
        if x.std() == 0 or y.std() == 0:
            logger.warning(f"   ⚠️  Varianza cero")
            results.append({
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

        # Calcular Pearson
        try:
            pearson_corr, pearson_pval = stats.pearsonr(x, y)
        except Exception as e:
            logger.error(f"   ❌ Error calculando Pearson: {e}")
            pearson_corr, pearson_pval = None, None

        # Calcular Spearman
        try:
            spearman_corr, spearman_pval = stats.spearmanr(x, y)
        except Exception as e:
            logger.error(f"   ❌ Error calculando Spearman: {e}")
            spearman_corr, spearman_pval = None, None

        # Log resultados
        if pearson_corr is not None:
            logger.info(f"   ✅ Pearson:  r = {pearson_corr:+.4f}  (p = {pearson_pval:.4f})")
        if spearman_corr is not None:
            logger.info(f"   ✅ Spearman: ρ = {spearman_corr:+.4f}  (p = {spearman_pval:.4f})")

        # Interpretación
        if pearson_corr is not None:
            strength = (
                "muy fuerte" if abs(pearson_corr) >= 0.7 else
                "fuerte" if abs(pearson_corr) >= 0.5 else
                "moderada" if abs(pearson_corr) >= 0.3 else
                "débil"
            )
            direction = "positiva" if pearson_corr > 0 else "negativa"
            logger.info(f"   📊 Correlación {strength} {direction}")

        # Guardar resultado
        results.append({
            'kpi_name': kpi_name,
            'pearson_corr': float(pearson_corr) if pearson_corr is not None else None,
            'pearson_pvalue': float(pearson_pval) if pearson_pval is not None else None,
            'spearman_corr': float(spearman_corr) if spearman_corr is not None else None,
            'spearman_pvalue': float(spearman_pval) if spearman_pval is not None else None,
            'n_observations': int(n_obs),
            'sufficient_data': True,
            'warning': None
        })

    # Resumen
    logger.info("\n" + "=" * 80)
    logger.info("RESUMEN DE CORRELACIONES")
    logger.info("=" * 80)

    valid_results = [r for r in results if r['sufficient_data'] and r['pearson_corr'] is not None]
    insufficient_results = [r for r in results if not r['sufficient_data']]

    logger.info(f"\n✅ KPIs con datos suficientes: {len(valid_results)}")
    logger.info(f"⚠️  KPIs con datos insuficientes: {len(insufficient_results)}")

    if valid_results:
        # Top 5 positivas
        top_positive = sorted(valid_results, key=lambda x: x['pearson_corr'], reverse=True)[:5]
        logger.info("\n🔝 TOP 5 CORRELACIONES POSITIVAS:")
        for i, r in enumerate(top_positive, 1):
            logger.info(f"   {i}. {r['kpi_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

        # Top 5 negativas
        top_negative = sorted(valid_results, key=lambda x: x['pearson_corr'])[:5]
        if top_negative[0]['pearson_corr'] < 0:
            logger.info("\n🔻 TOP 5 CORRELACIONES NEGATIVAS:")
            for i, r in enumerate(top_negative, 1):
                if r['pearson_corr'] < 0:
                    logger.info(f"   {i}. {r['kpi_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

    return results


# ============================================================================
# EXPORTACIÓN
# ============================================================================

def export_results(results: List[Dict]) -> None:
    """
    Exporta resultados a CSV y JSON.

    Args:
        results: Lista de resultados de correlaciones
    """
    logger.info("\n" + "=" * 80)
    logger.info("EXPORTANDO RESULTADOS")
    logger.info("=" * 80)

    if not results:
        logger.warning("⚠️  No hay resultados para exportar")
        return

    # Crear directorio de salida
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    csv_path = os.path.join(OUTPUT_DIR, 'kpi_correlations_mvp.csv')
    json_path = os.path.join(OUTPUT_DIR, 'kpi_correlations_mvp.json')

    # Exportar CSV
    try:
        df_results = pd.DataFrame(results)
        df_results.to_csv(csv_path, index=False)
        logger.info(f"✅ CSV guardado en: {csv_path}")
    except Exception as e:
        logger.error(f"❌ Error al guardar CSV: {e}")

    # Exportar JSON
    try:
        output_data = {
            'metadata': {
                'analysis_date': datetime.now().isoformat(),
                'total_kpis': len(results),
                'kpis_with_sufficient_data': len([r for r in results if r['sufficient_data']]),
                'min_observations_threshold': MIN_OBSERVATIONS_PER_KPI,
                'tables_used': [TABLE_KPIS, TABLE_OUTCOMES],
                'outcome_column': OUTCOME_COL
            },
            'results': results
        }

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        logger.info(f"✅ JSON guardado en: {json_path}")
    except Exception as e:
        logger.error(f"❌ Error al guardar JSON: {e}")


# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """
    Pipeline completo de análisis de correlaciones (MVP simplificado).
    """
    logger.info("\n" + "=" * 80)
    logger.info("HRKEY - PROOF OF CORRELATION MVP (SIMPLIFICADO)")
    logger.info("=" * 80)
    logger.info(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Tablas: {TABLE_KPIS}, {TABLE_OUTCOMES}")
    logger.info(f"Output: {OUTPUT_DIR}")

    try:
        # Paso 1: Construir dataset
        df = build_dataset()

        if df.empty:
            logger.error("\n❌ ANÁLISIS CANCELADO: No hay datos válidos")
            logger.error("   Verifica que:")
            logger.error(f"   1. La tabla {TABLE_KPIS} tenga datos")
            logger.error(f"   2. La tabla {TABLE_OUTCOMES} tenga datos")
            logger.error("   3. Ambas tablas tengan la columna 'user_id'")
            logger.error(f"   4. La tabla {TABLE_OUTCOMES} tenga la columna '{OUTCOME_COL}'")
            return 1

        # Paso 2: Calcular correlaciones
        results = compute_correlations(df)

        if not results:
            logger.error("\n❌ ANÁLISIS CANCELADO: No se pudieron calcular correlaciones")
            return 1

        # Paso 3: Exportar resultados
        export_results(results)

        # Resumen final
        logger.info("\n" + "=" * 80)
        logger.info("✅ ANÁLISIS COMPLETADO EXITOSAMENTE")
        logger.info("=" * 80)
        logger.info(f"\n📊 RESULTADOS:")
        logger.info(f"   Total KPIs analizados: {len(results)}")
        logger.info(f"   KPIs con datos suficientes: {len([r for r in results if r['sufficient_data']])}")
        logger.info(f"\n📁 ARCHIVOS GENERADOS:")
        logger.info(f"   CSV: ml/output/kpi_correlations_mvp.csv")
        logger.info(f"   JSON: ml/output/kpi_correlations_mvp.json")

        return 0

    except Exception as e:
        logger.error(f"\n❌ ERROR CRÍTICO: {e}", exc_info=True)
        return 1


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    sys.exit(main())
