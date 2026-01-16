-- Add USDC pricing cache and staking tier cache
-- Note: price_hrk remains a legacy column if present; all reads should use price_usdc.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'candidate_prices'
  ) THEN
    ALTER TABLE candidate_prices
      ADD COLUMN IF NOT EXISTS price_usdc NUMERIC(18, 6);

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'candidate_prices'
        AND column_name = 'price_hrk'
    ) THEN
      UPDATE candidate_prices
      SET price_usdc = price_hrk
      WHERE price_usdc IS NULL;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staking_tiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  wallet_address TEXT,
  tier TEXT NOT NULL DEFAULT 'none',
  stake_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staking_tiers_user_id ON staking_tiers(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_tiers_wallet_address ON staking_tiers(wallet_address);
