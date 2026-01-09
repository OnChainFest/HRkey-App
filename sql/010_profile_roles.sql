-- ============================================================================
-- HRKey Profile Roles - Database Schema
-- ============================================================================
-- Description: Implements dual-mode dashboard (Candidate + Referrer roles)
-- Author: HRKey Development Team
-- Date: 2026-01-09
-- Purpose: Enable users to switch between Candidate and Referrer modes
-- ============================================================================

-- ============================================================================
-- 1. PROFILE_ROLES TABLE
-- ============================================================================
-- Stores role assignments for each user (candidate, referrer)
-- Users can have multiple roles enabled simultaneously

CREATE TABLE IF NOT EXISTS profile_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Role type
  role TEXT NOT NULL CHECK (role IN ('candidate', 'referrer')),

  -- Status
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one row per user per role
  UNIQUE(user_id, role)
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for querying user's enabled roles
CREATE INDEX IF NOT EXISTS idx_profile_roles_user_enabled ON profile_roles(user_id, is_enabled);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profile_roles_role ON profile_roles(role);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE profile_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON profile_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own roles (enable/disable)
CREATE POLICY "Users can update their own roles"
  ON profile_roles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: System can insert default roles on user creation
CREATE POLICY "System can insert roles"
  ON profile_roles
  FOR INSERT
  WITH CHECK (true);

-- Policy: Superadmins can view all roles
CREATE POLICY "Superadmins can view all roles"
  ON profile_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to get enabled roles for a user
CREATE OR REPLACE FUNCTION get_user_roles(target_user_id UUID)
RETURNS TABLE(role TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT pr.role
  FROM profile_roles pr
  WHERE pr.user_id = target_user_id
    AND pr.is_enabled = TRUE
  ORDER BY pr.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize default roles for a user
CREATE OR REPLACE FUNCTION initialize_user_roles(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert candidate role (enabled by default)
  INSERT INTO profile_roles (user_id, role, is_enabled)
  VALUES (target_user_id, 'candidate', TRUE)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Insert referrer role (enabled by default)
  INSERT INTO profile_roles (user_id, role, is_enabled)
  VALUES (target_user_id, 'referrer', TRUE)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-initialize roles when a new user is created
CREATE OR REPLACE FUNCTION auto_initialize_roles()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM initialize_user_roles(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_initialize_roles') THEN
    CREATE TRIGGER trigger_auto_initialize_roles
      AFTER INSERT ON users
      FOR EACH ROW
      EXECUTE FUNCTION auto_initialize_roles();
  END IF;
END $$;

-- ============================================================================
-- 5. SEED EXISTING USERS WITH DEFAULT ROLES
-- ============================================================================
-- Initialize roles for all existing users who don't have roles yet

DO $$
DECLARE
  user_record RECORD;
  initialized_count INTEGER := 0;
BEGIN
  FOR user_record IN
    SELECT id FROM users
    WHERE NOT EXISTS (
      SELECT 1 FROM profile_roles WHERE user_id = users.id
    )
  LOOP
    PERFORM initialize_user_roles(user_record.id);
    initialized_count := initialized_count + 1;
  END LOOP;

  RAISE NOTICE '✅ Initialized roles for % existing users', initialized_count;
END $$;

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE profile_roles IS 'Stores user role assignments for dual-mode dashboard (candidate/referrer)';
COMMENT ON COLUMN profile_roles.role IS 'Role type: candidate (my profile) or referrer (contributor)';
COMMENT ON COLUMN profile_roles.is_enabled IS 'Whether this role is currently enabled for the user';

-- ============================================================================
-- 7. MIGRATION VERIFICATION
-- ============================================================================

DO $$
DECLARE
  total_users INTEGER;
  users_with_roles INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM users;
  SELECT COUNT(DISTINCT user_id) INTO users_with_roles FROM profile_roles;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Profile Roles migration completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Total users: %', total_users;
  RAISE NOTICE '  - Users with roles: %', users_with_roles;
  RAISE NOTICE '  - Table created: profile_roles';
  RAISE NOTICE '  - Helper functions: get_user_roles, initialize_user_roles';
  RAISE NOTICE '  - Trigger: auto_initialize_roles on user creation';
  RAISE NOTICE '  - RLS policies: 4 policies created';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for dual-mode dashboard!';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
