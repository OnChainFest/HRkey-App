// ============================================================================
// Access Decision Reason Taxonomy
// ============================================================================
// Standardized reason codes for capability-token access resolver observability.
// Keep these aligned with EPIC #227 resolver decision outputs.
// ============================================================================

export const AccessDecisionReasons = Object.freeze({
  ALLOW: 'ALLOW',
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_CONSUMED: 'TOKEN_CONSUMED',
  SIGNER_NOT_ACTIVE: 'SIGNER_NOT_ACTIVE',
  COMPANY_MISMATCH: 'COMPANY_MISMATCH',
  CONSENT_NOT_ACTIVE: 'CONSENT_NOT_ACTIVE',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  REQUEST_NOT_APPROVED: 'REQUEST_NOT_APPROVED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

export default AccessDecisionReasons;