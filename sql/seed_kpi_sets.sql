-- =====================================================
-- KPI SETS SEED DATA
-- =====================================================
-- Purpose: Seed initial KPI sets for common roles
-- Run this after running 010_kpi_references_p0.sql
--
-- Date: 2026-01-12
-- =====================================================

-- =====================================================
-- BACKEND ENGINEER KPI SETS
-- =====================================================

-- Backend Engineer - Senior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'backend_engineer',
  'senior',
  1,
  true,
  'KPI set for Senior Backend Engineers with focus on system design, code quality, and technical leadership',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS backend_senior_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'backend_senior_kpi_set_id', 'code_quality', 'Code Quality', 'Ability to write clean, maintainable, and well-documented code. Follows best practices and coding standards.', 'technical', true, 1.2000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'system_design', 'System Design', 'Capability to design scalable, reliable, and efficient systems. Makes sound architectural decisions.', 'technical', true, 1.5000, 250, NOW()),
  (:'backend_senior_kpi_set_id', 'problem_solving', 'Problem Solving', 'Approaches complex technical challenges methodically. Debugs issues efficiently and proposes effective solutions.', 'technical', true, 1.3000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'api_design', 'API Design', 'Designs clean, intuitive, and well-documented APIs. Considers versioning, backwards compatibility, and developer experience.', 'technical', true, 1.1000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'testing', 'Testing & Quality Assurance', 'Writes comprehensive tests (unit, integration, e2e). Maintains high code coverage and quality standards.', 'technical', true, 1.0000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'performance', 'Performance Optimization', 'Identifies and resolves performance bottlenecks. Optimizes database queries, caching, and system throughput.', 'technical', true, 1.1000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'collaboration', 'Collaboration', 'Works effectively with team members, product managers, and stakeholders. Communicates technical concepts clearly.', 'collaboration', true, 1.0000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'mentorship', 'Mentorship & Leadership', 'Mentors junior engineers, conducts code reviews, and shares knowledge. Provides constructive feedback.', 'leadership', true, 1.2000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'ownership', 'Ownership & Accountability', 'Takes ownership of projects from conception to deployment. Follows through on commitments and delivers on time.', 'leadership', true, 1.0000, 200, NOW()),
  (:'backend_senior_kpi_set_id', 'documentation', 'Documentation', 'Creates clear technical documentation, architectural diagrams, and runbooks. Ensures knowledge is transferable.', 'technical', false, 0.8000, 150, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- Backend Engineer - Mid-Level
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'backend_engineer',
  'mid',
  1,
  true,
  'KPI set for Mid-level Backend Engineers with focus on execution and growing technical expertise',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS backend_mid_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'backend_mid_kpi_set_id', 'code_quality', 'Code Quality', 'Writes clean, maintainable code with improving consistency. Follows team standards and best practices.', 'technical', true, 1.1000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'feature_delivery', 'Feature Delivery', 'Delivers features independently with minimal supervision. Estimates work accurately and meets deadlines.', 'technical', true, 1.3000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'problem_solving', 'Problem Solving', 'Debugs and resolves technical issues with growing independence. Asks good questions when blocked.', 'technical', true, 1.2000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'api_development', 'API Development', 'Implements RESTful or GraphQL APIs following established patterns. Handles errors appropriately.', 'technical', true, 1.0000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'testing', 'Testing', 'Writes unit and integration tests for new features. Understands testing best practices.', 'technical', true, 1.0000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'database_skills', 'Database Skills', 'Writes efficient SQL queries and understands database design. Handles migrations and schema changes.', 'technical', true, 1.0000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'collaboration', 'Collaboration', 'Communicates effectively with team members. Participates in code reviews and team discussions.', 'collaboration', true, 1.0000, 200, NOW()),
  (:'backend_mid_kpi_set_id', 'learning', 'Learning & Growth', 'Demonstrates continuous learning and adapts to new technologies. Seeks feedback and applies it.', 'collaboration', true, 1.0000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- Backend Engineer - Junior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'backend_engineer',
  'junior',
  1,
  true,
  'KPI set for Junior Backend Engineers with focus on fundamentals and growth',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS backend_junior_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'backend_junior_kpi_set_id', 'code_fundamentals', 'Code Fundamentals', 'Writes functional code with clear logic. Understands basic programming concepts and patterns.', 'technical', true, 1.2000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'task_completion', 'Task Completion', 'Completes assigned tasks with guidance. Follows instructions and meets expectations for junior-level work.', 'technical', true, 1.3000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'debugging', 'Debugging', 'Can identify and fix simple bugs. Uses debugging tools and asks for help when needed.', 'technical', true, 1.1000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'learning_ability', 'Learning Ability', 'Quickly learns new concepts, tools, and frameworks. Shows curiosity and initiative in learning.', 'collaboration', true, 1.2000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'collaboration', 'Collaboration', 'Works well with mentors and team members. Asks good questions and seeks clarification when needed.', 'collaboration', true, 1.0000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'code_reviews', 'Code Review Participation', 'Participates in code reviews by asking questions and learning from feedback.', 'collaboration', true, 1.0000, 200, NOW()),
  (:'backend_junior_kpi_set_id', 'reliability', 'Reliability', 'Shows up on time, meets commitments, and communicates proactively about blockers.', 'collaboration', true, 1.0000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- =====================================================
-- PRODUCT MANAGER KPI SETS
-- =====================================================

-- Product Manager - Senior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'product_manager',
  'senior',
  1,
  true,
  'KPI set for Senior Product Managers with focus on strategy, execution, and leadership',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS pm_senior_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'pm_senior_kpi_set_id', 'strategic_thinking', 'Strategic Thinking', 'Defines product vision and strategy aligned with business goals. Makes data-driven decisions.', 'leadership', true, 1.5000, 250, NOW()),
  (:'pm_senior_kpi_set_id', 'stakeholder_management', 'Stakeholder Management', 'Manages relationships with executives, customers, and cross-functional teams effectively.', 'collaboration', true, 1.3000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'prioritization', 'Prioritization', 'Prioritizes features and initiatives based on impact, effort, and strategic alignment.', 'technical', true, 1.2000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'user_research', 'User Research & Insights', 'Conducts user research, synthesizes insights, and translates them into product requirements.', 'technical', true, 1.1000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'execution', 'Execution & Delivery', 'Drives product development from concept to launch. Ensures teams deliver high-quality products on time.', 'technical', true, 1.3000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'metrics', 'Metrics & Analytics', 'Defines success metrics, tracks KPIs, and uses data to inform product decisions.', 'technical', true, 1.1000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'communication', 'Communication', 'Communicates product vision, roadmap, and updates clearly to diverse audiences.', 'collaboration', true, 1.2000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'technical_acumen', 'Technical Acumen', 'Understands technical constraints and works effectively with engineering teams.', 'technical', true, 1.0000, 200, NOW()),
  (:'pm_senior_kpi_set_id', 'leadership', 'Leadership & Influence', 'Leads cross-functional teams without direct authority. Inspires and motivates others.', 'leadership', true, 1.2000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- =====================================================
-- FRONTEND ENGINEER KPI SETS
-- =====================================================

-- Frontend Engineer - Senior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'frontend_engineer',
  'senior',
  1,
  true,
  'KPI set for Senior Frontend Engineers with focus on UI/UX, performance, and architecture',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS frontend_senior_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'frontend_senior_kpi_set_id', 'ui_implementation', 'UI Implementation', 'Builds pixel-perfect, responsive UIs that match designs. Creates reusable components.', 'technical', true, 1.2000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'ux_excellence', 'UX Excellence', 'Delivers exceptional user experiences with attention to detail, accessibility, and usability.', 'technical', true, 1.3000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'performance', 'Performance Optimization', 'Optimizes bundle size, load times, and runtime performance. Uses profiling tools effectively.', 'technical', true, 1.2000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'architecture', 'Frontend Architecture', 'Designs scalable frontend architectures. Makes sound decisions about state management and data flow.', 'technical', true, 1.4000, 250, NOW()),
  (:'frontend_senior_kpi_set_id', 'code_quality', 'Code Quality', 'Writes clean, maintainable, and well-tested frontend code. Follows best practices.', 'technical', true, 1.1000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'collaboration', 'Cross-functional Collaboration', 'Works effectively with designers, backend engineers, and product managers.', 'collaboration', true, 1.0000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'mentorship', 'Mentorship', 'Mentors junior engineers and conducts thorough code reviews.', 'leadership', true, 1.1000, 200, NOW()),
  (:'frontend_senior_kpi_set_id', 'accessibility', 'Accessibility', 'Implements accessible interfaces following WCAG guidelines. Considers diverse user needs.', 'technical', true, 1.0000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- =====================================================
-- DATA SCIENTIST KPI SETS
-- =====================================================

-- Data Scientist - Senior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'data_scientist',
  'senior',
  1,
  true,
  'KPI set for Senior Data Scientists with focus on modeling, insights, and business impact',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS ds_senior_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'ds_senior_kpi_set_id', 'modeling', 'Statistical Modeling & ML', 'Builds accurate, robust models using appropriate techniques. Validates and tunes models effectively.', 'technical', true, 1.5000, 250, NOW()),
  (:'ds_senior_kpi_set_id', 'data_analysis', 'Data Analysis', 'Analyzes complex datasets to extract meaningful insights. Uses statistical methods appropriately.', 'technical', true, 1.3000, 200, NOW()),
  (:'ds_senior_kpi_set_id', 'business_impact', 'Business Impact', 'Translates data insights into actionable business recommendations that drive measurable results.', 'leadership', true, 1.4000, 250, NOW()),
  (:'ds_senior_kpi_set_id', 'experimentation', 'Experimentation & A/B Testing', 'Designs and analyzes experiments rigorously. Draws valid conclusions from test results.', 'technical', true, 1.2000, 200, NOW()),
  (:'ds_senior_kpi_set_id', 'communication', 'Communication', 'Explains complex analyses and models clearly to non-technical stakeholders.', 'collaboration', true, 1.2000, 200, NOW()),
  (:'ds_senior_kpi_set_id', 'data_engineering', 'Data Engineering', 'Builds scalable data pipelines and maintains production ML systems.', 'technical', true, 1.1000, 200, NOW()),
  (:'ds_senior_kpi_set_id', 'visualization', 'Data Visualization', 'Creates clear, compelling visualizations that communicate insights effectively.', 'technical', true, 1.0000, 200, NOW()),
  (:'ds_senior_kpi_set_id', 'collaboration', 'Collaboration', 'Works effectively with engineers, product managers, and business stakeholders.', 'collaboration', true, 1.0000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- =====================================================
-- ENGINEERING MANAGER KPI SETS
-- =====================================================

-- Engineering Manager - Senior
INSERT INTO kpi_sets (role, seniority_level, version, active, description, created_at)
VALUES (
  'engineering_manager',
  'lead',
  1,
  true,
  'KPI set for Engineering Managers with focus on team leadership, delivery, and culture',
  NOW()
) ON CONFLICT (role, seniority_level, version) DO NOTHING
RETURNING id AS em_lead_kpi_set_id \gset

INSERT INTO kpis (kpi_set_id, key, name, description, category, required, weight, min_evidence_length, created_at)
VALUES
  (:'em_lead_kpi_set_id', 'team_leadership', 'Team Leadership', 'Leads, motivates, and develops high-performing engineering teams. Creates positive team culture.', 'leadership', true, 1.5000, 250, NOW()),
  (:'em_lead_kpi_set_id', 'people_development', 'People Development', 'Mentors engineers, provides regular feedback, and helps team members grow their careers.', 'leadership', true, 1.4000, 250, NOW()),
  (:'em_lead_kpi_set_id', 'delivery', 'Delivery & Execution', 'Ensures team consistently delivers high-quality work on time. Manages scope and priorities effectively.', 'technical', true, 1.3000, 200, NOW()),
  (:'em_lead_kpi_set_id', 'technical_excellence', 'Technical Excellence', 'Maintains high technical standards. Makes sound architectural and technical decisions.', 'technical', true, 1.2000, 200, NOW()),
  (:'em_lead_kpi_set_id', 'stakeholder_management', 'Stakeholder Management', 'Manages expectations and communicates effectively with product, executives, and other teams.', 'collaboration', true, 1.2000, 200, NOW()),
  (:'em_lead_kpi_set_id', 'process_improvement', 'Process Improvement', 'Identifies and implements process improvements. Optimizes team workflows and efficiency.', 'leadership', true, 1.1000, 200, NOW()),
  (:'em_lead_kpi_set_id', 'hiring', 'Hiring & Recruitment', 'Builds strong teams through effective hiring. Attracts and retains top talent.', 'leadership', true, 1.1000, 200, NOW()),
  (:'em_lead_kpi_set_id', 'strategic_thinking', 'Strategic Thinking', 'Contributes to technical strategy and long-term planning. Aligns team goals with business objectives.', 'leadership', true, 1.2000, 200, NOW())
ON CONFLICT (kpi_set_id, key) DO NOTHING;


-- =====================================================
-- SUMMARY
-- =====================================================
-- Total roles seeded: 7
-- - backend_engineer (junior, mid, senior)
-- - product_manager (senior)
-- - frontend_engineer (senior)
-- - data_scientist (senior)
-- - engineering_manager (lead)
--
-- To verify:
-- SELECT role, seniority_level, version, active FROM kpi_sets ORDER BY role, seniority_level;
-- SELECT ks.role, ks.seniority_level, COUNT(k.id) as kpi_count
-- FROM kpi_sets ks
-- LEFT JOIN kpis k ON k.kpi_set_id = ks.id
-- GROUP BY ks.role, ks.seniority_level
-- ORDER BY ks.role, ks.seniority_level;
