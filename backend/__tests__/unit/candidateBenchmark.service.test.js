import { jest } from '@jest/globals';

const mockRoleFit = jest.fn();
const mockPerformance = jest.fn();
const mockGraphInsights = jest.fn();
const mockTrustWeights = jest.fn();
const mockPropagation = jest.fn();
const mockReferenceQuality = jest.fn();
const mockCareerTrajectory = jest.fn();
const normalizePerformanceRoleDefinitionMock = jest.fn((value) => value);
const createClientMock = jest.fn();

jest.unstable_mockModule('../../services/roleFit.service.js', () => ({
  computeRoleFitScore: mockRoleFit
}));

jest.unstable_mockModule('../../services/performancePrediction.service.js', () => ({
  computePerformancePrediction: mockPerformance,
  normalizePerformanceRoleDefinition: normalizePerformanceRoleDefinitionMock
}));

jest.unstable_mockModule('../../services/recruiterGraphInsights.service.js', () => ({
  computeCandidateRecruiterInsights: mockGraphInsights
}));

jest.unstable_mockModule('../../services/reputationTrustWeighting.service.js', () => ({
  computeCandidateTrustWeights: mockTrustWeights
}));

jest.unstable_mockModule('../../services/reputationPropagation.service.js', () => ({
  computeCandidatePropagation: mockPropagation
}));

jest.unstable_mockModule('../../services/referenceQuality.service.js', () => ({
  computeReferenceQuality: mockReferenceQuality
}));

jest.unstable_mockModule('../../services/careerTrajectory.service.js', () => ({
  computeCareerTrajectory: mockCareerTrajectory
}));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

const referenceRows = [
  { id: 'ref-1', referee_id: 'referee-1' },
  { id: 'ref-2', referee_id: 'referee-2' },
  { id: 'ref-3', referee_id: null }
];

function createSupabaseStub(rows = referenceRows, error = null) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(async () => ({ data: rows, error }))
  };

  return {
    from: jest.fn(() => builder)
  };
}

function baseGraph(candidateId = 'candidate-1', overrides = {}) {
  return {
    target: { entityType: 'candidate', entityId: candidateId },
    insights: [
      { type: 'network_credibility', score: 0.42, band: 'limited' }
    ],
    supportingCounts: { referenceCount: 3, unresolvedReferenceCount: 1 },
    caveats: ['Graph remains sparse and should be read conservatively.'],
    ...overrides
  };
}

function baseTrust(candidateId = 'candidate-1', overrides = {}) {
  return {
    target: { entityType: 'candidate', entityId: candidateId },
    weightedScore: 0.66,
    caveats: ['Trust weighting stayed bounded to direct evidence.'],
    ...overrides
  };
}

function basePropagation(candidateId = 'candidate-1', overrides = {}) {
  return {
    target: { entityType: 'candidate', entityId: candidateId },
    score: 0.33,
    caveats: ['Propagation remains limited beyond direct evidence.'],
    ...overrides
  };
}

function baseTrajectory(candidateId = 'candidate-1', overrides = {}) {
  return {
    candidateId,
    signals: {
      promotionVelocity: { score: 0.61, band: 'moderate' },
      roleComplexityProgression: { score: 0.54, band: 'moderate' }
    },
    caveats: ['Career trajectory is derived from limited role history.'],
    ...overrides
  };
}

let service;

describe('candidateBenchmark.service', () => {
  beforeAll(async () => {
    createClientMock.mockImplementation(() => createSupabaseStub());
    service = await import('../../services/candidateBenchmark.service.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.__resetSupabaseClientForTests();
    service.__setSupabaseClientForTests(createSupabaseStub());

    mockRoleFit.mockResolvedValue({ candidateId: 'candidate-1', roleFitScore: 0.82, caveats: [] });
    mockPerformance.mockResolvedValue({ candidateId: 'candidate-1', performancePredictionScore: 0.58, caveats: [] });
    mockGraphInsights.mockResolvedValue(baseGraph());
    mockTrustWeights.mockResolvedValue(baseTrust());
    mockPropagation.mockResolvedValue(basePropagation());
    mockCareerTrajectory.mockResolvedValue(baseTrajectory());
    mockReferenceQuality
      .mockResolvedValueOnce({ referenceId: 'ref-1', qualityScore: 0.71 })
      .mockResolvedValueOnce({ referenceId: 'ref-2', qualityScore: 0.62 })
      .mockResolvedValueOnce({ referenceId: 'ref-3', qualityScore: 0.43 });
  });

  it('builds bounded relative positioning with a full signal set', async () => {
    const result = await service.computeCandidateBenchmark('candidate-1', {
      roleDefinition: { requiredSkills: ['analysis'] }
    });

    expect(result).toEqual({
      candidateId: 'candidate-1',
      signals: {
        roleFit: 0.82,
        performance: 0.58,
        evidenceQuality: 0.624,
        networkSupport: 0.375,
        trajectory: 0.575
      },
      relativePositioning: {
        strongestSignal: 'roleFit',
        weakestSignal: 'networkSupport',
        comparisons: expect.any(Array)
      },
      benchmarkSummary: expect.any(String),
      caveats: expect.any(Array)
    });
    expect(result.relativePositioning.strongestSignal).toBe('roleFit');
    expect(`${result.benchmarkSummary} ${result.caveats.join(' ')}`).not.toMatch(/peer ranking|better than others|top performer/i);
  });

  it('returns stable empty shape and truthful copy when no signals are available', async () => {
    mockGraphInsights.mockRejectedValue(new Error('graph failed'));
    mockTrustWeights.mockRejectedValue(new Error('trust failed'));
    mockPropagation.mockRejectedValue(new Error('propagation failed'));
    mockCareerTrajectory.mockResolvedValue({ candidateId: 'candidate-1', signals: {}, caveats: [] });
    service.__setSupabaseClientForTests(createSupabaseStub([], null));

    const result = await service.computeCandidateBenchmark('candidate-1', { roleDefinition: null });

    expect(result).toEqual({
      candidateId: 'candidate-1',
      signals: {},
      relativePositioning: {
        strongestSignal: null,
        weakestSignal: null,
        comparisons: []
      },
      benchmarkSummary: expect.any(String),
      caveats: expect.any(Array)
    });
    expect(result.benchmarkSummary).toMatch(/No relative signal balance is available/i);
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('returns stable shape with one signal and no fabricated strongest or weakest labels', async () => {
    mockGraphInsights.mockRejectedValue(new Error('graph failed'));
    mockPropagation.mockRejectedValue(new Error('propagation failed'));
    mockTrustWeights.mockResolvedValue(baseTrust('candidate-1', { weightedScore: 0.61, caveats: [] }));
    mockCareerTrajectory.mockResolvedValue({ candidateId: 'candidate-1', signals: {}, caveats: [] });
    service.__setSupabaseClientForTests(createSupabaseStub([], null));

    const result = await service.computeCandidateBenchmark('candidate-1', { roleDefinition: null });

    expect(result.signals).toEqual({ evidenceQuality: 0.61 });
    expect(result.relativePositioning).toEqual({
      strongestSignal: null,
      weakestSignal: null,
      comparisons: []
    });
    expect(result.benchmarkSummary).toMatch(/At least two signals are required/i);
  });

  it('does not emit comparisons below the threshold and nulls strongest or weakest when not meaningful', () => {
    const relative = service.__testables.buildRelativePositioning({
      roleFit: 0.61,
      evidenceQuality: 0.55,
      networkSupport: 0.54
    });

    expect(relative).toEqual({
      strongestSignal: null,
      weakestSignal: null,
      comparisons: []
    });
  });

  it('gracefully degrades when optional upstream services fail', async () => {
    mockRoleFit.mockRejectedValue(new Error('role fit failed'));
    mockPerformance.mockRejectedValue(new Error('performance failed'));
    mockGraphInsights.mockRejectedValue(new Error('graph failed'));
    mockCareerTrajectory.mockRejectedValue(new Error('trajectory failed'));
    mockReferenceQuality.mockReset();
    mockReferenceQuality.mockRejectedValue(new Error('ref quality failed'));

    const result = await service.computeCandidateBenchmark('candidate-1', {
      roleDefinition: { requiredSkills: ['analysis'] }
    });

    expect(result.signals).toEqual({
      evidenceQuality: 0.66,
      networkSupport: 0.33
    });
    expect(result.relativePositioning.comparisons).toHaveLength(0);
    expect(result.caveats).toEqual(expect.any(Array));
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('normalizes controller-facing input without exposing __testables', () => {
    const normalized = service.normalizeCandidateBenchmarkInput({
      candidateId: ' candidate-1 ',
      roleDefinition: JSON.stringify({
        requiredSkills: [' analytics ', '', 'analytics'],
        preferredSkills: ['leadership', 3],
        keywords: [' roadmap '],
        seniorityLevel: ' senior '
      })
    });

    expect(normalized).toEqual({
      candidateId: 'candidate-1',
      roleDefinition: {
        requiredSkills: ['analytics'],
        preferredSkills: ['leadership'],
        keywords: ['roadmap'],
        seniorityLevel: 'senior'
      }
    });
  });

  it('rejects malformed or invalid roleDefinition shapes consistently', () => {
    expect(() => service.parseCandidateBenchmarkRoleDefinition('{bad-json')).toThrow(/valid JSON/i);
    expect(() => service.parseCandidateBenchmarkRoleDefinition('[]')).toThrow(/plain object/i);
    expect(() => service.parseCandidateBenchmarkRoleDefinition({ requiredSkills: 'analytics' })).toThrow(/arrays of strings/i);
  });

  it('does not leak NaN or undefined in the returned payload', async () => {
    mockRoleFit.mockResolvedValue({ candidateId: 'candidate-1', roleFitScore: NaN, caveats: [] });
    mockPerformance.mockResolvedValue({ candidateId: 'candidate-1', performancePredictionScore: undefined, caveats: [] });
    mockTrustWeights.mockResolvedValue(baseTrust('candidate-1', { weightedScore: NaN, caveats: [] }));
    mockPropagation.mockResolvedValue(basePropagation('candidate-1', { score: NaN, caveats: [] }));
    mockGraphInsights.mockResolvedValue(baseGraph('candidate-1', { insights: [{ type: 'network_credibility', score: NaN }], caveats: [] }));
    mockCareerTrajectory.mockResolvedValue({ candidateId: 'candidate-1', signals: { promotionVelocity: { score: NaN } }, caveats: [] });
    service.__setSupabaseClientForTests(createSupabaseStub([], null));

    const result = await service.computeCandidateBenchmark('candidate-1', { roleDefinition: { requiredSkills: ['analysis'] } });

    expect(JSON.stringify(result)).not.toMatch(/NaN|undefined/);
    expect(result).toEqual({
      candidateId: 'candidate-1',
      signals: {},
      relativePositioning: {
        strongestSignal: null,
        weakestSignal: null,
        comparisons: []
      },
      benchmarkSummary: expect.any(String),
      caveats: expect.any(Array)
    });
  });
});
