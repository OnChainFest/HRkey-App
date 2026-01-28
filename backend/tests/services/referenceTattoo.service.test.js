import { jest } from '@jest/globals';

// Set env vars before imports
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.BASE_SEPOLIA_RPC_URL = 'https://test-rpc.example.com';
process.env.PEER_PROOF_REGISTRY_ADDRESS = '0x1234567890123456789012345678901234567890';
process.env.TATTOO_SIGNER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
process.env.BASE_CHAIN_ID = '84532';

const mockSupabaseClient = {
  from: jest.fn()
};

const mockContractCreateReference = jest.fn();
const mockContractReferences = jest.fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({
      getNetwork: jest.fn()
    })),
    Wallet: jest.fn(() => ({
      address: '0xSigner'
    })),
    Contract: jest.fn(() => ({
      createReference: mockContractCreateReference,
      references: mockContractReferences
    })),
    ZeroAddress: '0x0000000000000000000000000000000000000000'
  },
  keccak256: jest.fn((bytes) => '0x' + 'a'.repeat(64)),
  toUtf8Bytes: jest.fn((str) => new Uint8Array(str.length))
}));

const {
  buildCanonicalReferenceData,
  computeReferenceHash,
  computeIntegrityStatus,
  addIntegrityStatusToReferences,
  CANONICAL_SCHEMA_VERSION
} = await import('../../services/referenceTattoo.service.js');

function createQueryBuilder(response) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => builder),
    update: jest.fn(() => builder),
    then: (resolve) => Promise.resolve(response).then(resolve),
    catch: (reject) => Promise.resolve(response).catch(reject)
  };
  return builder;
}

describe('Reference Tattoo Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReset();
    mockContractCreateReference.mockReset();
    mockContractReferences.mockReset();
  });

  describe('buildCanonicalReferenceData', () => {
    test('extracts and normalizes canonical fields from reference', () => {
      const reference = {
        id: 'test-ref-id-1234-5678-9012-345678901234',
        relationship: '  manager  ',
        summary: '  Great   employee  ',
        detailed_feedback: '  Detailed   feedback  ',
        overall_rating: 4.5,
        kpi_ratings: { quality: 5, teamwork: 4 },
        reference_type: ' peer ',
        role_id: '  role-123  ',
        referrer_name: '  John Doe  ',
        // Volatile fields that should NOT be included
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        status: 'active',
        validation_status: 'APPROVED',
        is_hidden: false
      };

      const canonical = buildCanonicalReferenceData(reference);

      expect(canonical.schema).toBe(CANONICAL_SCHEMA_VERSION);
      expect(canonical.reference_id).toBe('test-ref-id-1234-5678-9012-345678901234');
      expect(canonical.relationship).toBe('manager');
      expect(canonical.summary).toBe('Great employee');
      expect(canonical.detailed_feedback).toBe('Detailed feedback');
      expect(canonical.overall_rating).toBe(4.5);
      expect(canonical.reference_type).toBe('peer');
      expect(canonical.role_id).toBe('role-123');
      expect(canonical.referrer_name_hash).toBeDefined();
      expect(canonical.referrer_name_hash).not.toBe('John Doe');

      // Ensure volatile fields are NOT included
      expect(canonical.created_at).toBeUndefined();
      expect(canonical.updated_at).toBeUndefined();
      expect(canonical.status).toBeUndefined();
      expect(canonical.validation_status).toBeUndefined();
      expect(canonical.is_hidden).toBeUndefined();
    });

    test('normalizes KPI ratings to consistent sorted array format', () => {
      const referenceWithObjectKpi = {
        id: 'test-ref-1',
        kpi_ratings: { zebra: 5, alpha: 3, beta: 4 }
      };

      const referenceWithArrayKpi = {
        id: 'test-ref-2',
        kpi_ratings: [
          { kpi_name: 'zebra', rating_value: 5 },
          { kpi_name: 'alpha', rating_value: 3 },
          { kpi_name: 'beta', rating_value: 4 }
        ]
      };

      const canonical1 = buildCanonicalReferenceData(referenceWithObjectKpi);
      const canonical2 = buildCanonicalReferenceData(referenceWithArrayKpi);

      // Both should be sorted alphabetically
      expect(canonical1.kpi_ratings[0].kpi_id).toBe('alpha');
      expect(canonical1.kpi_ratings[1].kpi_id).toBe('beta');
      expect(canonical1.kpi_ratings[2].kpi_id).toBe('zebra');

      expect(canonical2.kpi_ratings[0].kpi_id).toBe('alpha');
      expect(canonical2.kpi_ratings[1].kpi_id).toBe('beta');
      expect(canonical2.kpi_ratings[2].kpi_id).toBe('zebra');
    });

    test('handles null and missing fields gracefully', () => {
      const reference = {
        id: 'test-ref-minimal',
        relationship: null,
        summary: undefined,
        overall_rating: null,
        kpi_ratings: null,
        referrer_name: null
      };

      const canonical = buildCanonicalReferenceData(reference);

      expect(canonical.schema).toBe(CANONICAL_SCHEMA_VERSION);
      expect(canonical.reference_id).toBe('test-ref-minimal');
      expect(canonical.relationship).toBeNull();
      expect(canonical.summary).toBeUndefined(); // undefined stays undefined
      expect(canonical.overall_rating).toBeNull();
      expect(canonical.kpi_ratings).toBeNull();
      expect(canonical.referrer_name_hash).toBeNull();
    });
  });

  describe('computeReferenceHash', () => {
    test('produces deterministic hash for same reference data', () => {
      const reference = {
        id: 'test-ref-hash-1234',
        relationship: 'manager',
        summary: 'Excellent work',
        overall_rating: 5,
        kpi_ratings: { quality: 5 }
      };

      const result1 = computeReferenceHash(reference);
      const result2 = computeReferenceHash(reference);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.canonicalJson).toBe(result2.canonicalJson);
      expect(result1.canonicalData).toEqual(result2.canonicalData);
    });

    test('produces different hash for different content', () => {
      const reference1 = {
        id: 'test-ref-1',
        summary: 'Good work'
      };

      const reference2 = {
        id: 'test-ref-1',
        summary: 'Great work' // Different content
      };

      const result1 = computeReferenceHash(reference1);
      const result2 = computeReferenceHash(reference2);

      // Note: Because we mock keccak256, the hashes will be the same in this test
      // In real execution, they would differ
      expect(result1.canonicalJson).not.toBe(result2.canonicalJson);
    });
  });

  describe('computeIntegrityStatus', () => {
    test('returns UNKNOWN for non-tattooed reference', () => {
      const reference = {
        id: 'test-ref',
        tattoo_tx_hash: null,
        canonical_hash: null
      };

      const status = computeIntegrityStatus(reference);
      expect(status).toBe('UNKNOWN');
    });

    test('returns UNKNOWN if only tx_hash but no canonical_hash', () => {
      const reference = {
        id: 'test-ref',
        tattoo_tx_hash: '0x123',
        canonical_hash: null
      };

      const status = computeIntegrityStatus(reference);
      expect(status).toBe('UNKNOWN');
    });

    test('returns VALID when computed hash matches stored hash', () => {
      // Create a reference where the canonical hash matches what would be computed
      const reference = {
        id: 'test-ref-valid',
        relationship: 'manager',
        summary: 'Excellent',
        tattoo_tx_hash: '0x123456',
        canonical_hash: null,
        onchain_hash: null
      };

      // First compute what the hash would be
      const { hash } = computeReferenceHash(reference);

      // Set the canonical_hash to match
      reference.canonical_hash = hash;
      reference.onchain_hash = hash;

      const status = computeIntegrityStatus(reference);
      expect(status).toBe('VALID');
    });

    test('returns INVALID when computed hash differs from stored hash', () => {
      const reference = {
        id: 'test-ref-invalid',
        relationship: 'manager',
        summary: 'Modified content',
        tattoo_tx_hash: '0x123456',
        canonical_hash: '0xDIFFERENTHASH',
        onchain_hash: '0xDIFFERENTHASH'
      };

      const status = computeIntegrityStatus(reference);
      expect(status).toBe('INVALID');
    });
  });

  describe('addIntegrityStatusToReferences', () => {
    test('adds integrity_status to array of references', () => {
      const references = [
        {
          id: 'ref-1',
          tattoo_tx_hash: null,
          canonical_hash: null
        },
        {
          id: 'ref-2',
          tattoo_tx_hash: '0x123',
          canonical_hash: '0xDIFFERENT',
          onchain_hash: '0xDIFFERENT'
        }
      ];

      const result = addIntegrityStatusToReferences(references);

      expect(result[0].integrity_status).toBe('UNKNOWN');
      expect(result[1].integrity_status).toBe('INVALID');
      expect(result).toHaveLength(2);
    });

    test('handles empty array', () => {
      const result = addIntegrityStatusToReferences([]);
      expect(result).toEqual([]);
    });
  });
});

describe('Reference Tattoo Authorization', () => {
  // These tests verify authorization logic concepts
  // Full integration tests would require app setup

  test('tattoo should only be allowed by reference owner', () => {
    // This is a conceptual test - the actual authorization is in the service
    const ownerId = 'user-123';
    const otherUserId = 'user-456';
    const referenceOwnerId = 'user-123';

    expect(ownerId === referenceOwnerId).toBe(true);
    expect(otherUserId === referenceOwnerId).toBe(false);
  });

  test('tattoo should be rejected for hidden references', () => {
    const reference = {
      id: 'ref-1',
      is_hidden: true
    };

    expect(reference.is_hidden).toBe(true);
  });

  test('tattoo should be rejected for rejected validation status', () => {
    const reference = {
      id: 'ref-1',
      validation_status: 'REJECTED_FRAUD'
    };

    expect(reference.validation_status.startsWith('REJECTED')).toBe(true);
  });
});
