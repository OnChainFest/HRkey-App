#!/usr/bin/env python3
"""
HRKey - Dashboard de Correlaciones de KPIs
==========================================

Dashboard interactivo de Streamlit para visualizar y analizar las correlaciones
entre ratings de KPIs y outcomes medibles.

Autor: HRKey Data Team
Fecha: 2025-11-22

Uso:
    streamlit run ml/dashboard_kpi_correlations.py
"""

import os
import sys
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import numpy as np
import streamlit as st
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

# Paths relativos
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'output'
CSV_PATH = OUTPUT_DIR / 'kpi_correlations.csv'
JSON_PATH = OUTPUT_DIR / 'kpi_correlations.json'

# Configuración de página de Streamlit
st.set_page_config(
    page_title="HRKey - KPI Correlations Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Tema de colores HRKey
HRKEY_PRIMARY = '#00C4C7'
HRKEY_DARK = '#0a0a0a'
HRKEY_GRAY = '#888888'

# Configurar estilo de matplotlib/seaborn
sns.set_style("darkgrid")
plt.rcParams['figure.facecolor'] = '#0a0a0a'
plt.rcParams['axes.facecolor'] = '#1a1a1a'
plt.rcParams['text.color'] = 'white'
plt.rcParams['axes.labelcolor'] = 'white'
plt.rcParams['xtick.color'] = 'white'
plt.rcParams['ytick.color'] = 'white'
plt.rcParams['grid.color'] = '#333333'


# ============================================================================
# 1. CARGA DE DATOS
# ============================================================================

@st.cache_data
def load_data(path: Optional[Path] = None) -> pd.DataFrame:
    """
    Carga los resultados de correlaciones desde CSV o JSON.

    Args:
        path: Path al archivo de datos. Si None, intenta CSV primero, luego JSON.

    Returns:
        pd.DataFrame: DataFrame con columnas kpi_id, kpi_name, role_id,
                      pearson_corr, spearman_corr, n_observations, etc.

    Raises:
        FileNotFoundError: Si no se encuentra ningún archivo de datos
    """
    # Si no se especifica path, intentar CSV primero
    if path is None:
        if CSV_PATH.exists():
            path = CSV_PATH
        elif JSON_PATH.exists():
            path = JSON_PATH
        else:
            raise FileNotFoundError(
                "No se encontró archivo de correlaciones.\n"
                f"Buscado en:\n  - {CSV_PATH}\n  - {JSON_PATH}\n\n"
                "Por favor, ejecuta primero: python ml/correlation_analysis.py"
            )

    # Cargar según extensión
    if path.suffix == '.csv':
        df = pd.read_csv(path)
    elif path.suffix == '.json':
        import json
        with open(path, 'r') as f:
            data = json.load(f)
        # El JSON tiene estructura {metadata: {...}, results: [...]}
        df = pd.DataFrame(data.get('results', []))
    else:
        raise ValueError(f"Formato no soportado: {path.suffix}")

    # Validar columnas requeridas
    required_cols = ['kpi_name', 'pearson_corr', 'spearman_corr', 'n_observations']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Columnas faltantes en el dataset: {missing_cols}")

    # Convertir tipos
    df['pearson_corr'] = pd.to_numeric(df['pearson_corr'], errors='coerce')
    df['spearman_corr'] = pd.to_numeric(df['spearman_corr'], errors='coerce')
    df['n_observations'] = pd.to_numeric(df['n_observations'], errors='coerce').fillna(0).astype(int)

    return df


def get_data_summary(df: pd.DataFrame) -> dict:
    """
    Genera un resumen de estadísticas del dataset.

    Args:
        df: DataFrame de correlaciones

    Returns:
        dict: Diccionario con métricas clave
    """
    # Contar solo KPIs con datos suficientes
    valid_df = df[df['sufficient_data'] == True] if 'sufficient_data' in df.columns else df

    summary = {
        'total_rows': len(df),
        'total_kpis': df['kpi_name'].nunique(),
        'kpis_with_data': len(valid_df),
        'kpis_without_data': len(df) - len(valid_df),
        'avg_observations': df['n_observations'].mean(),
        'total_observations': df['n_observations'].sum(),
    }

    # Agregar role_id si existe
    if 'role_id' in df.columns:
        summary['total_roles'] = df['role_id'].nunique()

    return summary


# ============================================================================
# 2. FILTRADO DE DATOS
# ============================================================================

def filter_data(
    df: pd.DataFrame,
    role_id: Optional[str] = None,
    min_n: int = 10,
    only_significant: bool = False,
    significance_threshold: float = 0.05
) -> pd.DataFrame:
    """
    Filtra el DataFrame según criterios especificados.

    Args:
        df: DataFrame original
        role_id: ID de rol a filtrar (None = todos)
        min_n: Mínimo número de observaciones
        only_significant: Si True, solo muestra correlaciones significativas
        significance_threshold: Umbral de p-value para significancia

    Returns:
        pd.DataFrame: DataFrame filtrado
    """
    filtered = df.copy()

    # Filtrar por rol si se especifica
    if role_id and role_id != "Todos los roles" and 'role_id' in filtered.columns:
        filtered = filtered[filtered['role_id'] == role_id]

    # Filtrar por mínimo de observaciones
    filtered = filtered[filtered['n_observations'] >= min_n]

    # Filtrar por significancia si se requiere
    if only_significant and 'pearson_pvalue' in filtered.columns:
        filtered = filtered[filtered['pearson_pvalue'] <= significance_threshold]

    # Quitar KPIs sin correlación válida
    filtered = filtered[filtered['pearson_corr'].notna()]

    return filtered


# ============================================================================
# 3. VISUALIZACIONES
# ============================================================================

def plot_correlations(
    df: pd.DataFrame,
    metric: str = 'pearson_corr',
    top_n: int = 20,
    title: str = "Top KPIs por Correlación"
) -> plt.Figure:
    """
    Crea un gráfico de barras de las correlaciones.

    Args:
        df: DataFrame filtrado
        metric: Columna a graficar ('pearson_corr' o 'spearman_corr')
        top_n: Número máximo de KPIs a mostrar
        title: Título del gráfico

    Returns:
        plt.Figure: Objeto Figure de matplotlib
    """
    if df.empty:
        # Crear figura vacía con mensaje
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.text(0.5, 0.5, 'No hay datos para mostrar',
                ha='center', va='center', fontsize=16, color='white')
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
        return fig

    # Ordenar por correlación absoluta y tomar top N
    df_plot = df.nlargest(top_n, metric, keep='all')

    # Truncar nombres largos de KPI
    df_plot = df_plot.copy()
    df_plot['kpi_display'] = df_plot['kpi_name'].apply(
        lambda x: x[:30] + '...' if len(str(x)) > 30 else x
    )

    # Crear figura
    fig, ax = plt.subplots(figsize=(12, max(6, len(df_plot) * 0.3)))

    # Colores según signo de correlación
    colors = [HRKEY_PRIMARY if val > 0 else '#ff6b6b' for val in df_plot[metric]]

    # Gráfico horizontal de barras
    bars = ax.barh(
        df_plot['kpi_display'],
        df_plot[metric],
        color=colors,
        alpha=0.8,
        edgecolor='white',
        linewidth=0.5
    )

    # Añadir valores en las barras
    for i, (bar, val, n) in enumerate(zip(bars, df_plot[metric], df_plot['n_observations'])):
        width = bar.get_width()
        label_x = width + (0.02 if width > 0 else -0.02)
        ha = 'left' if width > 0 else 'right'
        ax.text(
            label_x, bar.get_y() + bar.get_height()/2,
            f'{val:.3f} (n={int(n)})',
            ha=ha, va='center', fontsize=9, color='white'
        )

    # Línea vertical en x=0
    ax.axvline(x=0, color='white', linestyle='-', linewidth=0.5, alpha=0.5)

    # Configuración de ejes
    ax.set_xlabel(f'{metric.replace("_", " ").title()}', fontsize=12, color='white')
    ax.set_ylabel('KPI', fontsize=12, color='white')
    ax.set_title(title, fontsize=14, fontweight='bold', color='white', pad=20)

    # Invertir eje Y para que el más alto esté arriba
    ax.invert_yaxis()

    # Grid
    ax.grid(axis='x', alpha=0.3, linestyle='--')

    # Ajustar layout
    plt.tight_layout()

    return fig


def plot_scatter_comparison(
    df: pd.DataFrame,
    title: str = "Pearson vs Spearman"
) -> plt.Figure:
    """
    Crea un scatter plot comparando Pearson vs Spearman.

    Args:
        df: DataFrame filtrado
        title: Título del gráfico

    Returns:
        plt.Figure: Objeto Figure de matplotlib
    """
    fig, ax = plt.subplots(figsize=(10, 8))

    if df.empty:
        ax.text(0.5, 0.5, 'No hay datos para mostrar',
                ha='center', va='center', fontsize=16, color='white')
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
        return fig

    # Scatter plot
    scatter = ax.scatter(
        df['pearson_corr'],
        df['spearman_corr'],
        c=df['n_observations'],
        cmap='viridis',
        alpha=0.6,
        s=100,
        edgecolors='white',
        linewidth=0.5
    )

    # Línea diagonal (y = x)
    lims = [
        min(df['pearson_corr'].min(), df['spearman_corr'].min()) - 0.1,
        max(df['pearson_corr'].max(), df['spearman_corr'].max()) + 0.1
    ]
    ax.plot(lims, lims, 'r--', alpha=0.5, linewidth=2, label='y = x (perfect agreement)')

    # Colorbar
    cbar = plt.colorbar(scatter, ax=ax)
    cbar.set_label('Número de observaciones', color='white', fontsize=10)
    cbar.ax.yaxis.set_tick_params(color='white')
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='white')

    # Ejes
    ax.set_xlabel('Pearson Correlation', fontsize=12, color='white')
    ax.set_ylabel('Spearman Correlation', fontsize=12, color='white')
    ax.set_title(title, fontsize=14, fontweight='bold', color='white', pad=20)

    # Grid
    ax.grid(alpha=0.3, linestyle='--')

    # Legend
    ax.legend(facecolor='#1a1a1a', edgecolor='white', framealpha=0.9)

    plt.tight_layout()

    return fig


# ============================================================================
# 4. ANÁLISIS INTERPRETATIVO
# ============================================================================

def generate_insights(df: pd.DataFrame, metric: str = 'pearson_corr') -> dict:
    """
    Genera insights automáticos sobre las correlaciones.

    Args:
        df: DataFrame filtrado
        metric: Métrica a analizar

    Returns:
        dict: Diccionario con insights
    """
    if df.empty:
        return {
            'top_positive': None,
            'top_negative': None,
            'strongest_overall': None,
            'total_shown': 0
        }

    # KPI con mayor correlación positiva
    positive = df[df[metric] > 0]
    top_positive = positive.nlargest(1, metric).iloc[0] if not positive.empty else None

    # KPI con mayor correlación negativa
    negative = df[df[metric] < 0]
    top_negative = negative.nsmallest(1, metric).iloc[0] if not negative.empty else None

    # Correlación más fuerte (en valor absoluto)
    df_abs = df.copy()
    df_abs['abs_corr'] = df_abs[metric].abs()
    strongest = df_abs.nlargest(1, 'abs_corr').iloc[0] if not df_abs.empty else None

    return {
        'top_positive': top_positive,
        'top_negative': top_negative,
        'strongest_overall': strongest,
        'total_shown': len(df),
        'avg_correlation': df[metric].mean(),
        'median_correlation': df[metric].median()
    }


def display_insights(insights: dict, metric: str = 'pearson_corr'):
    """
    Muestra insights en el dashboard.

    Args:
        insights: Diccionario de insights de generate_insights()
        metric: Métrica utilizada
    """
    st.markdown("### 🔍 Insights Clave")

    if insights['total_shown'] == 0:
        st.warning("No hay KPIs que cumplan los filtros seleccionados.")
        return

    # Crear columnas para métricas
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            label="KPIs Mostrados",
            value=insights['total_shown']
        )

    with col2:
        st.metric(
            label="Correlación Promedio",
            value=f"{insights['avg_correlation']:.3f}" if not pd.isna(insights['avg_correlation']) else "N/A"
        )

    with col3:
        st.metric(
            label="Correlación Mediana",
            value=f"{insights['median_correlation']:.3f}" if not pd.isna(insights['median_correlation']) else "N/A"
        )

    # Top insights
    st.markdown("---")

    if insights['top_positive'] is not None:
        top_pos = insights['top_positive']
        st.success(
            f"**🔝 Mayor Correlación Positiva:** {top_pos['kpi_name']} "
            f"({metric}: **{top_pos[metric]:.4f}**, n={int(top_pos['n_observations'])})"
        )

        # Interpretación
        corr_val = abs(top_pos[metric])
        strength = (
            "muy fuerte" if corr_val >= 0.7 else
            "fuerte" if corr_val >= 0.5 else
            "moderada" if corr_val >= 0.3 else
            "débil"
        )
        st.info(
            f"💡 **Interpretación:** A mayor rating en '{top_pos['kpi_name']}', "
            f"mayor outcome value (correlación {strength})."
        )

    if insights['top_negative'] is not None:
        top_neg = insights['top_negative']
        st.error(
            f"**🔻 Mayor Correlación Negativa:** {top_neg['kpi_name']} "
            f"({metric}: **{top_neg[metric]:.4f}**, n={int(top_neg['n_observations'])})"
        )

        st.info(
            f"💡 **Interpretación:** A mayor rating en '{top_neg['kpi_name']}', "
            f"menor outcome value (correlación inversa)."
        )


# ============================================================================
# 5. FUNCIÓN PRINCIPAL (STREAMLIT APP)
# ============================================================================

def main():
    """
    Función principal del dashboard de Streamlit.
    """
    # ========================================
    # Header
    # ========================================
    st.title("📊 HRKey - Dashboard de Correlaciones KPI")
    st.markdown(
        "Análisis de correlaciones entre **ratings de KPIs** (1-5) y **outcomes medibles** "
        "para el Proof of Correlation MVP."
    )
    st.markdown("---")

    # ========================================
    # Cargar datos
    # ========================================
    try:
        with st.spinner("Cargando datos..."):
            df = load_data()

        # Mostrar información de carga
        data_source = "CSV" if CSV_PATH.exists() else "JSON"
        st.success(f"✅ Datos cargados exitosamente desde {data_source}")

    except FileNotFoundError as e:
        st.error(f"❌ {str(e)}")
        st.info(
            "**Pasos para solucionar:**\n\n"
            "1. Asegúrate de haber ejecutado el script de análisis:\n"
            "   ```bash\n"
            "   python ml/correlation_analysis.py\n"
            "   ```\n\n"
            "2. Verifica que exista el archivo:\n"
            f"   - `{CSV_PATH}`\n"
            f"   - o `{JSON_PATH}`"
        )
        st.stop()

    except Exception as e:
        st.error(f"❌ Error al cargar datos: {e}")
        st.stop()

    # ========================================
    # Resumen del dataset
    # ========================================
    with st.expander("📋 Resumen del Dataset", expanded=False):
        summary = get_data_summary(df)

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total KPIs", summary['total_kpis'])
        with col2:
            st.metric("KPIs válidos", summary['kpis_with_data'])
        with col3:
            st.metric("Observaciones (avg)", f"{summary['avg_observations']:.0f}")
        with col4:
            if 'total_roles' in summary:
                st.metric("Roles únicos", summary['total_roles'])

        st.dataframe(
            df[['kpi_name', 'pearson_corr', 'spearman_corr', 'n_observations', 'sufficient_data']].head(10),
            use_container_width=True
        )

    # ========================================
    # Sidebar - Filtros
    # ========================================
    st.sidebar.header("🎛️ Filtros")

    # Selector de rol (si existe columna role_id)
    selected_role = "Todos los roles"
    if 'role_id' in df.columns:
        roles = ["Todos los roles"] + sorted(df['role_id'].dropna().unique().tolist())
        selected_role = st.sidebar.selectbox(
            "Filtrar por Role ID",
            roles,
            help="Selecciona un rol específico o 'Todos los roles'"
        )

    # Slider de mínimo n
    max_n = int(df['n_observations'].max()) if not df.empty else 100
    min_n = st.sidebar.slider(
        "Mínimo de observaciones (n)",
        min_value=1,
        max_value=max_n,
        value=min(10, max_n),
        step=1,
        help="Filtrar KPIs con al menos N observaciones"
    )

    # Solo mostrar significativos
    only_significant = st.sidebar.checkbox(
        "Solo correlaciones significativas (p < 0.05)",
        value=False,
        help="Mostrar solo KPIs con correlaciones estadísticamente significativas"
    )

    # Selector de métrica para ordenar
    metric_choice = st.sidebar.radio(
        "Ordenar y graficar por",
        ["pearson_corr", "spearman_corr"],
        format_func=lambda x: "Pearson" if x == "pearson_corr" else "Spearman",
        help="Selecciona qué métrica usar para ordenar y graficar"
    )

    # Top N para gráfico
    top_n = st.sidebar.slider(
        "Top N KPIs en gráfico",
        min_value=5,
        max_value=50,
        value=20,
        step=5,
        help="Número máximo de KPIs a mostrar en el gráfico de barras"
    )

    st.sidebar.markdown("---")
    st.sidebar.markdown("### ℹ️ Sobre este Dashboard")
    st.sidebar.info(
        "Este dashboard visualiza las correlaciones calculadas por el script "
        "`ml/correlation_analysis.py`. Los datos se actualizan cada vez que "
        "ejecutas el script de análisis."
    )

    # ========================================
    # Aplicar filtros
    # ========================================
    df_filtered = filter_data(
        df,
        role_id=selected_role,
        min_n=min_n,
        only_significant=only_significant
    )

    # ========================================
    # Mostrar tabla de resultados
    # ========================================
    st.markdown("### 📊 Resultados Filtrados")

    if df_filtered.empty:
        st.warning(
            "⚠️ No hay KPIs que cumplan los filtros seleccionados. "
            "Intenta ajustar los filtros en la barra lateral."
        )
    else:
        # Ordenar por métrica seleccionada
        df_display = df_filtered.sort_values(by=metric_choice, ascending=False).reset_index(drop=True)

        # Seleccionar columnas a mostrar
        display_cols = ['kpi_name', metric_choice, 'n_observations']
        if 'role_id' in df_display.columns:
            display_cols.insert(1, 'role_id')
        if 'pearson_pvalue' in df_display.columns:
            display_cols.append('pearson_pvalue')

        # Formatear tabla
        st.dataframe(
            df_display[display_cols].style.format({
                metric_choice: "{:.4f}",
                'pearson_pvalue': "{:.4f}" if 'pearson_pvalue' in display_cols else None
            }).background_gradient(
                subset=[metric_choice],
                cmap='RdYlGn',
                vmin=-1,
                vmax=1
            ),
            use_container_width=True,
            height=400
        )

        # Botón de descarga
        csv = df_display.to_csv(index=False)
        st.download_button(
            label="📥 Descargar resultados filtrados (CSV)",
            data=csv,
            file_name="kpi_correlations_filtered.csv",
            mime="text/csv"
        )

    # ========================================
    # Gráfico de barras
    # ========================================
    st.markdown("### 📈 Visualización de Correlaciones")

    if not df_filtered.empty:
        metric_label = "Pearson" if metric_choice == "pearson_corr" else "Spearman"
        fig = plot_correlations(
            df_filtered,
            metric=metric_choice,
            top_n=top_n,
            title=f"Top {min(top_n, len(df_filtered))} KPIs - Correlación {metric_label}"
        )
        st.pyplot(fig)
        plt.close(fig)
    else:
        st.info("No hay datos para graficar con los filtros actuales.")

    # ========================================
    # Scatter plot Pearson vs Spearman
    # ========================================
    if not df_filtered.empty and len(df_filtered) >= 2:
        st.markdown("### 🔬 Comparación Pearson vs Spearman")

        with st.expander("Ver gráfico de dispersión", expanded=False):
            fig_scatter = plot_scatter_comparison(df_filtered)
            st.pyplot(fig_scatter)
            plt.close(fig_scatter)

            st.markdown(
                "**Interpretación:**\n"
                "- Puntos cerca de la línea diagonal (y = x) → Ambas métricas concuerdan\n"
                "- Puntos alejados → Posible relación no-lineal o influencia de outliers\n"
                "- Color indica número de observaciones (más claro = más observaciones)"
            )

    # ========================================
    # Insights automáticos
    # ========================================
    if not df_filtered.empty:
        st.markdown("---")
        insights = generate_insights(df_filtered, metric=metric_choice)
        display_insights(insights, metric=metric_choice)

    # ========================================
    # Footer
    # ========================================
    st.markdown("---")
    st.markdown(
        "<div style='text-align: center; color: #888888; font-size: 12px;'>"
        "HRKey - Proof of Correlation MVP | "
        f"Data source: {data_source} | "
        f"Last updated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}"
        "</div>",
        unsafe_allow_html=True
    )


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    main()
