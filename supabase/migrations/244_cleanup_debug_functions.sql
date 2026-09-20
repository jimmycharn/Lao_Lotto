-- Migration 244: Clean up debug functions
DROP FUNCTION IF EXISTS public.debug_check_rounds_and_test_dealer_delete(UUID, UUID);
DROP FUNCTION IF EXISTS public.debug_find_user_profiles();
DROP FUNCTION IF EXISTS public.debug_inspect_round_fks(UUID);
DROP FUNCTION IF EXISTS public.debug_simulate_dealer_delete_test(UUID, UUID);
DROP FUNCTION IF EXISTS public.debug_inspect_all_dealer_rounds();
