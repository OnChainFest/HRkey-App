import { jest } from '@jest/globals';
import request from 'supertest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.BASE_SEPOLIA_RPC_URL = 'https://base-sepolia.example';
process.env.PROOF_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
process.env.PROOF_SIGNER_PRIVATE_KEY = '0x'.padEnd(66, '1');

const mockBuildCanonicalReferencePack = jest.fn();
const mockCanonicalHash = jest.fn();

const mockRecordReferencePackProof = jest.fn();
const mockGetProof = jest.fn();
const mockWait = jest.fn();

jest.unstable_mockModule('../../services/referencePack.service.js', () => ({
  buildCanonicalReferencePack: mockBuildCanonicalReferencePack
}));

jest.unstable_mockModule('../../utils/canonicalHash.js', () => ({
  canonicalHash: mockCanonicalHash
}));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
  requireSuperadmin: (_req, _res, next) => next(),
  requireCompanySigner: (_req, _res, next) => next(),
  requireSelfOrSuperadmin: () => (_req, _res, next) => next(),
  requireWalletLinked: () => (_req, _res, next) => next(),
  requireOwnWallet: () => (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next()
}));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

const supabaseMock = await import('../__mocks__/supabase.mock.js');
const { createMockSupabaseClient } = supabaseMock.default;
const mockSupabaseClient = createMockSupabaseClient();
const { createClient } = await import('@supabase/supabase-js');
createClient.mockReturnValue(mockSupabaseClient);

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn(),
    Contract: function MockContract() {
      this.recordReferencePackProof = mockRecordReferencePackProof;
      this.getProof = mockGetProof;
    }
  }
}));

const { default: app } = await import('../../server.js');

describe('Reference Pack Proof Endpoints', () => {
  beforeEach(() => {
    mockBuildCanonicalReferencePack.mockReset();
    mockCanonicalHash.mockReset();
    mockRecordReferencePackProof.mockReset();
    mockGetProof.mockReset();
    mockWait.mockReset();
  });

  test('POST /api/reference-pack/:identifier/commit returns expected payload', async () => {
    const packHash = 'a'.repeat(64);
    mockBuildCanonicalReferencePack.mockResolvedValue({ schema: 'hrkey.reference_pack.v1' });
    mockCanonicalHash.mockReturnValue({ hash: packHash, canonicalJson: '{}' });
    mockWait.mockResolvedValue({ blockNumber: 123 });
    mockRecordReferencePackProof.mockResolvedValue({ hash: '0xtxhash', wait: mockWait });

    const response = await request(app)
      .post('/api/reference-pack/candidate-123/commit')
      .expect(200);

    expect(response.body.pack_hash).toBe(packHash);
    expect(response.body.tx_hash).toBe('0xtxhash');
    expect(response.body.contract_address).toBe(process.env.PROOF_CONTRACT_ADDRESS);
    expect(response.body.chain_id).toBe(84532);
    expect(response.body.recorded_at).toBeTruthy();
    expect(mockRecordReferencePackProof).toHaveBeenCalledWith(`0x${packHash}`, 'candidate-123');
    expect(mockCanonicalHash).toHaveBeenCalled();
  });

  test('GET /api/reference-pack/proof/:packHash returns proof details', async () => {
    const packHash = 'b'.repeat(64);
    mockGetProof.mockResolvedValue(['0xrecorder', 456n, 'candidate-xyz', true]);

    const response = await request(app)
      .get(`/api/reference-pack/proof/${packHash}`)
      .expect(200);

    expect(response.body.exists).toBe(true);
    expect(response.body.recorder).toBe('0xrecorder');
    expect(response.body.timestamp).toBe(456);
    expect(response.body.candidateIdentifier).toBe('candidate-xyz');
    expect(response.body.contract_address).toBe(process.env.PROOF_CONTRACT_ADDRESS);
    expect(response.body.chain_id).toBe(84532);
  });
});
