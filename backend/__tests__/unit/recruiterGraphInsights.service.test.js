import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

function createQueryBuilder(resolver) {
  const state = { filters: [], action: 'select', payload: null, writeAction: null, order: null };
  const builder = {
    select: jest.fn(() => builder),
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
    users: [{ id: 'candidate-a' }, { id: 'candidate-d' }],
    referee_identities: [
      { id: 'ref-1', confidence: 'high', resolution_strategy: 'email' },
      { id: 'ref-2', confidence: 'medium', resolution_strategy: 'name_company' },
      { id: 'ref-3', confidence: 'low', resolution_strategy: 'manual' }
    ],
    companies: [], roles: [], company_signers: [], reference_invites: [],
    references: [
      { id: 'r1', owner_id: 'candidate-a', relationship: 'manager', referee_id: 'ref-1', referee_resolution_confidence: 'high', created_at: '2026-03-19T00:00:00.000Z', status: 'submitted' },
      { id: 'r2', owner_id: 'candidate-a', relationship: 'peer', referee_id: 'ref-2', referee_resolution_confidence: 'medium', created_at: '2026-03-18T00:00:00.000Z', status: 'submitted' },
      { id: 'r3', owner_id: 'candidate-a', relationship: 'peer', referee_id: null, referee_resolution_confidence: null, created_at: '2026-03-17T00:00:00.000Z', status: 'submitted' },
      { id: 'r4', owner_id: 'candidate-a', relationship: 'manager', referee_id: 'ref-1', referee_resolution_confidence: 'high', created_at: '2026-03-16T00:00:00.000Z', status: 'submitted' },
      { id: 'r5', owner_id: 'candidate-d', relationship: 'reference', referee_id: null, referee_resolution_confidence: null, created_at: '2026-03-15T00:00:00.000Z', status: 'submitted' }
    ],
    reputation_graph_nodes: [
      { id: 'node-cand-a', entity_type: 'candidate', entity_id: 'candidate-a' },
      { id: 'node-cand-d', entity_type: 'candidate', entity_id: 'candidate-d' },
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
      { id: 'e6', source_node_id: 'node-r4', target_node_id: 'node-cand-a', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r4', metadata: { inferred_relationship_type: 'MANAGER_OF' } },
      { id: 'e7', source_node_id: 'node-r5', target_node_id: 'node-cand-d', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'r5', metadata: {} }
    ]
  };

  const from = jest.fn((table) => createQueryBuilder(({ filters, terminal }) => {
    const rows = db[table];
    let result = rows;
    for (const filter of filters) result = result.filter((row) => row[filter.column] === filter.value);
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

function installFromImplementation() {
  harness.client.from.mockImplementation((table) => createQueryBuilder(({ filters, terminal }) => {
    const rows = harness.db[table];
    if (!rows) throw new Error(`Unexpected table: ${table}`);
    let result = rows;
    for (const filter of filters) {
      result = result.filter((row) => row[filter.column] === filter.value);
    }
    if (table === 'reputation_graph_edges') {
      result = result.map((row) => ({
        ...row,
        source: harness.db.reputation_graph_nodes.find((node) => node.id === row.source_node_id) || null,
        target: harness.db.reputation_graph_nodes.find((node) => node.id === row.target_node_id) || null
      }));
    }
    return { data: terminal === 'then' ? result : result[0] || null, error: null };
  }));
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => harness.client)
}));

let service;
let graphModule;
let propagationModule;
let trustModule;

describe('recruiterGraphInsights.service', () => {
  beforeEach(() => {
    installFromImplementation();
  });
  beforeAll(async () => {
    service = await import('../../services/recruiterGraphInsights.service.js');
    graphModule = await import('../../services/reputationGraph.service.js');
    propagationModule = await import('../../services/reputationPropagation.service.js');
    trustModule = await import('../../services/reputationTrustWeighting.service.js');
    service.__setSupabaseClientForTests(harness.client);
    graphModule.__setSupabaseClientForTests(harness.client);
    propagationModule.__setSupabaseClientForTests(harness.client);
    trustModule.__setSupabaseClientForTests(harness.client);
  });

  afterAll(() => {
    service.__resetSupabaseClientForTests();
    graphModule.__resetSupabaseClientForTests();
    propagationModule.__resetSupabaseClientForTests();
    trustModule.__resetSupabaseClientForTests();
  });

  it('gives confirmed support stronger network credibility than sparse evidence-only support', async () => {
    const [supported, sparse] = await Promise.all([
      service.computeCandidateRecruiterInsights('candidate-a'),
      service.computeCandidateRecruiterInsights('candidate-d')
    ]);

    expect(supported.summary.networkCredibilityBand).not.toBe('limited');
    expect(sparse.summary.networkCredibilityBand).toBe('limited');
    expect(supported.insights.find((item) => item.type === 'network_credibility').score)
      .toBeGreaterThan(sparse.insights.find((item) => item.type === 'network_credibility').score);
  });

  it('confirmed relationships improve trusted collaborator insight more than inferred-only sparse signals', async () => {
    const supported = await service.computeCandidateRecruiterInsights('candidate-a');
    const sparse = await service.computeCandidateRecruiterInsights('candidate-d');

    expect(supported.summary.trustedCollaboratorBand).not.toBe('limited');
    expect(supported.insights.find((item) => item.type === 'trusted_collaborator_signals').score)
      .toBeGreaterThan(sparse.insights.find((item) => item.type === 'trusted_collaborator_signals').score);
  });

  it('sparse graphs produce conservative bands and caveats', async () => {
    const sparse = await service.computeCandidateRecruiterInsights('candidate-d');

    expect(sparse.summary.overallGraphReadiness).toBe('limited');
    expect(sparse.caveats).toContain('Graph remains sparse; treat these insights as supportive context rather than objective truth.');
  });

  it('unresolved evidence lowers insight confidence', async () => {
    const full = await service.computeCandidateRecruiterInsights('candidate-a');
    const sparse = await service.computeCandidateRecruiterInsights('candidate-d');

    expect(full.supportingCounts.unresolvedReferenceCount).toBeGreaterThan(0);
    expect(sparse.supportingCounts.unresolvedReferenceCount).toBeGreaterThan(0);
    expect(sparse.insights.find((item) => item.type === 'network_credibility').details.join(' ')).toMatch(/unresolved/i);
  });

  it('returns deterministic output across repeated runs', async () => {
    const [first, second] = await Promise.all([
      service.computeCandidateRecruiterInsights('candidate-a'),
      service.computeCandidateRecruiterInsights('candidate-a')
    ]);

    expect(first).toEqual(second);
  });

  it('returns recruiter-readable sections without overclaiming language', async () => {
    const result = await service.computeCandidateRecruiterInsights('candidate-a');

    expect(result.insights).toHaveLength(3);
    for (const insight of result.insights) {
      expect(typeof insight.headline).toBe('string');
      expect(Array.isArray(insight.details)).toBe(true);
      expect(insight.details.length).toBeGreaterThan(0);
      expect(service.__testables.containsOverclaimingLanguage(insight.headline)).toBe(false);
      expect(insight.details.some((detail) => service.__testables.containsOverclaimingLanguage(detail))).toBe(false);
    }
  });
});
