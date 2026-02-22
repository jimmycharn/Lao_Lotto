-- Add allowed_lottery_types column to profiles table (for dealers)
-- This column stores an array of lottery type keys that the dealer is allowed to use
-- Default is all lottery types (null means all types allowed)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allowed_lottery_types TEXT[] DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.profiles.allowed_lottery_types IS 'Array of lottery type keys that this dealer is allowed to create rounds for. NULL means all types allowed.';
