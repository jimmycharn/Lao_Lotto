-- Migration 250: Drop overloaded 1-param dealer_delete_round(UUID) to fix PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.dealer_delete_round(UUID);
NOTIFY pgrst, 'reload schema';
