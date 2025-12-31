-- =============================================
-- SUPER SIMPLE RLS - NO SUBQUERIES
-- =============================================
-- All authenticated users can READ all tables
-- Only write to what you own
-- =============================================

-- =============================================
-- LOTTERY_ROUNDS
-- =============================================

ALTER TABLE lottery_rounds ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Dealers can view own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can insert own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can update own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can delete own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Users can view their dealer rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "dealers_manage_own_rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "users_view_dealer_rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can manage own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Admins can view all rounds" ON lottery_rounds;

-- Simple: All authenticated can READ
CREATE POLICY "authenticated_read_rounds" ON lottery_rounds
    FOR SELECT TO authenticated USING (true);

-- Dealers can INSERT/UPDATE/DELETE their own
CREATE POLICY "dealers_write_own_rounds" ON lottery_rounds
    FOR INSERT TO authenticated WITH CHECK (dealer_id = auth.uid());

CREATE POLICY "dealers_update_own_rounds" ON lottery_rounds
    FOR UPDATE TO authenticated USING (dealer_id = auth.uid());

CREATE POLICY "dealers_delete_own_rounds" ON lottery_rounds
    FOR DELETE TO authenticated USING (dealer_id = auth.uid());


-- =============================================
-- SUBMISSIONS
-- =============================================

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_submissions" ON submissions;
DROP POLICY IF EXISTS "dealers_view_round_submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can insert submissions" ON submissions;
DROP POLICY IF EXISTS "Dealers can view submissions for their rounds" ON submissions;

-- All authenticated can READ
CREATE POLICY "authenticated_read_submissions" ON submissions
    FOR SELECT TO authenticated USING (true);

-- Users can INSERT their own
CREATE POLICY "users_insert_submissions" ON submissions
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can UPDATE/DELETE their own
CREATE POLICY "users_update_submissions" ON submissions
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_delete_submissions" ON submissions
    FOR DELETE TO authenticated USING (user_id = auth.uid());


-- =============================================
-- TYPE_LIMITS
-- =============================================

ALTER TABLE type_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dealers_manage_type_limits" ON type_limits;
DROP POLICY IF EXISTS "users_view_type_limits" ON type_limits;
DROP POLICY IF EXISTS "Dealers can manage type limits" ON type_limits;

-- All authenticated can READ
CREATE POLICY "authenticated_read_type_limits" ON type_limits
    FOR SELECT TO authenticated USING (true);

-- Write handled via lottery_rounds ownership (checked in app)
CREATE POLICY "authenticated_write_type_limits" ON type_limits
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_type_limits" ON type_limits
    FOR UPDATE TO authenticated USING (true);


-- =============================================
-- NUMBER_LIMITS
-- =============================================

ALTER TABLE number_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dealers_manage_number_limits" ON number_limits;
DROP POLICY IF EXISTS "Dealers can manage number limits" ON number_limits;
DROP POLICY IF EXISTS "Users can view number limits" ON number_limits;

CREATE POLICY "authenticated_read_number_limits" ON number_limits
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_number_limits" ON number_limits
    FOR INSERT TO authenticated WITH CHECK (true);


-- =============================================
-- USER_SETTINGS
-- =============================================

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_view_own_settings" ON user_settings;
DROP POLICY IF EXISTS "dealers_manage_user_settings" ON user_settings;
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Dealers can manage user settings" ON user_settings;

CREATE POLICY "authenticated_read_user_settings" ON user_settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_user_settings" ON user_settings
    FOR ALL TO authenticated USING (true);


-- =============================================
-- Verify
-- =============================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
