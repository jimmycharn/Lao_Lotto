-- =============================================
-- FIX LOTTERY_ROUNDS RLS - Allow reading all rounds
-- =============================================
-- This is needed for upstream dealer transfer feature
-- Dealers need to check if upstream dealer has an active round
-- =============================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "authenticated_read_rounds" ON lottery_rounds;

-- Re-create with explicit USING (true) to allow all authenticated users to read
CREATE POLICY "authenticated_read_rounds" ON lottery_rounds
    FOR SELECT TO authenticated USING (true);

-- Verify
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'lottery_rounds';
