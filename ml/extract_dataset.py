#!/usr/bin/env python3
"""
HRScore ML - Dataset Extraction from Supabase
==============================================

Extrae y construye el dataset ML basado en KPI observations reales desde Supabase.

Basado en especificación: ml/DATASET_SPEC.md

Flujo:
1. Conecta a Supabase/Postgres
2. Agrega KPI observations por (subject_wallet, role_id, kpi_name)
3. Pivotea KPIs como features
4. Join con roles y hrkey_scores (target)
5. Aplica filtros de calidad
6. Exporta dataset a CSV

Uso:
    python ml/extract_dataset.py
    python ml/extract_dataset.py --min-observations 3 --min-observers 2
    python ml/extract_dataset.py --output ml/data/dataset_custom.csv

Autor: HRKey ML Team
Fecha: 2025-12-23
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

import pandas as pd
import numpy as np
from dotenv import load_dotenv

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Directorios
ML_DIR = Path(__file__).parent
DATA_DIR = ML_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

# KPIs estándar en orden
STANDARD_KPIS = [
    'code_quality',
    'test_coverage',
    'deployment_frequency',
    'bug_resolution_time',
    'api_response_time',
    'documentation_quality'
]

# ============================================================================
# CONEXIÓN A SUPABASE
# ============================================================================

def get_supabase_client():
    """
    Crea cliente de Supabase usando credenciales del .env

    Returns:
        Cliente de supabase-py o configuración para requests

    Raises:
        ValueError: Si faltan credenciales
    """
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY')

    if not supabase_url or not supabase_key:
        raise ValueError(
            "❌ Faltan credenciales de Supabase en .env\n"
            "Necesitas definir:\n"
            "  SUPABASE_URL=https://xxx.supabase.co\n"
            "  SUPABASE_SERVICE_KEY=eyJhbGc... (o SUPABASE_ANON_KEY)"
        )

    # Intentar usar supabase-py
    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)
        logger.info("✅ Conectado a Supabase usando supabase-py")
        return {'method': 'supabase-py', 'client': client}
    except ImportError:
        logger.info("ℹ️  supabase-py no disponible, usando requests")
        return {
            'method': 'requests',
            'url': supabase_url,
            'key': supabase_key
        }


def execute_query(client_config: Dict, table: str, select: str, filters: Optional[Dict] = None) -> pd.DataFrame:
    """
    Ejecuta query en Supabase y retorna DataFrame

    Args:
        client_config: Configuración de cliente (de get_supabase_client)
        table: Nombre de la tabla
        select: Columnas a seleccionar (formato Supabase)
        filters: Filtros opcionales {columna: valor}

    Returns:
        pd.DataFrame con los resultados
    """
    if client_config['method'] == 'supabase-py':
        query = client_config['client'].table(table).select(select)

        if filters:
            for col, val in filters.items():
                query = query.eq(col, val)

        response = query.execute()
        return pd.DataFrame(response.data)

    else:
        import requests

        url = f"{client_config['url']}/rest/v1/{table}"
        headers = {
            'apikey': client_config['key'],
            'Authorization': f"Bearer {client_config['key']}",
            'Content-Type': 'application/json'
        }

        params = {'select': select}
        if filters:
            for col, val in filters.items():
                params[col] = f'eq.{val}'

        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return pd.DataFrame(response.json())


# ============================================================================
# EXTRACCIÓN DE DATOS
# ============================================================================

def extract_kpi_observations(client_config: Dict, min_observations: int = 3) -> pd.DataFrame:
    """
    Extrae y agrega KPI observations desde Supabase

    Query basada en DATASET_SPEC.md sección 2.1

    Args:
        client_config: Configuración del cliente
        min_observations: Mínimo de observaciones por KPI

    Returns:
        DataFrame agregado por (subject_wallet, role_id, kpi_name)
    """
    logger.info("="*80)
    logger.info("EXTRAYENDO KPI OBSERVATIONS")
    logger.info("="*80)

    # Query todas las observaciones
    logger.info("📊 Consultando tabla kpi_observations...")
    df = execute_query(
        client_config,
        table='kpi_observations',
        select='*'
    )

    if df.empty:
        raise ValueError(
            "❌ No hay datos en kpi_observations.\n"
            "Inserta observaciones usando: POST /api/kpi-observations"
        )

    logger.info(f"✅ Obtenidas {len(df)} observaciones")

    # Filtrar valores nulos en columnas críticas
    initial_count = len(df)
    df = df.dropna(subset=['subject_wallet', 'kpi_name', 'rating_value'])
    dropped = initial_count - len(df)

    if dropped > 0:
        logger.info(f"⚠️  Removidas {dropped} observaciones con valores NULL ({dropped/initial_count*100:.1f}%)")

    # Validar rating_value en rango [1, 5]
    df = df[(df['rating_value'] >= 1) & (df['rating_value'] <= 5)]

    logger.info(f"✅ {len(df)} observaciones válidas")

    # Agregar por (subject_wallet, subject_user_id, role_id, kpi_name)
    logger.info("\n📊 Agregando por (subject_wallet, role_id, kpi_name)...")

    agg_dict = {
        'rating_value': ['count', 'mean', 'std', 'min', 'max'],
        'outcome_value': ['mean', 'std'],
        'observer_wallet': 'nunique',
        'verified': 'sum',
        'created_at': ['min', 'max']
    }

    grouped = df.groupby(['subject_wallet', 'subject_user_id', 'role_id', 'kpi_name']).agg(agg_dict)

    # Aplanar columnas multi-index
    grouped.columns = ['_'.join(col).strip('_') for col in grouped.columns.values]
    grouped = grouped.reset_index()

    # Renombrar para claridad
    grouped = grouped.rename(columns={
        'rating_value_count': 'n_observations',
        'rating_value_mean': 'avg_rating',
        'rating_value_std': 'stddev_rating',
        'rating_value_min': 'min_rating',
        'rating_value_max': 'max_rating',
        'outcome_value_mean': 'avg_outcome',
        'outcome_value_std': 'stddev_outcome',
        'observer_wallet_nunique': 'n_observers',
        'verified_sum': 'n_verified',
        'created_at_min': 'first_observation_at',
        'created_at_max': 'last_observation_at'
    })

    # Calcular span en días
    grouped['first_observation_at'] = pd.to_datetime(grouped['first_observation_at'])
    grouped['last_observation_at'] = pd.to_datetime(grouped['last_observation_at'])
    grouped['observation_span_days'] = (
        (grouped['last_observation_at'] - grouped['first_observation_at']).dt.total_seconds() / 86400
    )

    # Calcular % verificadas
    grouped['verified_pct'] = grouped['n_verified'] / grouped['n_observations']

    # Filtrar por mínimo de observaciones
    grouped = grouped[grouped['n_observations'] >= min_observations]

    logger.info(f"✅ {len(grouped)} agregaciones (subject, role, kpi) con >= {min_observations} observaciones")

    return grouped


def pivot_kpis_as_features(df_agg: pd.DataFrame, kpis: List[str]) -> pd.DataFrame:
    """
    Pivotea KPIs como columnas de features

    Args:
        df_agg: DataFrame agregado por KPI
        kpis: Lista de KPIs estándar

    Returns:
        DataFrame pivoteado con una fila por (subject_wallet, role_id)
    """
    logger.info("="*80)
    logger.info("PIVOTEANDO KPIS COMO FEATURES")
    logger.info("="*80)

    # Preparar datos para pivot
    pivot_data = []

    for kpi in kpis:
        kpi_df = df_agg[df_agg['kpi_name'] == kpi].copy()

        if kpi_df.empty:
            logger.warning(f"⚠️  KPI '{kpi}' no tiene datos")
            continue

        # Renombrar columnas con prefijo del KPI
        rename_map = {
            'avg_rating': f'{kpi}_avg_rating',
            'n_observations': f'{kpi}_n_obs',
            'n_observers': f'{kpi}_n_observers',
            'verified_pct': f'{kpi}_verified_pct'
        }

        kpi_df = kpi_df.rename(columns=rename_map)

        # Seleccionar solo columnas necesarias
        cols = ['subject_wallet', 'subject_user_id', 'role_id'] + list(rename_map.values())
        kpi_df = kpi_df[cols]

        pivot_data.append(kpi_df)
        logger.info(f"✅ KPI '{kpi}': {len(kpi_df)} evaluaciones")

    # Merge secuencial de todos los KPIs
    logger.info("\n📊 Mergeando KPIs...")

    if not pivot_data:
        raise ValueError("❌ No hay datos de KPIs para pivotar")

    result = pivot_data[0]

    for i, kpi_df in enumerate(pivot_data[1:], start=1):
        result = result.merge(
            kpi_df,
            on=['subject_wallet', 'subject_user_id', 'role_id'],
            how='outer'
        )
        logger.info(f"   Merged {i+1}/{len(pivot_data)} KPIs - shape: {result.shape}")

    logger.info(f"✅ Dataset pivoteado: {result.shape}")

    return result


def add_metadata_features(df_pivot: pd.DataFrame, df_agg: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega features de metadata agregada

    Args:
        df_pivot: DataFrame pivoteado
        df_agg: DataFrame agregado original

    Returns:
        DataFrame con metadata features añadidas
    """
    logger.info("="*80)
    logger.info("AGREGANDO METADATA FEATURES")
    logger.info("="*80)

    # Calcular metadata por (subject_wallet, role_id)
    metadata = df_agg.groupby(['subject_wallet', 'subject_user_id', 'role_id']).agg({
        'n_observations': 'sum',
        'n_observers': 'max',  # Máximo de observadores en cualquier KPI
        'verified_pct': 'mean',
        'observation_span_days': 'max',
        'kpi_name': 'nunique'
    }).reset_index()

    metadata = metadata.rename(columns={
        'n_observations': 'total_observations',
        'n_observers': 'total_observers',
        'verified_pct': 'verified_percentage',
        'observation_span_days': 'observation_span_days',
        'kpi_name': 'kpis_evaluated'
    })

    # Merge con dataset pivoteado
    result = df_pivot.merge(
        metadata,
        on=['subject_wallet', 'subject_user_id', 'role_id'],
        how='left'
    )

    logger.info(f"✅ Metadata agregada: {result.shape}")

    return result


def join_with_roles(df: pd.DataFrame, client_config: Dict) -> pd.DataFrame:
    """
    Join con tabla roles para obtener metadata del rol

    Args:
        df: DataFrame principal
        client_config: Configuración del cliente

    Returns:
        DataFrame con información de roles
    """
    logger.info("="*80)
    logger.info("JOIN CON ROLES")
    logger.info("="*80)

    try:
        roles = execute_query(
            client_config,
            table='roles',
            select='id,role_name,industry,seniority_level'
        )

        if roles.empty:
            logger.warning("⚠️  Tabla roles está vacía, continuando sin metadata de roles")
            return df

        # Join
        result = df.merge(
            roles,
            left_on='role_id',
            right_on='id',
            how='left'
        )

        # Remover columna id duplicada del join
        if 'id' in result.columns:
            result = result.drop(columns=['id'])

        logger.info(f"✅ Joined con {len(roles)} roles")

        # Reportar roles sin match
        null_roles = result['role_name'].isna().sum()
        if null_roles > 0:
            logger.warning(f"⚠️  {null_roles} filas sin match en tabla roles")

        return result

    except Exception as e:
        logger.warning(f"⚠️  Error al joinear con roles: {e}")
        return df


def join_with_hrscores(df: pd.DataFrame, client_config: Dict) -> pd.DataFrame:
    """
    Join con tabla hrkey_scores para obtener target (latest score)

    Args:
        df: DataFrame principal
        client_config: Configuración del cliente

    Returns:
        DataFrame con target_score
    """
    logger.info("="*80)
    logger.info("JOIN CON HRKEY_SCORES (TARGET)")
    logger.info("="*80)

    try:
        scores = execute_query(
            client_config,
            table='hrkey_scores',
            select='user_id,role_id,score,confidence,n_observations,created_at'
        )

        if scores.empty:
            logger.warning("⚠️  Tabla hrkey_scores está vacía, no hay target disponible")
            df['target_score'] = np.nan
            return df

        # Ordenar por created_at DESC para obtener último score
        scores['created_at'] = pd.to_datetime(scores['created_at'])
        scores = scores.sort_values('created_at', ascending=False)

        # Tomar solo el último score por (user_id, role_id)
        latest_scores = scores.groupby(['user_id', 'role_id']).first().reset_index()

        latest_scores = latest_scores.rename(columns={
            'score': 'target_score',
            'confidence': 'latest_score_confidence',
            'n_observations': 'latest_score_n_obs',
            'created_at': 'latest_score_computed_at'
        })

        # Join
        result = df.merge(
            latest_scores[['user_id', 'role_id', 'target_score', 'latest_score_confidence',
                          'latest_score_n_obs', 'latest_score_computed_at']],
            left_on=['subject_user_id', 'role_id'],
            right_on=['user_id', 'role_id'],
            how='left'
        )

        # Remover columna user_id duplicada
        if 'user_id' in result.columns:
            result = result.drop(columns=['user_id'])

        logger.info(f"✅ Joined con {len(latest_scores)} scores únicos")

        # Reportar cobertura de target
        has_target = result['target_score'].notna().sum()
        total = len(result)
        logger.info(f"   Target coverage: {has_target}/{total} ({has_target/total*100:.1f}%)")

        return result

    except Exception as e:
        logger.warning(f"⚠️  Error al joinear con hrkey_scores: {e}")
        df['target_score'] = np.nan
        return df


def apply_quality_filters(
    df: pd.DataFrame,
    min_observers: int = 2,
    min_kpis_evaluated: int = 3,
    min_verified_pct: Optional[float] = None,
    min_observation_span_days: Optional[float] = None
) -> pd.DataFrame:
    """
    Aplica filtros de calidad al dataset

    Args:
        df: DataFrame a filtrar
        min_observers: Mínimo de observadores únicos
        min_kpis_evaluated: Mínimo de KPIs evaluados
        min_verified_pct: Mínimo % de observaciones verificadas (opcional)
        min_observation_span_days: Mínimo días de observación (opcional)

    Returns:
        DataFrame filtrado
    """
    logger.info("="*80)
    logger.info("APLICANDO FILTROS DE CALIDAD")
    logger.info("="*80)

    initial_count = len(df)

    # Filtro: mínimo de observadores
    df = df[df['total_observers'] >= min_observers]
    logger.info(f"✅ Filtro total_observers >= {min_observers}: {len(df)} filas ({len(df)/initial_count*100:.1f}%)")

    # Filtro: mínimo de KPIs evaluados
    df = df[df['kpis_evaluated'] >= min_kpis_evaluated]
    logger.info(f"✅ Filtro kpis_evaluated >= {min_kpis_evaluated}: {len(df)} filas ({len(df)/initial_count*100:.1f}%)")

    # Filtro opcional: % verificadas
    if min_verified_pct is not None:
        df = df[df['verified_percentage'] >= min_verified_pct]
        logger.info(f"✅ Filtro verified_percentage >= {min_verified_pct}: {len(df)} filas ({len(df)/initial_count*100:.1f}%)")

    # Filtro opcional: span de días
    if min_observation_span_days is not None:
        df = df[df['observation_span_days'] >= min_observation_span_days]
        logger.info(f"✅ Filtro observation_span_days >= {min_observation_span_days}: {len(df)} filas ({len(df)/initial_count*100:.1f}%)")

    logger.info(f"\n✅ Dataset final después de filtros: {len(df)} filas (conservadas {len(df)/initial_count*100:.1f}%)")

    if df.empty:
        raise ValueError(
            "❌ Dataset vacío después de aplicar filtros de calidad.\n"
            "Considera reducir los thresholds o insertar más observaciones."
        )

    return df


# ============================================================================
# EXPORTACIÓN
# ============================================================================

def export_dataset(
    df: pd.DataFrame,
    output_path: Path,
    metadata: Dict
):
    """
    Exporta dataset a CSV con metadata

    Args:
        df: DataFrame a exportar
        output_path: Path del archivo CSV
        metadata: Diccionario con metadata de la extracción
    """
    logger.info("="*80)
    logger.info("EXPORTANDO DATASET")
    logger.info("="*80)

    # Guardar CSV
    df.to_csv(output_path, index=False)
    logger.info(f"✅ Dataset guardado: {output_path}")
    logger.info(f"   Shape: {df.shape}")
    logger.info(f"   Size: {output_path.stat().st_size / 1024:.1f} KB")

    # Guardar metadata como JSON
    metadata_path = output_path.with_suffix('.json')

    metadata_full = {
        **metadata,
        'extraction_date': datetime.now().isoformat(),
        'dataset_path': str(output_path),
        'shape': {'rows': len(df), 'columns': len(df.columns)},
        'columns': list(df.columns),
        'missing_values': df.isna().sum().to_dict(),
        'dtypes': df.dtypes.astype(str).to_dict()
    }

    with open(metadata_path, 'w') as f:
        json.dump(metadata_full, f, indent=2, default=str)

    logger.info(f"✅ Metadata guardada: {metadata_path}")

    # Estadísticas descriptivas
    logger.info("\n📊 ESTADÍSTICAS DEL DATASET:")
    logger.info(f"   Total filas: {len(df)}")
    logger.info(f"   Total columnas: {len(df.columns)}")

    if 'target_score' in df.columns:
        target_stats = df['target_score'].describe()
        logger.info(f"\n   Target (target_score):")
        logger.info(f"      Count:  {target_stats['count']:.0f}")
        logger.info(f"      Mean:   {target_stats['mean']:.2f}")
        logger.info(f"      Std:    {target_stats['std']:.2f}")
        logger.info(f"      Min:    {target_stats['min']:.2f}")
        logger.info(f"      Max:    {target_stats['max']:.2f}")
        logger.info(f"      Missing: {df['target_score'].isna().sum()} ({df['target_score'].isna().sum()/len(df)*100:.1f}%)")


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Extrae dataset ML desde Supabase basado en KPI observations',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path del archivo CSV de salida (default: ml/data/hrscore_dataset_YYYYMMDD_HHMMSS.csv)'
    )

    parser.add_argument(
        '--min-observations',
        type=int,
        default=3,
        help='Mínimo de observaciones por KPI (default: 3)'
    )

    parser.add_argument(
        '--min-observers',
        type=int,
        default=2,
        help='Mínimo de observadores únicos (default: 2)'
    )

    parser.add_argument(
        '--min-kpis-evaluated',
        type=int,
        default=3,
        help='Mínimo de KPIs evaluados (default: 3)'
    )

    parser.add_argument(
        '--min-verified-pct',
        type=float,
        default=None,
        help='Mínimo %% de observaciones verificadas (opcional)'
    )

    parser.add_argument(
        '--min-observation-span-days',
        type=float,
        default=None,
        help='Mínimo días entre primera y última observación (opcional)'
    )

    args = parser.parse_args()

    # Determinar output path
    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = DATA_DIR / f'hrscore_dataset_{timestamp}.csv'

    # Header
    print("\n" + "="*80)
    print("HRSCORE ML - DATASET EXTRACTION")
    print("="*80)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Output: {output_path}")
    print(f"\nFiltros de calidad:")
    print(f"  min_observations: {args.min_observations}")
    print(f"  min_observers: {args.min_observers}")
    print(f"  min_kpis_evaluated: {args.min_kpis_evaluated}")
    if args.min_verified_pct:
        print(f"  min_verified_pct: {args.min_verified_pct}")
    if args.min_observation_span_days:
        print(f"  min_observation_span_days: {args.min_observation_span_days}")
    print("")

    try:
        # 1. Conectar a Supabase
        client_config = get_supabase_client()

        # 2. Extraer KPI observations
        df_agg = extract_kpi_observations(client_config, args.min_observations)

        # 3. Pivotar KPIs como features
        df_pivot = pivot_kpis_as_features(df_agg, STANDARD_KPIS)

        # 4. Agregar metadata features
        df_with_metadata = add_metadata_features(df_pivot, df_agg)

        # 5. Join con roles
        df_with_roles = join_with_roles(df_with_metadata, client_config)

        # 6. Join con hrkey_scores (target)
        df_with_target = join_with_hrscores(df_with_roles, client_config)

        # 7. Aplicar filtros de calidad
        df_final = apply_quality_filters(
            df_with_target,
            min_observers=args.min_observers,
            min_kpis_evaluated=args.min_kpis_evaluated,
            min_verified_pct=args.min_verified_pct,
            min_observation_span_days=args.min_observation_span_days
        )

        # 8. Exportar
        metadata = {
            'min_observations': args.min_observations,
            'min_observers': args.min_observers,
            'min_kpis_evaluated': args.min_kpis_evaluated,
            'min_verified_pct': args.min_verified_pct,
            'min_observation_span_days': args.min_observation_span_days,
            'standard_kpis': STANDARD_KPIS
        }

        export_dataset(df_final, output_path, metadata)

        # Éxito
        logger.info("\n" + "="*80)
        logger.info("✅ EXTRACCIÓN COMPLETADA")
        logger.info("="*80)
        logger.info(f"\n📁 Archivos generados:")
        logger.info(f"   Dataset: {output_path}")
        logger.info(f"   Metadata: {output_path.with_suffix('.json')}")
        logger.info(f"\n🎯 Próximo paso:")
        logger.info(f"   python ml/train_hrscore.py --dataset {output_path}")

    except ValueError as e:
        logger.error(f"\n❌ ERROR DE VALIDACIÓN: {e}")
        sys.exit(1)

    except Exception as e:
        logger.error(f"\n❌ ERROR INESPERADO: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
