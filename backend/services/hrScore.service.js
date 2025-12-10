/**
 * HRScore Engine
 * Converts normalized performance signals into an overall HRScore.
 */

/**
 * Clamp a numeric value between a minimum and maximum range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * @typedef {Object} HRScoreInput
 * @property {number} teamImpact - 0 = no impact, 1 = extremely high team impact
 * @property {number} reliability - 0 = very unreliable, 1 = extremely reliable
 * @property {number} leadership - 0 = no leadership, 1 = strong leadership
 * @property {number} adaptability - 0 = rigid, 1 = highly adaptable
 * @property {number} communication - 0 = poor communication, 1 = excellent communication
 */

/**
 * @typedef {Object} HRScoreResult
 * @property {number} normalizedScore - Composite score clamped to [0, 1]
 * @property {number} hrScore - HRScore scaled to [0, 100]
 */

const WEIGHTS = {
  teamImpact: 0.30,
  reliability: 0.25,
  leadership: 0.20,
  adaptability: 0.15,
  communication: 0.10
};

/**
 * Calculate the HRScore based on weighted performance inputs.
 * @param {HRScoreInput} input
 * @returns {HRScoreResult}
 */
export function calculateHRScore(input) {
  const teamImpact = clamp(input.teamImpact, 0, 1);
  const reliability = clamp(input.reliability, 0, 1);
  const leadership = clamp(input.leadership, 0, 1);
  const adaptability = clamp(input.adaptability, 0, 1);
  const communication = clamp(input.communication, 0, 1);

  let normalizedScore =
    WEIGHTS.teamImpact * teamImpact +
    WEIGHTS.reliability * reliability +
    WEIGHTS.leadership * leadership +
    WEIGHTS.adaptability * adaptability +
    WEIGHTS.communication * communication;

  normalizedScore = clamp(normalizedScore, 0, 1);

  const hrScore = clamp(normalizedScore * 100, 0, 100);

  return {
    normalizedScore,
    hrScore
  };
}

export default {
  calculateHRScore
};
