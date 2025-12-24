# HRScore ML Dataset Specification

## Overview
Este documento especifica el dataset usado para entrenar el modelo predictivo de HRScore basado en observaciones reales de KPIs.

## Objetivo del Modelo
Predecir un **HRScore** (0-100) para un usuario en un rol específico, basado en evaluaciones agregadas de KPIs.

---

## 1. Fuente de Datos Principal

### Tabla: `kpi_observations`
```sql
CREATE TABLE kpi_observations (
  id UUID PRIMARY KEY,
  subject_wallet TEXT NOT NULL,           -- Usuario evaluado
  subject_user_id UUID,
  observer_wallet TEXT NOT NULL,          -- Usuario evaluador
  observer_user_id UUID,
  role_id UUID,                           -- Rol en contexto
  role_name TEXT,
  kpi_id UUID,
  kpi_name TEXT NOT NULL,                 -- Nombre del KPI
  rating_value NUMERIC NOT NULL,          -- Valor 1-5
  outcome_value NUMERIC,                  -- Outcome medible (opcional)
  context_notes TEXT,
  observed_at TIMESTAMPTZ,
  observation_period TEXT,
  source TEXT DEFAULT 'manual',
  reference_id UUID,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. Dataset Estructura

### 2.1 Query de Extracción Base

```sql
WITH kpi_aggregates AS (
  SELECT
    ko.subject_wallet,
    ko.subject_user_id,
    ko.role_id,
    ko.kpi_name,

    -- Agregaciones de rating
    COUNT(*) as n_observations,
    AVG(ko.rating_value) as avg_rating,
    STDDEV(ko.rating_value) as stddev_rating,
    MIN(ko.rating_value) as min_rating,
    MAX(ko.rating_value) as max_rating,

    -- Agregaciones de outcome (si existe)
    AVG(ko.outcome_value) as avg_outcome,
    STDDEV(ko.outcome_value) as stddev_outcome,

    -- Métricas de calidad
    COUNT(DISTINCT ko.observer_wallet) as n_observers,
    SUM(CASE WHEN ko.verified THEN 1 ELSE 0 END) as n_verified,

    -- Temporalidad
    MIN(ko.created_at) as first_observation_at,
    MAX(ko.created_at) as last_observation_at,
    EXTRACT(EPOCH FROM (MAX(ko.created_at) - MIN(ko.created_at)))/86400 as observation_span_days

  FROM kpi_observations ko
  WHERE ko.rating_value IS NOT NULL
  GROUP BY ko.subject_wallet, ko.subject_user_id, ko.role_id, ko.kpi_name
)
SELECT * FROM kpi_aggregates
WHERE n_observations >= 3;  -- Mínimo 3 observaciones por KPI
```

### 2.2 Pivot a Features

El dataset pivoteado contiene una fila por (subject_wallet, role_id) con columnas:

**Identificadores:**
- `subject_wallet` (TEXT)
- `subject_user_id` (UUID)
- `role_id` (UUID)
- `role_name` (TEXT) - JOIN con `roles.role_name`

**Features por KPI** (6 KPIs estándar):
Para cada KPI en `[code_quality, test_coverage, deployment_frequency, bug_resolution_time, api_response_time, documentation_quality]`:

- `{kpi_name}_avg_rating` (NUMERIC) - Promedio de ratings [1-5]
- `{kpi_name}_n_obs` (INTEGER) - Número de observaciones
- `{kpi_name}_n_observers` (INTEGER) - Número de observadores únicos
- `{kpi_name}_verified_pct` (NUMERIC) - % de observaciones verificadas

**Ejemplo de columnas pivoteadas:**
```
code_quality_avg_rating
code_quality_n_obs
code_quality_n_observers
code_quality_verified_pct
test_coverage_avg_rating
test_coverage_n_obs
...
```

**Metadata agregada:**
- `total_observations` (INTEGER) - Total de observaciones del usuario
- `total_observers` (INTEGER) - Total de observadores únicos
- `verified_percentage` (NUMERIC) - % global de verificadas
- `observation_span_days` (NUMERIC) - Días entre primera y última observación
- `kpis_evaluated` (INTEGER) - Número de KPIs con datos (1-6)

**Target Variable:**
- `target_score` (NUMERIC) - HRScore calculado previamente (si existe en `hrkey_scores`)

---

## 3. Joins Necesarios

### 3.1 Join con `roles`
```sql
LEFT JOIN roles r ON kpi_aggregates.role_id = r.id
```
**Propósito:** Obtener metadata del rol (role_name, industry, seniority_level)

**Columnas adicionales:**
- `role_name` (TEXT)
- `industry` (TEXT)
- `seniority_level` (TEXT)

### 3.2 Join con `hrkey_scores` (para target)
```sql
LEFT JOIN LATERAL (
  SELECT score, confidence, n_observations, created_at
  FROM hrkey_scores hs
  WHERE hs.user_id = kpi_aggregates.subject_user_id
    AND (hs.role_id = kpi_aggregates.role_id OR hs.role_id IS NULL)
  ORDER BY hs.created_at DESC
  LIMIT 1
) latest_score ON TRUE
```
**Propósito:** Obtener el último HRScore calculado como variable objetivo

**Columnas adicionales:**
- `latest_score` (NUMERIC) - Score 0-100
- `latest_score_confidence` (NUMERIC)
- `latest_score_n_obs` (INTEGER)
- `latest_score_computed_at` (TIMESTAMPTZ)

### 3.3 Join con `users` (opcional, para metadata)
```sql
LEFT JOIN users u ON kpi_aggregates.subject_user_id = u.id
```
**Columnas adicionales (solo para análisis, no features):**
- `user_email`
- `user_role` (admin/user)
- `identity_verified`

---

## 4. Filtros de Calidad

### Mínimos requeridos:
```sql
WHERE
  n_observations >= 3              -- Mínimo 3 observaciones por KPI
  AND n_observers >= 2             -- Mínimo 2 observadores diferentes
  AND kpis_evaluated >= 3          -- Al menos 3 KPIs evaluados
```

### Filtros opcionales (según disponibilidad de datos):
```sql
AND verified_percentage >= 0.3     -- Al menos 30% verificadas
AND observation_span_days >= 7     -- Al menos 1 semana de datos
```

---

## 5. Estadísticas del Dataset

### Dimensionalidad esperada:
- **Filas:** ~N usuarios × M roles evaluados
- **Features:** 6 KPIs × 4 métricas = 24 features principales + 5 metadata = **29 columnas**
- **Target:** 1 columna (latest_score)

### KPIs Estándar (orden para feature vector):
1. `code_quality`
2. `test_coverage`
3. `deployment_frequency`
4. `bug_resolution_time`
5. `api_response_time`
6. `documentation_quality`

### Valores esperados:
- `rating_value`: [1.0, 5.0] (escala Likert)
- `target_score`: [0.0, 100.0] (HRScore normalizado)
- `n_observations`: [3, ∞)
- `n_observers`: [2, ∞)

---

## 6. Splits de Datos

### Estrategia de Split:
```python
# Estratificado por role_id si hay suficientes muestras
train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=df['role_id'] if len(df) > 50 else None
)
```

### Validación:
- **Holdout:** 80% train / 20% test
- **Cross-Validation:** 5-fold CV en train set
- **Time-based split:** Si hay suficientes datos temporales

---

## 7. Feature Engineering (Fase 2)

### Potenciales features derivadas:
```python
# Diversidad de evaluadores
diversity_score = n_observers / n_observations

# Consistencia de ratings
consistency_score = 1 - (stddev_rating / 2.0)

# Interacciones entre KPIs
code_quality_x_test_coverage = avg_rating_code * avg_rating_test

# Z-scores normalizados por rol
z_score_code_quality = (avg_rating - role_mean) / role_std
```

---

## 8. Schema Final del CSV Exportado

```csv
subject_wallet,subject_user_id,role_id,role_name,industry,seniority_level,
code_quality_avg_rating,code_quality_n_obs,code_quality_n_observers,code_quality_verified_pct,
test_coverage_avg_rating,test_coverage_n_obs,test_coverage_n_observers,test_coverage_verified_pct,
deployment_frequency_avg_rating,deployment_frequency_n_obs,deployment_frequency_n_observers,deployment_frequency_verified_pct,
bug_resolution_time_avg_rating,bug_resolution_time_n_obs,bug_resolution_time_n_observers,bug_resolution_time_verified_pct,
api_response_time_avg_rating,api_response_time_n_obs,api_response_time_n_observers,api_response_time_verified_pct,
documentation_quality_avg_rating,documentation_quality_n_obs,documentation_quality_n_observers,documentation_quality_verified_pct,
total_observations,total_observers,verified_percentage,observation_span_days,kpis_evaluated,
target_score,created_at
```

**Total columnas:** 37

---

## 9. Notas de Implementación

### Missing Values:
- KPIs no evaluados: rellenar con `NULL` o media del rol
- `target_score` faltante: calcular on-the-fly o excluir fila

### Outliers:
- Ratings fuera de [1-5]: eliminar
- N_observations > 1000: revisar (posible duplicación)

### Data Leakage:
- **IMPORTANTE:** No usar `latest_score` de fechas posteriores a la observación
- Usar solo scores calculados ANTES o DURANTE el período de observación

---

## Changelog

**v1.0 (2025-12-23):**
- Especificación inicial basada en schema existente
- 6 KPIs estándar
- Joins con roles y hrkey_scores
- Filtros de calidad definidos
