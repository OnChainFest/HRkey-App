-- Issue #156 — Create Reference Pack and compute deterministic reference_hash
-- Adds storage column for SHA256(canonical Reference Pack JSON)
-- NOTE: Create/commit this migration file but DO NOT execute it here.

ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS reference_hash text;

CREATE INDEX IF NOT EXISTS idx_references_reference_hash
  ON public.references (reference_hash);
