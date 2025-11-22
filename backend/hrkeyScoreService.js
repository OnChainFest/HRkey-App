/**
 * HRKey Score Service
 *
 * Servicio de scoring que calcula el "HRKey Score" (0-100) para un sujeto+rol
 * basado en un modelo de regresión lineal entrenado en Python.
 *
 * Flujo:
 * 1. Carga configuración del modelo desde JSON (generado por ml/export_hrkey_model_config.py)
 * 2. Consulta los KPIs del sujeto desde kpi_observations
 * 3. Construye vector de features en el orden correcto
 * 4. Calcula predicción usando: y = intercept + sum(coef_i * x_i)
 * 5. Normaliza a score 0-100 usando target_stats
 * 6. Calcula nivel de confianza basado en número de observaciones
 *
 * Autor: HRKey Backend Team
 * Fecha: 2025-11-22
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Path al archivo de configuración del modelo
const MODEL_CONFIG_PATH = path.join(__dirname, '..', 'ml', 'output', 'hrkey_model_config_global.json');

// Cache del modelo en memoria (singleton)
let modelConfig = null;

// ============================================================================
// 1. CARGA DE CONFIGURACIÓN DEL MODELO
// ============================================================================

/**
 * Carga la configuración del modelo desde el archivo JSON.
 * Usa un singleton para evitar lecturas repetidas del disco.
 *
 * @returns {Object} Configuración del modelo
 * @throws {Error} Si el archivo no existe o está malformado
 */
function loadModelConfig() {
  // Si ya está cargado, devolver desde cache
  if (modelConfig !== null) {
    return modelConfig;
  }

  // Verificar que el archivo existe
  if (!fs.existsSync(MODEL_CONFIG_PATH)) {
    throw new Error(
      `Configuración del modelo no encontrada: ${MODEL_CONFIG_PATH}\n` +
      'Ejecuta primero: python ml/export_hrkey_model_config.py'
    );
  }

  try {
    const configJson = fs.readFileSync(MODEL_CONFIG_PATH, 'utf-8');
    modelConfig = JSON.parse(configJson);

    console.log('✅ Configuración del modelo HRKey cargada:');
    console.log(`   Model type: ${modelConfig.model_type}`);
    console.log(`   Role scope: ${modelConfig.role_scope}`);
    console.log(`   Features: ${modelConfig.train_info.n_features}`);
    console.log(`   R²: ${modelConfig.train_info.metrics?.r2 || 'N/A'}`);

    return modelConfig;
  } catch (err) {
    throw new Error(`Error al cargar configuración del modelo: ${err.message}`);
  }
}

/**
 * Recarga la configuración del modelo (útil si se actualiza el JSON).
 */
export function reloadModelConfig() {
  modelConfig = null;
  return loadModelConfig();
}

// ============================================================================
// 2. CONSULTA DE DATOS DE KPI DESDE LA BD
// ============================================================================

/**
 * Consulta todas las observaciones de KPI para un sujeto+rol.
 *
 * @param {string} subjectWallet - Wallet address del sujeto evaluado
 * @param {string} roleId - UUID del rol
 * @returns {Promise<Array>} Array de observaciones
 */
async function fetchKpiObservations(subjectWallet, roleId) {
  const { data, error } = await supabase
    .from('kpi_observations')
    .select('*')
    .eq('subject_wallet', subjectWallet)
    .eq('role_id', roleId);

  if (error) {
    throw new Error(`Error consultando kpi_observations: ${error.message}`);
  }

  return data || [];
}

/**
 * Agrega las observaciones por KPI (calcula promedio de rating_value).
 *
 * Equivalente a:
 * SELECT kpi_name, AVG(rating_value) as avg_rating
 * FROM kpi_observations
 * WHERE subject_wallet = ? AND role_id = ?
 * GROUP BY kpi_name
 *
 * @param {Array} observations - Array de observaciones raw
 * @returns {Object} Map { kpi_name: avg_rating }
 */
function aggregateKpisByAverage(observations) {
  const kpiMap = {};

  // Agrupar por kpi_name
  for (const obs of observations) {
    const kpiName = obs.kpi_name;
    const ratingValue = obs.rating_value;

    if (!kpiName || ratingValue == null) {
      continue; // Skip invalid entries
    }

    if (!kpiMap[kpiName]) {
      kpiMap[kpiName] = { sum: 0, count: 0 };
    }

    kpiMap[kpiName].sum += ratingValue;
    kpiMap[kpiName].count += 1;
  }

  // Calcular promedios
  const avgMap = {};
  for (const [kpiName, stats] of Object.entries(kpiMap)) {
    avgMap[kpiName] = stats.sum / stats.count;
  }

  return avgMap;
}

// ============================================================================
// 3. CONSTRUCCIÓN DEL VECTOR DE FEATURES
// ============================================================================

/**
 * Construye el vector de features X en el orden correcto según el modelo.
 *
 * @param {Object} kpiAvgMap - Map { kpi_name: avg_rating }
 * @param {Object} modelConfig - Configuración del modelo
 * @returns {Array<number>} Vector de features
 */
function buildFeatureVector(kpiAvgMap, modelConfig) {
  const defaultValue = modelConfig.scoring_config?.default_imputation_value ?? 0.0;

  // Construir vector en el mismo orden que features del modelo
  const X = modelConfig.features.map(feature => {
    const kpiName = feature.name;
    return kpiAvgMap[kpiName] ?? defaultValue;
  });

  return X;
}

// ============================================================================
// 4. CÁLCULO DE PREDICCIÓN (REGRESIÓN LINEAL)
// ============================================================================

/**
 * Calcula la predicción raw usando la fórmula del modelo lineal:
 * y_raw = intercept + sum(coef_i * x_i)
 *
 * @param {Array<number>} X - Vector de features
 * @param {Object} modelConfig - Configuración del modelo
 * @returns {number} Predicción raw (en escala de outcome_value)
 */
function calculateRawPrediction(X, modelConfig) {
  const intercept = modelConfig.intercept;
  const features = modelConfig.features;

  // y = intercept + sum(coef * x)
  let yRaw = intercept;

  for (let i = 0; i < X.length; i++) {
    yRaw += features[i].coef * X[i];
  }

  return yRaw;
}

// ============================================================================
// 5. NORMALIZACIÓN A HRKEY SCORE (0-100)
// ============================================================================

/**
 * Normaliza la predicción raw a un score entre 0 y 100.
 *
 * Usa normalización min-max:
 * score = ((y_raw - min) / (max - min)) * 100
 *
 * @param {number} yRaw - Predicción raw
 * @param {Object} targetStats - Estadísticas del target { min, max, mean, std }
 * @returns {number} Score normalizado (0-100)
 */
function normalizeToScore(yRaw, targetStats) {
  const { min, max } = targetStats;

  // Edge case: si min == max, devolver 50 (neutral)
  if (max <= min) {
    return 50;
  }

  // Normalizar a [0, 1]
  let normalized = (yRaw - min) / (max - min);

  // Clamp a [0, 1]
  normalized = Math.max(0, Math.min(1, normalized));

  // Escalar a [0, 100]
  return normalized * 100;
}

/**
 * Calcula un nivel de confianza basado en el número de observaciones.
 *
 * Fórmula: confidence = min(1, sqrt(n / 20))
 *
 * Interpretación:
 * - n < 5:  confianza < 0.5  (baja)
 * - n = 20: confianza = 1.0  (alta)
 * - n > 20: confianza = 1.0  (alta)
 *
 * @param {number} nObservations - Número de observaciones
 * @returns {number} Confianza (0-1)
 */
function calculateConfidence(nObservations) {
  const threshold = 20;
  const confidence = Math.sqrt(nObservations / threshold);
  return Math.min(1, confidence);
}

// ============================================================================
// 6. FUNCIÓN PRINCIPAL: COMPUTE HRKEY SCORE
// ============================================================================

/**
 * Calcula el HRKey Score para un sujeto+rol.
 *
 * @param {Object} params - Parámetros
 * @param {string} params.subjectWallet - Wallet address del sujeto
 * @param {string} params.roleId - UUID del rol
 * @returns {Promise<Object>} Resultado del scoring
 *
 * Resultado de éxito:
 * {
 *   ok: true,
 *   subject_wallet: string,
 *   role_id: string,
 *   score: number,              // 0-100
 *   raw_prediction: number,     // en escala de outcome_value
 *   confidence: number,         // 0-1
 *   n_observations: number,
 *   used_kpis: Array<string>,
 *   model_info: Object
 * }
 *
 * Resultado de error:
 * {
 *   ok: false,
 *   reason: string,
 *   message: string
 * }
 */
export async function computeHrkeyScore({ subjectWallet, roleId }) {
  try {
    // ========================================
    // 1. Cargar configuración del modelo
    // ========================================
    const config = loadModelConfig();

    // Validar que el rol coincida (si el modelo es por rol)
    if (config.role_scope !== 'global' && config.role_scope !== roleId) {
      return {
        ok: false,
        reason: 'ROLE_MISMATCH',
        message: `El modelo está entrenado para role_id=${config.role_scope}, pero se solicitó ${roleId}`
      };
    }

    // ========================================
    // 2. Consultar observaciones de KPI
    // ========================================
    const observations = await fetchKpiObservations(subjectWallet, roleId);

    // Validar que haya datos suficientes
    const minRequired = config.scoring_config?.min_observations_required ?? 3;

    if (observations.length < minRequired) {
      return {
        ok: false,
        reason: 'NOT_ENOUGH_DATA',
        message: `Se requieren al menos ${minRequired} observaciones de KPI. Encontradas: ${observations.length}`,
        n_observations: observations.length
      };
    }

    // ========================================
    // 3. Agregar KPIs (calcular promedios)
    // ========================================
    const kpiAvgMap = aggregateKpisByAverage(observations);

    // KPIs que realmente aportaron datos
    const usedKpis = Object.keys(kpiAvgMap);

    if (usedKpis.length === 0) {
      return {
        ok: false,
        reason: 'NO_VALID_KPIS',
        message: 'No se encontraron KPIs válidos con rating_value',
        n_observations: observations.length
      };
    }

    // ========================================
    // 4. Construir vector de features
    // ========================================
    const X = buildFeatureVector(kpiAvgMap, config);

    // ========================================
    // 5. Calcular predicción raw
    // ========================================
    const yRaw = calculateRawPrediction(X, config);

    // ========================================
    // 6. Normalizar a HRKey Score (0-100)
    // ========================================
    const hrkeyScore = normalizeToScore(yRaw, config.target_stats);

    // ========================================
    // 7. Calcular confianza
    // ========================================
    const confidence = calculateConfidence(observations.length);

    // ========================================
    // 8. Construir respuesta
    // ========================================
    return {
      ok: true,
      subject_wallet: subjectWallet,
      role_id: roleId,
      score: parseFloat(hrkeyScore.toFixed(2)),
      raw_prediction: parseFloat(yRaw.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(4)),
      confidence_percentage: parseFloat((confidence * 100).toFixed(2)),
      n_observations: observations.length,
      used_kpis: usedKpis,
      model_info: {
        model_type: config.model_type,
        trained_at: config.trained_at,
        role_scope: config.role_scope,
        metrics: config.train_info?.metrics || null,
        n_features: config.train_info?.n_features || 0
      },
      // Información adicional para debugging (opcional)
      debug: {
        feature_vector: X,
        kpi_averages: kpiAvgMap,
        target_stats: config.target_stats
      }
    };

  } catch (err) {
    console.error('❌ Error en computeHrkeyScore:', err);

    return {
      ok: false,
      reason: 'INTERNAL_ERROR',
      message: err.message,
      error: err.toString()
    };
  }
}

// ============================================================================
// 7. FUNCIÓN AUXILIAR: GET MODEL INFO
// ============================================================================

/**
 * Devuelve información sobre el modelo cargado (sin hacer cálculos).
 *
 * @returns {Object} Información del modelo
 */
export function getModelInfo() {
  try {
    const config = loadModelConfig();

    return {
      ok: true,
      model_type: config.model_type,
      trained_at: config.trained_at,
      role_scope: config.role_scope,
      version: config.version,
      n_features: config.train_info?.n_features || 0,
      metrics: config.train_info?.metrics || null,
      features: config.features.map(f => ({
        name: f.name,
        coef: f.coef,
        abs_coef: f.abs_coef
      })),
      target_stats: config.target_stats,
      scoring_config: config.scoring_config
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'MODEL_NOT_LOADED',
      message: err.message
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  computeHrkeyScore,
  getModelInfo,
  reloadModelConfig
};
