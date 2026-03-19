import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';

const fromMock = jest.fn();
const mockSupabaseClient = { from: fromMock };

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/references.service.js', () => ({
  ReferenceService: class {},
  resolveCandidateId: jest.fn(),
  getActiveSignerCompanyIds: jest.fn(),
  hasApprovedReferenceAccess: jest.fn(),
  hashInviteToken: jest.fn()
}));

const { getMyReferences } = await import('../../controllers/referencesController.js');

function createRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    })
  };
}

describe('referencesController.getMyReferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes approved references and uses status in-filter for self visibility', async () => {
    const references = [
      { id: 'ref-active', status: 'active', reference_hash: 'hash-active' },
      { id: 'ref-approved', status: 'approved', reference_hash: 'hash-approved' }
    ];

    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      in: jest.fn(() => builder),
      order: jest.fn(async () => ({ data: references, error: null }))
    };
    fromMock.mockReturnValue(builder);

    const req = { user: { id: 'user-1' }, requestId: 'req-1' };
    const res = createRes();

    await getMyReferences(req, res);

    expect(fromMock).toHaveBeenCalledWith('references');
    expect(builder.eq).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(builder.in).toHaveBeenCalledWith('status', ['active', 'approved']);
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active');
    expect(builder.select.mock.calls[0][0]).toContain('reference_hash');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.references).toEqual(references);
  });
});
