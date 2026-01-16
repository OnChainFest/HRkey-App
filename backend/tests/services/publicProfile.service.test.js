import { jest } from '@jest/globals';

const mockMaybeSingle = jest.fn();
const mockOr = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSupabaseClient = {
  from: jest.fn()
};

const mockEvaluateCandidateForUser = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: mockEvaluateCandidateForUser
}));

const { getPublicProfile, getPublicIdentifierForUser } = await import('../../services/publicProfile.service.js');

describe('Public Profile Service', () => {
  beforeEach(() => {
    const builder = {
      select: mockSelect,
      or: mockOr,
      maybeSingle: mockMaybeSingle,
      eq: mockEq
    };

    mockMaybeSingle.mockReset();
    mockEq.mockReset().mockReturnValue(builder);
    mockOr.mockReset().mockReturnValue(builder);
    mockSelect.mockReset().mockReturnValue(builder);
    mockSupabaseClient.from.mockReset().mockReturnValue(builder);
    mockEvaluateCandidateForUser.mockReset();
  });

  test('returns public profile with evaluation data', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'user-1',
        public_handle: 'jane-doe',
        full_name: 'Jane Doe',
        headline: 'Backend Engineer',
        skills: ['node', 'express'],
        is_public_profile: true
      },
      error: null
    });

    mockEvaluateCandidateForUser.mockResolvedValue({
      scoring: {
        hrScoreResult: { hrScore: 82, normalizedScore: 0.82 },
        pricingResult: { priceUsd: 120 }
      }
    });

    const result = await getPublicProfile('jane-doe');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('users');
    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-1');
    expect(result?.userId).toBe('user-1');
    expect(result?.handle).toBe('jane-doe');
    expect(result?.hrScore).toBe(82);
    expect(result?.priceUsd).toBe(120);
  });

  test('returns profile without optional token data', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'user-2', full_name: 'Sam', is_public_profile: true },
      error: null
    });

    mockEvaluateCandidateForUser.mockResolvedValue({
      scoring: {
        hrScoreResult: { hrScore: 60 },
        pricingResult: { priceUsd: 80 }
      }
    });

    const result = await getPublicProfile('user-2');

    expect(result?.hrScore).toBe(60);
    expect(result?.priceUsd).toBe(80);
  });

  test('returns null when profile is not public or not found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'user-3', is_public_profile: false }, error: null });
    const hidden = await getPublicProfile('user-3');
    expect(hidden).toBeNull();

    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const missing = await getPublicProfile('missing');
    expect(missing).toBeNull();
  });

  test('getPublicIdentifierForUser resolves handle or id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'user-4', public_handle: 'public-handle', is_public_profile: true },
      error: null
    });

    const identifier = await getPublicIdentifierForUser('user-4');

    expect(identifier?.identifier).toBe('public-handle');
    expect(identifier?.handle).toBe('public-handle');
    expect(identifier?.isPublicProfile).toBe(true);

    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'user-5', is_public_profile: false }, error: null });
    const fallback = await getPublicIdentifierForUser('user-5');
    expect(fallback?.identifier).toBe('user-5');
    expect(fallback?.isPublicProfile).toBe(false);
  });
});
