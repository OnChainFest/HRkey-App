# HRKey Score - ML-Powered Professional Scoring

## 📊 Overview

El **HRKey Score** es un sistema de scoring (0-100) que evalúa el desempeño profesional de una persona en un rol específico basándose en sus KPIs registrados.

Utiliza un modelo de **Ridge Regression** entrenado en Python que se exporta a JSON para inferencia rápida desde Node.js, eliminando la necesidad de ejecutar Python en producción.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ENTRENAMIENTO (Offline - Python)                        │
│                                                              │
│   ml/baseline_predictive_model.py                           │
│   ├─ Carga observaciones desde kpi_observations            │
│   ├─ Construye dataset (subject, role) → KPIs              │
│   ├─ Entrena Ridge Regression                              │
│   └─ Exporta modelo (.pkl)                                 │
│                                                              │
│   ml/export_hrkey_model_config.py                           │
│   ├─ Carga modelo .pkl                                      │
│   ├─ Extrae coeficientes, features, estadísticas           │
│   └─ Exporta a JSON                                         │
│                                                              │
│   Output: ml/output/hrkey_model_config_global.json          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. INFERENCIA (Online - Node.js)                           │
│                                                              │
│   backend/hrkeyScoreService.js                              │
│   ├─ Carga configuración desde JSON                        │
│   ├─ Consulta KPIs del sujeto desde BD                     │
│   ├─ Construye vector de features                          │
│   ├─ Calcula: y = intercept + Σ(coef_i * x_i)             │
│   ├─ Normaliza a 0-100                                      │
│   └─ Calcula confianza                                      │
│                                                              │
│   backend/server.js                                          │
│   └─ POST /api/hrkey-score                                  │
│                                                              │
│   Response: { score: 78.45, confidence: 0.89, ... }         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Setup y Uso

### Paso 1: Entrenar el Modelo (Offline)

```bash
# 1. Asegúrate de tener datos en kpi_observations
# (puedes insertar usando POST /api/kpi-observations)

# 2. Entrenar modelo baseline
cd ml
python baseline_predictive_model.py

# Output:
#   ml/models/ridge_global.pkl
#   ml/output/baseline_metrics_global.json
#   ml/output/kpi_feature_importance_global.csv
```

### Paso 2: Exportar Configuración a JSON

```bash
# Exportar modelo a JSON para el backend
python ml/export_hrkey_model_config.py

# Output:
#   ml/output/hrkey_model_config_global.json
```

Este archivo contiene:
- Coeficientes del modelo
- Intercept
- Lista de features (KPIs) en orden
- Estadísticas del target (min, max, mean, std)
- Métricas de evaluación (MAE, RMSE, R²)

### Paso 3: Levantar el Backend

```bash
cd backend
npm start

# El servidor cargará automáticamente el modelo al arrancar
# ✅ Configuración del modelo HRKey cargada:
#    Model type: ridge
#    Role scope: global
#    Features: 8
#    R²: 0.7456
```

### Paso 4: Calcular Score vía API

```bash
# Calcular HRKey Score para un sujeto+rol
curl -X POST http://localhost:3001/api/hrkey-score \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xSUBJECT_ADDRESS",
    "role_id": "UUID_OF_ROLE"
  }'
```

**Respuesta de éxito:**

```json
{
  "ok": true,
  "subject_wallet": "0xSUBJECT_ADDRESS",
  "role_id": "UUID_OF_ROLE",
  "score": 78.45,
  "raw_prediction": 125432.50,
  "confidence": 0.8944,
  "confidence_percentage": 89.44,
  "n_observations": 16,
  "used_kpis": [
    "deployment_frequency",
    "code_quality",
    "team_collaboration",
    "mttr",
    "bug_resolution_time",
    "pr_review_quality",
    "documentation_quality",
    "test_coverage"
  ],
  "model_info": {
    "model_type": "ridge",
    "trained_at": "2025-11-22T15:30:45.123456",
    "role_scope": "global",
    "metrics": {
      "mae": 8234.5678,
      "rmse": 10567.8901,
      "r2": 0.7456
    },
    "n_features": 8
  },
  "debug": {
    "feature_vector": [4.5, 4.2, 3.8, 2.1, 3.5, 4.7, 3.9, 4.0],
    "kpi_averages": {
      "deployment_frequency": 4.5,
      "code_quality": 4.2,
      "team_collaboration": 3.8,
      "mttr": 2.1,
      "bug_resolution_time": 3.5,
      "pr_review_quality": 4.7,
      "documentation_quality": 3.9,
      "test_coverage": 4.0
    },
    "target_stats": {
      "min": 65000,
      "max": 180000,
      "mean": 115234.5,
      "std": 28456.7
    }
  }
}
```

**Respuesta cuando no hay datos suficientes:**

```json
{
  "ok": false,
  "reason": "NOT_ENOUGH_DATA",
  "message": "Se requieren al menos 3 observaciones de KPI. Encontradas: 2",
  "n_observations": 2
}
```

---

## 📊 Interpretación del Score

### HRKey Score (0-100)

El score se calcula en 3 pasos:

1. **Predicción raw** usando el modelo lineal:
   ```
   y_raw = intercept + Σ(coef_i * x_i)
   ```
   donde:
   - `x_i` = rating promedio del KPI i (1-5, o 0 si no existe)
   - `coef_i` = coeficiente del modelo para el KPI i
   - `intercept` = constante del modelo

2. **Normalización a 0-100** usando min-max scaling:
   ```
   score = ((y_raw - min) / (max - min)) * 100
   ```
   donde `min` y `max` son los valores mínimo y máximo del target en el dataset de entrenamiento.

3. **Clamping**: El score se limita al rango [0, 100].

### Confidence (0-1)

El nivel de confianza indica qué tan confiable es el score basándose en el número de observaciones:

```
confidence = min(1, sqrt(n / 20))
```

**Interpretación:**
- `n < 5`: confidence < 0.5 → **Baja confianza** (pocos datos)
- `n = 10`: confidence = 0.71 → **Confianza moderada**
- `n = 20`: confidence = 1.0 → **Alta confianza**
- `n > 20`: confidence = 1.0 → **Alta confianza**

### Raw Prediction

Es la predicción en la escala original del target (por ejemplo, salario, ventas, etc.).

**Ejemplo:**
- `raw_prediction: 125432.50` → El modelo predice que el outcome_value esperado es ~$125,432
- `score: 78.45` → Esto representa el percentil 78.45 dentro del rango de outcomes observados

---

## 🔧 Endpoints Disponibles

### 1. POST /api/hrkey-score

Calcula el HRKey Score para un sujeto+rol.

**Request:**
```json
{
  "subject_wallet": "0xABC",
  "role_id": "uuid-123"
}
```

**Response:**
Ver ejemplo arriba.

**Status Codes:**
- `200 OK` - Score calculado exitosamente
- `400 Bad Request` - Campos faltantes o role_id mismatch
- `422 Unprocessable Entity` - No hay datos suficientes
- `503 Service Unavailable` - Modelo no configurado

---

### 2. GET /api/hrkey-score/model-info

Obtiene información sobre el modelo cargado (sin hacer cálculos).

**Request:**
```bash
curl http://localhost:3001/api/hrkey-score/model-info
```

**Response:**
```json
{
  "ok": true,
  "model_type": "ridge",
  "trained_at": "2025-11-22T15:30:45.123456",
  "role_scope": "global",
  "version": "1.0.0",
  "n_features": 8,
  "metrics": {
    "mae": 8234.5678,
    "rmse": 10567.8901,
    "r2": 0.7456
  },
  "features": [
    {
      "name": "deployment_frequency",
      "coef": 12345.6789,
      "abs_coef": 12345.6789
    },
    {
      "name": "code_quality",
      "coef": 9876.5432,
      "abs_coef": 9876.5432
    },
    ...
  ],
  "target_stats": {
    "min": 65000,
    "max": 180000,
    "mean": 115234.5,
    "std": 28456.7
  },
  "scoring_config": {
    "min_observations_required": 3,
    "default_imputation_value": 0.0,
    "normalization_method": "min_max",
    "confidence_calculation": "sqrt_n_over_20"
  }
}
```

---

## 🛠️ Troubleshooting

### Error: "Configuración del modelo no encontrada"

**Causa:** El archivo `ml/output/hrkey_model_config_global.json` no existe.

**Solución:**
```bash
python ml/export_hrkey_model_config.py
```

---

### Error: "Se requieren al menos 3 observaciones"

**Causa:** El sujeto+rol no tiene suficientes datos en `kpi_observations`.

**Solución:**
Inserta más observaciones usando:
```bash
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xSUBJECT",
    "observer_wallet": "0xOBSERVER",
    "role_id": "uuid-123",
    "observations": [
      { "kpi_name": "deployment_frequency", "rating_value": 4, "outcome_value": 120 },
      { "kpi_name": "code_quality", "rating_value": 5, "outcome_value": 130 },
      { "kpi_name": "team_collaboration", "rating_value": 3, "outcome_value": 110 }
    ]
  }'
```

---

### Score parece incorrecto

**Posibles causas:**

1. **KPIs faltantes**: Si el sujeto no tiene datos para algunos KPIs, se imputan con 0, lo que puede afectar el score.

2. **Modelo desactualizado**: Si agregaste nuevos datos, re-entrena el modelo:
   ```bash
   python ml/baseline_predictive_model.py
   python ml/export_hrkey_model_config.py
   # Reinicia el backend
   ```

3. **Verificar debug info**: La respuesta incluye un campo `debug` con el vector de features y promedios de KPIs. Úsalo para verificar qué valores se están usando.

---

## 🔄 Actualización del Modelo

Para actualizar el modelo con nuevos datos:

```bash
# 1. Entrenar con datos actualizados
python ml/baseline_predictive_model.py

# 2. Exportar nueva configuración
python ml/export_hrkey_model_config.py

# 3. Recargar configuración en el backend (sin reiniciar)
curl -X POST http://localhost:3001/api/admin/reload-model
# (o simplemente reinicia el servidor)
```

**Nota:** El backend carga el JSON una sola vez al arrancar. Si actualizas el modelo, debes reiniciar el servidor o implementar un endpoint de recarga.

---

## 📈 Próximos Pasos

1. **Modelos por rol**: Entrenar modelos específicos para cada rol:
   ```bash
   python ml/baseline_predictive_model.py --role_id <UUID>
   python ml/export_hrkey_model_config.py --role_id <UUID>
   ```

2. **Modelos más avanzados**: Experimentar con RandomForest, XGBoost, etc.

3. **Explicabilidad**: Agregar endpoint que explique por qué un score es alto/bajo (basado en coeficientes).

4. **Tracking temporal**: Mostrar cómo evoluciona el score de una persona en el tiempo.

5. **Benchmarking**: Comparar el score de una persona vs el promedio de su rol.

---

## 📚 Referencias

- **Entrenamiento del modelo**: `ml/baseline_predictive_model.py`
- **Exportación a JSON**: `ml/export_hrkey_model_config.py`
- **Servicio de scoring**: `backend/hrkeyScoreService.js`
- **Endpoints**: `backend/server.js` (líneas 648-800)

---

**¿Necesitas ayuda? Contacta al equipo de ML Engineering de HRKey.**
