# HRKey - ML Correlation Analysis

## 📊 Overview

Este módulo analiza correlaciones entre **ratings de KPIs** (1-5) y **outcomes medibles** (resultados cuantificables) para el **Proof of Correlation MVP**.

El análisis calcula correlaciones de Pearson y Spearman por cada KPI único, validando que haya suficientes datos para conclusiones estadísticamente significativas.

---

## 📁 Estructura

```
ml/
├── correlation_analysis.py   # Script principal de análisis
├── requirements.txt           # Dependencias Python
├── README.md                  # Esta documentación
├── .env.example              # Template de variables de entorno
└── output/                    # Directorio de resultados (auto-creado)
    ├── kpi_correlations.csv   # Resultados en formato CSV
    └── kpi_correlations.json  # Resultados en formato JSON
```

---

## 🔧 Instalación

### 1. Crear entorno virtual (recomendado)

```bash
cd ml
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

Dependencias principales:
- `pandas` - Manipulación de DataFrames
- `numpy` - Operaciones numéricas
- `scipy` - Cálculos estadísticos (correlaciones)
- `supabase` - Cliente oficial de Supabase (opcional)
- `requests` - HTTP requests (fallback)
- `python-dotenv` - Variables de entorno

---

## ⚙️ Configuración

### 1. Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (o en `ml/`):

```bash
# .env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
```

**IMPORTANTE:**
- Usa tu **SUPABASE_URL** real (formato: `https://xxx.supabase.co`)
- Usa tu **SERVICE_ROLE_KEY** (no la anon key)
- Encuentra estas credenciales en: Supabase Dashboard → Settings → API

### 2. Verificar datos en Supabase

El script espera que la tabla `kpi_observations` exista y tenga columnas:

```sql
-- Columnas requeridas:
- subject_wallet (TEXT)
- observer_wallet (TEXT)
- role_id (UUID)
- kpi_id (UUID, puede ser NULL)
- kpi_name (TEXT)
- rating_value (NUMERIC 1-5)
- outcome_value (NUMERIC, no NULL)
- observed_at (TIMESTAMPTZ)
```

Para verificar que tienes datos:

```sql
SELECT COUNT(*) FROM kpi_observations WHERE outcome_value IS NOT NULL;
```

---

## 🚀 Uso

### Ejecución básica

```bash
cd ml
python correlation_analysis.py
```

### Ejecución con logging detallado

```bash
python correlation_analysis.py 2>&1 | tee analysis.log
```

---

## 📊 Output Esperado

### 1. **Console Output**

```
================================================================================
HRKEY - ANÁLISIS DE CORRELACIONES KPI
================================================================================
Fecha: 2024-11-22 10:30:45
Output directory: /path/to/ml/output
Min observations per KPI: 10

================================================================================
CARGANDO DATOS DESDE SUPABASE
================================================================================
✅ Conectado a Supabase usando supabase-py
✅ Cargadas 245 observaciones desde Supabase

📊 INFORMACIÓN DEL DATASET:
   Shape: (245, 15)
   Columnas: ['id', 'subject_wallet', 'observer_wallet', ...]

================================================================================
LIMPIANDO DATOS
================================================================================
Observaciones originales: 245
   Removidas 0 filas con rating_value NULL
   Removidas 23 filas con outcome_value NULL
✅ Datos limpios y listos para análisis

📊 RESUMEN DE LIMPIEZA:
   Observaciones originales: 245
   Observaciones limpias: 222
   Removidas: 23 (9.4%)

================================================================================
CALCULANDO CORRELACIONES POR KPI
================================================================================

📊 Analizando 8 KPIs únicos...

────────────────────────────────────────────────────────────────────────────────
KPI: deployment_frequency
   Observaciones: 42
   ✅ Pearson:  r = +0.4523  (p = 0.0023)
   ✅ Spearman: ρ = +0.4891  (p = 0.0012)
   📊 Correlación moderada positiva

────────────────────────────────────────────────────────────────────────────────
KPI: code_quality
   Observaciones: 38
   ✅ Pearson:  r = +0.3214  (p = 0.0487)
   ✅ Spearman: ρ = +0.3456  (p = 0.0321)
   📊 Correlación moderada positiva

...

================================================================================
RESUMEN DE CORRELACIONES
================================================================================

✅ KPIs con datos suficientes: 6
⚠️  KPIs con datos insuficientes: 2

🔝 TOP 5 CORRELACIONES POSITIVAS (Pearson):
   1. deployment_frequency: r = +0.4523 (n = 42)
   2. code_quality: r = +0.3214 (n = 38)
   3. team_collaboration: r = +0.2987 (n = 35)
   ...

⚠️  KPIs CON DATOS INSUFICIENTES:
   - new_kpi_test: 5 obs (min: 10)
   - experimental_metric: 3 obs (min: 10)

================================================================================
EXPORTANDO RESULTADOS
================================================================================
✅ CSV guardado en: /path/to/ml/output/kpi_correlations.csv
   Filas: 8
   Columnas: ['kpi_id', 'kpi_name', 'pearson_corr', ...]

✅ JSON guardado en: /path/to/ml/output/kpi_correlations.json
   Total KPIs: 8

================================================================================
✅ ANÁLISIS COMPLETADO EXITOSAMENTE
================================================================================
```

---

### 2. **CSV Output** (`ml/output/kpi_correlations.csv`)

```csv
kpi_id,kpi_name,pearson_corr,pearson_pvalue,spearman_corr,spearman_pvalue,n_observations,sufficient_data,warning
uuid-1,deployment_frequency,0.4523,0.0023,0.4891,0.0012,42,True,
uuid-2,code_quality,0.3214,0.0487,0.3456,0.0321,38,True,
uuid-3,mttr,-0.2145,0.1234,0.1987,0.1567,28,True,
,new_kpi_test,,,,,5,False,Insuficientes datos (min: 10)
...
```

**Columnas:**
- `kpi_id` - UUID del KPI (puede ser NULL)
- `kpi_name` - Nombre del KPI
- `pearson_corr` - Coeficiente de correlación de Pearson (-1 a 1)
- `pearson_pvalue` - Valor p de Pearson (significancia)
- `spearman_corr` - Coeficiente de correlación de Spearman
- `spearman_pvalue` - Valor p de Spearman
- `n_observations` - Número de observaciones
- `sufficient_data` - TRUE/FALSE (si cumple mínimo de 10 obs)
- `warning` - Mensaje de advertencia si hay problemas

---

### 3. **JSON Output** (`ml/output/kpi_correlations.json`)

```json
{
  "metadata": {
    "analysis_date": "2024-11-22T10:30:45.123456",
    "total_kpis": 8,
    "kpis_with_sufficient_data": 6,
    "min_observations_threshold": 10
  },
  "results": [
    {
      "kpi_id": "uuid-1",
      "kpi_name": "deployment_frequency",
      "pearson_corr": 0.4523,
      "pearson_pvalue": 0.0023,
      "spearman_corr": 0.4891,
      "spearman_pvalue": 0.0012,
      "n_observations": 42,
      "sufficient_data": true,
      "warning": null
    },
    {
      "kpi_id": "uuid-2",
      "kpi_name": "code_quality",
      "pearson_corr": 0.3214,
      "pearson_pvalue": 0.0487,
      "spearman_corr": 0.3456,
      "spearman_pvalue": 0.0321,
      "n_observations": 38,
      "sufficient_data": true,
      "warning": null
    },
    {
      "kpi_id": null,
      "kpi_name": "new_kpi_test",
      "pearson_corr": null,
      "pearson_pvalue": null,
      "spearman_corr": null,
      "spearman_pvalue": null,
      "n_observations": 5,
      "sufficient_data": false,
      "warning": "Insuficientes datos (min: 10)"
    }
  ]
}
```

---

## 🔍 Interpretación de Resultados

### Coeficiente de Correlación (r o ρ)

| Rango | Interpretación |
|-------|----------------|
| 0.7 a 1.0 | Correlación muy fuerte positiva |
| 0.5 a 0.7 | Correlación fuerte positiva |
| 0.3 a 0.5 | Correlación moderada positiva |
| 0.0 a 0.3 | Correlación débil positiva |
| 0.0 | Sin correlación |
| -0.3 a 0.0 | Correlación débil negativa |
| -0.5 a -0.3 | Correlación moderada negativa |
| -0.7 a -0.5 | Correlación fuerte negativa |
| -1.0 a -0.7 | Correlación muy fuerte negativa |

### P-value (significancia estadística)

- **p < 0.01** → Muy significativo (99% confianza)
- **p < 0.05** → Significativo (95% confianza)
- **p ≥ 0.05** → No significativo

### Ejemplos de interpretación:

**Ejemplo 1:**
```
deployment_frequency: r = +0.45 (p = 0.002)
```
→ Correlación **moderada positiva** y **muy significativa**. A mayor rating de deployment_frequency, mayor outcome_value. La relación es estadísticamente sólida.

**Ejemplo 2:**
```
code_quality: r = +0.32 (p = 0.048)
```
→ Correlación **moderada positiva** y **marginalmente significativa**. Hay relación, pero menos fuerte.

**Ejemplo 3:**
```
experimental_metric: r = +0.18 (p = 0.234)
```
→ Correlación **débil** y **no significativa**. No hay evidencia de relación clara.

---

## 🛠️ Troubleshooting

### Error: "SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar definidos"

**Solución:**
1. Verifica que `.env` exista en la raíz del proyecto o en `ml/`
2. Verifica que contenga:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJhbGc...
   ```
3. Reinicia el terminal después de crear `.env`

---

### Error: "No se encontraron datos en kpi_observations"

**Solución:**
1. Verifica que la tabla exista:
   ```sql
   SELECT * FROM kpi_observations LIMIT 1;
   ```
2. Verifica que tengas datos:
   ```sql
   SELECT COUNT(*) FROM kpi_observations;
   ```
3. Si no hay datos, primero inserta usando la API:
   ```bash
   curl -X POST http://localhost:3001/api/kpi-observations \
     -H "Content-Type: application/json" \
     -d '{"subject_wallet":"0xABC", "observer_wallet":"0xDEF", ...}'
   ```

---

### Warning: "Removidas N filas con outcome_value NULL"

**Causa:** Para calcular correlación entre `rating_value` y `outcome_value`, ambos deben estar presentes.

**Solución:**
- Asegúrate de incluir `outcome_value` al insertar observaciones
- Es opcional en la API, pero necesario para correlaciones

---

### Warning: "KPI con datos insuficientes (min: 10)"

**Causa:** Menos de 10 observaciones para ese KPI.

**Solución:**
- Esto es normal al inicio del proyecto
- Colecta más datos para ese KPI
- Ajusta `MIN_OBSERVATIONS_PER_KPI` en el código si quieres un umbral menor (no recomendado < 5)

---

## 📈 Próximos Pasos

### 1. Integración con Dashboard

Puedes consumir los resultados JSON desde tu frontend:

```javascript
// Cargar resultados
fetch('/ml/output/kpi_correlations.json')
  .then(res => res.json())
  .then(data => {
    const validCorrelations = data.results.filter(r => r.sufficient_data);

    // Ordenar por correlación más fuerte
    validCorrelations.sort((a, b) =>
      Math.abs(b.pearson_corr) - Math.abs(a.pearson_corr)
    );

    // Mostrar top 10
    displayTopCorrelations(validCorrelations.slice(0, 10));
  });
```

### 2. Visualizaciones

Puedes extender el script para generar gráficos:

```python
import matplotlib.pyplot as plt
import seaborn as sns

def plot_correlations(results):
    """Generar gráfico de barras de correlaciones"""
    valid = [r for r in results if r['sufficient_data']]
    df = pd.DataFrame(valid)

    plt.figure(figsize=(12, 6))
    sns.barplot(data=df, x='kpi_name', y='pearson_corr')
    plt.xticks(rotation=45, ha='right')
    plt.title('Correlaciones KPI vs Outcome')
    plt.ylabel('Pearson Correlation')
    plt.tight_layout()
    plt.savefig('ml/output/correlations_chart.png')
```

### 3. Análisis Temporal

Agregar análisis de cómo cambian las correlaciones con el tiempo:

```python
def temporal_analysis(df):
    """Analizar correlaciones por período"""
    df['month'] = pd.to_datetime(df['observed_at']).dt.to_period('M')

    for kpi in df['kpi_name'].unique():
        kpi_data = df[df['kpi_name'] == kpi]
        monthly = kpi_data.groupby('month').apply(
            lambda x: stats.pearsonr(x['rating_value'], x['outcome_value'])[0]
        )
        # Plot evolution...
```

---

## 🔬 Metodología

### Correlación de Pearson
- Mide relación **lineal** entre variables
- Sensible a outliers
- Asume distribución normal

### Correlación de Spearman
- Mide relación **monotónica** (no necesariamente lineal)
- Basada en rankings, más robusta a outliers
- No asume distribución normal

**¿Cuál usar?**
- Si ambas son similares → buena señal de correlación robusta
- Si Spearman > Pearson → posible relación no-lineal
- Si Pearson > Spearman → posible influencia de outliers

---

## 📚 Referencias

- **Scipy Stats:** https://docs.scipy.org/doc/scipy/reference/stats.html
- **Pandas:** https://pandas.pydata.org/docs/
- **Supabase Python:** https://github.com/supabase-community/supabase-py

---

## 📝 Changelog

**v1.0.0 (2024-11-22)**
- Implementación inicial
- Soporte para correlaciones Pearson y Spearman
- Validación de datos mínimos
- Exports a CSV y JSON
- Logging detallado

---

**¿Necesitas ayuda? Contacta al equipo de Data Engineering de HRKey.**
