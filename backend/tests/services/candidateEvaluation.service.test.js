import { jest } from '@jest/globals';

const mockEq = jest.fn();
const mockReferencesTable = {
  select: jest.fn().mockReturnThis(),
  eq: mockEq
};
const mockSupabaseClient = {
  from: jest.fn(() => mockReferencesTable)
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const { evaluateCandidateForUser } = await import('../../services/candidateEvaluation.service.js');

const EMPTY_PRICE_USD = 24;

describe('Candidate Evaluation Service', () => {
  beforeEach(() => {
    mockEq.mockReset();
    mockReferencesTable.select.mockClear().mockReturnThis();
    mockSupabaseClient.from.mockClear().mockReturnValue(mockReferencesTable);
  });

  test('returns baseline scoring for user with no references', async () => {
    mockEq.mockResolvedValueOnce({ data: [], error: null });

    const result = await evaluateCandidateForUser('user-empty');

    expect(result.userId).toBe('user-empty');
    expect(result.scoring.referenceAnalysis.answers).toHaveLength(0);
    expect(result.scoring.hrScoreResult.hrScore).toBe(0);
    expect(result.scoring.pricingResult.priceUsd).toBeCloseTo(EMPTY_PRICE_USD, 5);
    expect(result.rawReferences).toBeUndefined();
  });

  test('raises scores for multiple strong references', async () => {
    const mockRows = [
      {
        id: 'ref-1',
        summary: 'Excellent and reliable teammate who delivered great impact and communication.',
        detailed_feedback: { recommendation: 'Highly recommend', strengths: 'Clear with clients' }
      },
      {
        id: 'ref-2',
        summary: 'Outstanding results with strong leadership and ownership.'
      }
    ];

    mockEq.mockResolvedValueOnce({ data: mockRows, error: null });

    const result = await evaluateCandidateForUser('user-strong');

    expect(result.scoring.referenceAnalysis.answers).toHaveLength(2);
    expect(result.scoring.hrScoreResult.hrScore).toBeGreaterThan(50);
    expect(result.scoring.pricingResult.priceUsd).toBeGreaterThan(EMPTY_PRICE_USD);
    expect(result.rawReferences).toBeUndefined();
  });

  test('optionally returns raw references when requested', async () => {
    const mockRows = [
      { id: 'ref-raw', summary: 'Reliable and clear communicator.' }
    ];

    mockEq.mockResolvedValueOnce({ data: mockRows, error: null });

    const result = await evaluateCandidateForUser('user-raw', { includeRawReferences: true });

    expect(result.rawReferences).toEqual(mockRows);
    expect(result.scoring.referenceAnalysis.answers[0].questionId).toBe('ref-raw');
  });

  test('throws when userId is missing', async () => {
    await expect(evaluateCandidateForUser('')).rejects.toThrow('userId is required');
  });
});
