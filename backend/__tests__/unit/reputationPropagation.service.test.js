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
    users: [{ id: 'candidate-a' }, { id: 'candidate-b' }, { id: 'candidate-c' }],
    referee_identities: [
      { id: 'ref-1', confidence: 'high', resolution_strategy: 'email' },
      { id: 'ref-2', confidence: 'medium', resolution_strategy: 'name_company' }
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
      { id: 'r5', owner_id: 'candidate-c', relationship: 'collaborator', referee_id: 'ref-2', referee_resolution_confidence: 'medium', created_at: '2026-03-16T00:00:00.000Z', status: 'submitted' }
    ],
    reputation_graph_nodes: [
      { id: 'node-cand-a', entity_type: 'candidate', entity_id: 'candidate-a' },
      { id: 'node-cand-b', entity_type: 'candidate', entity_id: 'candidate-b' },
      { id: 'node-cand-c', entity_type: 'candidate', entity_id: 'candidate-c' },
      { id: 'node-ref-1', entity_type: 'referee', entity_id: 'ref-1' },
      { id: 'node-ref-2', entity_type: 'referee', entity_id: 'ref-2' },
      { id: 'node-r1', entity_type: 'reference', entity_id: 'r1' },
      { id: 'node-r2', entity_type: 'reference', entity_id: 'r2' },
      { id: 'node-r3', entity_type: 'reference', entity_id: 'r3' },
      { id: 'node-r4', entity_type: 'reference', entity_id: 'r4' },
      { id: 'node-r5', entity_type: 'reference', entity_id: 'r5' }
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
      { id: 'e9', source_node_id: 'node-r5', target_node_id: 'node-cand-c', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r5', metadata: { inferred_relationship_type: 'COLLABORATED_WITH' } }
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

let reputationPropagationService;
let reputationGraphModule;

describe('reputationPropagation.service', () => {
  beforeAll(async () => {
    reputationPropagationService = await import('../../services/reputationPropagation.service.js');
    reputationGraphModule = await import('../../services/reputationGraph.service.js');
    reputationPropagationService.__setSupabaseClientForTests(harness.client);
    reputationGraphModule.__setSupabaseClientForTests(harness.client);
  });

  afterAll(() => {
    reputationPropagationService.__resetSupabaseClientForTests();
  });

  it('computes candidate propagation from direct evidence and canonical referees', async () => {
    const result = await reputationPropagationService.computeCandidatePropagation('candidate-a');

    expect(result.target).toEqual({ entityType: 'candidate', entityId: 'candidate-a' });
    expect(result.directEvidenceScore).toBeGreaterThan(0.3);
    expect(result.networkPropagationScore).toBeGreaterThanOrEqual(0);
    expect(result.supportingEvidenceCount).toBe(3);
    expect(result.supportingConfirmedRelationshipCount).toBeGreaterThanOrEqual(0);
    expect(result.explanations.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });


  it('enforces maxDepth=0 as direct evidence only', async () => {
    const directOnlyResult = await reputationPropagationService.computeCandidatePropagation('candidate-a', { maxDepth: 0 });

    expect(directOnlyResult.networkPropagationScore).toBe(0);
    expect(directOnlyResult.breakdown.network).toEqual([]);
    expect(directOnlyResult.caveats).toContain('Propagation was limited to direct evidence by configuration.');
  });

  it('enforces maxDepth=1 as one-hop only propagation', async () => {
    const directOnly = await reputationPropagationService.computeRefereePropagation('ref-1', { maxDepth: 0 });
    const oneHopResult = await reputationPropagationService.computeRefereePropagation('ref-1', { maxDepth: 1 });

    expect(directOnly.networkPropagationScore).toBe(0);
    expect(oneHopResult.networkPropagationScore).toBeGreaterThan(0);
    expect(oneHopResult.breakdown.network.every((item) => item.hopDepth === 1)).toBe(true);
    expect(oneHopResult.caveats).toContain('Propagation was limited to one hop by configuration.');
  });

  it('enforces maxDepth=2 as the maximum supported propagation depth', async () => {
    const oneHopResult = await reputationPropagationService.computeRefereePropagation('ref-1', { maxDepth: 1 });
    const twoHopResult = await reputationPropagationService.computeRefereePropagation('ref-1', { maxDepth: 2 });

    expect(twoHopResult.networkPropagationScore).toBe(oneHopResult.networkPropagationScore);
    expect(twoHopResult.breakdown.network.every((item) => item.hopDepth <= 1)).toBe(true);
    expect(twoHopResult.score).toBeLessThanOrEqual(1);
  });

  it('disables second-order corroboration when includeSecondOrder=false', async () => {
    const secondOrderEnabled = await reputationPropagationService.__testables.computeRefereeCredibilityForCandidate({
      refereeId: 'ref-1',
      candidateId: 'candidate-a',
      options: reputationPropagationService.__testables.resolveOptions({ maxDepth: 2, includeSecondOrder: true }),
      visited: new Set(['candidate:candidate-a']),
      traversalState: reputationPropagationService.__testables.createTraversalState(1)
    });
    const secondOrderDisabled = await reputationPropagationService.__testables.computeRefereeCredibilityForCandidate({
      refereeId: 'ref-1',
      candidateId: 'candidate-a',
      options: reputationPropagationService.__testables.resolveOptions({ maxDepth: 2, includeSecondOrder: false }),
      visited: new Set(['candidate:candidate-a']),
      traversalState: reputationPropagationService.__testables.createTraversalState(1)
    });

    expect(secondOrderEnabled.score).toBeGreaterThan(0);
    expect(secondOrderEnabled.supportingCandidateCount).toBeGreaterThan(0);
    expect(secondOrderDisabled.score).toBe(0);
    expect(secondOrderDisabled.caveat).toBe('Second-order propagation was disabled for this computation.');
  });

  it('keeps sparse candidate graphs conservative', async () => {
    const result = await reputationPropagationService.computeCandidatePropagation('candidate-c');

    expect(result.score).toBeLessThan(0.5);
    expect(result.confidenceBand).toBe('limited');
    expect(result.caveats).toContain('Graph remains sparse; score is driven mostly by direct evidence.');
  });

  it('computes referee propagation from supported candidates', async () => {
    const result = await reputationPropagationService.computeRefereePropagation('ref-1');

    expect(result.target).toEqual({ entityType: 'referee', entityId: 'ref-1' });
    expect(result.networkPropagationScore).toBeGreaterThanOrEqual(0);
    expect(result.supportingCandidateCount).toBe(2);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('is deterministic across repeated runs', async () => {
    const [first, second] = await Promise.all([
      reputationPropagationService.computeCandidatePropagation('candidate-a'),
      reputationPropagationService.computeCandidatePropagation('candidate-a')
    ]);

    expect(second).toEqual(first);
  });

  it('prevents unsupported node propagation targets', async () => {
    await expect(reputationPropagationService.propagateReputationFromNode('node-r1')).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROPAGATION_TARGET',
      status: 400
    });
  });
});
