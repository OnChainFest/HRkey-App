-- ============================================================================
-- HRKey Analytics Layer - Database Schema
-- ============================================================================
-- Description: Analytics and behavioral tracking system for product insights
-- Author: HRKey Development Team
-- Date: 2025-12-10
-- Purpose: Track user behavior, conversion funnels, and platform metrics
-- ============================================================================

-- ============================================================================
-- 1. ANALYTICS EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor and context
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- User performing action (nullable for system events)
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL, -- Related company (nullable)

  -- Event classification
  event_type TEXT NOT NULL, -- 'DATA_ACCESS_REQUEST', 'PROFILE_VIEW', 'SEARCH', etc.
  event_category TEXT, -- 'engagement', 'conversion', 'search', 'revenue', 'content', 'admin'

  -- Event data
  context JSONB, -- Event-specific data (flexible schema)
  source TEXT DEFAULT 'backend' CHECK (source IN ('frontend', 'backend', 'api', 'webhook')),

  -- Session tracking
  session_id TEXT, -- Optional session identifier

  -- Request metadata
  metadata JSONB, -- IP address, user agent, referrer, etc.

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Core indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_category ON analytics_events(event_category);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_company_id ON analytics_events(company_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category_created ON analytics_events(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_company_created ON analytics_events(company_id, created_at DESC);

-- GIN index for JSONB context querying
CREATE INDEX IF NOT EXISTS idx_analytics_events_context_gin ON analytics_events USING GIN (context);

-- Partial index for recent events (last 90 days)
CREATE INDEX IF NOT EXISTS idx_analytics_events_recent ON analytics_events(created_at DESC)
  WHERE created_at > (NOW() - INTERVAL '90 days');

-- ============================================================================
-- 3. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE analytics_events IS 'Behavioral analytics and product metrics tracking';
COMMENT ON COLUMN analytics_events.event_type IS 'Specific event identifier (e.g., DATA_ACCESS_REQUEST, PROFILE_VIEW)';
COMMENT ON COLUMN analytics_events.event_category IS 'High-level category: engagement, conversion, search, revenue, content, admin';
COMMENT ON COLUMN analytics_events.context IS 'Event-specific data in flexible JSONB format';
COMMENT ON COLUMN analytics_events.source IS 'Origin of the event: frontend, backend, api, webhook';
COMMENT ON COLUMN analytics_events.session_id IS 'Optional session identifier for user journey tracking';
COMMENT ON COLUMN analytics_events.metadata IS 'Request metadata: IP, user agent, referrer, etc.';

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Superadmins can read all analytics events
CREATE POLICY "Superadmins can view all analytics events"
  ON analytics_events FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin')
  );

-- Users can view their own events (optional - enable if needed)
CREATE POLICY "Users can view their own analytics events"
  ON analytics_events FOR SELECT
  USING (user_id = auth.uid());

-- Service role (backend) can insert analytics events
CREATE POLICY "System can insert analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE allowed (append-only table for data integrity)
-- Analytics events are immutable

-- ============================================================================
-- 5. HELPER VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Daily event counts by type
CREATE OR REPLACE VIEW analytics_daily_event_counts AS
SELECT
  DATE(created_at) as event_date,
  event_type,
  event_category,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT company_id) as unique_companies
FROM analytics_events
WHERE created_at > (NOW() - INTERVAL '90 days')
GROUP BY DATE(created_at), event_type, event_category
ORDER BY event_date DESC, event_count DESC;

-- View: Top events in last 7 days
CREATE OR REPLACE VIEW analytics_top_events_7d AS
SELECT
  event_type,
  event_category,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT company_id) as unique_companies,
  MIN(created_at) as first_occurrence,
  MAX(created_at) as last_occurrence
FROM analytics_events
WHERE created_at > (NOW() - INTERVAL '7 days')
GROUP BY event_type, event_category
ORDER BY event_count DESC
LIMIT 50;

-- View: User activity summary (last 30 days)
CREATE OR REPLACE VIEW analytics_user_activity_30d AS
SELECT
  u.id as user_id,
  u.email,
  u.role,
  COUNT(ae.id) as total_events,
  COUNT(DISTINCT ae.event_type) as unique_event_types,
  MIN(ae.created_at) as first_activity,
  MAX(ae.created_at) as last_activity,
  COUNT(ae.id) FILTER (WHERE ae.event_category = 'conversion') as conversion_events,
  COUNT(ae.id) FILTER (WHERE ae.event_category = 'engagement') as engagement_events
FROM users u
LEFT JOIN analytics_events ae ON u.id = ae.user_id
  AND ae.created_at > (NOW() - INTERVAL '30 days')
GROUP BY u.id, u.email, u.role
HAVING COUNT(ae.id) > 0
ORDER BY total_events DESC;

-- View: Company activity summary (last 30 days)
CREATE OR REPLACE VIEW analytics_company_activity_30d AS
SELECT
  c.id as company_id,
  c.name as company_name,
  c.verified,
  COUNT(ae.id) as total_events,
  COUNT(DISTINCT ae.user_id) as unique_users,
  COUNT(DISTINCT ae.event_type) as unique_event_types,
  MIN(ae.created_at) as first_activity,
  MAX(ae.created_at) as last_activity,
  COUNT(ae.id) FILTER (WHERE ae.event_type = 'DATA_ACCESS_REQUEST') as data_requests,
  COUNT(ae.id) FILTER (WHERE ae.event_type = 'PROFILE_VIEW') as profile_views
FROM companies c
LEFT JOIN analytics_events ae ON c.id = ae.company_id
  AND ae.created_at > (NOW() - INTERVAL '30 days')
GROUP BY c.id, c.name, c.verified
HAVING COUNT(ae.id) > 0
ORDER BY total_events DESC;

-- View: Conversion funnel metrics (last 30 days)
CREATE OR REPLACE VIEW analytics_conversion_funnel_30d AS
SELECT
  'Total Users' as stage,
  1 as stage_order,
  COUNT(DISTINCT id) as user_count,
  COUNT(DISTINCT id) as unique_count
FROM users
WHERE created_at > (NOW() - INTERVAL '30 days')

UNION ALL

SELECT
  'Active Users (any event)' as stage,
  2 as stage_order,
  COUNT(DISTINCT user_id) as user_count,
  COUNT(DISTINCT user_id) as unique_count
FROM analytics_events
WHERE created_at > (NOW() - INTERVAL '30 days')
  AND user_id IS NOT NULL

UNION ALL

SELECT
  'Companies Created' as stage,
  3 as stage_order,
  COUNT(DISTINCT user_id) as user_count,
  COUNT(DISTINCT company_id) as unique_count
FROM analytics_events
WHERE event_type = 'COMPANY_CREATED'
  AND created_at > (NOW() - INTERVAL '30 days')

UNION ALL

SELECT
  'Data Access Requests' as stage,
  4 as stage_order,
  COUNT(DISTINCT user_id) as user_count,
  COUNT(DISTINCT id) as unique_count
FROM analytics_events
WHERE event_type = 'DATA_ACCESS_REQUEST'
  AND created_at > (NOW() - INTERVAL '30 days')

UNION ALL

SELECT
  'Conversions (approvals)' as stage,
  5 as stage_order,
  COUNT(DISTINCT user_id) as user_count,
  COUNT(DISTINCT id) as unique_count
FROM analytics_events
WHERE event_type = 'DATA_ACCESS_APPROVED'
  AND created_at > (NOW() - INTERVAL '30 days')

ORDER BY stage_order;

-- View: Skill demand trends (from search context)
CREATE OR REPLACE VIEW analytics_skill_demand_trends AS
SELECT
  (context->>'skill')::TEXT as skill_name,
  COUNT(*) as search_count,
  COUNT(DISTINCT user_id) as unique_searchers,
  COUNT(DISTINCT company_id) as unique_companies,
  MIN(created_at) as first_searched,
  MAX(created_at) as last_searched,
  DATE_TRUNC('day', MAX(created_at)) as last_search_date
FROM analytics_events
WHERE event_type = 'CANDIDATE_SEARCH'
  AND context ? 'skill'
  AND created_at > (NOW() - INTERVAL '90 days')
GROUP BY (context->>'skill')::TEXT
HAVING COUNT(*) > 0
ORDER BY search_count DESC;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get event counts for a date range
CREATE OR REPLACE FUNCTION get_event_counts(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  filter_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  event_type TEXT,
  event_category TEXT,
  event_count BIGINT,
  unique_users BIGINT,
  unique_companies BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.event_type,
    ae.event_category,
    COUNT(*)::BIGINT as event_count,
    COUNT(DISTINCT ae.user_id)::BIGINT as unique_users,
    COUNT(DISTINCT ae.company_id)::BIGINT as unique_companies
  FROM analytics_events ae
  WHERE ae.created_at >= start_date
    AND ae.created_at <= end_date
    AND (filter_event_type IS NULL OR ae.event_type = filter_event_type)
  GROUP BY ae.event_type, ae.event_category
  ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get hourly event distribution (for detecting patterns)
CREATE OR REPLACE FUNCTION get_hourly_event_distribution(
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  hour_of_day INTEGER,
  event_count BIGINT,
  avg_events_per_day NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM created_at)::INTEGER as hour_of_day,
    COUNT(*)::BIGINT as event_count,
    (COUNT(*)::NUMERIC / days_back) as avg_events_per_day
  FROM analytics_events
  WHERE created_at > (NOW() - (days_back || ' days')::INTERVAL)
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY hour_of_day;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. DATA RETENTION POLICY (Optional - for future implementation)
-- ============================================================================

-- TODO: Add automated data retention/archiving policy
-- Consider partitioning table by month for better performance with large datasets

COMMENT ON TABLE analytics_events IS
'Analytics events table. Retention: 2 years. Consider archiving older data to separate table.';

-- ============================================================================
-- 8. MIGRATION VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Analytics Layer migration completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - analytics_events (with 11 indexes)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - analytics_daily_event_counts';
  RAISE NOTICE '  - analytics_top_events_7d';
  RAISE NOTICE '  - analytics_user_activity_30d';
  RAISE NOTICE '  - analytics_company_activity_30d';
  RAISE NOTICE '  - analytics_conversion_funnel_30d';
  RAISE NOTICE '  - analytics_skill_demand_trends';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - get_event_counts(start_date, end_date, [event_type])';
  RAISE NOTICE '  - get_hourly_event_distribution([days_back])';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies enabled:';
  RAISE NOTICE '  - Superadmins: full read access';
  RAISE NOTICE '  - Users: read own events';
  RAISE NOTICE '  - System: insert only';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for analytics event tracking!';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
