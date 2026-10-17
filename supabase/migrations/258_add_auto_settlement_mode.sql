-- Migration 257: Add 'auto' settlement mode and set as default for line_groups

-- 1. Drop existing check constraint if exists
ALTER TABLE public.line_groups
DROP CONSTRAINT IF EXISTS chk_line_groups_settlement_mode;

-- 2. Add updated check constraint allowing 'auto', 'immediate', and 'cross_round'
ALTER TABLE public.line_groups
ADD CONSTRAINT chk_line_groups_settlement_mode
CHECK (settlement_mode IN ('auto', 'immediate', 'cross_round'));

-- 3. Set default to 'auto'
ALTER TABLE public.line_groups
ALTER COLUMN settlement_mode SET DEFAULT 'auto';

-- 4. Update existing groups that currently default to immediate or null to 'auto'
UPDATE public.line_groups
SET settlement_mode = 'auto'
WHERE settlement_mode IS NULL;
