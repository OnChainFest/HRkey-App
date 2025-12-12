/**
 * HRScore Persistence & Automation Layer
 *
 * Main entry point for the HRScore service layer.
 * Provides a unified API for score calculation, persistence, and history tracking.
 *
 * @module services/hrscore
 */

// Import all modules
import * as scoreCalculator from './scoreCalculator.js';
import * as scoreHistory from './scoreHistory.js';
import * as autoTrigger from './autoTrigger.js';

// ============================================================================
// RE-EXPORT ALL FUNCTIONS
// ============================================================================

// Score Calculator
export const {
  calculateAndPersistScore,
  recalculateScore,
  calculateScoresBatch
} = scoreCalculator;

// Score History
export const {
  getLatestScore,
  getScoreHistory,
  getScoreEvolution,
  getScoreImprovement,
  getScoreStats
} = scoreHistory;

// Auto Triggers
export const {
  onReferenceValidated,
  onKpiObservationCreated,
  scheduledBatchRecalculation
} = autoTrigger;

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Calculator
  calculateAndPersistScore,
  recalculateScore,
  calculateScoresBatch,

  // History
  getLatestScore,
  getScoreHistory,
  getScoreEvolution,
  getScoreImprovement,
  getScoreStats,

  // Auto-triggers
  onReferenceValidated,
  onKpiObservationCreated,
  scheduledBatchRecalculation
};

// ============================================================================
// LAYER METADATA
// ============================================================================

/**
 * Get metadata about the HRScore Persistence Layer.
 *
 * @returns {Object} Layer metadata
 */
export function getHRScoreLayerInfo() {
  return {
    name: 'HRScore Persistence & Automation Layer',
    version: '1.0.0',
    description: 'Automatic HRKey Score calculation, persistence, and history tracking',
    features: [
      'Automatic score calculation on reference validation',
      'Historical score tracking',
      'Score evolution analysis',
      'Batch recalculation support',
      'Analytics integration',
      'Fail-soft error handling'
    ],
    modules: {
      scoreCalculator: 'Calculate and persist HRKey Scores',
      scoreHistory: 'Query historical scores and trends',
      autoTrigger: 'Automatic score recalculation triggers'
    },
    triggerSources: [
      'manual',
      'reference_validated',
      'kpi_observation',
      'scheduled',
      'api_request'
    ],
    integrations: [
      'RVL (Reference Validation Layer)',
      'Analytics Layer',
      'Existing hrkeyScoreService.js'
    ]
  };
}
