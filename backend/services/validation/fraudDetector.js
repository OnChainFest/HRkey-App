/**
 * Fraud Detection Service
 *
 * Calculates fraud risk score (0-100) based on multiple signals:
 * - Text quality and authenticity
 * - Rating patterns
 * - Consistency with other references
 * - Suspicious patterns
 *
 * Lower scores indicate lower fraud risk (0 = no fraud detected).
 *
 * @module services/validation/fraudDetector
 */

import logger from '../../logger.js';

// Fraud detection weights (sum to 1.0)
const FRAUD_WEIGHTS = {
  text_quality: 0.25,      // Text authenticity signals
  rating_patterns: 0.30,   // Suspicious rating patterns
  consistency: 0.25,       // Consistency with other refs
  email_reputation: 0.20   // Email domain and reputation
};

// Scoring thresholds
const THRESHOLDS = {
  min_text_length: 50,           // Suspiciously short
  max_text_length: 5000,         // Suspiciously long
  perfect_ratings_threshold: 0.9, // All ratings > 4.5 is suspicious
  all_same_rating_threshold: 0.1, // All ratings identical
  common_phrase_limit: 5,        // Max occurrences of common boilerplate phrases
  word_repetition_limit: 0.3     // Max fraction of repeated words
};

/**
 * Calculates comprehensive fraud score for a reference.
 *
 * @param {Object} referenceData - Reference data to analyze
 * @param {string} referenceData.text - Standardized narrative text
 * @param {Object} referenceData.kpi_ratings - KPI ratings object
 * @param {number} referenceData.consistency_score - Consistency score from checker (0-1)
 * @param {string} referenceData.referrer_email - Email of reference provider
 * @returns {number} Fraud score (0-100, lower is better)
 *
 * @example
 * const fraudScore = calculateFraudScore({
 *   text: "John was excellent in every way possible...",
 *   kpi_ratings: { teamwork: 5, leadership: 5, communication: 5 },
 *   consistency_score: 0.95,
 *   referrer_email: "manager@company.com"
 * });
 * // Returns: 15 (low risk)
 */
export function calculateFraudScore(referenceData) {
  const { text, kpi_ratings, consistency_score, referrer_email } = referenceData;

  logger.debug('Calculating fraud score', {
    text_length: text?.length,
    kpi_count: Object.keys(kpi_ratings || {}).length,
    consistency_score
  });

  // Component 1: Text Quality Analysis
  const textQualityScore = analyzeTextQuality(text);

  // Component 2: Rating Pattern Analysis
  const ratingPatternScore = analyzeRatingPatterns(kpi_ratings);

  // Component 3: Consistency Analysis (inverse - lower consistency = higher fraud risk)
  const consistencyFraudScore = (1 - (consistency_score || 1.0)) * 100;

  // Component 4: Email Reputation Analysis
  const emailReputationScore = analyzeEmailReputation(referrer_email);

  // Weighted combination
  const overallFraudScore =
    (textQualityScore * FRAUD_WEIGHTS.text_quality) +
    (ratingPatternScore * FRAUD_WEIGHTS.rating_patterns) +
    (consistencyFraudScore * FRAUD_WEIGHTS.consistency) +
    (emailReputationScore * FRAUD_WEIGHTS.email_reputation);

  const finalScore = Math.round(Math.max(0, Math.min(100, overallFraudScore)));

  logger.debug('Fraud score calculated', {
    overall: finalScore,
    components: {
      text_quality: textQualityScore,
      rating_patterns: ratingPatternScore,
      consistency: consistencyFraudScore,
      email_reputation: emailReputationScore
    }
  });

  return finalScore;
}

/**
 * Analyzes text quality for fraud indicators.
 *
 * @private
 * @param {string} text - Narrative text
 * @returns {number} Text quality fraud score (0-100)
 */
function analyzeTextQuality(text) {
  if (!text || typeof text !== 'string') {
    return 100; // Maximum fraud risk for missing text
  }

  let score = 0;
  const issues = [];

  // Check 1: Text length
  if (text.length < THRESHOLDS.min_text_length) {
    score += 40;
    issues.push('Text too short');
  } else if (text.length > THRESHOLDS.max_text_length) {
    score += 20;
    issues.push('Text suspiciously long');
  }

  // Check 2: Generic/boilerplate phrases
  const boilerplateCount = detectBoilerplatePhrases(text);
  if (boilerplateCount > THRESHOLDS.common_phrase_limit) {
    score += 30;
    issues.push('Contains too many boilerplate phrases');
  }

  // Check 3: Word repetition
  const repetitionScore = calculateWordRepetition(text);
  if (repetitionScore > THRESHOLDS.word_repetition_limit) {
    score += 25;
    issues.push('Excessive word repetition detected');
  }

  // Check 4: All caps (shouting/spam indicator)
  const upperCaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (upperCaseRatio > 0.5) {
    score += 20;
    issues.push('Excessive capitalization');
  }

  // Check 5: Lack of punctuation (low effort)
  const punctuationCount = (text.match(/[.!?,;:]/g) || []).length;
  const sentenceEstimate = text.length / 100; // Rough estimate
  if (punctuationCount < sentenceEstimate * 0.5) {
    score += 15;
    issues.push('Insufficient punctuation');
  }

  logger.debug('Text quality analysis', { score, issues });

  return Math.min(100, score);
}

/**
 * Analyzes rating patterns for suspicious behavior.
 *
 * @private
 * @param {Object} kpiRatings - KPI ratings object
 * @returns {number} Rating pattern fraud score (0-100)
 */
function analyzeRatingPatterns(kpiRatings) {
  if (!kpiRatings || Object.keys(kpiRatings).length === 0) {
    return 50; // Neutral score for missing ratings
  }

  let score = 0;
  const ratings = Object.values(kpiRatings).filter(r => typeof r === 'number');

  if (ratings.length === 0) {
    return 50;
  }

  // Check 1: All perfect ratings (suspiciously high)
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  if (avgRating > THRESHOLDS.perfect_ratings_threshold * 5) {
    score += 35;
  }

  // Check 2: All identical ratings (lazy evaluation)
  const uniqueRatings = new Set(ratings);
  if (uniqueRatings.size === 1) {
    score += 40;
  }

  // Check 3: No variance (all ratings within 0.5 of each other)
  const maxRating = Math.max(...ratings);
  const minRating = Math.min(...ratings);
  if (maxRating - minRating < 0.5 && ratings.length > 3) {
    score += 25;
  }

  // Check 4: Unrealistic precision (e.g., all ratings are x.7347)
  const decimalCounts = {};
  ratings.forEach(r => {
    const decimal = (r % 1).toFixed(2);
    decimalCounts[decimal] = (decimalCounts[decimal] || 0) + 1;
  });
  const maxDecimalCount = Math.max(...Object.values(decimalCounts));
  if (maxDecimalCount > ratings.length * 0.8) {
    score += 20;
  }

  logger.debug('Rating pattern analysis', { score, avg_rating: avgRating, unique_count: uniqueRatings.size });

  return Math.min(100, score);
}

/**
 * Analyzes email reputation for fraud indicators.
 *
 * @private
 * @param {string} email - Referrer email address
 * @returns {number} Email reputation fraud score (0-100)
 */
function analyzeEmailReputation(email) {
  if (!email || typeof email !== 'string') {
    return 50; // Neutral for missing email
  }

  let score = 0;

  // Extract domain
  const emailParts = email.toLowerCase().split('@');
  if (emailParts.length !== 2) {
    return 80; // Invalid email format
  }

  const domain = emailParts[1];

  // Check 1: Disposable email domains (common fraud indicator)
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', '10minutemail.com',
    'guerrillamail.com', 'mailinator.com', 'trashmail.com'
  ];

  if (disposableDomains.includes(domain)) {
    score += 60;
  }

  // Check 2: Free email providers (slightly less trustworthy for professional refs)
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'protonmail.com'
  ];

  if (freeProviders.includes(domain)) {
    score += 15; // Slight penalty, but not major
  }

  // Check 3: Suspicious patterns in email
  const suspiciousPatterns = [
    /\d{5,}/, // 5+ consecutive digits (e.g., user12345@...)
    /^[a-z]{1,2}@/, // Very short username (e.g., a@, xy@)
    /\+test|\+fake|\+spam/i // Test/fake indicators in email
  ];

  suspiciousPatterns.forEach(pattern => {
    if (pattern.test(email)) {
      score += 20;
    }
  });

  logger.debug('Email reputation analysis', { email, domain, score });

  return Math.min(100, score);
}

/**
 * Detects common boilerplate phrases in text.
 *
 * @private
 * @param {string} text - Text to analyze
 * @returns {number} Count of boilerplate phrases detected
 */
function detectBoilerplatePhrases(text) {
  const boilerplatePhrases = [
    'team player',
    'hard worker',
    'goes above and beyond',
    'pleasure to work with',
    'highly recommend',
    'without hesitation',
    'asset to any team',
    'great attitude',
    'self-starter',
    'detail-oriented'
  ];

  let count = 0;
  const lowerText = text.toLowerCase();

  boilerplatePhrases.forEach(phrase => {
    if (lowerText.includes(phrase)) {
      count++;
    }
  });

  return count;
}

/**
 * Calculates word repetition ratio in text.
 *
 * @private
 * @param {string} text - Text to analyze
 * @returns {number} Repetition ratio (0-1)
 */
function calculateWordRepetition(text) {
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words.filter(w => w.length > 3)); // Ignore short words

  if (words.length === 0) return 0;

  const repetitionRatio = 1 - (uniqueWords.size / words.length);
  return repetitionRatio;
}

/**
 * Gets detailed fraud analysis breakdown.
 *
 * @param {Object} referenceData - Reference data
 * @returns {Object} Detailed fraud analysis
 */
export function getFraudAnalysisDetails(referenceData) {
  const { text, kpi_ratings, consistency_score, referrer_email } = referenceData;

  return {
    overall_score: calculateFraudScore(referenceData),
    components: {
      text_quality: {
        score: analyzeTextQuality(text),
        weight: FRAUD_WEIGHTS.text_quality
      },
      rating_patterns: {
        score: analyzeRatingPatterns(kpi_ratings),
        weight: FRAUD_WEIGHTS.rating_patterns
      },
      consistency: {
        score: (1 - (consistency_score || 1.0)) * 100,
        weight: FRAUD_WEIGHTS.consistency
      },
      email_reputation: {
        score: analyzeEmailReputation(referrer_email),
        weight: FRAUD_WEIGHTS.email_reputation
      }
    },
    risk_level: getRiskLevel(calculateFraudScore(referenceData))
  };
}

/**
 * Converts fraud score to risk level.
 *
 * @private
 * @param {number} score - Fraud score (0-100)
 * @returns {string} Risk level
 */
function getRiskLevel(score) {
  if (score < 20) return 'low';
  if (score < 40) return 'medium';
  if (score < 70) return 'high';
  return 'critical';
}

export default {
  calculateFraudScore,
  getFraudAnalysisDetails
};
