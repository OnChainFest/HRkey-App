#!/usr/bin/env python3
"""
HRKey - Proof of Correlation MVP (Ultra Simplificado)
=====================================================

MVP mínimo que NO depende de tablas que aún no existen (user_kpis).
Solo usa tablas básicas: users, references, reference_requests

Objetivo:
- Correlacionar variables del requester con scores de referencias
- Generar advertencias si faltan datos pero NO romper
- Permitir iteración rápida sin necesidad de datos complejos

Flujo:
1. Cargar references, reference_requests, users
2. Construir dataset de correlación simple
3. Calcular correlaciones
4. Exportar resultados

Autor: HRKey Data Team
Fecha: 2025-11-23 (MVP Ultra Simple)
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

# ============================================================================
# CONSTANTES
# ============================================================================

# Tablas mínimas requeridas
TABLE_REFERENCES = "references"
TABLE_REFERENCE_REQUESTS = "reference_requests"
TABLE_USERS = "users"

# Configuración de análisis
MIN_OBSERVATIONS = 5
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
        table_name: Nombre de la tabla

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
                logger.warning(f"⚠️  Tabla {table_name} está vacía o no existe")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} filas de {table_name}")
            return df

        except Exception as e:
            logger.warning(f"⚠️  No se pudo cargar {table_name}: {e}")
            return pd.DataFrame()

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
                logger.warning(f"⚠️  Tabla {table_name} está vacía o no existe")
                return pd.DataFrame()

            df = pd.DataFrame(data)
            logger.info(f"✅ Cargadas {len(df)} filas de {table_name}")
            return df

        except requests.exceptions.RequestException as e:
            logger.warning(f"⚠️  No se pudo cargar {table_name}: {e}")
            return pd.DataFrame()


# ============================================================================
# CONSTRUCCIÓN DEL DATASET
# ============================================================================

def build_dataset() -> pd.DataFrame:
    """
    Construye un dataset simple para correlaciones MVP.

    Estrategia:
    - Cargar references (tabla principal)
    - Agregar info de reference_requests si existe
    - Agregar info de users si existe
    - Crear variables para correlación

    Returns:
        pd.DataFrame: Dataset para análisis de correlación
    """
    logger.info("\n" + "=" * 80)
    logger.info("CONSTRUYENDO DATASET MVP")
    logger.info("=" * 80)

    # Cargar tabla principal: references
    references = fetch_table(TABLE_REFERENCES)

    if references.empty:
        logger.error(f"❌ La tabla {TABLE_REFERENCES} está vacía o no existe")
        logger.error("   No se puede continuar sin datos de referencias")
        return pd.DataFrame()

    logger.info(f"\n📊 Referencias cargadas: {len(references)}")
    logger.info(f"   Columnas disponibles: {list(references.columns)}")

    # Inicializar dataset base
    df = references.copy()

    # Intentar cargar reference_requests (opcional)
    reference_requests = fetch_table(TABLE_REFERENCE_REQUESTS)
    if not reference_requests.empty:
        logger.info(f"\n✅ Reference requests cargadas: {len(reference_requests)}")

        # Merge con references si tienen columna común
        if 'request_id' in df.columns and 'id' in reference_requests.columns:
            df = df.merge(
                reference_requests,
                left_on='request_id',
                right_on='id',
                how='left',
                suffixes=('', '_request')
            )
            logger.info(f"   Merged {len(df)} referencias con requests")
        else:
            logger.warning("   ⚠️  No se pudo hacer merge: faltan columnas request_id o id")
    else:
        logger.warning(f"⚠️  Tabla {TABLE_REFERENCE_REQUESTS} no disponible (continuando sin ella)")

    # Intentar cargar users (opcional)
    users = fetch_table(TABLE_USERS)
    if not users.empty:
        logger.info(f"\n✅ Users cargados: {len(users)}")

        # Merge con users si hay user_id
        if 'user_id' in df.columns and 'id' in users.columns:
            df = df.merge(
                users,
                left_on='user_id',
                right_on='id',
                how='left',
                suffixes=('', '_user')
            )
            logger.info(f"   Merged {len(df)} referencias con users")
        else:
            logger.warning("   ⚠️  No se pudo hacer merge: faltan columnas user_id o id")
    else:
        logger.warning(f"⚠️  Tabla {TABLE_USERS} no disponible (continuando sin ella)")

    # Log del dataset final
    logger.info(f"\n🧮 Dataset construido:")
    logger.info(f"   Total filas: {len(df)}")
    logger.info(f"   Total columnas: {len(df.columns)}")
    logger.info(f"   Columnas: {list(df.columns)[:20]}")  # Primeras 20 columnas

    return df


# ============================================================================
# EXTRACCIÓN DE VARIABLES PARA CORRELACIÓN
# ============================================================================

def extract_correlation_variables(df: pd.DataFrame) -> tuple:
    """
    Extrae variables numéricas para correlación.

    Returns:
        tuple: (features_df, outcome_col_name) o (None, None) si no hay datos
    """
    logger.info("\n" + "=" * 80)
    logger.info("EXTRAYENDO VARIABLES PARA CORRELACIÓN")
    logger.info("=" * 80)

    if df.empty:
        logger.error("❌ DataFrame vacío")
        return None, None

    # Identificar columnas numéricas
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    if not numeric_cols:
        logger.error("❌ No se encontraron columnas numéricas para correlacionar")
        return None, None

    logger.info(f"\n📊 Columnas numéricas encontradas: {len(numeric_cols)}")
    logger.info(f"   {numeric_cols}")

    # Buscar columna de outcome (score o rating)
    outcome_col = None
    outcome_candidates = [
        'overall_rating',
        'rating',
        'score',
        'performance_score',
        'verification_score'
    ]

    for candidate in outcome_candidates:
        if candidate in numeric_cols:
            outcome_col = candidate
            logger.info(f"\n✅ Outcome encontrado: {outcome_col}")
            break

    if outcome_col is None:
        logger.warning("\n⚠️  No se encontró columna de outcome típica")
        logger.warning(f"   Buscadas: {outcome_candidates}")
        logger.warning(f"   Usando la primera columna numérica como outcome: {numeric_cols[0]}")
        outcome_col = numeric_cols[0]

    # Features = todas las numéricas excepto el outcome
    feature_cols = [col for col in numeric_cols if col != outcome_col]

    if not feature_cols:
        logger.error("❌ No hay features numéricas para correlacionar")
        return None, None

    logger.info(f"\n📈 Features (variables X): {len(feature_cols)}")
    logger.info(f"   {feature_cols}")
    logger.info(f"\n🎯 Outcome (variable Y): {outcome_col}")

    # Crear DataFrame de features
    features_df = df[feature_cols + [outcome_col]].copy()

    # Remover filas con NaN en outcome
    original_count = len(features_df)
    features_df = features_df.dropna(subset=[outcome_col])
    removed = original_count - len(features_df)

    if removed > 0:
        logger.warning(f"⚠️  Removidas {removed} filas sin valor en {outcome_col}")

    logger.info(f"\n🧮 Dataset final para correlación:")
    logger.info(f"   Filas: {len(features_df)}")
    logger.info(f"   Features: {len(feature_cols)}")

    return features_df, outcome_col


# ============================================================================
# CÁLCULO DE CORRELACIONES
# ============================================================================

def compute_correlations(df: pd.DataFrame, outcome_col: str) -> List[Dict]:
    """
    Calcula correlaciones entre features y outcome.

    Args:
        df: DataFrame con features y outcome
        outcome_col: Nombre de la columna outcome

    Returns:
        List[Dict]: Lista de resultados con correlaciones
    """
    logger.info("\n" + "=" * 80)
    logger.info("CALCULANDO CORRELACIONES")
    logger.info("=" * 80)

    if df.empty:
        logger.error("❌ DataFrame vacío")
        return []

    # Obtener lista de features (todas excepto outcome)
    feature_cols = [col for col in df.columns if col != outcome_col]

    logger.info(f"\n📊 Analizando {len(feature_cols)} features vs {outcome_col}\n")

    results = []

    for feature_name in feature_cols:
        logger.info(f"{'─' * 80}")
        logger.info(f"Feature: {feature_name}")

        # Extraer datos válidos (sin NaN)
        valid_data = df[[feature_name, outcome_col]].dropna()
        n_obs = len(valid_data)

        logger.info(f"   Observaciones válidas: {n_obs}")

        # Validar cantidad mínima
        if n_obs < MIN_OBSERVATIONS:
            logger.warning(f"   ⚠️  INSUFICIENTE: Se necesitan al menos {MIN_OBSERVATIONS}")
            results.append({
                'feature_name': feature_name,
                'outcome_name': outcome_col,
                'pearson_corr': None,
                'pearson_pvalue': None,
                'spearman_corr': None,
                'spearman_pvalue': None,
                'n_observations': n_obs,
                'sufficient_data': False,
                'warning': f'Insuficientes datos (min: {MIN_OBSERVATIONS})'
            })
            continue

        # Extraer arrays
        x = valid_data[feature_name].values
        y = valid_data[outcome_col].values

        # Validar varianza
        if x.std() == 0 or y.std() == 0:
            logger.warning(f"   ⚠️  Varianza cero")
            results.append({
                'feature_name': feature_name,
                'outcome_name': outcome_col,
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
            'feature_name': feature_name,
            'outcome_name': outcome_col,
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

    logger.info(f"\n✅ Features con datos suficientes: {len(valid_results)}")
    logger.info(f"⚠️  Features con datos insuficientes: {len(insufficient_results)}")

    if valid_results:
        # Top 5 positivas
        top_positive = sorted(valid_results, key=lambda x: x['pearson_corr'], reverse=True)[:5]
        logger.info("\n🔝 TOP 5 CORRELACIONES POSITIVAS:")
        for i, r in enumerate(top_positive, 1):
            logger.info(f"   {i}. {r['feature_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

        # Top 5 negativas
        top_negative = sorted(valid_results, key=lambda x: x['pearson_corr'])[:5]
        if top_negative[0]['pearson_corr'] < 0:
            logger.info("\n🔻 TOP 5 CORRELACIONES NEGATIVAS:")
            for i, r in enumerate(top_negative, 1):
                if r['pearson_corr'] < 0:
                    logger.info(f"   {i}. {r['feature_name']}: r = {r['pearson_corr']:+.4f} (n = {r['n_observations']})")

    return results


# ============================================================================
# EXPORTACIÓN
# ============================================================================

def export_results(results: List[Dict], outcome_col: str) -> None:
    """
    Exporta resultados a CSV y JSON.

    Args:
        results: Lista de resultados de correlaciones
        outcome_col: Nombre de la columna outcome usada
    """
    logger.info("\n" + "=" * 80)
    logger.info("EXPORTANDO RESULTADOS")
    logger.info("=" * 80)

    if not results:
        logger.warning("⚠️  No hay resultados para exportar")
        return

    # Crear directorio de salida
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    csv_path = os.path.join(OUTPUT_DIR, 'correlations_mvp.csv')
    json_path = os.path.join(OUTPUT_DIR, 'correlations_mvp.json')

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
                'total_features': len(results),
                'features_with_sufficient_data': len([r for r in results if r['sufficient_data']]),
                'min_observations_threshold': MIN_OBSERVATIONS,
                'tables_used': [TABLE_REFERENCES, TABLE_REFERENCE_REQUESTS, TABLE_USERS],
                'outcome_column': outcome_col
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
    Pipeline completo de análisis de correlaciones (MVP ultra simple).
    """
    logger.info("\n" + "=" * 80)
    logger.info("HRKEY - PROOF OF CORRELATION MVP (ULTRA SIMPLE)")
    logger.info("=" * 80)
    logger.info(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Tablas: {TABLE_REFERENCES} (principal)")
    logger.info(f"        {TABLE_REFERENCE_REQUESTS} (opcional)")
    logger.info(f"        {TABLE_USERS} (opcional)")
    logger.info(f"Output: {OUTPUT_DIR}")

    try:
        # Paso 1: Construir dataset
        df = build_dataset()

        if df.empty:
            logger.error("\n❌ ANÁLISIS CANCELADO: No hay datos válidos")
            logger.error(f"   Verifica que la tabla {TABLE_REFERENCES} tenga datos")
            return 1

        # Paso 2: Extraer variables para correlación
        features_df, outcome_col = extract_correlation_variables(df)

        if features_df is None or features_df.empty:
            logger.error("\n❌ ANÁLISIS CANCELADO: No se pudieron extraer variables numéricas")
            return 1

        # Paso 3: Calcular correlaciones
        results = compute_correlations(features_df, outcome_col)

        if not results:
            logger.warning("\n⚠️  No se pudieron calcular correlaciones (puede ser normal si hay pocos datos)")
            logger.warning("   Continúa agregando datos y ejecuta nuevamente")
            return 0

        # Paso 4: Exportar resultados
        export_results(results, outcome_col)

        # Resumen final
        logger.info("\n" + "=" * 80)
        logger.info("✅ ANÁLISIS COMPLETADO EXITOSAMENTE")
        logger.info("=" * 80)
        logger.info(f"\n📊 RESULTADOS:")
        logger.info(f"   Total features analizadas: {len(results)}")
        logger.info(f"   Features con datos suficientes: {len([r for r in results if r['sufficient_data']])}")
        logger.info(f"   Outcome usado: {outcome_col}")
        logger.info(f"\n📁 ARCHIVOS GENERADOS:")
        logger.info(f"   CSV: ml/output/correlations_mvp.csv")
        logger.info(f"   JSON: ml/output/correlations_mvp.json")

        return 0

    except Exception as e:
        logger.error(f"\n❌ ERROR CRÍTICO: {e}", exc_info=True)
        logger.error("\n💡 SUGERENCIAS:")
        logger.error("   1. Verifica que las variables de entorno estén configuradas (.env)")
        logger.error("   2. Verifica que la tabla 'references' exista y tenga datos")
        logger.error("   3. Verifica la conexión a Supabase")
        return 1


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    sys.exit(main())
