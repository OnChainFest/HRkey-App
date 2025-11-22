# KPI Observations API - Proof of Correlation MVP

## 📊 Overview

Esta API captura **observaciones estructuradas de KPIs** (ratings + contexto) que luego serán consumidas por el motor de correlación en Python para medir relaciones entre KPIs y resultados laborales.

**Objetivo:** Construir la "tubería de datos" entre el frontend (app.html), el backend (Node/Express) y el análisis ML (Python/pandas/scikit-learn).

---

## 🗄️ Database Setup

### 1. Ejecutar la migración SQL

Primero, debes aplicar el schema SQL en tu base de datos Supabase:

```bash
# Conectar a Supabase y ejecutar
psql $SUPABASE_DB_URL -f sql/004_kpi_observations.sql
```

O desde el **Supabase SQL Editor**:
- Ir a SQL Editor en tu proyecto Supabase
- Copiar y ejecutar el contenido de `sql/004_kpi_observations.sql`

### 2. Tablas creadas

La migración crea:

**Tabla principal:**
- `kpi_observations` - Almacena cada observación individual de KPI

**Vista agregada (para analytics):**
- `kpi_observations_summary` - Datos agregados por (subject, role, kpi)

**Campos principales de `kpi_observations`:**

```sql
CREATE TABLE kpi_observations (
  id UUID PRIMARY KEY,
  subject_wallet TEXT NOT NULL,           -- Quién es evaluado
  observer_wallet TEXT NOT NULL,          -- Quién evalúa
  role_id UUID REFERENCES roles(id),      -- Rol al que aplica
  kpi_name TEXT NOT NULL,                 -- KPI específico
  rating_value NUMERIC NOT NULL (1-5),    -- Rating numérico
  outcome_value NUMERIC,                  -- Resultado medible (opcional)
  context_notes TEXT,                     -- Contexto libre
  observation_period TEXT,                -- Período (ej: "Q1 2024")
  observed_at TIMESTAMPTZ,                -- Cuándo ocurrió el desempeño
  ...
);
```

---

## 🔌 API Endpoints

### BASE URL

```
http://localhost:3001  (desarrollo)
https://tu-backend.herokuapp.com  (producción)
```

---

### 1. POST `/api/kpi-observations`

**Crear una o más observaciones de KPIs (batch insert)**

#### Request Body

```json
{
  "subject_wallet": "0xABC123...",
  "observer_wallet": "0xDEF456...",
  "role_id": "550e8400-e29b-41d4-a716-446655440000",
  "role_name": "Backend Developer",
  "observations": [
    {
      "kpi_name": "deployment_frequency",
      "rating_value": 4,
      "outcome_value": 120,
      "context_notes": "Deployed 120 times during Q1 2024. Excellent velocity.",
      "observation_period": "Q1 2024",
      "observed_at": "2024-03-31T23:59:59Z"
    },
    {
      "kpi_name": "code_quality",
      "rating_value": 5,
      "context_notes": "Code reviews consistently praised. Zero regressions."
    },
    {
      "kpi_name": "mttr",
      "rating_value": 3,
      "outcome_value": 45,
      "context_notes": "Average MTTR of 45 minutes. Could be improved."
    }
  ]
}
```

#### Response (201 Created)

```json
{
  "success": true,
  "inserted": 3,
  "observations": [
    {
      "id": "uuid-1",
      "subject_wallet": "0xABC123...",
      "observer_wallet": "0xDEF456...",
      "role_id": "550e8400-e29b-41d4-a716-446655440000",
      "kpi_name": "deployment_frequency",
      "rating_value": 4,
      "outcome_value": 120,
      "context_notes": "Deployed 120 times during Q1 2024...",
      "created_at": "2024-11-22T10:30:00Z",
      ...
    },
    ...
  ]
}
```

#### Validaciones

- ✅ `subject_wallet`, `observer_wallet`, `role_id`, `observations` son **requeridos**
- ✅ `observations` debe ser un **array no vacío**
- ✅ Cada observación debe tener `kpi_name` y `rating_value`
- ✅ `rating_value` debe ser un número entre **1 y 5**

#### Ejemplo cURL

```bash
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xSUBJECT",
    "observer_wallet": "0xOBSERVER",
    "role_id": "UUID_ROLE",
    "role_name": "Backend Developer",
    "observations": [
      {
        "kpi_name": "deployment_frequency",
        "rating_value": 4,
        "outcome_value": 120,
        "context_notes": "Deployed 120 times in Q1",
        "observation_period": "Q1 2024"
      }
    ]
  }'
```

---

### 2. GET `/api/kpi-observations`

**Obtener observaciones con filtros opcionales**

#### Query Parameters (todos opcionales)

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `subject_wallet` | string | Filtrar por wallet del evaluado | `0xABC...` |
| `observer_wallet` | string | Filtrar por wallet del evaluador | `0xDEF...` |
| `role_id` | uuid | Filtrar por rol | `550e8400-...` |
| `kpi_name` | string | Filtrar por KPI específico | `deployment_frequency` |
| `verified` | boolean | Filtrar por verificación | `true` o `false` |
| `limit` | integer | Máximo de resultados | `50` (default: 200, max: 1000) |
| `offset` | integer | Offset para paginación | `100` (default: 0) |

#### Response (200 OK)

```json
{
  "success": true,
  "count": 42,
  "observations": [
    {
      "id": "uuid-1",
      "subject_wallet": "0xABC...",
      "observer_wallet": "0xDEF...",
      "role_id": "uuid-role",
      "role_name": "Backend Developer",
      "kpi_name": "deployment_frequency",
      "rating_value": 4,
      "outcome_value": 120,
      "context_notes": "...",
      "observation_period": "Q1 2024",
      "observed_at": "2024-03-31T23:59:59Z",
      "created_at": "2024-11-22T10:30:00Z",
      ...
    },
    ...
  ],
  "filters": {
    "subject_wallet": "0xABC...",
    "role_id": "uuid-role",
    "limit": 200,
    "offset": 0
  }
}
```

#### Ejemplo cURL

```bash
# Obtener todas las observaciones de un subject
curl "http://localhost:3001/api/kpi-observations?subject_wallet=0xABC123&limit=100"

# Obtener observaciones de un KPI específico
curl "http://localhost:3001/api/kpi-observations?kpi_name=deployment_frequency&verified=true"

# Paginación
curl "http://localhost:3001/api/kpi-observations?limit=50&offset=100"
```

---

### 3. GET `/api/kpi-observations/summary`

**Obtener resumen agregado de KPIs (optimizado para analytics/ML)**

Este endpoint usa la vista SQL `kpi_observations_summary` que agrega automáticamente las observaciones por `(subject, role, kpi)`.

**Ideal para:**
- Alimentar el motor de correlación en Python
- Análisis estadístico
- Dashboards de analytics

#### Query Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `subject_wallet` | string | Filtrar por subject |
| `role_id` | uuid | Filtrar por rol |
| `kpi_name` | string | Filtrar por KPI |
| `limit` | integer | Máximo resultados (default: 100, max: 1000) |

#### Response (200 OK)

```json
{
  "success": true,
  "count": 25,
  "summary": [
    {
      "subject_wallet": "0xABC...",
      "subject_user_id": "uuid-user",
      "role_id": "uuid-role",
      "role_name": "Backend Developer",
      "kpi_name": "deployment_frequency",
      "observation_count": 5,
      "avg_rating": 4.2,
      "stddev_rating": 0.4,
      "min_rating": 4,
      "max_rating": 5,
      "avg_outcome": 115.0,
      "verified_count": 3,
      "latest_observation_date": "2024-03-31T23:59:59Z"
    },
    ...
  ]
}
```

#### Ejemplo cURL

```bash
# Resumen de todos los KPIs para un subject
curl "http://localhost:3001/api/kpi-observations/summary?subject_wallet=0xABC123"

# Resumen de un rol específico
curl "http://localhost:3001/api/kpi-observations/summary?role_id=UUID_ROLE"

# Resumen de un KPI específico
curl "http://localhost:3001/api/kpi-observations/summary?kpi_name=deployment_frequency"
```

---

## 🎨 Integración Frontend (app.html)

### Ejemplo: Enviar observaciones después de que el signer llena el formulario

```javascript
// En app.html, después de que el usuario selecciona rol y KPIs

async function submitKpiObservations() {
  const subjectWallet = '0x...'; // Wallet del candidato/empleado
  const observerWallet = getCurrentUserWallet(); // Wallet del signer/manager
  const selectedRoleId = document.getElementById('roleSelect').value;
  const selectedRoleName = document.getElementById('roleSelect').selectedOptions[0].text;

  // Construir array de observaciones basado en los KPIs seleccionados
  const observations = [];

  // Ejemplo: si tienes inputs de rating para cada KPI
  const kpiInputs = document.querySelectorAll('.kpi-rating-input');
  kpiInputs.forEach(input => {
    const kpiName = input.dataset.kpiName;
    const ratingValue = parseInt(input.value);
    const contextNotes = document.getElementById(`notes_${kpiName}`)?.value || '';

    if (ratingValue >= 1 && ratingValue <= 5) {
      observations.push({
        kpi_name: kpiName,
        rating_value: ratingValue,
        context_notes: contextNotes,
        observation_period: 'Q4 2024', // O extraer del formulario
      });
    }
  });

  if (observations.length === 0) {
    alert('Por favor, evalúa al menos un KPI');
    return;
  }

  // Enviar al backend
  try {
    const response = await fetch('http://localhost:3001/api/kpi-observations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject_wallet: subjectWallet,
        observer_wallet: observerWallet,
        role_id: selectedRoleId,
        role_name: selectedRoleName,
        observations: observations
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ ${result.inserted} observaciones guardadas`);
      alert('Evaluaciones guardadas exitosamente!');
      // Resetear formulario, mostrar confirmación, etc.
    } else {
      console.error('Error:', result.error);
      alert('Error al guardar: ' + result.error);
    }
  } catch (error) {
    console.error('Network error:', error);
    alert('Error de red al guardar evaluaciones');
  }
}
```

### Ejemplo: Mostrar observaciones existentes

```javascript
async function loadUserKpiHistory(subjectWallet) {
  try {
    const response = await fetch(
      `http://localhost:3001/api/kpi-observations?subject_wallet=${subjectWallet}&limit=100`
    );
    const result = await response.json();

    if (result.success) {
      console.log(`Found ${result.count} observations`);
      displayObservations(result.observations);
    }
  } catch (error) {
    console.error('Error loading KPI history:', error);
  }
}

function displayObservations(observations) {
  const container = document.getElementById('kpi-history');
  container.innerHTML = observations.map(obs => `
    <div class="kpi-observation-card">
      <h4>${obs.kpi_name}</h4>
      <p>Rating: ${obs.rating_value}/5 ⭐</p>
      <p>Period: ${obs.observation_period || 'N/A'}</p>
      <p>${obs.context_notes || 'No context provided'}</p>
      <small>Evaluated by ${obs.observer_wallet.slice(0, 8)}...</small>
    </div>
  `).join('');
}
```

---

## 🐍 Integración Python (Analytics/ML)

### Conectar desde Python y leer datos

```python
import pandas as pd
import requests
from sqlalchemy import create_engine
import os

# ==================================================
# Opción 1: Usar la API REST (recomendado para MVP)
# ==================================================

def fetch_kpi_observations_via_api(base_url='http://localhost:3001'):
    """
    Fetch KPI observations via REST API endpoint
    """
    # Obtener resumen agregado (ideal para ML)
    response = requests.get(f'{base_url}/api/kpi-observations/summary?limit=1000')
    data = response.json()

    if data['success']:
        df = pd.DataFrame(data['summary'])
        print(f"✅ Loaded {len(df)} aggregated KPI observations")
        return df
    else:
        raise Exception(f"API error: {data.get('error')}")


def fetch_detailed_observations_via_api(base_url='http://localhost:3001', **filters):
    """
    Fetch detailed observations with filters
    """
    # Construir query string
    params = '&'.join([f'{k}={v}' for k, v in filters.items()])
    url = f'{base_url}/api/kpi-observations?{params}'

    response = requests.get(url)
    data = response.json()

    if data['success']:
        df = pd.DataFrame(data['observations'])
        print(f"✅ Loaded {len(df)} detailed observations")
        return df
    else:
        raise Exception(f"API error: {data.get('error')}")


# ==================================================
# Opción 2: Conectar directamente a Supabase DB
# ==================================================

def fetch_kpi_observations_via_db():
    """
    Connect directly to Supabase Postgres and fetch data
    """
    # Usar la misma conexión que el correlation engine
    db_url = os.getenv('SUPABASE_DB_URL')
    engine = create_engine(db_url)

    # Query directo a la vista agregada (más eficiente)
    query = """
        SELECT *
        FROM kpi_observations_summary
        ORDER BY subject_wallet, role_id, kpi_name
    """

    df = pd.read_sql_query(query, engine)
    print(f"✅ Loaded {len(df)} aggregated observations from DB")
    return df


# ==================================================
# Uso en el Correlation Engine
# ==================================================

def build_kpi_features_dataframe():
    """
    Build features for correlation analysis from KPI observations
    """
    # Opción 1: Via API
    df_summary = fetch_kpi_observations_via_api()

    # Pivotar para tener un KPI por columna
    df_pivot = df_summary.pivot_table(
        index=['subject_wallet', 'role_id'],
        columns='kpi_name',
        values='avg_rating',
        aggfunc='first'
    ).reset_index()

    # Renombrar columnas con prefijo kpi_
    kpi_columns = [col for col in df_pivot.columns
                   if col not in ['subject_wallet', 'role_id']]
    rename_dict = {col: f'kpi_{col}' for col in kpi_columns}
    df_pivot = df_pivot.rename(columns=rename_dict)

    print("✅ KPI features ready for ML:")
    print(f"   Subjects: {len(df_pivot)}")
    print(f"   KPI features: {[col for col in df_pivot.columns if col.startswith('kpi_')]}")

    return df_pivot


# ==================================================
# Ejemplo de integración con correlation engine
# ==================================================

if __name__ == "__main__":
    # Fetch data
    kpi_features = build_kpi_features_dataframe()

    # Ahora puedes usar esto en tu correlation engine
    # analytics/proof_of_correlation/dataset_builder.py puede importar esta función

    print("\n📊 Sample data:")
    print(kpi_features.head())

    print("\n📈 Statistics:")
    print(kpi_features.describe())
```

### Integrar con el Correlation Engine existente

```python
# En analytics/proof_of_correlation/dataset_builder.py

def fetch_kpi_observations_from_api() -> pd.DataFrame:
    """
    Fetch KPI observations from the REST API instead of direct DB query.
    This uses the observations captured via the frontend/backend pipeline.
    """
    import requests
    import os

    backend_url = os.getenv('BACKEND_URL', 'http://localhost:3001')
    response = requests.get(f'{backend_url}/api/kpi-observations/summary?limit=10000')

    if response.status_code != 200:
        logger.error(f"Failed to fetch KPI observations: {response.status_code}")
        return pd.DataFrame()

    data = response.json()

    if not data['success']:
        logger.error(f"API error: {data.get('error')}")
        return pd.DataFrame()

    df = pd.DataFrame(data['summary'])
    logger.info(f"✅ Fetched {len(df)} KPI observations from API")

    return df


def build_training_dataset_with_observations(conn=None) -> pd.DataFrame:
    """
    Enhanced dataset builder that includes observations from the API.
    """
    # Fetch job outcomes (original code)
    outcomes_df = fetch_job_outcomes()

    # Fetch KPI observations from new endpoint
    observations_df = fetch_kpi_observations_from_api()

    # Pivot observations to wide format (one column per KPI)
    if not observations_df.empty:
        obs_pivot = observations_df.pivot_table(
            index=['subject_wallet', 'role_id'],
            columns='kpi_name',
            values='avg_rating',
            aggfunc='first'
        ).reset_index()

        # Join with outcomes
        # ... (continuar con lógica de join)

    return df
```

---

## 📝 Notas para el Proof of Correlation

### Flujo completo de datos:

```
1. Frontend (app.html)
   ↓
   Usuario selecciona rol + KPIs + ratings
   ↓
2. POST /api/kpi-observations
   ↓
   Datos guardados en kpi_observations table
   ↓
3. Python Correlation Engine
   ↓
   GET /api/kpi-observations/summary
   ↓
   pandas DataFrame con KPIs agregados
   ↓
4. Correlation Analysis
   ↓
   Resultados guardados en correlation_results table
```

### Campos importantes para el análisis ML:

- **rating_value**: Rating numérico 1-5 (variable principal)
- **outcome_value**: Métrica cuantitativa opcional (ej: # deployments, % error rate)
- **observation_period**: Para análisis temporal
- **verified**: Para filtrar solo datos verificados
- **avg_rating, stddev_rating**: De la vista summary (útil para normalización)

### Próximos pasos:

1. ✅ **Aplicar SQL migration** (`sql/004_kpi_observations.sql`)
2. ✅ **Endpoints funcionando** en el backend
3. 🔄 **Integrar en app.html** el formulario de KPI ratings
4. 🔄 **Conectar Python** correlation engine con `/api/kpi-observations/summary`
5. 🔄 **Proof of Correlation**: Medir correlaciones KPIs → job outcomes

---

## 🧪 Testing

### Test con curl

```bash
# 1. Crear observación
curl -X POST http://localhost:3001/api/kpi-observations \
  -H "Content-Type: application/json" \
  -d '{
    "subject_wallet": "0xTEST_SUBJECT",
    "observer_wallet": "0xTEST_OBSERVER",
    "role_id": "550e8400-e29b-41d4-a716-446655440000",
    "observations": [
      {"kpi_name": "test_kpi", "rating_value": 4}
    ]
  }'

# 2. Verificar que se guardó
curl "http://localhost:3001/api/kpi-observations?subject_wallet=0xTEST_SUBJECT"

# 3. Ver resumen
curl "http://localhost:3001/api/kpi-observations/summary"
```

---

## 🆘 Troubleshooting

### Error: "Table kpi_observations does not exist"

**Solución:** Ejecutar la migración SQL:
```bash
psql $SUPABASE_DB_URL -f sql/004_kpi_observations.sql
```

### Error: "Missing required fields"

**Causa:** El request body no incluye `subject_wallet`, `observer_wallet`, `role_id`, o `observations`.

**Solución:** Verificar que todos los campos requeridos estén presentes.

### Error: "rating_value must be between 1 and 5"

**Causa:** El `rating_value` está fuera del rango permitido.

**Solución:** Asegurar que los ratings sean números entre 1 y 5.

### No se pueden insertar observaciones (RLS policy error)

**Causa:** Row Level Security bloqueando el insert.

**Solución:** Verificar que el usuario esté autenticado o deshabilitar RLS temporalmente para testing:
```sql
ALTER TABLE kpi_observations DISABLE ROW LEVEL SECURITY;
```

---

## 📚 Referencias

- **SQL Migration:** `sql/004_kpi_observations.sql`
- **Controller:** `backend/controllers/kpiObservationsController.js`
- **Server Integration:** `backend/server.js` (líneas 573-645)
- **Python Integration:** Ver sección "Integración Python" arriba
- **Correlation Engine:** `analytics/proof_of_correlation/`

---

**¡Listo para capturar datos y probar correlaciones! 🚀📊**
