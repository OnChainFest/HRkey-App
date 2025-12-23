# HRScore ML Pipeline - Guía de Uso Local

**Versión:** 1.0
**Fecha:** 2025-12-23
**Autor:** HRKey ML Team

---

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Requisitos](#requisitos)
3. [Configuración Inicial](#configuración-inicial)
4. [Pipeline Completo](#pipeline-completo)
5. [Uso Avanzado](#uso-avanzado)
6. [Artifacts Generados](#artifacts-generados)
7. [Troubleshooting](#troubleshooting)

---

## 📖 Descripción General

Este pipeline entrena modelos ML para predecir **HRScore** (0-100) basado en observaciones reales de KPIs.

### Componentes:

1. **`DATASET_SPEC.md`** - Especificación técnica del dataset
2. **`extract_dataset.py`** - Extracción de datos desde Supabase
3. **`train_hrscore.py`** - Entrenamiento de modelos ML
4. **`artifacts/`** - Modelos versionados + métricas + manifests

### Flujo:

```
Supabase DB (kpi_observations)
        ↓
extract_dataset.py → CSV dataset
        ↓
train_hrscore.py → Trained models
        ↓
artifacts/ (model.pkl + manifest.json + metrics.json)
```

---

## 🔧 Requisitos

### Python 3.8+

Instala las dependencias:

```bash
cd /home/user/HRkey-App

# Opción 1: pip
pip install -r ml/requirements.txt

# Opción 2: crear virtualenv (recomendado)
python3 -m venv venv
source venv/bin/activate
pip install -r ml/requirements.txt
```

### Dependencias principales:

- `pandas` - Manipulación de datos
- `numpy` - Cálculos numéricos
- `scikit-learn` - Modelos ML
- `xgboost` (opcional) - Modelo XGBoost
- `supabase-py` (opcional) - Cliente de Supabase
- `python-dotenv` - Variables de entorno
- `joblib` - Serialización de modelos

### Credenciales de Supabase

Crea/actualiza `.env` en la raíz del proyecto:

```bash
# .env
SUPABASE_URL=https://wrervcydgdrlcndtjboy.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service key (no anon key!)
# O usa SUPABASE_ANON_KEY si no tienes service key
```

**IMPORTANTE:** Nunca comitees el `.env` con credenciales reales.

---

## ⚙️ Configuración Inicial

### 1. Verificar datos en Supabase

Asegúrate de tener observaciones de KPIs en la tabla `kpi_observations`:

```bash
# Contar observaciones (requiere psql o Supabase dashboard)
# O usa el script de verificación:
python -c "
from ml.extract_dataset import get_supabase_client, execute_query
client = get_supabase_client()
df = execute_query(client, 'kpi_observations', 'id')
print(f'Total observaciones: {len(df)}')
"
```

Mínimo recomendado:
- **50+ observaciones** por KPI
- **3+ observadores** diferentes por subject
- **3+ KPIs evaluados** por subject

### 2. Crear directorios (se crean automáticamente)

```bash
mkdir -p ml/data ml/models ml/output ml/artifacts
```

---

## 🚀 Pipeline Completo

### PASO 1: Extraer Dataset

Extrae datos de Supabase y construye el dataset ML:

```bash
cd /home/user/HRkey-App

# Extracción básica (usa defaults)
python ml/extract_dataset.py

# Con filtros personalizados
python ml/extract_dataset.py \
  --min-observations 3 \
  --min-observers 2 \
  --min-kpis-evaluated 3

# Especificar output
python ml/extract_dataset.py \
  --output ml/data/dataset_custom.csv
```

**Output esperado:**
```
ml/data/hrscore_dataset_20251223_120000.csv       # Dataset
ml/data/hrscore_dataset_20251223_120000.json      # Metadata
```

**Parámetros:**

| Flag | Default | Descripción |
|------|---------|-------------|
| `--min-observations` | 3 | Mínimo de observaciones por KPI |
| `--min-observers` | 2 | Mínimo de observadores únicos |
| `--min-kpis-evaluated` | 3 | Mínimo de KPIs evaluados |
| `--min-verified-pct` | None | Mínimo % verificadas (0.0-1.0) |
| `--min-observation-span-days` | None | Mínimo días de observación |

**Verificar dataset:**

```bash
# Ver primeras filas
head -20 ml/data/hrscore_dataset_*.csv

# Contar filas
wc -l ml/data/hrscore_dataset_*.csv

# Ver metadata
cat ml/data/hrscore_dataset_*.json | jq .
```

---

### PASO 2: Entrenar Modelos

Entrena modelos ML usando el dataset extraído:

```bash
# Entrenamiento básico (usa dataset más reciente)
python ml/train_hrscore.py

# Especificar dataset
python ml/train_hrscore.py \
  --dataset ml/data/hrscore_dataset_20251223_120000.csv

# Entrenar solo modelos específicos
python ml/train_hrscore.py \
  --models ridge random_forest

# Ajustar parámetros
python ml/train_hrscore.py \
  --test-size 0.3 \
  --cv-folds 10 \
  --random-state 42

# Versión custom
python ml/train_hrscore.py \
  --version v1.0-prod
```

**Output esperado:**

```
ml/artifacts/ridge_20251223_120000/
  ├── model.pkl                 # Pipeline completo (preprocessing + modelo)
  ├── manifest.json             # Metadata completa
  ├── metrics.json              # Métricas de evaluación
  ├── feature_importance.csv    # Importancia de features
  └── README.md                 # Documentación del artifact

ml/artifacts/random_forest_20251223_120000/
  └── ...

ml/artifacts/latest_best -> ridge_20251223_120000/  # Symlink al mejor
```

**Parámetros:**

| Flag | Default | Descripción |
|------|---------|-------------|
| `--dataset` | Más reciente | Path del dataset CSV |
| `--models` | Todos | Modelos a entrenar: `ridge`, `linear`, `random_forest`, `xgboost` |
| `--test-size` | 0.2 | Proporción de test set (0.0-1.0) |
| `--cv-folds` | 5 | Número de folds para cross-validation |
| `--random-state` | 42 | Semilla para reproducibilidad |
| `--version` | Timestamp | Versión custom para artifacts |

**Modelos disponibles:**

| Modelo | Descripción | Pros | Contras |
|--------|-------------|------|---------|
| `ridge` | Regresión Ridge (L2 regularización) | Simple, interpretable, rápido | Asume linealidad |
| `linear` | Regresión lineal básica | Muy simple, baseline | Sin regularización |
| `random_forest` | Random Forest Regressor | No lineal, robusto | Menos interpretable |
| `xgboost` | XGBoost Regressor | SOTA performance | Requiere más datos, lento |

---

### PASO 3: Evaluar Resultados

#### Ver métricas del mejor modelo:

```bash
cat ml/artifacts/latest_best/metrics.json | jq .
```

**Ejemplo de output:**

```json
{
  "test": {
    "mae": 5.23,
    "rmse": 7.45,
    "r2": 0.78
  },
  "train": {
    "mae": 3.21,
    "rmse": 4.56,
    "r2": 0.89
  },
  "cv": {
    "r2_mean": 0.76,
    "r2_std": 0.05,
    "r2_scores": [0.72, 0.78, 0.75, 0.79, 0.76]
  }
}
```

**Interpretación de métricas:**

- **R² (0-1):** Proporción de varianza explicada. >0.7 = bueno, >0.8 = excelente
- **MAE:** Error absoluto medio en puntos de HRScore. <5 = bueno
- **RMSE:** Penaliza errores grandes. <8 = bueno
- **CV R² mean:** R² promedio en cross-validation (más confiable que test R²)
- **Overfitting gap:** `train R² - test R²`. <0.1 = bueno, >0.2 = overfitting

#### Ver feature importance:

```bash
head -10 ml/artifacts/latest_best/feature_importance.csv
```

**Ejemplo:**

```csv
feature,importance
code_quality_avg_rating,4.82
test_coverage_avg_rating,3.91
deployment_frequency_avg_rating,3.42
total_observations,2.15
...
```

#### Ver manifest completo:

```bash
cat ml/artifacts/latest_best/manifest.json | jq .
```

Incluye:
- Metadata del modelo (tipo, params, versión sklearn)
- Info del dataset usado
- Features y su importancia
- Métricas de performance
- Instrucciones de reproducibilidad

---

## 🔬 Uso Avanzado

### Cargar y usar modelo para predicción

```python
import joblib
import pandas as pd

# Cargar modelo
model = joblib.load('ml/artifacts/latest_best/model.pkl')

# Preparar datos (debe tener las mismas features)
X_new = pd.DataFrame({
    'code_quality_avg_rating': [4.5],
    'code_quality_n_obs': [10],
    'code_quality_n_observers': [5],
    'code_quality_verified_pct': [0.8],
    'test_coverage_avg_rating': [4.2],
    'test_coverage_n_obs': [8],
    'test_coverage_n_observers': [4],
    'test_coverage_verified_pct': [0.75],
    # ... resto de features (ver manifest.json)
})

# Predecir
predictions = model.predict(X_new)
print(f'Predicted HRScore: {predictions[0]:.2f}')
```

### Exportar modelo para Node.js (como actual)

El modelo actual en `backend/hrkeyScoreService.js` usa un JSON config. Para exportarlo:

```python
import joblib
import json
import numpy as np

# Cargar modelo
pipeline = joblib.load('ml/artifacts/latest_best/model.pkl')
regressor = pipeline.named_steps['regressor']

# Extraer coeficientes (solo para modelos lineales)
if hasattr(regressor, 'coef_'):
    # Cargar metadata de features
    with open('ml/artifacts/latest_best/manifest.json', 'r') as f:
        manifest = json.load(f)

    feature_names = manifest['features']['names']

    # Construir config
    config = {
        'model_type': type(regressor).__name__,
        'intercept': float(regressor.intercept_),
        'coefficients': dict(zip(feature_names, regressor.coef_)),
        'features': feature_names,
        'target_stats': {
            # Calcular desde datos de entrenamiento
            'min': 0.0,
            'max': 100.0,
            'mean': 70.0,
            'std': 15.0
        }
    }

    # Guardar
    with open('ml/output/hrkey_model_config_global.json', 'w') as f:
        json.dump(config, f, indent=2)
```

### Re-entrenar con más datos

Si agregaste más observaciones a Supabase:

```bash
# 1. Extraer nuevo dataset
python ml/extract_dataset.py

# 2. Re-entrenar
python ml/train_hrscore.py --version v1.1

# 3. Comparar con versión anterior
diff ml/artifacts/ridge_v1.0/metrics.json ml/artifacts/ridge_v1.1/metrics.json
```

### Entrenar modelos por rol

Si tienes suficientes datos, entrena modelos específicos por rol:

```bash
# Modificar extract_dataset.py para filtrar por role_id
# O procesar el CSV con pandas:

python -c "
import pandas as pd

df = pd.read_csv('ml/data/hrscore_dataset_latest.csv')

# Obtener roles únicos
roles = df['role_id'].unique()

for role_id in roles:
    df_role = df[df['role_id'] == role_id]
    if len(df_role) >= 50:  # Mínimo 50 muestras
        output = f'ml/data/dataset_role_{role_id}.csv'
        df_role.to_csv(output, index=False)
        print(f'Saved {output}: {len(df_role)} samples')
"

# Entrenar por rol
for dataset in ml/data/dataset_role_*.csv; do
    python ml/train_hrscore.py --dataset $dataset --version role_specific
done
```

---

## 📦 Artifacts Generados

### Estructura de directorios:

```
ml/
├── DATASET_SPEC.md               # Especificación del dataset
├── README_PIPELINE.md            # Esta guía
├── extract_dataset.py            # Script de extracción
├── train_hrscore.py              # Script de entrenamiento
├── requirements.txt              # Dependencias Python
│
├── data/                         # Datasets extraídos
│   ├── hrscore_dataset_20251223_120000.csv
│   └── hrscore_dataset_20251223_120000.json
│
├── artifacts/                    # Modelos versionados
│   ├── ridge_20251223_120000/
│   │   ├── model.pkl
│   │   ├── manifest.json
│   │   ├── metrics.json
│   │   ├── feature_importance.csv
│   │   └── README.md
│   ├── random_forest_20251223_120000/
│   │   └── ...
│   └── latest_best -> ridge_20251223_120000/  # Symlink
│
├── output/                       # Outputs legacy (backward compat)
│   ├── hrkey_model_config_global.json
│   └── baseline_metrics_global.json
│
└── models/                       # Modelos legacy
    └── ridge_global.pkl
```

### Archivos importantes:

| Archivo | Descripción |
|---------|-------------|
| `artifacts/{model}_{version}/model.pkl` | Pipeline completo (preprocessing + modelo) |
| `artifacts/{model}_{version}/manifest.json` | Metadata completa (features, params, performance) |
| `artifacts/{model}_{version}/metrics.json` | Métricas de evaluación |
| `artifacts/{model}_{version}/feature_importance.csv` | Importancia de cada feature |
| `artifacts/latest_best/` | Symlink al mejor modelo |

### Manifest schema:

```json
{
  "model": {
    "name": "ridge",
    "version": "20251223_120000",
    "type": "Ridge",
    "params": {...},
    "sklearn_version": "1.3.0"
  },
  "training": {
    "date": "2025-12-23T12:00:00",
    "dataset": {...},
    "params": {...},
    "random_state": 42
  },
  "features": {
    "names": ["code_quality_avg_rating", ...],
    "count": 29,
    "importance": {"code_quality_avg_rating": 4.82, ...}
  },
  "performance": {
    "test": {"mae": 5.23, "rmse": 7.45, "r2": 0.78},
    "train": {...},
    "cv": {...}
  },
  "target": {
    "name": "target_score",
    "description": "HRScore (0-100)",
    "range": [0, 100]
  },
  "reproducibility": {
    "instructions": "Ver ml/README_PIPELINE.md",
    "command": "python ml/train_hrscore.py --dataset ..."
  }
}
```

---

## 🐛 Troubleshooting

### Error: "No se encontraron datos en kpi_observations"

**Causa:** Tabla vacía o credenciales incorrectas.

**Solución:**
```bash
# Verificar credenciales
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY

# Insertar observaciones de prueba
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0x123...",
    "observer_wallet": "0x456...",
    "kpi_name": "code_quality",
    "rating_value": 4.5,
    "role_id": "..."
  }'
```

### Error: "Dataset demasiado pequeño"

**Causa:** No hay suficientes observaciones después de filtros.

**Solución:**
```bash
# Reducir thresholds
python ml/extract_dataset.py \
  --min-observations 2 \
  --min-observers 1 \
  --min-kpis-evaluated 2

# O insertar más datos
```

### Error: "target_score NULL"

**Causa:** No hay HRScores calculados en la tabla `hrkey_scores`.

**Solución:**
```bash
# Calcular HRScores para todos los usuarios
curl -X POST http://localhost:3001/api/hrscore/calculate \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# O entrenar sin target (unsupervised)
# Requiere modificar train_hrscore.py
```

### Error: "XGBoost no disponible"

**Causa:** Librería xgboost no instalada.

**Solución:**
```bash
# Instalar XGBoost
pip install xgboost

# O entrenar sin XGBoost
python ml/train_hrscore.py --models ridge random_forest
```

### Performance pobre (R² < 0.5)

**Causas posibles:**
1. Pocos datos de entrenamiento
2. Features no informativas
3. Target ruidoso

**Soluciones:**
```bash
# 1. Revisar distribución de datos
python -c "
import pandas as pd
df = pd.read_csv('ml/data/hrscore_dataset_latest.csv')
print(df.describe())
print(df['target_score'].hist())
"

# 2. Revisar correlaciones
python -c "
import pandas as pd
df = pd.read_csv('ml/data/hrscore_dataset_latest.csv')
kpi_cols = [c for c in df.columns if '_avg_rating' in c]
print(df[kpi_cols + ['target_score']].corr()['target_score'].sort_values())
"

# 3. Aumentar datos o mejorar features
```

### Error: "supabase-py no disponible, usando requests"

**No es error:** El script funciona con `requests` como fallback.

**Para instalar supabase-py (opcional):**
```bash
pip install supabase
```

---

## 📝 Notas Finales

### ✅ Checklist de validación:

Antes de usar el modelo en producción:

- [ ] Dataset tiene >= 100 filas
- [ ] Test R² >= 0.7
- [ ] CV R² std < 0.1 (modelo estable)
- [ ] Overfitting gap < 0.15
- [ ] Features tienen sentido (ver feature importance)
- [ ] Probado en datos nuevos (no en train/test)

### 🔄 Versionado de modelos:

Usa versiones semánticas para cambios importantes:

```bash
# v1.0 - Baseline
python ml/train_hrscore.py --version v1.0

# v1.1 - Más datos
python ml/train_hrscore.py --version v1.1

# v2.0 - Nuevas features
python ml/train_hrscore.py --version v2.0
```

### 🚫 Restricciones (según requisitos):

- ❌ **NO refactors grandes:** Scripts usan estructura existente
- ❌ **NO tocar auth middleware:** No se modifica autenticación
- ❌ **NO cambiar schema:** Se usan tablas existentes sin migrations
- ✅ **Solo comandos locales:** Todo se ejecuta en local, sin push a Git

### 🎯 Próximos pasos sugeridos:

1. **Implementar A/B testing:** Comparar modelo nuevo vs actual en producción
2. **Monitoreo de drift:** Detectar cuando datos cambian y re-entrenar
3. **Feature engineering:** Agregar features derivadas (interacciones, z-scores)
4. **Ensemble models:** Combinar predicciones de múltiples modelos
5. **Interpretabilidad:** SHAP values para explicar predicciones

---

## 📞 Soporte

Para preguntas o problemas:

1. Revisar esta guía completa
2. Verificar logs de ejecución
3. Revisar `DATASET_SPEC.md` para detalles técnicos
4. Abrir issue en el repositorio (si aplicable)

---

**Última actualización:** 2025-12-23
**Versión del pipeline:** 1.0
