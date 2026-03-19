import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn() }))
}));

let ensureCanonicalRefereeIdentity;
let resolveRefereeIdentity;
let __setSupabaseClientForTests;
let __resetSupabaseClientForTests;

beforeAll(async () => {
  ({
    ensureCanonicalRefereeIdentity,
    resolveRefereeIdentity,
    __setSupabaseClientForTests,
    __resetSupabaseClientForTests
  } = await import('../../services/refereeIdentity.service.js'));
});

function createTestClient(db) {
  return {
    from(table) {
      return {
        select() {
          return this;
        },
        eq(column, value) {
          this.filters = this.filters || [];
          this.filters.push({ column, value });
          return this;
        },
        upsert(payload) {
          this.payload = payload;
          this.action = 'upsert';
          return this;
        },
        async maybeSingle() {
          const rows = db[table] || [];
          const result = (this.filters || []).reduce(
            (acc, filter) => acc.filter((row) => row[filter.column] === filter.value),
            rows
          );
          return { data: result[0] || null, error: null };
        },
        async single() {
          if (this.action === 'upsert' && table === 'referee_identities') {
            const existing = db.referee_identities.find((row) => row.id === this.payload.id);
            if (existing) {
              Object.assign(existing, this.payload);
              return { data: existing, error: null };
            }
            db.referee_identities.push({ ...this.payload });
            return { data: db.referee_identities[db.referee_identities.length - 1], error: null };
          }
          const rows = db[table] || [];
          const result = (this.filters || []).reduce(
            (acc, filter) => acc.filter((row) => row[filter.column] === filter.value),
            rows
          );
          return { data: result[0] || null, error: null };
        }
      };
    }
  };
}

describe('refereeIdentity.service', () => {
  let db;

  beforeEach(() => {
    db = {
      reference_invites: [],
      company_signers: [],
      referee_identities: []
    };
    __setSupabaseClientForTests(createTestClient(db));
  });

  afterAll(() => {
    __resetSupabaseClientForTests();
  });

  test('resolves email-based identities deterministically', async () => {
    const first = await resolveRefereeIdentity({ id: 'ref-1', referrer_email: ' Referee@Example.COM ' });
    const second = await resolveRefereeIdentity({ id: 'ref-2', referrer_email: 'referee@example.com' });

    expect(first.resolutionStrategy).toBe('email');
    expect(first.refereeId).toBe(second.refereeId);
  });

  test('falls back to a hashed composite when email is unavailable', async () => {
    const resolved = await resolveRefereeIdentity({
      id: 'ref-3',
      referrer_name: ' Jordan Ref ',
      referrer_company: ' Beta Corp ',
      role_id: 'role-123'
    });

    expect(resolved.resolutionStrategy).toBe('fallback');
    expect(resolved.normalizedAttributes).toMatchObject({
      name: 'jordan ref',
      company: 'beta corp',
      role: 'role-123'
    });
  });

  test('maps multiple references to the same canonical signer identity', async () => {
    db.reference_invites.push({ id: 'invite-1', company_signer_id: 'signer-1', company_id: 'company-1' });
    db.reference_invites.push({ id: 'invite-2', company_signer_id: 'signer-1', company_id: 'company-1' });
    db.company_signers.push({
      id: 'signer-1',
      user_id: 'user-9',
      company_id: 'company-1',
      email: 'signer@example.com',
      role: 'HR Manager',
      is_active: true
    });

    const first = await ensureCanonicalRefereeIdentity({ id: 'ref-4', invite_id: 'invite-1' });
    const second = await ensureCanonicalRefereeIdentity({ id: 'ref-5', invite_id: 'invite-2' });

    expect(first.resolutionStrategy).toBe('signer');
    expect(first.refereeId).toBe(second.refereeId);
    expect(db.referee_identities).toHaveLength(1);
  });

  test('is idempotent for repeated persistence of the same referee', async () => {
    const reference = { id: 'ref-6', referrer_email: 'repeat@example.com' };
    const first = await ensureCanonicalRefereeIdentity(reference);
    const second = await ensureCanonicalRefereeIdentity(reference);

    expect(first.refereeId).toBe(second.refereeId);
    expect(db.referee_identities).toHaveLength(1);
  });
});
