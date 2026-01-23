export type SDLStatementType = 'ATTRIBUTE' | 'PREFERENCE' | 'EVENT' | 'RELATION' | 'PROOF';

export type FieldDecision =
  | 'REUSE_OK'
  | 'REUSE_NEEDS_UPDATE'
  | 'NEW_REQUIRED'
  | 'PROOF_REQUIRED'
  | 'UNMAPPED';

export type ProofClaim = {
  type: string;
  params: Record<string, unknown>;
  issuer: string;
  issued_at: string;
};

export type SDLStatement = {
  id: string;
  subject: string;
  key: string;
  type: SDLStatementType;
  sensitivity: string;
  value_ref: Record<string, unknown> | null;
  provenance?: Record<string, unknown> | null;
  proof?: ProofClaim | null;
  updated_at?: string;
  valid_to?: string | null;
};

export type SDLFieldProof = {
  type: string;
  min_age?: number;
  params?: Record<string, unknown>;
};

export type SDLField = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  sensitivity?: string;
  statement_type?: SDLStatementType;
  proof?: SDLFieldProof;
};

export type MarketSchema = {
  id: string;
  title: string;
  description?: string;
  grantee: string;
  purpose: string;
  fields: SDLField[];
};

export type FieldMatchResult = {
  field: SDLField;
  decision: FieldDecision;
  statement: SDLStatement | null;
  reason?: string;
};

export type Consent = {
  consent_id: string;
  subject: string;
  grantee: string;
  purpose: string;
  scope: Record<string, unknown>;
  duration_from: string;
  duration_to: string;
  revocable: boolean;
};

export type View = {
  view_id: string;
  subject: string;
  schema_id: string;
  linked_statements: Record<string, string>;
  generated_at: string;
};
