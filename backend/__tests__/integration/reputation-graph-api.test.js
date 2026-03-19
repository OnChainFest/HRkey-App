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
      if (!state.writeAction) {
        state.action = 'select';
      }
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
    users: [{ id: '11111111-1111-4111-8111-111111111111' }],
    references: [{ id: '22222222-2222-4222-8222-222222222222', owner_id: '11111111-1111-4111-8111-111111111111' }],
    companies: [],
    company_signers: [],
    roles: [],
    reference_invites: [],
    reputation_graph_nodes: [
      { id: '33333333-3333-4333-8333-333333333333', entity_type: 'candidate', entity_id: '11111111-1111-4111-8111-111111111111' },
      { id: '44444444-4444-4444-8444-444444444444', entity_type: 'reference', entity_id: '22222222-2222-4222-8222-222222222222' }
    ],
    reputation_graph_edges: [
      {
        id: 'edge-1',
        source_node_id: '33333333-3333-4333-8333-333333333333',
        target_node_id: '44444444-4444-4444-8444-444444444444',
        edge_type: 'reviewed_by',
        metadata: { source: 'existing-reference' },
        active: true,
        created_at: '2026-03-19T00:00:00.000Z'
      }
    ],
    reference_invites_requests: []
  };

  const client = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'candidate@example.com' } }, error: null }))
    },
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn((table) => createQueryBuilder(({ action, writeAction, payload, filters, terminal }) => {
      const rows = db[table];
      if (!rows) throw new Error(`Unexpected table: ${table}`);

      if (table === 'reference_invites' && (writeAction || action) === 'insert' && terminal === 'single') {
        const row = { id: '55555555-5555-4555-8555-555555555555', ...payload[0] };
        rows.push(row);
        return { data: row, error: null };
      }

      if (table === 'reputation_graph_nodes' && (writeAction || action) === 'upsert' && terminal === 'single') {
        let row = rows.find((item) => item.entity_type === payload.entity_type && item.entity_id === payload.entity_id);
        if (!row) {
          row = { id: `node-${rows.length + 1}`, ...payload };
          rows.push(row);
        }
        return { data: row, error: null };
      }

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

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
  EventTypes: { REFERENCE_REQUESTED: 'REFERENCE_REQUESTED' }
}));

jest.unstable_mockModule('../../services/validation/index.js', () => ({
  validateReference: jest.fn().mockResolvedValue({})
}));

jest.unstable_mockModule('../../services/hrscore/autoTrigger.js', () => ({
  onReferenceValidated: jest.fn().mockResolvedValue()
}));

let app;

describe('Reputation graph API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });
  const originalFetch = global.fetch;

  beforeEach(() => {
    harness.client.from.mockClear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202, text: jest.fn().mockResolvedValue('') });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the candidate graph to the candidate owner', async () => {
    const response = await request(app)
      .get('/api/reputation-graph/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.node.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(response.body.outgoingEdges).toHaveLength(1);
  });

  it('rejects entity types that are not queryable through the API', async () => {
    const response = await request(app)
      .get('/api/reputation-graph/referee/some-referee-id')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('returns a not-found response for unauthorized candidate graph access', async () => {
    const response = await request(app)
      .get('/api/reputation-graph/candidate/11111111-1111-4111-8111-111111111111')
      .set('x-test-user-id', '99999999-9999-4999-8999-999999999999')
      .set('x-test-user-email', 'other@example.com');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('returns node edges for an authorized candidate-owned reference graph node', async () => {
    const response = await request(app)
      .get('/api/reputation-graph/node/44444444-4444-4444-8444-444444444444/edges')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com');

    expect(response.status).toBe(200);
    expect(response.body.node.entity_type).toBe('reference');
    expect(response.body.incomingEdges).toHaveLength(1);
  });

  it('preserves the existing reference request flow', async () => {
    const response = await request(app)
      .post('/api/references/request')
      .set('x-test-user-id', '11111111-1111-4111-8111-111111111111')
      .set('x-test-user-email', 'candidate@example.com')
      .send({
        referee_email: 'referee@example.com',
        candidate_id: '11111111-1111-4111-8111-111111111111'
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(harness.db.reputation_graph_nodes.some((node) => node.entity_type === 'referee')).toBe(false);
  });
});
