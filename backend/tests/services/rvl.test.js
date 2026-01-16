/**
 * Reference Validation Layer (RVL) - Unit Tests
 *
 * Tests for all RVL services:
 * - narrativeStandardizer
 * - embeddingService
 * - consistencyChecker
 * - fraudDetector
 * - structuredOutputGen
 * - main validateReference function
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { standardizeNarrative, validateNarrativeQuality, extractKeyPhrases } from '../../services/validation/narrativeStandardizer.js';
import { generateEmbedding, cosineSimilarity } from '../../services/validation/embeddingService.js';
import { checkConsistency, detectContradictions } from '../../services/validation/consistencyChecker.js';
import { calculateFraudScore, getFraudAnalysisDetails } from '../../services/validation/fraudDetector.js';
import { generateStructuredOutput, formatForHRScore, formatForAPI } from '../../services/validation/structuredOutputGen.js';
import { validateReference, getRVLInfo } from '../../services/validation/index.js';

// ============================================================================
// NARRATIVE STANDARDIZER TESTS
// ============================================================================

describe('narrativeStandardizer', () => {
  describe('standardizeNarrative', () => {
    it('should trim whitespace', () => {
      const input = '  John was excellent  ';
      const output = standardizeNarrative(input);
      expect(output).toBe('John was excellent');
    });

    it('should normalize excessive punctuation', () => {
      const input = 'Amazing!!!!!';
      const output = standardizeNarrative(input);
      expect(output).toBe('Amazing!!!');
    });

    it('should normalize line breaks', () => {
      const input = 'Line1\r\n\r\n\r\nLine2';
      const output = standardizeNarrative(input);
      expect(output).toBe('Line1\n\nLine2');
    });

    it('should convert smart quotes to straight quotes', () => {
      const input = '"Smart quotes" and \'single quotes\'';
      const output = standardizeNarrative(input);
      expect(output).toBe('"Smart quotes" and \'single quotes\'');
    });

    it('should capitalize first letter', () => {
      const input = 'john was excellent';
      const output = standardizeNarrative(input);
      expect(output.charAt(0)).toBe('J');
    });

    it('should handle empty input', () => {
      expect(standardizeNarrative('')).toBe('');
      expect(standardizeNarrative(null)).toBe('');
      expect(standardizeNarrative(undefined)).toBe('');
    });
  });

  describe('validateNarrativeQuality', () => {
    it('should pass valid text', () => {
      const text = 'John was an excellent team member who consistently delivered high-quality work.';
      const result = validateNarrativeQuality(text);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail text that is too short', () => {
      const text = 'Too short';
      const result = validateNarrativeQuality(text);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Text too short (minimum 20 characters)');
    });

    it('should fail text with too few words', () => {
      const text = 'Only three words';
      const result = validateNarrativeQuality(text);
      expect(result.valid).toBe(false);
    });

    it('should fail text with excessive repetition', () => {
      const text = 'test test test test test test test test test test test';
      const result = validateNarrativeQuality(text);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('repetition'))).toBe(true);
    });
  });

  describe('extractKeyPhrases', () => {
    it('should extract common professional phrases', () => {
      const text = 'John was a great team player and showed excellent communication skills.';
      const phrases = extractKeyPhrases(text);
      expect(phrases).toContain('team player');
      expect(phrases.length).toBeGreaterThan(0);
    });

    it('should return empty array for short text', () => {
      const phrases = extractKeyPhrases('Too short');
      expect(phrases).toEqual([]);
    });
  });
});

// ============================================================================
// EMBEDDING SERVICE TESTS
// ============================================================================

describe('embeddingService', () => {
  describe('generateEmbedding', () => {
    it('should generate embedding vector with correct dimensions', async () => {
      const text = 'John was an excellent team member';
      const embedding = await generateEmbedding(text);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding).toHaveLength(1536); // OpenAI ada-002 dimensions
      expect(typeof embedding[0]).toBe('number');
    });

    it('should generate consistent embeddings for same text', async () => {
      const text = 'Test consistency';
      const embedding1 = await generateEmbedding(text);
      const embedding2 = await generateEmbedding(text);

      // Mock embeddings should be deterministic
      expect(embedding1).toEqual(embedding2);
    });

    it('should reject text that is too short', async () => {
      await expect(generateEmbedding('Short')).rejects.toThrow('Text too short');
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors as 1.0', () => {
      const vec = [1, 2, 3, 4, 5];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between opposite vectors as -1.0', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors as 0', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should throw error for invalid vectors', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Invalid embedding vectors');
    });
  });
});

// ============================================================================
// CONSISTENCY CHECKER TESTS
// ============================================================================

describe('consistencyChecker', () => {
  describe('checkConsistency', () => {
    it('should return perfect score when no previous references exist', async () => {
      const result = await checkConsistency(
        'John was excellent',
        { teamwork: 5, leadership: 4 },
        []
      );

      expect(result.consistency_score).toBe(1.0);
      expect(result.flags).toHaveLength(0);
    });

    it('should detect KPI deviations', async () => {
      const previousRefs = [
        { kpi_ratings: { teamwork: 5, leadership: 5 } },
        { kpi_ratings: { teamwork: 4.5, leadership: 4.8 } }
      ];

      const result = await checkConsistency(
        'John was okay',
        { teamwork: 1, leadership: 1 }, // Large deviation
        previousRefs
      );

      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.flags.some(f => f.type === 'KPI_DEVIATION')).toBe(true);
    });

    it('should calculate lower consistency score for inconsistent ratings', async () => {
      const previousRefs = [
        { kpi_ratings: { teamwork: 5 } },
        { kpi_ratings: { teamwork: 5 } }
      ];

      const result = await checkConsistency(
        'John was okay',
        { teamwork: 1 }, // Very different from previous
        previousRefs
      );

      expect(result.consistency_score).toBeLessThan(0.9);
    });
  });

  describe('detectContradictions', () => {
    it('should detect contradictory statements', () => {
      const text = 'John was always punctual. However, he was often late to meetings.';
      const contradictions = detectContradictions(text);

      expect(contradictions.length).toBeGreaterThan(0);
    });

    it('should return empty array for short text', () => {
      const contradictions = detectContradictions('Short text');
      expect(contradictions).toEqual([]);
    });
  });
});

// ============================================================================
// FRAUD DETECTOR TESTS
// ============================================================================

describe('fraudDetector', () => {
  describe('calculateFraudScore', () => {
    it('should return low score for legitimate reference', () => {
      const score = calculateFraudScore({
        text: 'John was an excellent team member who consistently delivered high-quality work. He showed strong leadership skills and was always willing to help others. His communication was clear and effective, and he worked well under pressure.',
        kpi_ratings: { teamwork: 4.5, leadership: 4, communication: 5, reliability: 4.8 },
        consistency_score: 0.9,
        referrer_email: 'manager@company.com'
      });

      expect(score).toBeLessThan(30);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return high score for suspiciously short text', () => {
      const score = calculateFraudScore({
        text: 'Good.',
        kpi_ratings: { teamwork: 5 },
        consistency_score: 0.9,
        referrer_email: 'test@gmail.com'
      });

      expect(score).toBeGreaterThan(30);
    });

    it('should return high score for all perfect ratings', () => {
      const score = calculateFraudScore({
        text: 'John was perfect in every way. He is the best employee I have ever worked with. Everything he does is flawless.',
        kpi_ratings: { teamwork: 5, leadership: 5, communication: 5, reliability: 5, innovation: 5 },
        consistency_score: 0.9,
        referrer_email: 'manager@company.com'
      });

      expect(score).toBeGreaterThan(20); // Should flag perfect ratings
    });

    it('should penalize disposable email domains', () => {
      const score1 = calculateFraudScore({
        text: 'John was an excellent team member who consistently delivered high-quality work and showed strong leadership.',
        kpi_ratings: { teamwork: 4, leadership: 4 },
        consistency_score: 0.9,
        referrer_email: 'manager@tempmail.com' // Disposable
      });

      const score2 = calculateFraudScore({
        text: 'John was an excellent team member who consistently delivered high-quality work and showed strong leadership.',
        kpi_ratings: { teamwork: 4, leadership: 4 },
        consistency_score: 0.9,
        referrer_email: 'manager@company.com' // Corporate
      });

      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('getFraudAnalysisDetails', () => {
    it('should return detailed breakdown', () => {
      const details = getFraudAnalysisDetails({
        text: 'John was excellent',
        kpi_ratings: { teamwork: 4 },
        consistency_score: 0.9,
        referrer_email: 'test@company.com'
      });

      expect(details).toHaveProperty('overall_score');
      expect(details).toHaveProperty('components');
      expect(details).toHaveProperty('risk_level');
      expect(details.components).toHaveProperty('text_quality');
      expect(details.components).toHaveProperty('rating_patterns');
    });
  });
});

// ============================================================================
// STRUCTURED OUTPUT GENERATOR TESTS
// ============================================================================

describe('structuredOutputGen', () => {
  describe('generateStructuredOutput', () => {
    it('should generate complete structured output', () => {
      const input = {
        standardized_text: 'John was an excellent team member.',
        kpi_ratings: { teamwork: 5, leadership: 4 },
        detailed_feedback: { recommendation: 'Highly recommend' },
        consistency_score: 0.95,
        fraud_score: 10,
        embedding_vector: null,
        flags: []
      };

      const output = generateStructuredOutput(input);

      expect(output).toHaveProperty('standardized_text');
      expect(output).toHaveProperty('structured_dimensions');
      expect(output).toHaveProperty('consistency_score');
      expect(output).toHaveProperty('fraud_score');
      expect(output).toHaveProperty('confidence');
      expect(output).toHaveProperty('validation_status');
      expect(output).toHaveProperty('metadata');

      expect(output.structured_dimensions).toHaveProperty('teamwork');
      expect(output.structured_dimensions.teamwork).toHaveProperty('rating');
      expect(output.structured_dimensions.teamwork).toHaveProperty('confidence');
    });

    it('should calculate appropriate validation status', () => {
      const input = {
        standardized_text: 'Test',
        kpi_ratings: { teamwork: 5 },
        detailed_feedback: {},
        consistency_score: 0.95,
        fraud_score: 10,
        embedding_vector: null,
        flags: []
      };

      const output = generateStructuredOutput(input);
      expect(output.validation_status).toBe('APPROVED');
    });

    it('should reject high fraud score', () => {
      const input = {
        standardized_text: 'Test',
        kpi_ratings: { teamwork: 5 },
        detailed_feedback: {},
        consistency_score: 0.95,
        fraud_score: 75, // High fraud
        embedding_vector: null,
        flags: []
      };

      const output = generateStructuredOutput(input);
      expect(output.validation_status).toBe('REJECTED_HIGH_FRAUD_RISK');
    });
  });

  describe('formatForHRScore', () => {
    it('should format for HRScore engine', () => {
      const structured = generateStructuredOutput({
        standardized_text: 'John was excellent',
        kpi_ratings: { teamwork: 5, leadership: 4 },
        detailed_feedback: {},
        consistency_score: 0.95,
        fraud_score: 10,
        embedding_vector: null,
        flags: []
      });

      const formatted = formatForHRScore(structured);

      expect(formatted).toHaveProperty('kpi_ratings');
      expect(formatted).toHaveProperty('narrative');
      expect(formatted).toHaveProperty('confidence_score');
      expect(formatted).toHaveProperty('validation_passed');
      expect(formatted.kpi_ratings.teamwork).toBe(5);
    });
  });

  describe('formatForAPI', () => {
    it('should format for API response', () => {
      const structured = generateStructuredOutput({
        standardized_text: 'John was excellent',
        kpi_ratings: { teamwork: 5 },
        detailed_feedback: {},
        consistency_score: 0.95,
        fraud_score: 10,
        embedding_vector: [1, 2, 3],
        flags: []
      });

      const formatted = formatForAPI(structured, false);

      expect(formatted).toHaveProperty('status');
      expect(formatted).toHaveProperty('confidence');
      expect(formatted).not.toHaveProperty('embedding_vector');
    });
  });
});

// ============================================================================
// MAIN VALIDATE REFERENCE FUNCTION TESTS
// ============================================================================

describe('validateReference (main function)', () => {
  it('should validate a complete reference end-to-end', async () => {
    const rawReference = {
      summary: 'John was an excellent team member who consistently delivered high-quality work. He showed strong leadership and communication skills.',
      kpi_ratings: { teamwork: 4.5, leadership: 4, communication: 5 },
      detailed_feedback: { recommendation: 'Highly recommend' },
      owner_id: '123e4567-e89b-12d3-a456-426614174000',
      referrer_email: 'manager@company.com'
    };

    const result = await validateReference(rawReference, {
      skipEmbeddings: true,
      skipConsistencyCheck: true
    });

    expect(result).toHaveProperty('standardized_text');
    expect(result).toHaveProperty('structured_dimensions');
    expect(result).toHaveProperty('fraud_score');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('validation_status');
    expect(result.fraud_score).toBeLessThan(50);
  });

  it('should reject reference with text too short', async () => {
    const rawReference = {
      summary: 'Good',
      kpi_ratings: { teamwork: 5 },
      detailed_feedback: {},
      owner_id: '123e4567-e89b-12d3-a456-426614174000',
      referrer_email: 'test@company.com'
    };

    await expect(
      validateReference(rawReference, { skipEmbeddings: true })
    ).rejects.toThrow('too short');
  });

  it('should handle validation with previous references', async () => {
    const rawReference = {
      summary: 'John was an excellent team member with great skills.',
      kpi_ratings: { teamwork: 4 },
      detailed_feedback: {},
      owner_id: '123e4567-e89b-12d3-a456-426614174000',
      referrer_email: 'test@company.com'
    };

    const previousRefs = [
      {
        summary: 'John was good',
        kpi_ratings: { teamwork: 4.5 },
        validated_data: null
      }
    ];

    const result = await validateReference(rawReference, {
      previousReferences: previousRefs,
      skipEmbeddings: true
    });

    expect(result.consistency_score).toBeDefined();
    expect(result.consistency_score).toBeGreaterThan(0);
  });
});

// ============================================================================
// RVL INFO TESTS
// ============================================================================

describe('getRVLInfo', () => {
  it('should return RVL configuration info', () => {
    const info = getRVLInfo();

    expect(info).toHaveProperty('version');
    expect(info).toHaveProperty('enabled_features');
    expect(info).toHaveProperty('thresholds');
    expect(info.version).toBe('1.0.0');
    expect(info.enabled_features.text_standardization).toBe(true);
  });
});
