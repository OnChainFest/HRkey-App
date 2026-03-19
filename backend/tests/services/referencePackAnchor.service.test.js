import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const fromMock = jest.fn();
const updateMock = jest.fn();
const eqMock = jest.fn(async () => ({ data: null, error: null }));
const mockSupabaseClient = { from: fromMock };

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const {
  autoAnchorReferencePack,
  persistPendingAnchorMetadata
} = await import('../../services/referencePackAnchor.service.js');

describe('referencePackAnchor.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateMock.mockImplementation(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });
  });

  test('persistPendingAnchorMetadata writes pending metadata', async () => {
    const metadata = { anchor_status: 'pending', reference_hash: 'hash-1' };

    const result = await persistPendingAnchorMetadata('ref-1', metadata);

    expect(result).toEqual(metadata);
    expect(fromMock).toHaveBeenCalledWith('references');
    expect(updateMock).toHaveBeenCalledWith(metadata);
  });

  test('non-blocking mode returns after pending persistence', async () => {
    const pendingMetadata = { anchor_status: 'pending', reference_hash: 'hash-2' };
    const persistPending = jest.fn(async () => {
      await mockSupabaseClient.from('references').update(pendingMetadata).eq('id', 'ref-2');
      return pendingMetadata;
    });
    const completeAnchor = jest.fn();

    const result = await autoAnchorReferencePack('ref-2', {
      mode: 'non-blocking',
      persistPending,
      completeAnchor
    });

    expect(result).toEqual(pendingMetadata);
    expect(completeAnchor).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  test('completion mode persists anchored metadata', async () => {
    const pendingMetadata = { anchor_status: 'pending', reference_hash: 'hash-3' };
    const anchoredMetadata = { anchor_status: 'anchored', anchor_tx_hash: '0xabc' };

    const persistPending = jest.fn(async () => {
      await mockSupabaseClient.from('references').update(pendingMetadata).eq('id', 'ref-3');
      return pendingMetadata;
    });
    const completeAnchor = jest.fn(async () => anchoredMetadata);

    const result = await autoAnchorReferencePack('ref-3', {
      mode: 'completion',
      persistPending,
      completeAnchor
    });

    expect(result).toEqual(anchoredMetadata);
    expect(updateMock.mock.calls[1][0]).toEqual(anchoredMetadata);
  });

  test('completion mode persists failed metadata on error', async () => {
    const pendingMetadata = { anchor_status: 'pending', reference_hash: 'hash-4' };

    const persistPending = jest.fn(async () => {
      await mockSupabaseClient.from('references').update(pendingMetadata).eq('id', 'ref-4');
      return pendingMetadata;
    });
    const completeAnchor = jest.fn(async () => {
      throw new Error('anchor failed');
    });

    const result = await autoAnchorReferencePack('ref-4', {
      mode: 'completion',
      persistPending,
      completeAnchor
    });

    expect(result).toEqual({ anchor_status: 'failed', anchor_error: 'anchor failed' });
    expect(updateMock.mock.calls[1][0]).toEqual({ anchor_status: 'failed', anchor_error: 'anchor failed' });
  });
});
