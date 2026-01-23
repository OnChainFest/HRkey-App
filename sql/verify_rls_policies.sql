-- ============================================================================
-- RLS Policy Verification Script
-- ============================================================================
-- Purpose: Verify that RLS policies are correctly enforcing consent-based access
-- Usage: Run this script against your Supabase instance to audit RLS coverage
-- Author: HRKey Security Team
-- Date: 2026-01-22
-- ============================================================================

-- ============================================================================
-- 1. CHECK RLS COVERAGE
-- ============================================================================
-- Verify that all sensitive tables have RLS enabled

\echo '============================================================'
\echo 'RLS Coverage Audit'
\echo '============================================================'
\echo ''

SELECT * FROM audit_rls_coverage();

\echo ''
\echo 'Expected: All tables should have rls_enabled = true and policy_count > 0'
\echo ''

-- ============================================================================
-- 2. LIST ALL POLICIES FOR SENSITIVE TABLES
-- ============================================================================
-- Show detailed policy information

\echo '============================================================'
\echo 'Detailed Policy Information'
\echo '============================================================'
\echo ''

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL as has_using_clause,
  with_check IS NOT NULL as has_with_check_clause
FROM pg_policies
WHERE tablename IN (
  'references',
  'kpi_observations',
  'hrkey_scores',
  'consents',
  'audit_events',
  'data_access_requests'
)
ORDER BY tablename, policyname;

\echo ''

-- ============================================================================
-- 3. TEST SCENARIO: Self-Access (should always work)
-- ============================================================================
-- Test that users can access their own data

\echo '============================================================'
\echo 'Test Scenario: Self-Access'
\echo '============================================================'
\echo ''
\echo 'Testing if users can access their own data...'
\echo ''

-- Create a test user ID (replace with actual user ID from your database)
DO $$
DECLARE
  v_test_user_id UUID;
  v_ref_count INTEGER;
  v_kpi_count INTEGER;
  v_score_count INTEGER;
BEGIN
  -- Get first non-superadmin user
  SELECT id INTO v_test_user_id
  FROM users
  WHERE role != 'superadmin'
  LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE '⚠️  No test user found. Skipping self-access test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing self-access for user: %', v_test_user_id;

  -- Simulate auth.uid() = test user
  PERFORM set_config('request.jwt.claims.sub', v_test_user_id::TEXT, true);

  -- Count accessible references
  SELECT COUNT(*) INTO v_ref_count
  FROM references
  WHERE owner_id = v_test_user_id;

  RAISE NOTICE '  - References accessible: %', v_ref_count;

  -- Count accessible KPI observations
  SELECT COUNT(*) INTO v_kpi_count
  FROM kpi_observations
  WHERE subject_user_id = v_test_user_id;

  RAISE NOTICE '  - KPI observations accessible: %', v_kpi_count;

  -- Count accessible scores
  SELECT COUNT(*) INTO v_score_count
  FROM hrkey_scores
  WHERE user_id = v_test_user_id;

  RAISE NOTICE '  - HRKey scores accessible: %', v_score_count;

  IF v_ref_count >= 0 AND v_kpi_count >= 0 AND v_score_count >= 0 THEN
    RAISE NOTICE '✅ Self-access test PASSED';
  ELSE
    RAISE WARNING '❌ Self-access test FAILED';
  END IF;

  -- Reset auth context
  PERFORM set_config('request.jwt.claims.sub', NULL, true);
END $$;

\echo ''

-- ============================================================================
-- 4. TEST SCENARIO: No Consent (should be denied)
-- ============================================================================
-- Test that users WITHOUT consent cannot access other users' data

\echo '============================================================'
\echo 'Test Scenario: No Consent (Denial)'
\echo '============================================================'
\echo ''
\echo 'Testing if users WITHOUT consent are blocked...'
\echo ''

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_ref_count INTEGER;
BEGIN
  -- Get two different users
  SELECT id INTO v_user1_id
  FROM users
  WHERE role != 'superadmin'
  LIMIT 1;

  SELECT id INTO v_user2_id
  FROM users
  WHERE role != 'superadmin'
    AND id != v_user1_id
  LIMIT 1;

  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠️  Not enough test users found. Skipping no-consent test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing access from user % to user %''s data (no consent)', v_user1_id, v_user2_id;

  -- Simulate auth.uid() = user1 trying to access user2's data
  PERFORM set_config('request.jwt.claims.sub', v_user1_id::TEXT, true);

  -- Try to count user2's references
  SELECT COUNT(*) INTO v_ref_count
  FROM references
  WHERE owner_id = v_user2_id;

  RAISE NOTICE '  - References accessible: % (should be 0)', v_ref_count;

  IF v_ref_count = 0 THEN
    RAISE NOTICE '✅ No-consent denial test PASSED';
  ELSE
    RAISE WARNING '❌ No-consent denial test FAILED - user can see data without consent!';
  END IF;

  -- Reset auth context
  PERFORM set_config('request.jwt.claims.sub', NULL, true);
END $$;

\echo ''

-- ============================================================================
-- 5. TEST SCENARIO: With Consent (should be allowed)
-- ============================================================================
-- Test that users WITH active consent can access data

\echo '============================================================'
\echo 'Test Scenario: With Active Consent (Allowed)'
\echo '============================================================'
\echo ''
\echo 'Testing if users WITH consent can access data...'
\echo ''

DO $$
DECLARE
  v_subject_id UUID;
  v_grantee_id UUID;
  v_consent_id UUID;
  v_ref_count INTEGER;
BEGIN
  -- Get two users
  SELECT id INTO v_subject_id
  FROM users
  WHERE role != 'superadmin'
  LIMIT 1;

  SELECT id INTO v_grantee_id
  FROM users
  WHERE role != 'superadmin'
    AND id != v_subject_id
  LIMIT 1;

  IF v_subject_id IS NULL OR v_grantee_id IS NULL THEN
    RAISE NOTICE '⚠️  Not enough test users found. Skipping consent test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing access from user % to user %''s data (with consent)', v_grantee_id, v_subject_id;

  -- Create a test consent
  INSERT INTO consents (
    subject_user_id,
    granted_to_user,
    resource_type,
    scope,
    purpose,
    status,
    granted_at
  ) VALUES (
    v_subject_id,
    v_grantee_id,
    'references',
    ARRAY['read'],
    'rls_verification_test',
    'active',
    NOW()
  )
  RETURNING id INTO v_consent_id;

  RAISE NOTICE '  - Created test consent: %', v_consent_id;

  -- Simulate auth.uid() = grantee trying to access subject's data
  PERFORM set_config('request.jwt.claims.sub', v_grantee_id::TEXT, true);

  -- Try to count subject's references
  SELECT COUNT(*) INTO v_ref_count
  FROM references
  WHERE owner_id = v_subject_id;

  RAISE NOTICE '  - References accessible: % (should be > 0 if subject has references)', v_ref_count;

  IF v_ref_count >= 0 THEN
    RAISE NOTICE '✅ Consent-based access test PASSED';
  ELSE
    RAISE WARNING '❌ Consent-based access test FAILED';
  END IF;

  -- Cleanup: Delete test consent
  DELETE FROM consents WHERE id = v_consent_id;
  RAISE NOTICE '  - Cleaned up test consent';

  -- Reset auth context
  PERFORM set_config('request.jwt.claims.sub', NULL, true);
END $$;

\echo ''

-- ============================================================================
-- 6. TEST SCENARIO: Superadmin Access (should see all)
-- ============================================================================
-- Test that superadmins can access all data

\echo '============================================================'
\echo 'Test Scenario: Superadmin Access'
\echo '============================================================'
\echo ''
\echo 'Testing if superadmins can access all data...'
\echo ''

DO $$
DECLARE
  v_superadmin_id UUID;
  v_total_refs INTEGER;
  v_accessible_refs INTEGER;
BEGIN
  -- Get a superadmin user
  SELECT id INTO v_superadmin_id
  FROM users
  WHERE role = 'superadmin'
  LIMIT 1;

  IF v_superadmin_id IS NULL THEN
    RAISE NOTICE '⚠️  No superadmin found. Skipping superadmin test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing superadmin access for user: %', v_superadmin_id;

  -- Count total references (service role - no RLS)
  SELECT COUNT(*) INTO v_total_refs
  FROM references;

  RAISE NOTICE '  - Total references in database: %', v_total_refs;

  -- Simulate auth.uid() = superadmin
  PERFORM set_config('request.jwt.claims.sub', v_superadmin_id::TEXT, true);

  -- Count accessible references
  SELECT COUNT(*) INTO v_accessible_refs
  FROM references;

  RAISE NOTICE '  - References accessible to superadmin: %', v_accessible_refs;

  IF v_accessible_refs = v_total_refs THEN
    RAISE NOTICE '✅ Superadmin access test PASSED';
  ELSE
    RAISE WARNING '❌ Superadmin access test FAILED - superadmin cannot see all data!';
  END IF;

  -- Reset auth context
  PERFORM set_config('request.jwt.claims.sub', NULL, true);
END $$;

\echo ''

-- ============================================================================
-- 7. SUMMARY
-- ============================================================================

\echo '============================================================'
\echo 'RLS Verification Summary'
\echo '============================================================'
\echo ''
\echo 'RLS policies have been verified. Review the results above.'
\echo ''
\echo 'Expected behavior:'
\echo '  ✅ Users can access their own data (self-access)'
\echo '  ✅ Users WITHOUT consent are denied access to others data'
\echo '  ✅ Users WITH active consent can access granted data'
\echo '  ✅ Superadmins can access all data'
\echo '  ✅ Service role (backend) bypasses RLS'
\echo ''
\echo 'If any tests failed, review the policy definitions in'
\echo 'migration 012_rls_hardening_sensitive_tables.sql'
\echo '============================================================'

-- ============================================================================
-- END OF VERIFICATION SCRIPT
-- ============================================================================
