-- =============================================
-- RLS POLICIES FOR ALL TABLES (FIXED)
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. LOTTERY_ROUNDS
-- =============================================

ALTER TABLE lottery_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can view own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can insert own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can update own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Dealers can delete own rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Users can view their dealer rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "dealers_manage_own_rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "users_view_dealer_rounds" ON lottery_rounds;

-- Dealers can manage their own rounds
CREATE POLICY "dealers_manage_own_rounds" ON lottery_rounds
    FOR ALL 
    TO authenticated
    USING (dealer_id = auth.uid())
    WITH CHECK (dealer_id = auth.uid());

-- Users can view rounds from their dealer (using subquery with alias)
CREATE POLICY "users_view_dealer_rounds" ON lottery_rounds
    FOR SELECT 
    TO authenticated
    USING (
        dealer_id IN (
            SELECT p.dealer_id FROM profiles p WHERE p.id = auth.uid()
        )
        OR dealer_id = auth.uid()
    );

-- =============================================
-- 2. SUBMISSIONS
-- =============================================

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can insert submissions" ON submissions;
DROP POLICY IF EXISTS "Dealers can view submissions for their rounds" ON submissions;
DROP POLICY IF EXISTS "users_manage_own_submissions" ON submissions;
DROP POLICY IF EXISTS "dealers_view_round_submissions" ON submissions;

-- Users can view/create their own submissions
CREATE POLICY "users_manage_own_submissions" ON submissions
    FOR ALL 
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Dealers can view submissions for their rounds
CREATE POLICY "dealers_view_round_submissions" ON submissions
    FOR SELECT 
    TO authenticated
    USING (
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr WHERE lr.dealer_id = auth.uid()
        )
    );

-- =============================================
-- 3. TYPE_LIMITS
-- =============================================

ALTER TABLE type_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can manage type limits" ON type_limits;
DROP POLICY IF EXISTS "dealers_manage_type_limits" ON type_limits;
DROP POLICY IF EXISTS "users_view_type_limits" ON type_limits;

-- Dealers can manage their round's type limits
CREATE POLICY "dealers_manage_type_limits" ON type_limits
    FOR ALL 
    TO authenticated
    USING (
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr WHERE lr.dealer_id = auth.uid()
        )
    )
    WITH CHECK (
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr WHERE lr.dealer_id = auth.uid()
        )
    );

-- Users can view type limits for rounds they can access
CREATE POLICY "users_view_type_limits" ON type_limits
    FOR SELECT 
    TO authenticated
    USING (
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr 
            WHERE lr.dealer_id IN (
                SELECT p.dealer_id FROM profiles p WHERE p.id = auth.uid()
            )
        )
    );

-- =============================================
-- 4. NUMBER_LIMITS
-- =============================================

ALTER TABLE number_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can manage number limits" ON number_limits;
DROP POLICY IF EXISTS "dealers_manage_number_limits" ON number_limits;

CREATE POLICY "dealers_manage_number_limits" ON number_limits
    FOR ALL 
    TO authenticated
    USING (
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr WHERE lr.dealer_id = auth.uid()
        )
    );

-- =============================================
-- 5. USER_SETTINGS
-- =============================================

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Dealers can manage user settings" ON user_settings;
DROP POLICY IF EXISTS "users_view_own_settings" ON user_settings;
DROP POLICY IF EXISTS "dealers_manage_user_settings" ON user_settings;

-- Users can view their own settings
CREATE POLICY "users_view_own_settings" ON user_settings
    FOR SELECT 
    TO authenticated
    USING (user_id = auth.uid());

-- Dealers can manage settings for their users
CREATE POLICY "dealers_manage_user_settings" ON user_settings
    FOR ALL 
    TO authenticated
    USING (
        user_id IN (
            SELECT p.id FROM profiles p WHERE p.dealer_id = auth.uid()
        )
    );

-- =============================================
-- Verify all policies
-- =============================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
