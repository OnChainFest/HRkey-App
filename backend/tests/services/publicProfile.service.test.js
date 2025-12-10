import { jest } from '@jest/globals';

const mockMaybeSingle = jest.fn();
const mockOr = jest.fn();
const mockSelect = jest.fn();
const mockSupabaseClient = {
  from: jest.fn()
};

const mockEvaluateCandidateForUser = jest.fn();
const mockGetTokenomicsPreviewForUser = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/candidateEvaluation.service.js', () => ({
  evaluateCandidateForUser: mockEvaluateCandidateForUser
}));

jest.unstable_mockModule('../../services/tokenomicsPreview.service.js', () => ({
  getTokenomicsPreviewForUser: mockGetTokenomicsPreviewForUser
}));

const { getPublicProfile } = await import('../../services/publicProfile.service.js');

describe('Public Profile Service', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockOr.mockReset().mockReturnValue({ select: mockSelect, maybeSingle: mockMaybeSingle });
    mockSelect.mockReset().mockReturnValue({ or: mockOr, maybeSingle: mockMaybeSingle });
    mockSupabaseClient.from.mockReset().mockReturnValue({
      select: mockSelect,
      or: mockOr,
      maybeSingle: mockMaybeSingle
    });
    mockEvaluateCandidateForUser.mockReset();
    mockGetTokenomicsPreviewForUser.mockReset();
  });

  test('returns public profile with tokenomics preview', async () => {
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

    mockGetTokenomicsPreviewForUser.mockResolvedValue({
      tokens: { clampedTokens: 950 }
    });

    const result = await getPublicProfile('jane-doe');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('users');
    expect(mockEvaluateCandidateForUser).toHaveBeenCalledWith('user-1');
    expect(mockGetTokenomicsPreviewForUser).toHaveBeenCalledWith('user-1');
    expect(result?.userId).toBe('user-1');
    expect(result?.handle).toBe('jane-doe');
    expect(result?.hrScore).toBe(82);
    expect(result?.priceUsd).toBe(120);
    expect(result?.hrkTokens).toBe(950);
  });

  test('returns profile without tokenomics when preview fails', async () => {
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

    mockGetTokenomicsPreviewForUser.mockRejectedValue(new Error('Preview failed'));

    const result = await getPublicProfile('user-2');

    expect(result?.hrkTokens).toBeNull();
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
});
