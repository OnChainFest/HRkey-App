# OPEN vs CLOSED Boundaries

This repository contains both protocol-safe components (OPEN) and proprietary intelligence (CLOSED).

> **Note:** OPEN protocol components have been exported to the dedicated public repository:
> **[hrkey-protocol](https://github.com/OnChainFest/hrkey-protocol)**
>
> The protocol repo contains: smart contracts, SDL primitives, deploy scripts, and integration docs.

## OPEN (safe for public contribution)
- Protocol rails, interfaces, and integration scaffolding
- Consent & permission gates, schema definitions, verifiers, wallet adapters
- Smart contract interfaces/templates

## CLOSED (restricted, approval required)
- HRScore/scoring logic (formulas, weights, heuristics)
- Pricing & monetization logic
- Fraud/anti-gaming detection logic and thresholds
- ML training data, model weights, feature engineering
- Correlation algorithms and private analytics

## REVIEW (security-sensitive rails)
Payments, privileged service clients, webhooks, and other security-critical integrations.
Treat as maintainer-only unless explicitly approved.

## Crown-Jewel Paths (do not open without explicit approval)
- ml/
- analytics/proof_of_correlation/
- backend/services/hrscore/
- backend/services/scoringPipeline.service.js
- backend/pricing/
- sql/003_correlation_engine_schema.sql
- sql/009_hrscore_persistence.sql
- sql/010_pricing_and_staking_cache.sql

Contributor guidance:
- OPEN paths: PRs welcome with normal review.
- CLOSED/REVIEW paths: PRs require explicit maintainer approval.
