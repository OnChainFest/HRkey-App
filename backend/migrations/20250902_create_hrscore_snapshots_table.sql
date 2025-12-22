CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS hrscore_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  score numeric NOT NULL,
  breakdown jsonb NULL,
  trigger_source text NOT NULL,
  created_at timestamptz DEFAULT now()
);
