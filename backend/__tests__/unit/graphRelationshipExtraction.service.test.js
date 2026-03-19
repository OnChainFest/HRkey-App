import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

function createQueryBuilder(resolver) {
  const state = {
    filters: [],
    payload: null,
    action: 'select',
    writeAction: null
  };

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
      state.filters.push({ op: 'eq', column, value });
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
    users: [{ id: 'candidate-1' }],
    companies: [],
    roles: [],
    references: [
      { id: 'reference-manager', owner_id: 'candidate-1' },
      { id: 'reference-peer', owner_id: 'candidate-1' },
      { id: 'reference-collaborator', owner_id: 'candidate-1' },
      { id: 'reference-fallback', owner_id: 'candidate-1' },
      { id: 'reference-direct-report', owner_id: 'candidate-1' }
    ],
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

let extractRelationshipsFromReference;
let persistRelationshipsFromReference;
let GRAPH_RELATIONSHIP_TYPES;
let __setSupabaseClientForTests;
let __resetSupabaseClientForTests;

describe('graphRelationshipExtraction.service', () => {
  beforeAll(async () => {
    ({
      extractRelationshipsFromReference,
      persistRelationshipsFromReference,
      GRAPH_RELATIONSHIP_TYPES
    } = await import('../../services/graphRelationshipExtraction.service.js'));

    ({
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

  test('extracts manager relationship signals deterministically', () => {
    const extraction = extractRelationshipsFromReference({
      id: 'reference-manager',
      owner_id: 'candidate-1',
      relationship: ' manager '
    });

    expect(extraction.inferredRelationshipType).toBe(GRAPH_RELATIONSHIP_TYPES.MANAGER_OF);
    expect(extraction.inferredRelationshipSignals).toEqual([
      expect.objectContaining({
        relationshipType: GRAPH_RELATIONSHIP_TYPES.MANAGER_OF,
        normalizedRelationshipValue: 'manager',
        materializedAsGraphEdge: false
      })
    ]);
    expect(extraction.persistableGraphEdges).toEqual([
      expect.objectContaining({ relationshipType: GRAPH_RELATIONSHIP_TYPES.REFERENCED })
    ]);
  });

  test('extracts peer relationship signals', () => {
    const extraction = extractRelationshipsFromReference({
      id: 'reference-peer',
      owner_id: 'candidate-1',
      relationship: 'peer'
    });

    expect(extraction.inferredRelationshipSignals[0]).toMatchObject({
      relationshipType: GRAPH_RELATIONSHIP_TYPES.PEER_OF,
      materializedAsGraphEdge: false
    });
  });

  test('extracts collaborator relationship signals', () => {
    const extraction = extractRelationshipsFromReference({
      id: 'reference-collaborator',
      owner_id: 'candidate-1',
      relationship: 'collaborator'
    });

    expect(extraction.inferredRelationshipSignals[0]).toMatchObject({
      relationshipType: GRAPH_RELATIONSHIP_TYPES.COLLABORATED_WITH,
      materializedAsGraphEdge: false
    });
  });

  test('extracts direct report relationship signals', () => {
    const extraction = extractRelationshipsFromReference({
      id: 'reference-direct-report',
      owner_id: 'candidate-1',
      relationship: 'direct_report'
    });

    expect(extraction.inferredRelationshipSignals[0]).toMatchObject({
      relationshipType: GRAPH_RELATIONSHIP_TYPES.DIRECT_REPORT_OF,
      materializedAsGraphEdge: false
    });
  });

  test('falls back cleanly when relationship is missing', () => {
    const extraction = extractRelationshipsFromReference({
      id: 'reference-fallback',
      owner_id: 'candidate-1'
    });

    expect(extraction.inferredRelationshipType).toBeNull();
    expect(extraction.inferredRelationshipSignals).toEqual([]);
    expect(extraction.persistableGraphEdges).toHaveLength(1);
    expect(extraction.persistableGraphEdges[0].metadata).toMatchObject({
      normalized_relationship_value: null,
      inferred_relationship_type: null
    });
  });

  test('persists only referenced evidence edges and stores inferred signals in metadata', async () => {
    const reference = {
      id: 'reference-direct-report',
      owner_id: 'candidate-1',
      relationship: 'direct_report'
    };

    const firstRun = await persistRelationshipsFromReference(reference);
    const secondRun = await persistRelationshipsFromReference(reference);

    expect(firstRun.edges).toHaveLength(1);
    expect(secondRun.edges).toHaveLength(1);
    expect(firstRun.inferredRelationshipSignals).toEqual([
      expect.objectContaining({ relationshipType: GRAPH_RELATIONSHIP_TYPES.DIRECT_REPORT_OF })
    ]);
    expect(harness.db.reputation_graph_nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_type: 'reference', entity_id: 'reference-direct-report' }),
        expect.objectContaining({ entity_type: 'candidate', entity_id: 'candidate-1' })
      ])
    );
    expect(harness.db.reputation_graph_edges).toHaveLength(1);
    expect(harness.db.reputation_graph_edges[0]).toEqual(
      expect.objectContaining({
        edge_type: GRAPH_RELATIONSHIP_TYPES.REFERENCED,
        reference_id: 'reference-direct-report',
        confidence_score: 1,
        metadata: expect.objectContaining({
          normalized_relationship_value: 'direct_report',
          inferred_relationship_type: GRAPH_RELATIONSHIP_TYPES.DIRECT_REPORT_OF,
          extraction_source: 'reference_submission',
          reference_id: 'reference-direct-report',
          candidate_id: 'candidate-1',
          confidence_score: 1
        })
      })
    );
  });

  test('rejects invalid reference payloads', async () => {
    expect(() => extractRelationshipsFromReference(null)).toThrow('Reference record is required');
    expect(() => extractRelationshipsFromReference({ id: 'missing-owner' })).toThrow('Reference record must include id and owner_id');
    await expect(persistRelationshipsFromReference({ id: 'missing-owner' })).rejects.toThrow('Reference record must include id and owner_id');
  });
});
