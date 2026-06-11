-- Migration: Add is_default field to dealer_upstream_connections
-- Allows dealer to select which upstream dealer is the default for auto layoff (Bot /ตีออก)

ALTER TABLE dealer_upstream_connections
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Index for fast default lookup
CREATE INDEX IF NOT EXISTS idx_upstream_is_default ON dealer_upstream_connections(dealer_id, is_default);

-- Ensure only one default per dealer (not enforced at DB level, handled in app logic)
-- Set the first active non-linked record as default if none is set
UPDATE dealer_upstream_connections duc
SET is_default = true
WHERE is_default = false
  AND id = (
    SELECT id FROM dealer_upstream_connections
    WHERE dealer_id = duc.dealer_id
      AND status = 'active'
      AND is_blocked = false
    ORDER BY created_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM dealer_upstream_connections
    WHERE dealer_id = duc.dealer_id AND is_default = true
  );
