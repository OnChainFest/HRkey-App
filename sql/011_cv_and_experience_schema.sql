-- ============================================================================
-- HRKey CV & Experience Schema - Professional Profile Construction
-- ============================================================================
-- Description: Structured CV/profile data for candidates
-- Author: HRKey Development Team (Claude Code)
-- Date: 2025-01-06
-- Purpose: Enable candidates to build structured professional profiles
-- ============================================================================

-- ============================================================================
-- 1. CANDIDATE EXPERIENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Core experience data
  role TEXT NOT NULL,
  company TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE, -- NULL = current position
  is_current BOOLEAN DEFAULT FALSE,

  -- Details
  description TEXT, -- Main responsibilities and achievements
  location TEXT,
  employment_type TEXT CHECK (employment_type IN (
    'full-time', 'part-time', 'contract', 'freelance', 'internship', 'volunteer'
  )),

  -- Metadata
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'references-only')),
  display_order INTEGER DEFAULT 0, -- For custom ordering

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_experiences_user ON candidate_experiences(user_id);
CREATE INDEX IF NOT EXISTS idx_experiences_dates ON candidate_experiences(start_date DESC, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_experiences_visibility ON candidate_experiences(visibility);
CREATE INDEX IF NOT EXISTS idx_experiences_current ON candidate_experiences(is_current) WHERE is_current = TRUE;

-- ============================================================================
-- 2. CANDIDATE EDUCATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Core education data
  institution TEXT NOT NULL,
  degree TEXT NOT NULL, -- e.g., "Bachelor of Science", "Master of Arts"
  field_of_study TEXT, -- e.g., "Computer Science", "Business Administration"
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,

  -- Details
  grade TEXT, -- GPA, honors, etc.
  activities TEXT, -- Clubs, societies, etc.
  description TEXT,

  -- Metadata
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_education_user ON candidate_education(user_id);
CREATE INDEX IF NOT EXISTS idx_education_dates ON candidate_education(start_date DESC, end_date DESC);

-- ============================================================================
-- 3. CANDIDATE SKILLS TABLE (Enhanced from users.skills array)
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Skill data
  skill_name TEXT NOT NULL,
  category TEXT, -- e.g., "Technical", "Soft Skills", "Languages", "Tools"
  proficiency_level TEXT CHECK (proficiency_level IN (
    'beginner', 'intermediate', 'advanced', 'expert'
  )),
  years_of_experience INTEGER,

  -- Endorsements (future)
  endorsement_count INTEGER DEFAULT 0,

  -- Metadata
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  CONSTRAINT unique_user_skill UNIQUE(user_id, skill_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_user ON candidate_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON candidate_skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_proficiency ON candidate_skills(proficiency_level);

-- ============================================================================
-- 4. CANDIDATE CERTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Certification data
  name TEXT NOT NULL,
  issuing_organization TEXT NOT NULL,
  issue_date DATE,
  expiration_date DATE,
  credential_id TEXT,
  credential_url TEXT,

  -- Metadata
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_certifications_user ON candidate_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_certifications_dates ON candidate_certifications(issue_date DESC);

-- ============================================================================
-- 5. REFERENCE ↔ EXPERIENCE LINKING
-- ============================================================================

-- Link references to specific experiences
ALTER TABLE references ADD COLUMN IF NOT EXISTS experience_id UUID REFERENCES candidate_experiences(id) ON DELETE SET NULL;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_references_experience ON references(experience_id);

COMMENT ON COLUMN references.experience_id IS 'Links reference to a specific work experience entry from the candidate CV';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_experiences_updated_at ON candidate_experiences;
CREATE TRIGGER update_experiences_updated_at
  BEFORE UPDATE ON candidate_experiences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_education_updated_at ON candidate_education;
CREATE TRIGGER update_education_updated_at
  BEFORE UPDATE ON candidate_education
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_skills_updated_at ON candidate_skills;
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON candidate_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_certifications_updated_at ON candidate_certifications;
CREATE TRIGGER update_certifications_updated_at
  BEFORE UPDATE ON candidate_certifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE candidate_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_certifications ENABLE ROW LEVEL SECURITY;

-- Users can manage their own profile data
CREATE POLICY "Users can manage own experiences"
  ON candidate_experiences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own education"
  ON candidate_education FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own skills"
  ON candidate_skills FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own certifications"
  ON candidate_certifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public can view public profile data
CREATE POLICY "Public can view public experiences"
  ON candidate_experiences FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Public can view public education"
  ON candidate_education FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Public can view public skills"
  ON candidate_skills FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Public can view public certifications"
  ON candidate_certifications FOR SELECT
  USING (visibility = 'public');

-- ============================================================================
-- 8. CV COMPLETENESS VIEW
-- ============================================================================

-- View to calculate profile completeness percentage
CREATE OR REPLACE VIEW candidate_profile_completeness AS
SELECT
  u.id as user_id,
  u.email,
  u.full_name,
  u.headline,
  -- Check for basic profile fields (40% weight)
  (CASE WHEN u.full_name IS NOT NULL AND u.full_name != '' THEN 10 ELSE 0 END +
   CASE WHEN u.headline IS NOT NULL AND u.headline != '' THEN 10 ELSE 0 END +
   CASE WHEN u.public_handle IS NOT NULL AND u.public_handle != '' THEN 10 ELSE 0 END +
   CASE WHEN u.is_public_profile = TRUE THEN 10 ELSE 0 END) as basic_fields_score,

  -- Experience data (30% weight)
  CASE WHEN EXISTS (SELECT 1 FROM candidate_experiences WHERE user_id = u.id) THEN 30 ELSE 0 END as experience_score,

  -- Skills data (20% weight)
  CASE WHEN EXISTS (SELECT 1 FROM candidate_skills WHERE user_id = u.id) THEN 20 ELSE 0 END as skills_score,

  -- Education data (10% weight)
  CASE WHEN EXISTS (SELECT 1 FROM candidate_education WHERE user_id = u.id) THEN 10 ELSE 0 END as education_score,

  -- Total completeness
  (CASE WHEN u.full_name IS NOT NULL AND u.full_name != '' THEN 10 ELSE 0 END +
   CASE WHEN u.headline IS NOT NULL AND u.headline != '' THEN 10 ELSE 0 END +
   CASE WHEN u.public_handle IS NOT NULL AND u.public_handle != '' THEN 10 ELSE 0 END +
   CASE WHEN u.is_public_profile = TRUE THEN 10 ELSE 0 END +
   CASE WHEN EXISTS (SELECT 1 FROM candidate_experiences WHERE user_id = u.id) THEN 30 ELSE 0 END +
   CASE WHEN EXISTS (SELECT 1 FROM candidate_skills WHERE user_id = u.id) THEN 20 ELSE 0 END +
   CASE WHEN EXISTS (SELECT 1 FROM candidate_education WHERE user_id = u.id) THEN 10 ELSE 0 END
  ) as completeness_percentage
FROM users u;

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE candidate_experiences IS 'Work experience entries for candidate CVs';
COMMENT ON TABLE candidate_education IS 'Education history for candidate profiles';
COMMENT ON TABLE candidate_skills IS 'Structured skills with proficiency levels (replaces simple array in users.skills)';
COMMENT ON TABLE candidate_certifications IS 'Professional certifications and licenses';
COMMENT ON VIEW candidate_profile_completeness IS 'Calculates profile completeness percentage for candidates';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 011 completed successfully';
  RAISE NOTICE 'Added CV & experience schema:';
  RAISE NOTICE '  - candidate_experiences';
  RAISE NOTICE '  - candidate_education';
  RAISE NOTICE '  - candidate_skills';
  RAISE NOTICE '  - candidate_certifications';
  RAISE NOTICE '  - references.experience_id (linking)';
  RAISE NOTICE '  - candidate_profile_completeness view';
  RAISE NOTICE '  - RLS policies for privacy';
END $$;
