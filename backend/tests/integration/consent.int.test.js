// ============================================================================
// Consent Integration Tests - OPTIONAL
// ============================================================================
// These tests require a real Supabase connection
// Run only against a dedicated test project or local Supabase instance
//
// Setup:
// 1. Create a test Supabase project
// 2. Run migrations: sql/011_consents_and_audit_events.sql
// 3. Set env vars:
//    SUPABASE_TEST_URL=https://test-project.supabase.co
//    SUPABASE_TEST_SERVICE_KEY=your-test-service-key
//
// Run: npm test -- tests/integration/consent.int.test.js
// ============================================================================

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { createConsent, checkConsent, revokeConsent } from '../../utils/consentManager.js';

// Skip all tests if integration test env vars not set
const INTEGRATION_TESTS_ENABLED = !!process.env.SUPABASE_TEST_URL && !!process.env.SUPABASE_TEST_SERVICE_KEY;

const describeIntegration = INTEGRATION_TESTS_ENABLED ? describe : describe.skip;

describeIntegration('Consent Integration Tests (requires real Supabase)', () => {
  let supabase;
  let testConsentIds = [];
  let testUserIds = [];

  const mockUsers = {
    dataOwner: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'owner@test.com'
    },
    requester: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'requester@test.com'
    }
  };

  beforeAll(async () => {
    supabase = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_KEY);

    // Create test users (or verify they exist)
    testUserIds = [mockUsers.dataOwner.id, mockUsers.requester.id];
  });

  afterEach(async () => {
    // Cleanup: delete test consents
    if (testConsentIds.length > 0) {
      await supabase.from('consents').delete().in('id', testConsentIds);
      testConsentIds = [];
    }

    // Cleanup: delete test audit events
    await supabase.from('audit_events').delete().in('actor_user_id', testUserIds);
  });

  test('createConsent creates consent in database', async () => {
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'integration_test',
      scope: ['read']
    });

    testConsentIds.push(consent.id);

    expect(consent).toMatchObject({
      subject_user_id: mockUsers.dataOwner.id,
      granted_to_user: mockUsers.requester.id,
      resource_type: 'references',
      purpose: 'integration_test',
      status: 'active'
    });

    // Verify in database
    const { data } = await supabase.from('consents').select('*').eq('id', consent.id).single();
    expect(data).toBeTruthy();
  });

  test('checkConsent validates active consent', async () => {
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'integration_test',
      scope: ['read']
    });

    testConsentIds.push(consent.id);

    const result = await checkConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references'
    });

    expect(result.hasConsent).toBe(true);
    expect(result.consent.id).toBe(consent.id);
  });

  test('revokeConsent updates status to revoked', async () => {
    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'integration_test',
      scope: ['read']
    });

    testConsentIds.push(consent.id);

    const revoked = await revokeConsent(consent.id, mockUsers.dataOwner.id);

    expect(revoked.status).toBe('revoked');
    expect(revoked.revoked_by).toBe(mockUsers.dataOwner.id);

    // Verify checkConsent returns false after revocation
    const result = await checkConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references'
    });

    expect(result.hasConsent).toBe(false);
  });

  test('expired consent is not returned by checkConsent', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const consent = await createConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references',
      purpose: 'integration_test',
      scope: ['read'],
      expiresAt: yesterday
    });

    testConsentIds.push(consent.id);

    const result = await checkConsent({
      subjectUserId: mockUsers.dataOwner.id,
      grantedToUser: mockUsers.requester.id,
      resourceType: 'references'
    });

    expect(result.hasConsent).toBe(false);
    expect(result.reason).toBe('consent_expired');
  });
});

if (!INTEGRATION_TESTS_ENABLED) {
  console.log('⚠️  Consent integration tests SKIPPED - set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY to run');
}
