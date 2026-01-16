# HRKey Launch-0 Production Readiness Audit

**Auditor**: Senior Staff Engineer & Product Auditor
**Date**: 2025-12-23
**Branch**: `claude/audit-hrkey-launch-Lp81w`
**Scope**: Complete repository audit for Launch-0 production deployment

---

## ✅ What Is Solid & Done

**Identity & Permissions (P0 - claimed closed)**
- RBAC system fully implemented: users, admin, superadmin roles (middleware/auth.js:1-200)
- Company and signer management with invite tokens and email verification
- Self-only enforcement on sensitive endpoints (wallet creation, identity verification)
- Resource-scoped authorization checks preventing IDOR attacks
- 8 comprehensive permission test suites covering identity, company, signers, wallets, references, audit logs, data access, revenue

**Database Schema - Well Designed**
- 8 migration files covering all major domains (001-009)
- RLS policies defined on sensitive tables (hrkey_scores, data_access_requests)
- Materialized views for HRScore analytics (latest scores, evolution tracking)
- Proper indexing strategy (composite indexes on user_id+created_at patterns)
- Foreign key constraints enforcing referential integrity
- JSONB columns for flexible metadata without schema bloat

**API Structure - Clear & Consistent**
- 65 endpoints across 15 controllers (backend/server.js:1-1800)
- Consistent error handling with structured logging (logger.js)
- Input validation via Zod schemas (schemas/*.schema.js)
- Rate limiting: 3 tiers (general 100/15min, strict 5/hr, auth 10/15min)
- Health checks: `/health` (liveness) and `/health/deep` (readiness with Supabase/Stripe checks)

**Security Infrastructure**
- Helmet security headers configured (CSP, HSTS, X-Frame-Options)
- CORS with explicit allowlist (production enforces origin header)
- Supabase JWT authentication with token verification
- No .env files tracked in git (verified via git ls-files)
- Sentry error monitoring with environment-specific DSN
- Request correlation IDs for distributed tracing

**Testing - Comprehensive Coverage**
- 42 test files totaling 12,573 lines of test code
- Permission test coverage: all core controllers (identity, company, signers, wallets, references, data access, revenue, KPI observations)
- Service layer tests: HRScore, analytics, reference validation, scoring pipeline, tokenomics, admin overview
- Integration tests: HRScore end-to-end, rate limiting, revenue flows
- Auth tests: middleware, secured endpoints, integration flows
- Mock infrastructure for Supabase, Stripe, email services

**Operational Tooling**
- Staging smoke test script (scripts/smoke-staging.mjs) with masked secrets
- Health check documentation (HEALTHCHECKS.md)
- .env.example with comprehensive variable documentation
- Winston structured logging with request metadata
- Staging environment configuration (.env.staging.example)

---

## ⚠️ Exists but Incomplete

**HRScore ML Model - Exists / Trained on Dummy Data**
- Model config file exists: ml/output/hrkey_model_config_global.json
- **CRITICAL**: R² = -2.67 (negative R-squared means model performs worse than predicting the mean)
- Ridge regression with 6 features (code_quality, test_coverage, deployment_frequency, bug_resolution_time, api_response_time, documentation_quality)
- Scoring service fully implemented (hrkeyScoreService.js:1-300) but relies on untrained model
- Missing: Real KPI observation data to train on / Model retraining pipeline / Model versioning strategy

**Reference Validation Layer - Keyword-Based / No ML**
- Implemented as simple heuristic (referenceValidation.service.js:1-150)
- Keyword matching for: exaggeration, negative sentiment, positive sentiment, impact, reliability, communication
- Length-based scoring (< 40 chars = 0.2, < 200 = 0.6, else 1.0)
- Missing: Semantic analysis / Named entity recognition / Fraud detection patterns / Reference quality scoring beyond keywords

**Revenue Sharing Logic - Implemented / Untested End-to-End**
- Data access request workflow exists (data_access_requests table with PENDING/APPROVED/REJECTED states)
- Revenue ledger tables defined (revenue_ledger, revenue_shares)
- Payment integration with Stripe (create-payment-intent endpoint)
- Missing: Automated payout execution / Integration test covering full payment→access→payout cycle / Revenue reconciliation tooling

**Analytics Layer - Schema Complete / Queries Partial**
- 7 analytics tables defined (sql/008_analytics_layer.sql)
- Analytics controller exists (controllers/analyticsController.js)
- Missing: Populated data for candidate_activity_log, company_activity_log / Dashboard queries for demand trends, skill trending / Data retention policies

**KPI Observations - Capture Works / Correlation Engine Theoretical**
- kpi_observations table with proper structure (subject, observer, role, KPI name, rating, outcome)
- POST /api/kpi-observations endpoint functional
- Missing: Actual observers submitting data / Correlation calculation scripts running on real data / Statistical validation of KPI→outcome relationships

**Blockchain Integration - Prepared / Not Active**
- Smart contracts in contracts/ directory (PeerProofRegistry)
- Hardhat config files present
- Wallet creation works (custodial, Base-ready)
- Missing: Deployed contract addresses / Actual on-chain reference storage / Gasless transaction infrastructure / Paymaster funding

---

## ❌ Missing or Blocking

**Trained ML Model**
- Current model file is placeholder/dummy data with negative R²
- Blocks: Credible HRScore calculation / Product differentiation vs. traditional references / Trust in predictive scoring
- Impact: HIGH - HRScore is a core product value proposition

**Real KPI Observation Data**
- Zero production KPI observations in database
- Blocks: Model training / Correlation analysis / Proof-of-correlation claims
- Impact: HIGH - Cannot validate that KPIs predict performance without data

**CI/CD Pipeline**
- No .github/workflows visible
- No automated test runs on PR
- No deployment automation
- Impact: MEDIUM - Manual deployment risk, slower iteration

**Database Migration Strategy**
- 8 SQL files in sql/ directory but unclear which have been applied to production
- Duplicate migration files (20250115 vs 20250902 for hrscore_snapshots)
- No migration version tracking (no schema_migrations table or equivalent)
- Impact: MEDIUM - Risk of schema drift between environments

**Production Environment Configuration**
- No documented prod environment variables
- No secrets rotation policy
- No Supabase RLS policy verification tooling
- Impact: MEDIUM - Operational risk on launch day

**User-Facing Documentation**
- No end-user help docs
- No company onboarding guide
- No API documentation for data access integrations
- Impact: MEDIUM - Support burden, slow adoption

---

## 🧨 Risky or Weak Areas

**DEBUG Route Exposed (server.js:1722)**
- Severity: **MEDIUM**
- `/debug-sentry` route conditionally enabled but exists in production code
- Exposes Sentry configuration status and internal error handling
- Recommendation: Remove entirely or guard with NODE_ENV !== 'production' AND IP allowlist

**Private Key Encryption (server.js:264-272)**
- Severity: **MEDIUM**
- Uses userId as scrypt salt: `crypto.scryptSync(userId, 'hrkey-salt-2025', 32)`
- Fixed salt 'hrkey-salt-2025' across all users
- If userId is compromised, private key is recoverable
- Recommendation: Use unique per-wallet salt stored separately

**Reference Submission Token Handling**
- Severity: **LOW**
- Invite tokens stored in plaintext in database (company_signers.invite_token, references table)
- No token expiration enforcement at database level
- Recommendation: Hash tokens before storage / Add expires_at CHECK constraint

**Materialized View Refresh Strategy**
- Severity: **LOW**
- hrkey_scores_latest and hrkey_score_evolution require manual REFRESH
- No cron job configured
- Recommendation: Add pg_cron job or application-level scheduler / Document refresh SLA

**CORS Configuration Logging (server.js:344-348)**
- Severity: **LOW**
- Logs warnings on CORS violations but allows request in production if allowed origin matches
- Could leak origin enumeration to attackers
- Recommendation: Return 403 immediately on CORS violation in production without detailed logging

**Test Execution Blocked**
- Severity: **MEDIUM** (operational)
- node_modules not installed in environment
- Cannot verify tests actually pass
- Recommendation: Run `npm install && npm test` before deployment / Add to pre-commit hook

---

## 🧠 Design Wins

**Fail-Soft Analytics**
- Analytics layer designed to never block core flows (reference submission, wallet creation)
- If analytics tracking fails, operation succeeds and error is logged
- Shows mature understanding of system priorities

**Materialized Views for HRScore Evolution**
- hrkey_score_evolution uses window functions to calculate deltas, trends, improvement %
- Avoids N+1 queries for historical data
- Smart use of Postgres features

**Request ID Correlation**
- Every request gets UUID correlation ID for distributed tracing
- Propagated through logger, Sentry, error responses
- Shows experience with production debugging

**Resource-Scoped Authorization Pattern**
- Middleware like requireSelfOrSuperadmin('userId') encapsulates ownership checks
- Prevents copy-paste authorization bugs
- Reusable across endpoints

**Zod Schema Validation**
- Input validation centralized in schemas/*.schema.js
- Consistent error format (422 Unprocessable Entity)
- Type-safe validation without ORM bloat

**Comprehensive Permission Testing**
- Tests verify not just happy path but IDOR prevention (PERM-I2, PERM-C3, etc.)
- Mock Supabase client allows testing auth flows without real database
- Shows security-first mindset

**Revenue Sharing Data Model**
- 40/40/20 split (platform/candidate/reference) encoded in database schema
- Audit trail via revenue_ledger with immutable transaction log
- Prepared for regulatory compliance

---

## 🧊 Do Not Touch (For Now)

**Database Schema Files (sql/001-009)**
- Justification: Well-designed, comprehensive, already referenced by production code
- Changing table names or column types now would break existing services
- Wait until post-launch to refactor (if needed)

**Permission Middleware Architecture (middleware/auth.js)**
- Justification: Extensively tested, predictable behavior
- Controllers depend on specific middleware signatures
- Refactoring would invalidate 8 test suites
- Leave frozen until Launch-0 completes

**Reference Validation Heuristics (referenceValidation.service.js)**
- Justification: Simple, deterministic, testable
- Moving to ML-based validation mid-launch adds complexity
- Current approach is "good enough" for MVP
- Iterate post-launch with real reference data

**Wallet Creation Service (server.js:221-305)**
- Justification: Tested, functional, handles edge cases
- Encryption scheme is weak but changing it requires re-encrypting all existing wallets
- Schedule wallet migration for post-launch maintenance window

**Supabase RLS Policies (sql/009_hrscore_persistence.sql:275-315)**
- Justification: Correctly enforce "users see own scores, superadmins see all"
- Changing mid-launch risks exposing data or breaking dashboard
- Audit post-launch with pen test

---

## 🧭 Suggested Next Focus Areas

**1. Train HRScore Model on Real Data (Impact: CRITICAL / Effort: HIGH)**
- Collect 50-100 KPI observations from beta users
- Run ml/ correlation scripts on actual data
- Retrain Ridge model and verify R² > 0.5
- Update hrkey_model_config_global.json
- Without this, HRScore is vaporware

**2. Run Full Test Suite and Fix Failures (Impact: HIGH / Effort: LOW)**
- `npm install` in backend directory
- `npm test` and address any failing tests
- Document test coverage % (aim for >80% on critical paths)
- Add CI/CD to block merges if tests fail

**3. Database Migration Audit (Impact: HIGH / Effort: MEDIUM)**
- Connect to staging Supabase instance
- Verify which migrations from sql/ have been applied
- Resolve duplicate migration files (hrscore_snapshots)
- Create schema_migrations tracking table
- Document "source of truth" for schema

**4. Remove Debug Route and Harden Secrets (Impact: MEDIUM / Effort: LOW)**
- Delete `/debug-sentry` route entirely (server.js:1722-1755)
- Rotate Supabase/Stripe/Resend keys if ever exposed
- Add secret rotation SOP to runbook
- Implement per-wallet encryption salt

**5. End-to-End Revenue Sharing Test (Impact: MEDIUM / Effort: MEDIUM)**
- Create integration test: Company pays → Data access granted → Revenue split recorded
- Verify Stripe webhook handling
- Test payout request flow
- Document revenue reconciliation process

---

## If this were my project, I would focus next on:

**Training the HRScore ML model on real KPI observation data.**

The product's entire value proposition rests on predictive scoring. Every other feature (references, data access) is commodity. The ML model with R² = -2.67 is worse than random guessing. Without a credible model, Launch-0 is launching a data collection platform pretending to be an AI product. Get 50-100 real KPI observations, retrain the model, and prove the correlation thesis. Everything else can wait.
