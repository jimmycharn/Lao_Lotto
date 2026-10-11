-- Migration 256: Add dealer slip verification settings and line group settlement mode

-- 1. Add slip verification settings to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slip_provider TEXT DEFAULT 'slipok',
ADD COLUMN IF NOT EXISTS slipok_api_key TEXT,
ADD COLUMN IF NOT EXISTS slipok_branch_id TEXT,
ADD COLUMN IF NOT EXISTS slip_tolerance_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS slip_tolerance_mode TEXT DEFAULT 'forgive_difference',
ADD COLUMN IF NOT EXISTS auto_slip_verification_enabled BOOLEAN DEFAULT FALSE;

-- Add check constraint for slip_tolerance_mode if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_profiles_slip_tolerance_mode'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT chk_profiles_slip_tolerance_mode
        CHECK (slip_tolerance_mode IN ('forgive_difference', 'carry_remainder'));
    END IF;
END $$;

-- 2. Add settlement mode to line_groups table
ALTER TABLE public.line_groups
ADD COLUMN IF NOT EXISTS settlement_mode TEXT DEFAULT 'immediate';

-- Add check constraint for settlement_mode if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_line_groups_settlement_mode'
    ) THEN
        ALTER TABLE public.line_groups
        ADD CONSTRAINT chk_line_groups_settlement_mode
        CHECK (settlement_mode IN ('immediate', 'cross_round'));
    END IF;
END $$;

-- 3. Enhance used_slips table for member and payment linking
ALTER TABLE public.used_slips
ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.member_round_payments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS slip_data JSONB;

-- 4. Create index for fast duplicate checks on dealer level
CREATE INDEX IF NOT EXISTS idx_used_slips_dealer_trans ON public.used_slips(dealer_id, trans_ref);
CREATE INDEX IF NOT EXISTS idx_line_groups_dealer_mode ON public.line_groups(dealer_id, settlement_mode);
