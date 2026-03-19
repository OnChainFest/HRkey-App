import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

function createQueryBuilder(resolver) {
  const state = {
    filters: [],
    order: null,
    payload: null,
    action: 'select',
    writeAction: null
  };

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
    update: jest.fn((payload) => {
      state.action = 'update';
      state.writeAction = 'update';
      state.payload = payload;
      return builder;
    }),
    eq: jest.fn((column, value) => {
      state.filters.push({ op: 'eq', column, value });
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
    users: [{ id: 'candidate-1' }, { id: 'referee-user-1' }],
    companies: [{ id: 'company-1' }],
    roles: [{ id: 'role-1' }],
    references: [{ id: 'reference-1', owner_id: 'candidate-1' }],
    company_signers: [],
    reference_invites: [],
    reputation_graph_nodes: [],
    reputation_graph_edges: []
  };

  const from = jest.fn((table) => createQueryBuilder(({ action, writeAction, payload, filters, terminal }) => {
    const rows = db[table];
    if (!rows) throw new Error(`Unexpected table: ${table}`);

    if (table === 'reputation_graph_nodes') {
      if ((writeAction || action) === 'upsert' && terminal === 'single') {
        let row = rows.find((item) => item.entity_type === payload.entity_type && item.entity_id === payload.entity_id);
        if (!row) {
          row = {
            id: `node-${rows.length + 1}`,
            entity_type: payload.entity_type,
            entity_id: payload.entity_id,
            created_at: '2026-03-19T00:00:00.000Z',
            updated_at: payload.updated_at
          };
          rows.push(row);
        } else {
          row.updated_at = payload.updated_at;
        }
        return { data: row, error: null };
      }

      let result = rows;
      for (const filter of filters) {
        if (filter.op === 'eq') result = result.filter((row) => row[filter.column] === filter.value);
      }
      return { data: terminal === 'then' ? result : result[0] || null, error: null };
    }

    if (table === 'reputation_graph_edges') {
      if ((writeAction || action) === 'insert' && terminal === 'single') {
        const row = { id: `edge-${rows.length + 1}`, created_at: '2026-03-19T00:00:00.000Z', ...payload };
        rows.push(row);
        return { data: row, error: null };
      }

      if ((writeAction || action) === 'upsert' && terminal === 'single') {
        let row = rows.find((item) => item.source_node_id === payload.source_node_id && item.target_node_id === payload.target_node_id && item.edge_type === payload.edge_type);
        if (!row) {
          row = { id: `edge-${rows.length + 1}`, created_at: '2026-03-19T00:00:00.000Z', ...payload };
          rows.push(row);
        } else {
          Object.assign(row, payload);
        }
        return { data: row, error: null };
      }

      let result = rows;
      for (const filter of filters) {
        if (filter.op === 'eq') result = result.filter((row) => row[filter.column] === filter.value);
      }
      result = result.map((row) => ({
        ...row,
        source: db.reputation_graph_nodes.find((node) => node.id === row.source_node_id) || null,
        target: db.reputation_graph_nodes.find((node) => node.id === row.target_node_id) || null
      }));
      return { data: terminal === 'then' ? result : result[0] || null, error: null };
    }

    let result = rows;
    for (const filter of filters) {
      if (filter.op === 'eq') result = result.filter((row) => row[filter.column] === filter.value);
    }
    return { data: terminal === 'then' ? result : result[0] || null, error: null };
  }));

  return {
    client: { from },
    db
  };
}

const harness = createSupabaseHarness();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => harness.client)
}));

let ReputationGraphService;
let ReputationGraphError;
let __setSupabaseClientForTests;
let __resetSupabaseClientForTests;

describe('ReputationGraphService', () => {
  beforeAll(async () => {
    ({
      ReputationGraphService,
      ReputationGraphError,
      __setSupabaseClientForTests,
      __resetSupabaseClientForTests
    } = await import('../../services/reputationGraph.service.js'));
  });
  beforeEach(() => {
    harness.db.reputation_graph_nodes.length = 0;
    harness.db.reputation_graph_edges.length = 0;
    __setSupabaseClientForTests(harness.client);
  });

  afterAll(() => {
    __resetSupabaseClientForTests();
  });

  it('creates nodes for existing domain entities', async () => {
    const node = await ReputationGraphService.ensureNode('candidate', 'candidate-1');

    expect(node.entity_type).toBe('candidate');
    expect(node.entity_id).toBe('candidate-1');
    expect(harness.db.reputation_graph_nodes).toHaveLength(1);
  });

  it('creates directed edges once and rejects duplicates', async () => {
    const edge = await ReputationGraphService.createEdge({
      source: { entityType: 'candidate', entityId: 'candidate-1' },
      target: { entityType: 'reference', entityId: 'reference-1' },
      edgeType: 'reviewed_by',
      metadata: { source: 'test' }
    });

    expect(edge.edge_type).toBe('reviewed_by');
    await expect(ReputationGraphService.createEdge({
      source: { entityType: 'candidate', entityId: 'candidate-1' },
      target: { entityType: 'reference', entityId: 'reference-1' },
      edgeType: 'reviewed_by'
    })).rejects.toMatchObject({ code: 'DUPLICATE_EDGE', status: 409 });
  });

  it('rejects invalid edge types', async () => {
    await expect(ReputationGraphService.createEdge({
      source: { entityType: 'candidate', entityId: 'candidate-1' },
      target: { entityType: 'reference', entityId: 'reference-1' },
      edgeType: 'endorsed_by'
    })).rejects.toMatchObject({ code: 'INVALID_EDGE_TYPE', status: 400 });
  });

  it('returns a composed graph for an entity', async () => {
    await ReputationGraphService.upsertEdge({
      source: { entityType: 'candidate', entityId: 'candidate-1' },
      target: { entityType: 'reference', entityId: 'reference-1' },
      edgeType: 'reviewed_by',
      metadata: { source: 'reference_flow' }
    });

    const graph = await ReputationGraphService.getEntityGraph('candidate', 'candidate-1');

    expect(graph.node.entity_type).toBe('candidate');
    expect(graph.outgoingEdges).toHaveLength(1);
    expect(graph.incomingEdges).toHaveLength(0);
    expect(graph.outgoingEdges[0].target.entity_id).toBe('reference-1');
  });
});
