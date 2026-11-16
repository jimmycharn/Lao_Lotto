-- Migration 263: Add upstream_code to dealer_upstream_connections
-- Ensures every upstream connection (manual or linked) gets a unique 5-digit code

-- 1. Ensure member_code_seq sequence exists
CREATE SEQUENCE IF NOT EXISTS member_code_seq START WITH 10001;

-- 2. Add upstream_code column
ALTER TABLE public.dealer_upstream_connections
ADD COLUMN IF NOT EXISTS upstream_code TEXT DEFAULT nextval('member_code_seq')::text;

-- 3. Backfill any existing connections that have null upstream_code
UPDATE public.dealer_upstream_connections
SET upstream_code = nextval('member_code_seq')::text
WHERE upstream_code IS NULL;

-- 4. Create index on upstream_code
CREATE INDEX IF NOT EXISTS idx_dealer_upstream_connections_code 
ON public.dealer_upstream_connections(upstream_code);
