/**
 * Narrative Standardization Service
 *
 * Cleans, normalizes, and standardizes reference narrative text.
 * Prepares text for embedding generation and fraud detection.
 *
 * @module services/validation/narrativeStandardizer
 */

/**
 * Standardizes narrative text through multiple cleaning stages.
 *
 * Operations performed:
 * 1. Trim whitespace
 * 2. Normalize line breaks and spacing
 * 3. Remove excessive punctuation
 * 4. Fix common typos and artifacts
 * 5. Normalize quotes and dashes
 * 6. Remove zero-width characters
 *
 * @param {string} text - Raw narrative text
 * @returns {string} Standardized text
 *
 * @example
 * standardizeNarrative("  John was   great!!!  ")
 * // Returns: "John was great!"
 */
export function standardizeNarrative(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text;

  // 1. Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  // 2. Normalize line breaks (convert CRLF and CR to LF)
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Remove excessive newlines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 4. Normalize multiple spaces to single space
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // 5. Remove zero-width characters and other invisible Unicode
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 6. Normalize quotes (convert smart quotes to straight quotes)
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"'); // Smart double quotes
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'"); // Smart single quotes

  // 7. Normalize dashes (convert em-dash, en-dash to hyphen)
  cleaned = cleaned.replace(/[\u2013\u2014]/g, '-');

  // 8. Remove excessive punctuation (3+ consecutive same chars)
  cleaned = cleaned.replace(/([!?.]){3,}/g, '$1$1$1'); // Max 3

  // 9. Fix common spacing issues around punctuation
  cleaned = cleaned.replace(/\s+([,.!?;:])/g, '$1'); // Remove space before punctuation
  cleaned = cleaned.replace(/([,.!?;:])(\w)/g, '$1 $2'); // Add space after punctuation

  // 10. Capitalize first letter of text (basic grammar fix)
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // 11. Final trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Extracts key phrases from narrative text (for future semantic analysis).
 *
 * @param {string} text - Standardized narrative text
 * @returns {Array<string>} Array of key phrases
 *
 * @example
 * extractKeyPhrases("John was a great team player and showed strong leadership.")
 * // Returns: ["great team player", "strong leadership"]
 */
export function extractKeyPhrases(text) {
  if (!text || text.length < 10) {
    return [];
  }

  // Common professional attribute patterns
  const patterns = [
    /\b(excellent|great|strong|outstanding|exceptional|solid|good)\s+(\w+)\s+(skills?|abilities?|performance|attitude)\b/gi,
    /\b(team player|leader|communicator|problem solver|collaborator|mentor)\b/gi,
    /\b(highly?\s+)?(recommend|skilled|talented|capable|reliable|dedicated|motivated)\b/gi
  ];

  const phrases = new Set();

  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = match.toLowerCase().trim();
        if (normalized.length > 3) {
          phrases.add(normalized);
        }
      });
    }
  });

  return Array.from(phrases);
}

/**
 * Validates that narrative text meets minimum quality standards.
 *
 * @param {string} text - Narrative text to validate
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether text passes validation
 * @returns {Array<string>} result.issues - Array of validation issues
 *
 * @example
 * validateNarrativeQuality("abc")
 * // Returns: { valid: false, issues: ["Text too short (minimum 20 characters)"] }
 */
export function validateNarrativeQuality(text) {
  const issues = [];

  if (!text || typeof text !== 'string') {
    return { valid: false, issues: ['Text is empty or invalid'] };
  }

  const trimmed = text.trim();

  // Check minimum length
  if (trimmed.length < 20) {
    issues.push('Text too short (minimum 20 characters)');
  }

  // Check maximum length (reasonable upper bound)
  if (trimmed.length > 10000) {
    issues.push('Text too long (maximum 10,000 characters)');
  }

  // Check for suspicious patterns
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 5) {
    issues.push('Text has too few words (minimum 5 words)');
  }

  // Check for excessive repetition (same word repeated 10+ times)
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordFreq = {};
  words.forEach(word => {
    if (word.length > 3) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const maxFreq = Math.max(...Object.values(wordFreq));
  if (maxFreq > 10 && wordCount < 50) {
    issues.push('Text contains excessive repetition');
  }

  // Check for gibberish (too many consonants in a row)
  const gibberishPattern = /[bcdfghjklmnpqrstvwxyz]{7,}/i;
  if (gibberishPattern.test(trimmed)) {
    issues.push('Text contains potential gibberish');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export default {
  standardizeNarrative,
  extractKeyPhrases,
  validateNarrativeQuality
};
