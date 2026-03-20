import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const referencesByCandidate = {
  'candidate-strong': [
    {
      id: 'ref-s1', owner_id: 'candidate-strong', created_at: '2026-02-01T00:00:00.000Z', relationship: 'manager',
      summary: 'Senior engineering manager who led platform modernization and analytics programs.',
      detailed_feedback: {
        strengths: 'She owned the migration roadmap, led a cross-functional program across engineering and operations, and improved deployment reliability by 35 percent.',
        example: 'In the latest release she mentored two leads, coordinated architecture reviews, and delivered the platform launch on time.'
      }
    },
    {
      id: 'ref-s2', owner_id: 'candidate-strong', created_at: '2025-05-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Led workflow automation and reporting delivery.',
      detailed_feedback: {
        strengths: 'He managed vendor coordination, owned analytics reporting, and shipped a scalable workflow automation program.'
      }
    },
    {
      id: 'ref-s3', owner_id: 'candidate-strong', created_at: '2024-01-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Product lead with strong delivery ownership.',
      detailed_feedback: {
        strengths: 'She delivered roadmap milestones, improved KPI visibility, and partnered with finance on forecasting.'
      }
    }
  ],
  'candidate-mismatch': [
    {
      id: 'ref-m1', owner_id: 'candidate-mismatch', created_at: '2026-01-01T00:00:00.000Z', relationship: 'manager',
      summary: 'Outstanding operations leader with analytics delivery.',
      detailed_feedback: {
        strengths: 'He led onboarding analytics, managed payroll reporting, and improved service delivery by 20 percent.'
      }
    },
    {
      id: 'ref-m2', owner_id: 'candidate-mismatch', created_at: '2025-01-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Trusted collaborator on reporting programs.',
      detailed_feedback: {
        strengths: 'She owned stakeholder communication and launched dashboard improvements.'
      }
    }
  ],
  'candidate-sparse': [
    {
      id: 'ref-p1', owner_id: 'candidate-sparse', created_at: '2024-06-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Great person and supportive teammate.',
      detailed_feedback: { strengths: 'Good worker with a great attitude.' }
    }
  ],
  'candidate-flat': [
    {
      id: 'ref-f1', owner_id: 'candidate-flat', created_at: '2024-01-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Worked on projects with the team.',
      detailed_feedback: { strengths: 'Supported delivery and was helpful.' }
    },
    {
      id: 'ref-f2', owner_id: 'candidate-flat', created_at: '2025-01-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Worked on projects with the team.',
      detailed_feedback: { strengths: 'Supported delivery and was helpful.' }
    }
  ],
  'candidate-progressive': [
    {
      id: 'ref-g1', owner_id: 'candidate-progressive', created_at: '2023-01-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Supported sprint delivery for the product team.',
      detailed_feedback: { strengths: 'Helped coordinate tasks and documentation.' }
    },
    {
      id: 'ref-g2', owner_id: 'candidate-progressive', created_at: '2026-01-01T00:00:00.000Z', relationship: 'manager',
      summary: 'Senior manager who led platform strategy and cross-functional launches.',
      detailed_feedback: { strengths: 'Owned the roadmap, mentored managers, drove architecture decisions, and delivered a complex migration program.' }
    }
  ],
  'candidate-no-network': [
    {
      id: 'ref-n1', owner_id: 'candidate-no-network', created_at: '2025-03-01T00:00:00.000Z', relationship: 'manager',
      summary: 'Operations manager with moderate reporting ownership.',
      detailed_feedback: { strengths: 'Managed weekly operations reviews and improved process consistency.' }
    },
    {
      id: 'ref-n2', owner_id: 'candidate-no-network', created_at: '2024-03-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Coordinated delivery efforts across teams.',
      detailed_feedback: { strengths: 'Supported launches and documented follow-up actions.' }
    }
  ],
  'candidate-ceiling-not-reduced': [
    {
      id: 'ref-c1', owner_id: 'candidate-ceiling-not-reduced', created_at: '2025-08-01T00:00:00.000Z', relationship: 'peer',
      summary: 'General support for delivery.',
      detailed_feedback: { strengths: 'Supported project delivery and communicated status.' }
    },
    {
      id: 'ref-c2', owner_id: 'candidate-ceiling-not-reduced', created_at: '2024-08-01T00:00:00.000Z', relationship: 'peer',
      summary: 'Reliable collaborator.',
      detailed_feedback: { strengths: 'Helped with documentation and execution support.' }
    }
  ]
};

const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn((field, candidateId) => ({
        order: jest.fn(async () => ({ data: referencesByCandidate[candidateId] || [], error: null }))
      }))
    }))
  }))
};

const computeCandidateTrustWeightsMock = jest.fn(async (candidateId) => {
  if (candidateId === 'candidate-no-network') throw new Error('trust unavailable');
  return ({
    'candidate-strong': { weightedScore: 0.82, baseScore: 0.74 },
    'candidate-mismatch': { weightedScore: 0.95, baseScore: 0.55 },
    'candidate-sparse': { weightedScore: 0.52, baseScore: 0.5 },
    'candidate-flat': { weightedScore: 0.6, baseScore: 0.56 },
    'candidate-progressive': { weightedScore: 0.67, baseScore: 0.61 },
    'candidate-ceiling-not-reduced': { weightedScore: 0.51, baseScore: 0.5 }
  }[candidateId] || { weightedScore: 0.5, baseScore: 0.5 });
});

const computeCandidateRecruiterInsightsMock = jest.fn(async (candidateId) => {
  if (candidateId === 'candidate-no-network') throw new Error('graph unavailable');
  return ({
    'candidate-strong': {
      summary: { overallGraphReadiness: 'strong' },
      insights: [{ score: 0.8 }, { score: 0.77 }, { score: 0.74 }],
      supportingCounts: { referenceCount: 3, canonicalRefereeCount: 3, unresolvedReferenceCount: 0 }
    },
    'candidate-mismatch': {
      summary: { overallGraphReadiness: 'strong' },
      insights: [{ score: 0.83 }, { score: 0.79 }, { score: 0.75 }],
      supportingCounts: { referenceCount: 2, canonicalRefereeCount: 2, unresolvedReferenceCount: 0 }
    },
    'candidate-sparse': {
      summary: { overallGraphReadiness: 'limited' },
      insights: [{ score: 0.34 }, { score: 0.3 }, { score: 0.28 }],
      supportingCounts: { referenceCount: 1, canonicalRefereeCount: 0, unresolvedReferenceCount: 1 }
    },
    'candidate-flat': {
      summary: { overallGraphReadiness: 'moderate' },
      insights: [{ score: 0.55 }, { score: 0.5 }, { score: 0.52 }],
      supportingCounts: { referenceCount: 2, canonicalRefereeCount: 1, unresolvedReferenceCount: 1 }
    },
    'candidate-progressive': {
      summary: { overallGraphReadiness: 'moderate' },
      insights: [{ score: 0.58 }, { score: 0.57 }, { score: 0.54 }],
      supportingCounts: { referenceCount: 2, canonicalRefereeCount: 2, unresolvedReferenceCount: 0 }
    },
    'candidate-ceiling-not-reduced': {
      summary: { overallGraphReadiness: 'limited' },
      insights: [{ score: 0.32 }, { score: 0.3 }, { score: 0.28 }],
      supportingCounts: { referenceCount: 2, canonicalRefereeCount: 0, unresolvedReferenceCount: 2 }
    }
  }[candidateId]);
});

const computeRoleFitScoreMock = jest.fn(async (candidateId) => ({
  'candidate-strong': {
    candidateId, roleFitScore: 0.84, band: 'strong', components: { skillMatch: 0.88 }, diagnostics: { skillMatch: { requiredScore: 0.9 } }
  },
  'candidate-mismatch': {
    candidateId, roleFitScore: 0.21, band: 'limited', components: { skillMatch: 0.18 }, diagnostics: { skillMatch: { requiredScore: 0.1 } }
  },
  'candidate-sparse': {
    candidateId, roleFitScore: 0.41, band: 'limited', components: { skillMatch: 0.44 }, diagnostics: { skillMatch: { requiredScore: 0.35 } }
  },
  'candidate-flat': {
    candidateId, roleFitScore: 0.58, band: 'moderate', components: { skillMatch: 0.56 }, diagnostics: { skillMatch: { requiredScore: 0.52 } }
  },
  'candidate-progressive': {
    candidateId, roleFitScore: 0.6, band: 'moderate', components: { skillMatch: 0.62 }, diagnostics: { skillMatch: { requiredScore: 0.6 } }
  },
  'candidate-no-network': {
    candidateId, roleFitScore: 0.63, band: 'moderate', components: { skillMatch: 0.62 }, diagnostics: { skillMatch: { requiredScore: 0.62 } }
  },
  'candidate-ceiling-not-reduced': {
    candidateId, roleFitScore: 0.43, band: 'limited', components: { skillMatch: 0.41 }, diagnostics: { skillMatch: { requiredScore: 0.38 } }
  }
}[candidateId]));

const getLatestScoreMock = jest.fn(async (candidateIdOrArgs) => (candidateIdOrArgs?.userId === 'candidate-no-network' ? null : { score: 77.4 }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/reputationTrustWeighting.service.js', () => ({
  computeCandidateTrustWeights: computeCandidateTrustWeightsMock
}));

jest.unstable_mockModule('../../services/recruiterGraphInsights.service.js', () => ({
  computeCandidateRecruiterInsights: computeCandidateRecruiterInsightsMock
}));

jest.unstable_mockModule('../../services/roleFit.service.js', () => ({
  computeRoleFitScore: computeRoleFitScoreMock
}));

jest.unstable_mockModule('../../services/hrscore/scoreHistory.js', () => ({
  getLatestScore: getLatestScoreMock
}));

const service = await import('../../services/performancePrediction.service.js');

function expectNoInvalidNumbers(value) {
  if (Array.isArray(value)) {
    value.forEach(expectNoInvalidNumbers);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(expectNoInvalidNumbers);
    return;
  }
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(value).not.toBeUndefined();
}

describe('performancePrediction.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('produces bounded deterministic output for the same input', async () => {
    const roleDefinition = { requiredSkills: ['platform'], seniorityLevel: 'senior' };
    const first = await service.computePerformancePrediction('candidate-strong', roleDefinition);
    const second = await service.computePerformancePrediction('candidate-strong', roleDefinition);

    expect(first).toEqual(second);
    expect(first.performancePredictionScore).toBeGreaterThanOrEqual(0);
    expect(first.performancePredictionScore).toBeLessThanOrEqual(1);
  });

  it('returns a strong or upper-moderate forecast for strong aligned evidence', async () => {
    const result = await service.computePerformancePrediction('candidate-strong', { requiredSkills: ['platform'] });

    expect(['strong', 'moderate']).toContain(result.band);
    expect(result.performancePredictionScore).toBeGreaterThanOrEqual(0.68);
    expect(result.components.roleReadiness).toBe(0.84);
    expect(result.components.networkConfidence).toBeGreaterThan(0.7);
  });

  it('prevents good network and references from rescuing a weak role mismatch into a strong prediction', async () => {
    const result = await service.computePerformancePrediction('candidate-mismatch', { requiredSkills: ['rust', 'kubernetes'] });

    expect(result.band).toBe('limited');
    expect(result.performancePredictionScore).toBeLessThanOrEqual(0.42);
    expect(result.diagnostics.appliedCeilings.roleReadiness.capApplied).toBe(true);
  });

  it('keeps sparse evidence scenarios limited and caveated', async () => {
    const result = await service.computePerformancePrediction('candidate-sparse', { requiredSkills: ['operations'] });

    expect(result.band).toBe('limited');
    expect(result.caveats).toContain('Prediction remains limited by sparse or uneven evidence.');
    expect(result.caveats).toContain('Future-role prediction is supportive context, not an objective guarantee of performance.');
  });

  it('increases career progression score when newer references show stronger ownership', () => {
    const flat = service.computeCareerProgressionSignal({ references: referencesByCandidate['candidate-flat'] });
    const progressive = service.computeCareerProgressionSignal({ references: referencesByCandidate['candidate-progressive'] });

    expect(progressive.score).toBeGreaterThan(flat.score);
    expect(progressive.detail.progressionDelta).toBeGreaterThan(flat.detail.progressionDelta);
  });

  it('guards against unsafe language in explanations and caveats', async () => {
    const result = await service.computePerformancePrediction('candidate-strong', { requiredSkills: ['platform'] });

    expect(() => service.assertNoUnsafeLanguage([...result.explanation, ...result.caveats])).not.toThrow();
    expect([...result.explanation, ...result.caveats].join(' ')).not.toMatch(/recommended hire|must hire|top performer|safe to hire/i);
  });

  it('keeps confidence separate so sparse evidence lowers confidence even when some other components are moderate', async () => {
    const sparse = await service.computePerformancePrediction('candidate-sparse', { requiredSkills: ['operations'] });
    const flat = await service.computePerformancePrediction('candidate-flat', { requiredSkills: ['operations'] });

    expect(sparse.components.predictionConfidence).toBeLessThan(flat.components.predictionConfidence);
    expect(flat.components.roleReadiness).toBeGreaterThan(sparse.components.predictionConfidence);
  });

  it('does not mention a role-readiness ceiling unless it actually reduced the score', async () => {
    const result = await service.computePerformancePrediction('candidate-ceiling-not-reduced', { requiredSkills: ['ops'] });

    expect(result.diagnostics.appliedCeilings.roleReadiness.capApplied).toBe(true);
    expect(result.diagnostics.appliedCeilings.roleReadiness.wasReduced).toBe(false);
    expect(result.caveats).not.toContain('Weak role readiness applied a conservative ceiling so supporting signals could not rescue a role mismatch.');
  });

  it('mentions the role-readiness ceiling when it actually reduces the score', async () => {
    const result = await service.computePerformancePrediction('candidate-mismatch', { requiredSkills: ['rust', 'kubernetes'] });

    expect(result.diagnostics.appliedCeilings.roleReadiness.wasReduced).toBe(true);
    expect(result.caveats).toContain('Weak role readiness applied a conservative ceiling so supporting signals could not rescue a role mismatch.');
  });

  it('prevents prediction confidence from independently promoting a result into strong', async () => {
    const result = await service.computePerformancePrediction('candidate-flat', { requiredSkills: ['operations'] });

    expect(result.diagnostics.appliedCeilings.confidencePromotion.capApplied).toBe(true);
    expect(result.band).not.toBe('strong');
  });

  it('rejects invalid object-like shapes and keeps malformed-but-valid role definitions deterministic', async () => {
    const weirdDefinition = {
      requiredSkills: ['platform', ' ', 'platform', null],
      preferredSkills: ['analytics', '', 'analytics'],
      keywords: ['ops', undefined, 'ops'],
      seniorityLevel: ' senior '
    };

    const first = await service.computePerformancePrediction('candidate-strong', weirdDefinition);
    const second = await service.computePerformancePrediction('candidate-strong', weirdDefinition);

    expect(first).toEqual(second);
    expect(Array.isArray(first.diagnostics.roleDefinitionInput.requiredSkills)).toBe(true);
    expect(Array.isArray(first.diagnostics.roleDefinitionInput.preferredSkills)).toBe(true);
    expect(Array.isArray(first.diagnostics.roleDefinitionInput.keywords)).toBe(true);
    expect(() => service.normalizePerformanceRoleDefinition([])).toThrow('roleDefinition must be a plain object');
    expect(() => service.normalizePerformanceRoleDefinition({ requiredSkills: 'platform' })).toThrow('requiredSkills must be an array of strings');
  });

  it('returns stable output without NaN or undefined fields even when optional upstream signals fail', async () => {
    const result = await service.computePerformancePrediction('candidate-no-network', { requiredSkills: ['operations'] });

    expect(result.components).toEqual(expect.objectContaining({
      roleReadiness: expect.any(Number),
      evidenceReliability: expect.any(Number),
      networkConfidence: expect.any(Number),
      careerProgression: expect.any(Number),
      predictionConfidence: expect.any(Number)
    }));
    expect(result.diagnostics.appliedCeilings).toEqual(expect.objectContaining({
      roleReadiness: expect.any(Object),
      confidencePromotion: expect.any(Object)
    }));
    expect(result.explanation).toEqual(expect.any(Array));
    expect(result.caveats).toContain('Network-backed context was unavailable, so network confidence remained conservative.');
    expectNoInvalidNumbers(result);
  });
});
