/**
 * Reference Validation Layer (heuristic v1)
 * Cleans narrative references and extracts simple, normalized signals.
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
 * Normalize whitespace and trim the reference text.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

const EXAGGERATION_KEYWORDS = ['always', 'never', 'perfect', 'flawless', 'best ever', 'world-class'];
const NEGATIVE_KEYWORDS = ['unreliable', 'late', 'problem', 'conflict', 'dishonest', 'weak'];
const POSITIVE_KEYWORDS = ['excellent', 'outstanding', 'highly recommend', 'reliable', 'strong', 'great'];

const IMPACT_KEYWORDS = ['impact', 'results', 'delivered', 'ownership', 'leader'];
const RELIABILITY_KEYWORDS = ['reliable', 'on time', 'consistent', 'trust', 'dependable'];
const COMMUNICATION_KEYWORDS = ['communication', 'communicator', 'clear', 'presentations', 'clients', 'explained', 'articulate'];

/**
 * Determine if any keyword exists within the text.
 * @param {string} lowerText
 * @param {string[]} keywords
 * @returns {boolean}
 */
function hasKeyword(lowerText, keywords) {
  return keywords.some((keyword) => lowerText.includes(keyword));
}

/**
 * Returns a lightweight length factor used in signal scoring.
 * @param {number} length
 * @returns {number}
 */
function lengthFactor(length) {
  if (length <= 0) return 0;
  if (length < 40) return 0.2;
  if (length < 200) return 0.6;
  return 1;
}

/**
 * Calculate a signal from keyword hits and text length.
 * @param {string} lowerText
 * @param {string[]} keywords
 * @param {number} lenFactor
 * @returns {number}
 */
function computeSignal(lowerText, keywords, lenFactor) {
  let score = lenFactor * 0.3;

  keywords.forEach((keyword) => {
    if (lowerText.includes(keyword)) {
      score += 0.25;
    }
  });

  return clamp(score, 0, 1);
}

/**
 * @typedef {Object} ReferenceAnswerInput
 * @property {string} questionId
 * @property {string} answerText
 */

/**
 * @typedef {Object} ReferenceAnswerOutput
 * @property {string} questionId
 * @property {string} cleanedText
 * @property {boolean} exaggerationFlag
 * @property {boolean} positivityFlag
 * @property {boolean} negativityFlag
 * @property {number} impactSignal
 * @property {number} reliabilitySignal
 * @property {number} communicationSignal
 */

/**
 * @typedef {Object} AggregatedSignals
 * @property {number} teamImpact
 * @property {number} reliability
 * @property {number} communication
 */

/**
 * @typedef {Object} ReferenceValidationResult
 * @property {ReferenceAnswerOutput[]} answers
 * @property {AggregatedSignals} aggregatedSignals
 */

/**
 * Validate and score a collection of reference answers.
 * @param {ReferenceAnswerInput[]} answers
 * @returns {ReferenceValidationResult}
 */
export function validateReferences(answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    return {
      answers: [],
      aggregatedSignals: { teamImpact: 0, reliability: 0, communication: 0 }
    };
  }

  const outputs = answers.map((answer) => {
    const cleanedText = cleanText(answer?.answerText ?? '');
    const lowerText = cleanedText.toLowerCase();
    const lenFactor = lengthFactor(cleanedText.length);

    const exaggerationFlag = hasKeyword(lowerText, EXAGGERATION_KEYWORDS);
    const negativityFlag = hasKeyword(lowerText, NEGATIVE_KEYWORDS);
    const positivityFlag = hasKeyword(lowerText, POSITIVE_KEYWORDS);

    const impactSignal = computeSignal(lowerText, IMPACT_KEYWORDS, lenFactor);
    const reliabilitySignal = computeSignal(lowerText, RELIABILITY_KEYWORDS, lenFactor);
    const communicationSignal = computeSignal(lowerText, COMMUNICATION_KEYWORDS, lenFactor);

    return {
      questionId: answer?.questionId ?? '',
      cleanedText,
      exaggerationFlag,
      positivityFlag,
      negativityFlag,
      impactSignal,
      reliabilitySignal,
      communicationSignal
    };
  });

  const total = outputs.length;
  const aggregatedSignals = total
    ? {
        teamImpact: clamp(
          outputs.reduce((sum, ans) => sum + ans.impactSignal, 0) / total,
          0,
          1
        ),
        reliability: clamp(
          outputs.reduce((sum, ans) => sum + ans.reliabilitySignal, 0) / total,
          0,
          1
        ),
        communication: clamp(
          outputs.reduce((sum, ans) => sum + ans.communicationSignal, 0) / total,
          0,
          1
        )
      }
    : { teamImpact: 0, reliability: 0, communication: 0 };

  return {
    answers: outputs,
    aggregatedSignals
  };
}

export default {
  validateReferences
};
