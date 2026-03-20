import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

function createQueryBuilder(resolver) {
  const state = { filters: [], action: 'select', payload: null, writeAction: null, order: null };
  const builder = {
    select: jest.fn(() => {
      if (!state.writeAction) state.action = 'select';
      return builder;
    }),
    insert: jest.fn((payload) => {
      state.action = 'insert';
      state.writeAction = 'insert';
      state.payload = payload;
      return builder;
    }),
    upsert: jest.fn((payload) => {
      state.action = 'upsert';
      state.writeAction = 'upsert';
      state.payload = payload;
      return builder;
    }),
    eq: jest.fn((column, value) => {
      state.filters.push({ column, value });
      return builder;
    }),
    order: jest.fn((column, opts) => {
      state.order = { column, opts };
      return builder;
    }),
    maybeSingle: jest.fn(async () => resolver({ ...state, terminal: 'maybeSingle' })),
    single: jest.fn(async () => resolver({ ...state, terminal: 'single' })),
    then: (resolve, reject) => Promise.resolve(resolver({ ...state, terminal: 'then' })).then(resolve, reject)
  };
  return builder;
}

function createSupabaseHarness() {
  const db = {
    users: [{ id: 'candidate-a' }, { id: 'candidate-b' }, { id: 'candidate-c' }, { id: 'candidate-d' }],
    referee_identities: [
      { id: 'ref-1', confidence: 'high', resolution_strategy: 'email' },
      { id: 'ref-2', confidence: 'medium', resolution_strategy: 'name_company' },
      { id: 'ref-3', confidence: 'low', resolution_strategy: 'manual' }
    ],
    companies: [],
    roles: [],
    company_signers: [],
    reference_invites: [],
    references: [
      { id: 'r1', owner_id: 'candidate-a', relationship: 'manager', referee_id: 'ref-1', referee_resolution_confidence: 'high', created_at: '2026-03-19T00:00:00.000Z', status: 'submitted' },
      { id: 'r2', owner_id: 'candidate-a', relationship: 'peer', referee_id: 'ref-2', referee_resolution_confidence: 'medium', created_at: '2026-03-18T00:00:00.000Z', status: 'submitted' },
      { id: 'r3', owner_id: 'candidate-a', relationship: 'peer', referee_id: null, referee_resolution_confidence: null, created_at: '2026-03-17T00:00:00.000Z', status: 'submitted' },
      { id: 'r4', owner_id: 'candidate-b', relationship: 'manager', referee_id: 'ref-1', referee_resolution_confidence: 'high', created_at: '2026-03-18T00:00:00.000Z', status: 'submitted' },
      { id: 'r5', owner_id: 'candidate-c', relationship: 'collaborator', referee_id: 'ref-2', referee_resolution_confidence: 'medium', created_at: '2026-03-16T00:00:00.000Z', status: 'submitted' },
      { id: 'r6', owner_id: 'candidate-d', relationship: 'reference', referee_id: 'ref-3', referee_resolution_confidence: 'low', created_at: '2026-03-15T00:00:00.000Z', status: 'submitted' }
    ],
    reputation_graph_nodes: [
      { id: 'node-cand-a', entity_type: 'candidate', entity_id: 'candidate-a' },
      { id: 'node-cand-b', entity_type: 'candidate', entity_id: 'candidate-b' },
      { id: 'node-cand-c', entity_type: 'candidate', entity_id: 'candidate-c' },
      { id: 'node-cand-d', entity_type: 'candidate', entity_id: 'candidate-d' },
      { id: 'node-ref-1', entity_type: 'referee', entity_id: 'ref-1' },
      { id: 'node-ref-2', entity_type: 'referee', entity_id: 'ref-2' },
      { id: 'node-ref-3', entity_type: 'referee', entity_id: 'ref-3' },
      { id: 'node-r1', entity_type: 'reference', entity_id: 'r1' },
      { id: 'node-r2', entity_type: 'reference', entity_id: 'r2' },
      { id: 'node-r3', entity_type: 'reference', entity_id: 'r3' },
      { id: 'node-r4', entity_type: 'reference', entity_id: 'r4' },
      { id: 'node-r5', entity_type: 'reference', entity_id: 'r5' },
      { id: 'node-r6', entity_type: 'reference', entity_id: 'r6' }
    ],
    reputation_graph_edges: [
      { id: 'e1', source_node_id: 'node-ref-1', target_node_id: 'node-cand-a', edge_type: 'MANAGER_OF', confidence_score: 1, active: true },
      { id: 'e2', source_node_id: 'node-ref-2', target_node_id: 'node-cand-a', edge_type: 'PEER_OF', confidence_score: 1, active: true },
      { id: 'e3', source_node_id: 'node-r1', target_node_id: 'node-cand-a', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r1', metadata: { inferred_relationship_type: 'MANAGER_OF' } },
      { id: 'e4', source_node_id: 'node-r2', target_node_id: 'node-cand-a', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r2', metadata: { inferred_relationship_type: 'PEER_OF' } },
      { id: 'e5', source_node_id: 'node-r3', target_node_id: 'node-cand-a', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r3', metadata: {} },
      { id: 'e6', source_node_id: 'node-ref-1', target_node_id: 'node-cand-b', edge_type: 'MANAGER_OF', confidence_score: 1, active: true },
      { id: 'e7', source_node_id: 'node-r4', target_node_id: 'node-cand-b', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r4', metadata: { inferred_relationship_type: 'MANAGER_OF' } },
      { id: 'e8', source_node_id: 'node-ref-2', target_node_id: 'node-cand-c', edge_type: 'COLLABORATED_WITH', confidence_score: 1, active: true },
      { id: 'e9', source_node_id: 'node-r5', target_node_id: 'node-cand-c', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r5', metadata: { inferred_relationship_type: 'COLLABORATED_WITH' } },
      { id: 'e10', source_node_id: 'node-r6', target_node_id: 'node-cand-d', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r6', metadata: {} }
    ]
  };

  const from = jest.fn((table) => createQueryBuilder(({ filters, terminal }) => {
    const rows = db[table];
    if (!rows) throw new Error(`Unexpected table: ${table}`);
    let result = rows;
    for (const filter of filters) {
      result = result.filter((row) => row[filter.column] === filter.value);
    }
    if (table === 'reputation_graph_edges') {
      result = result.map((row) => ({
        ...row,
        source: db.reputation_graph_nodes.find((node) => node.id === row.source_node_id) || null,
        target: db.reputation_graph_nodes.find((node) => node.id === row.target_node_id) || null
      }));
    }
    return { data: terminal === 'then' ? result : result[0] || null, error: null };
  }));

  return { client: { from }, db };
}

const harness = createSupabaseHarness();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => harness.client)
}));

let service;
let graphModule;
let propagationModule;

describe('reputationTrustWeighting.service', () => {
  beforeAll(async () => {
    service = await import('../../services/reputationTrustWeighting.service.js');
    graphModule = await import('../../services/reputationGraph.service.js');
    propagationModule = await import('../../services/reputationPropagation.service.js');
    service.__setSupabaseClientForTests(harness.client);
    graphModule.__setSupabaseClientForTests(harness.client);
    propagationModule.__setSupabaseClientForTests(harness.client);
  });

  afterAll(() => {
    service.__resetSupabaseClientForTests();
    graphModule.__resetSupabaseClientForTests();
    propagationModule.__resetSupabaseClientForTests();
  });

  it('weights stronger relationship types above weaker ones', () => {
    const managerWeight = service.computeRelationshipStrengthWeight({ confirmedEdgeType: 'MANAGER_OF', evidenceMode: 'confirmed', confirmedConfidenceScore: 1 });
    const peerWeight = service.computeRelationshipStrengthWeight({ confirmedEdgeType: 'PEER_OF', evidenceMode: 'confirmed', confirmedConfidenceScore: 1 });
    const referencedWeight = service.computeRelationshipStrengthWeight({ inferredRelationshipType: null, evidenceMode: 'referenced-only', resolutionConfidence: 'low' });

    expect(managerWeight).toBeGreaterThan(peerWeight);
    expect(peerWeight).toBeGreaterThan(referencedWeight);
  });

  it('weights confirmed relationships above inferred-only signals', () => {
    const confirmed = service.computeRelationshipStrengthWeight({ confirmedEdgeType: 'COLLABORATED_WITH', evidenceMode: 'confirmed', confirmedConfidenceScore: 1 });
    const inferred = service.computeRelationshipStrengthWeight({ inferredRelationshipType: 'COLLABORATED_WITH', evidenceMode: 'inferred', resolutionConfidence: 'medium' });

    expect(confirmed).toBeGreaterThan(inferred);
  });

  it('weights higher-credibility referees above isolated low-confidence referees', async () => {
    const highCredibility = await service.computeRefereeCredibilityWeight({ identityConfidence: 'high', distinctCandidateCount: 3, corroboratedCandidateCount: 2, propagationScore: 0.7 });
    const lowCredibility = await service.computeRefereeCredibilityWeight({ identityConfidence: 'low', distinctCandidateCount: 1, corroboratedCandidateCount: 0, propagationScore: 0.1 });

    expect(highCredibility).toBeGreaterThan(lowCredibility);
  });

  it('applies diminishing returns for repeated reference volume', () => {
    const oneReference = service.computeReferenceVolumeWeight({ referenceCount: 1, corroboratedRefereeCount: 1, resolvedReferenceCount: 1 });
    const threeReferences = service.computeReferenceVolumeWeight({ referenceCount: 3, corroboratedRefereeCount: 2, resolvedReferenceCount: 3 });
    const tenReferences = service.computeReferenceVolumeWeight({ referenceCount: 10, corroboratedRefereeCount: 4, resolvedReferenceCount: 10 });

    expect(threeReferences).toBeGreaterThan(oneReference);
    expect(tenReferences - threeReferences).toBeLessThan(threeReferences - oneReference);
  });

  it('keeps graph centrality as a small bounded modifier', () => {
    const sparse = service.computeGraphCentralityWeight({ distinctCanonicalRefereeCount: 1, distinctSupportedCandidateCount: 0, relationshipDiversityCount: 1 });
    const broad = service.computeGraphCentralityWeight({ distinctCanonicalRefereeCount: 6, distinctSupportedCandidateCount: 8, relationshipDiversityCount: 4 });

    expect(broad).toBeGreaterThan(sparse);
    expect(broad).toBeLessThanOrEqual(1.08);
    expect(sparse).toBeGreaterThanOrEqual(0.95);
  });

  it('disables propagation-derived credibility for candidate weighting options', () => {
    const candidateOptions = service.__testables.resolveCandidateWeightingOptions({ includePropagationCredibility: true });
    const genericOptions = service.__testables.normalizeOptions({ includePropagationCredibility: true });

    expect(genericOptions.includePropagationCredibility).toBe(true);
    expect(candidateOptions.includePropagationCredibility).toBe(false);
  });

  it('ignores propagation-derived credibility when disabled to prevent candidate circularity', async () => {
    const withPropagation = await service.computeRefereeCredibilityWeight(
      { identityConfidence: 'high', distinctCandidateCount: 2, corroboratedCandidateCount: 1, propagationScore: 0.95 },
      { includePropagationCredibility: true }
    );
    const withoutPropagation = await service.computeRefereeCredibilityWeight(
      { identityConfidence: 'high', distinctCandidateCount: 2, corroboratedCandidateCount: 1, propagationScore: 0.95 },
      service.__testables.resolveCandidateWeightingOptions({ includePropagationCredibility: true })
    );

    expect(withPropagation).toBeGreaterThan(withoutPropagation);
    expect(withoutPropagation).toBeLessThanOrEqual(1.2);
  });

  it('computes a bounded deterministic composite signal weight', async () => {
    const signal = {
      confirmedEdgeType: 'REFERENCED',
      evidenceMode: 'referenced-only',
      resolutionConfidence: 'low',
      refereeContext: { identityConfidence: 'low', distinctCandidateCount: 1, corroboratedCandidateCount: 0, propagationScore: 0.1 },
      referenceContext: { referenceCount: 1, corroboratedRefereeCount: 1, resolvedReferenceCount: 1 },
      centralityContext: { distinctCanonicalRefereeCount: 1, distinctSupportedCandidateCount: 0, relationshipDiversityCount: 1 }
    };

    const [first, second] = await Promise.all([
      service.computeSignalWeight(signal),
      service.computeSignalWeight(signal)
    ]);

    expect(first).toEqual(second);
    expect(first.finalCompositeWeight).toBeGreaterThanOrEqual(0.55);
    expect(first.finalCompositeWeight).toBeLessThanOrEqual(1.35);
    expect(first.graphCentrality).toBeGreaterThanOrEqual(0.95);
  });

  it('summarizes weighting outputs conservatively for sparse support', () => {
    const result = service.default.summarizeTrustWeightingResult({
      target: { entityType: 'candidate', entityId: 'candidate-d' },
      baseScore: 0.18,
      weights: {
        relationshipStrength: 0.86,
        refereeCredibility: 0.9,
        referenceVolume: 0.98,
        graphCentrality: 0.97,
        finalCompositeWeight: 0.74
      },
      supportingCounts: {
        referenceCount: 1,
        canonicalRefereeCount: 0,
        confirmedRelationshipCount: 0,
        inferredRelationshipCount: 0,
        unresolvedReferenceCount: 1
      },
      scoreContributions: {
        strongestRelationship: 'REFERENCED',
        representativeRefereeId: null,
        corroboratedRefereeCount: 0,
        relationshipDiversityCount: 1
      },
      explanations: ['Sparse support kept the weighting close to baseline.'],
      caveats: ['Graph remains sparse, so weighting stays conservative and evidence-led.']
    });

    expect(result.weightedScore).toBeLessThanOrEqual(result.baseScore);
    expect(result.band).toBe('low');
    expect(result.caveats).toContain('Graph remains sparse, so weighting stays conservative and evidence-led.');
    expect(result.caveats).not.toContain('Propagation-derived referee credibility was disabled for candidate weighting to avoid target-candidate circular reinforcement.');
  });
});
