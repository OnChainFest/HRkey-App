-- Migration: 020_referee_identity_resolution.sql
-- Purpose: Add canonical referee identities and link references to deterministic referee entities.

CREATE TABLE IF NOT EXISTS referee_identities (
  id TEXT PRIMARY KEY,
  resolution_strategy TEXT NOT NULL CHECK (resolution_strategy IN ('email', 'signer', 'fallback')),
  canonical_key_hash TEXT NOT NULL UNIQUE,
  normalized_email TEXT,
  normalized_name TEXT,
  normalized_company TEXT,
  normalized_role TEXT,
  signer_id UUID REFERENCES company_signers(id) ON DELETE SET NULL,
  signer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referee_identities_strategy
  ON referee_identities(resolution_strategy);

CREATE INDEX IF NOT EXISTS idx_referee_identities_signer_id
  ON referee_identities(signer_id)
  WHERE signer_id IS NOT NULL;

ALTER TABLE references
  ADD COLUMN IF NOT EXISTS referee_id TEXT REFERENCES referee_identities(id) ON DELETE SET NULL;

ALTER TABLE references
  ADD COLUMN IF NOT EXISTS referee_resolution_strategy TEXT;

ALTER TABLE references
  ADD COLUMN IF NOT EXISTS referee_resolution_confidence TEXT;

ALTER TABLE references
  ADD COLUMN IF NOT EXISTS referee_resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_references_referee_id
  ON references(referee_id)
  WHERE referee_id IS NOT NULL;
