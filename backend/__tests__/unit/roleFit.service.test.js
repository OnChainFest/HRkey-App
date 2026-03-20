import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const references = [
  {
    id: 'ref-1',
    owner_id: 'candidate-1',
    created_at: '2026-02-01T00:00:00.000Z',
    summary: 'Senior product manager who led onboarding, analytics, and workflow automation initiatives.',
    detailed_feedback: {
      strengths: 'She led a cross-functional onboarding redesign, owned stakeholder communication, and launched an analytics dashboard that reduced onboarding time by 30 percent.',
      example: 'During the Q4 rollout, she coordinated engineering and operations, documented risks, and mentored two coordinators.'
    },
    relationship: 'manager'
  },
  {
    id: 'ref-2',
    owner_id: 'candidate-1',
    created_at: '2025-11-10T00:00:00.000Z',
    summary: 'Managed implementation work for payroll and reporting systems.',
    detailed_feedback: {
      strengths: 'He managed vendor delivery, improved reporting accuracy, and owned the weekly status review with finance leaders.'
    },
    relationship: 'peer'
  },
  {
    id: 'ref-3',
    owner_id: 'candidate-1',
    created_at: '2024-08-10T00:00:00.000Z',
    summary: 'Great person and supportive teammate.',
    detailed_feedback: {
      strengths: 'Great attitude and nice person.'
    },
    relationship: 'peer'
  }
];

const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(async () => ({ data: references, error: null }))
      }))
    }))
  }))
};

const computeCandidateTrustWeightsMock = jest.fn(async () => ({
  weightedScore: 0.62,
  baseScore: 0.58
}));
const getLatestScoreMock = jest.fn(async () => ({ score: 81.2 }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/reputationTrustWeighting.service.js', () => ({
  computeCandidateTrustWeights: computeCandidateTrustWeightsMock
}));

jest.unstable_mockModule('../../services/hrscore/scoreHistory.js', () => ({
  getLatestScore: getLatestScoreMock
}));

const service = await import('../../services/roleFit.service.js');

describe('roleFit.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('separates score clamping from generic rounding semantics', () => {
    expect(service.clampScore(1.2)).toBe(1);
    expect(service.clampScore(-0.4)).toBe(0);
    expect(service.roundTo3(1.2349)).toBe(1.235);
    expect(service.roundTo3(-0.0049)).toBe(-0.005);
  });

  it('computes a bounded, decomposed role-fit score', async () => {
    const result = await service.computeRoleFitScore('candidate-1', {
      requiredSkills: ['onboarding', 'analytics', 'workflow automation'],
      preferredSkills: ['stakeholder communication', 'reporting'],
      seniorityLevel: 'senior',
      keywords: ['payroll', 'operations']
    });

    expect(result.roleFitScore).toBeGreaterThanOrEqual(0);
    expect(result.roleFitScore).toBeLessThanOrEqual(1);
    expect(result.band).toBe('strong');
    expect(result.components.skillMatch).toBeGreaterThan(0.7);
    expect(result.components.evidenceStrength).toBeGreaterThan(0.45);
    expect(result.explanation).toContain('Strong overlap with required role skills.');
    expect(result.caveats).toContain('Reference quality is uneven across submissions.');
    expect(result.diagnostics.referenceQuality).toHaveLength(3);
    expect(result.diagnostics.requiredSkillCeiling.capApplied).toBe(false);
  });

  it('returns limited fit when role evidence is sparse', async () => {
    const result = await service.computeRoleFitScore('candidate-1', {
      requiredSkills: ['java', 'distributed systems', 'kubernetes'],
      preferredSkills: ['machine learning'],
      seniorityLevel: 'senior',
      keywords: ['compiler']
    });

    expect(result.band).toBe('limited');
    expect(result.components.skillMatch).toBeLessThan(0.3);
    expect(result.caveats).toContain('Limited evidence for required domain skills.');
    expect(result.caveats).not.toContain('Low overlap with required skills capped the final fit assessment.');
    expect(result.roleFitScore).toBeLessThanOrEqual(0.38);
    expect(result.diagnostics.requiredSkillCeiling).toMatchObject({
      capApplied: true,
      wasReduced: false,
      capValue: 0.38
    });
  });

  it('keeps deterministic repeated runs identical', async () => {
    const roleDefinition = {
      requiredSkills: ['analytics', 'onboarding'],
      preferredSkills: ['reporting'],
      seniorityLevel: 'senior',
      keywords: ['operations']
    };

    const first = await service.computeRoleFitScore('candidate-1', roleDefinition);
    const second = await service.computeRoleFitScore('candidate-1', roleDefinition);

    expect(first).toEqual(second);
  });

  it('does not apply the required-skill ceiling when no required skills were provided', async () => {
    const result = await service.computeRoleFitScore('candidate-1', {
      requiredSkills: [],
      preferredSkills: ['analytics', 'operations'],
      seniorityLevel: 'senior',
      keywords: ['payroll']
    });

    expect(result.diagnostics.requiredSkillCeiling).toMatchObject({
      capApplied: false,
      capValue: null
    });
    expect(result.caveats).not.toContain('Low overlap with required skills capped the final fit assessment.');
  });

  it('prevents trust adjustment from rescuing a weak required-skill match above the cap', async () => {
    computeCandidateTrustWeightsMock.mockResolvedValueOnce({
      weightedScore: 1,
      baseScore: 0
    });

    const result = await service.computeRoleFitScore('candidate-1', {
      requiredSkills: ['kubernetes', 'rust', 'distributed systems', 'compiler'],
      preferredSkills: ['machine learning'],
      seniorityLevel: 'senior',
      keywords: ['gpu']
    });

    expect(result.diagnostics.trustAdjustment).toMatchObject({
      direction: 'increase',
      appliedDelta: 0.03,
      weightedScore: 1,
      baseScore: 0
    });
    expect(result.roleFitScore).toBeLessThanOrEqual(0.38);
    expect(result.diagnostics.requiredSkillCeiling.capApplied).toBe(true);
  });

  it('applies the moderate required-skill ceiling for partial overlap', async () => {
    computeCandidateTrustWeightsMock.mockResolvedValueOnce({
      weightedScore: 1,
      baseScore: 0
    });

    const result = await service.computeRoleFitScore('candidate-1', {
      requiredSkills: ['analytics', 'unknown platform', 'missing skill', 'another missing skill'],
      preferredSkills: ['operations', 'reporting'],
      seniorityLevel: 'senior',
      keywords: ['payroll']
    });

    expect(result.diagnostics.skillMatch.requiredScore).toBe(0.25);
    expect(result.roleFitScore).toBeLessThanOrEqual(0.55);
    expect(result.caveats).toContain('Low overlap with required skills capped the final fit assessment.');
    expect(result.diagnostics.requiredSkillCeiling).toMatchObject({
      capApplied: true,
      wasReduced: true,
      capValue: 0.55
    });
  });
});
