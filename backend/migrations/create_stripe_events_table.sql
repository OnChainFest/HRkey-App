-- Migration: Create stripe_events table for webhook idempotency
-- Purpose: Track processed Stripe webhook events to prevent duplicate processing
-- Date: 2025-12-08

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for fast event lookup during idempotency checks
CREATE INDEX IF NOT EXISTS idx_stripe_events_stripe_event_id
ON stripe_events(stripe_event_id);

-- Index for querying by event type
CREATE INDEX IF NOT EXISTS idx_stripe_events_event_type
ON stripe_events(event_type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
ON stripe_events(processed_at DESC);

-- Add comment
COMMENT ON TABLE stripe_events IS 'Tracks processed Stripe webhook events for idempotency protection';
COMMENT ON COLUMN stripe_events.stripe_event_id IS 'Unique Stripe event ID from webhook (e.g., evt_xxx)';
COMMENT ON COLUMN stripe_events.event_type IS 'Stripe event type (e.g., payment_intent.succeeded)';
COMMENT ON COLUMN stripe_events.metadata IS 'Additional event data (payment_intent_id, amount, email, etc.)';
COMMENT ON COLUMN stripe_events.processed_at IS 'When the event was successfully processed';
