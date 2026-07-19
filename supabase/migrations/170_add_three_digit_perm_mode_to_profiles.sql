-- Add three_digit_perm_mode column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS three_digit_perm_mode TEXT DEFAULT 'literal' CHECK (three_digit_perm_mode IN ('literal', 'perm_set'));

COMMENT ON COLUMN public.profiles.three_digit_perm_mode IS 'Configures how 3-digit numbers with suffix multipliers (*3, *6, etc.) are parsed: literal (เต็งโต๊ด) or perm_set (คูณชุด)';
