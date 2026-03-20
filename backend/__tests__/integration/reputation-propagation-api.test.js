import { jest } from '@jest/globals';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

function createQueryBuilder(resolver) {
  const state = { filters: [], action: 'select', payload: null, writeAction: null };
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
    order: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => resolver({ ...state, terminal: 'maybeSingle' })),
    single: jest.fn(async () => resolver({ ...state, terminal: 'single' })),
    then: (resolve, reject) => Promise.resolve(resolver({ ...state, terminal: 'then' })).then(resolve, reject)
  };
  return builder;
}

function createSupabaseHarness() {
  const db = {
    users: [{ id: '11111111-1111-4111-8111-111111111111' }, { id: 'candidate-2' }],
    references: [
      { id: 'ref-a', owner_id: '11111111-1111-4111-8111-111111111111', relationship: 'manager', referee_id: 'referee-1', referee_resolution_confidence: 'high', created_at: '2026-03-19T00:00:00.000Z', status: 'submitted' },
      { id: 'ref-b', owner_id: 'candidate-2', relationship: 'manager', referee_id: 'referee-1', referee_resolution_confidence: 'high', created_at: '2026-03-18T00:00:00.000Z', status: 'submitted' }
    ],
    companies: [],
    company_signers: [],
    referee_identities: [{ id: 'referee-1', confidence: 'high', resolution_strategy: 'email' }],
    roles: [],
    reference_invites: [],
    reputation_graph_nodes: [
      { id: 'cand-node-1', entity_type: 'candidate', entity_id: '11111111-1111-4111-8111-111111111111' },
      { id: 'cand-node-2', entity_type: 'candidate', entity_id: 'candidate-2' },
      { id: 'ref-node-1', entity_type: 'referee', entity_id: 'referee-1' },
      { id: 'ref-artifact-1', entity_type: 'reference', entity_id: 'ref-a' },
      { id: 'ref-artifact-2', entity_type: 'reference', entity_id: 'ref-b' }
    ],
    reputation_graph_edges: [
      { id: 'edge-1', source_node_id: 'ref-node-1', target_node_id: 'cand-node-1', edge_type: 'MANAGER_OF', confidence_score: 1, active: true, created_at: '2026-03-19T00:00:00.000Z' },
      { id: 'edge-2', source_node_id: 'ref-artifact-1', target_node_id: 'cand-node-1', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'ref-a', metadata: { inferred_relationship_type: 'MANAGER_OF' }, created_at: '2026-03-19T00:00:00.000Z' },
      { id: 'edge-3', source_node_id: 'ref-node-1', target_node_id: 'cand-node-2', edge_type: 'MANAGER_OF', confidence_score: 1, active: true, created_at: '2026-03-18T00:00:00.000Z' },
      { id: 'edge-4', source_node_id: 'ref-artifact-2', target_node_id: 'cand-node-2', edge_type: 'REFERENCED', confidence_score: 1, active: true, reference_id: 'ref-b', metadata: { inferred_relationship_type: 'MANAGER_OF' }, created_at: '2026-03-18T00:00:00.000Z' }
    ]
  };

  const client = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'candidate@example.com' } }, error: null }))
    },
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn((table) => createQueryBuilder(({ filters, terminal }) => {
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
    }))
  };

  return { client, db };
}

const harness = createSupabaseHarness();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => harness.client)
}));

let app;
let graphModule;
let propagationModule;

describe('Reputation propagation API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
    graphModule = await import('../../services/reputationGraph.service.js');
    propagationModule = await import('../../services/reputationPropagation.service.js');
    graphModule.__setSupabaseClientForTests(harness.client);
    propagationModule.__setSupabaseClientForTests(harness.client);
  });

  afterAll(() => {
    propagationModule.__resetSupabaseClientForTests();
    graphModule.__resetSupabaseClientForTests();
  });

  it('returns candidate reputation propagation to the candidate owner', async () => {
    const response = await request(app)
      .get('/api/reputation-propagation/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.target).toEqual({ entityType: 'candidate', entityId: '11111111-1111-4111-8111-111111111111' });
    expect(response.body.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(response.body.explanations)).toBe(true);
  });

  it('denies candidate propagation access to unauthorized users', async () => {
    const response = await request(app)
      .get('/api/reputation-propagation/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '99999999-9999-4999-8999-999999999999')
      .set('x-test-user-email', 'other@example.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('allows referee propagation only for superadmins', async () => {
    const forbiddenResponse = await request(app)
      .get('/api/reputation-propagation/referee/referee-1')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(forbiddenResponse.status).toBe(403);

    const okResponse = await request(app)
      .get('/api/reputation-propagation/referee/referee-1')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com')
      .set('x-test-user-role', 'superadmin');

    expect(okResponse.status).toBe(200);
    expect(okResponse.body.ok).toBe(true);
    expect(okResponse.body.target.entityType).toBe('referee');
  });
});
