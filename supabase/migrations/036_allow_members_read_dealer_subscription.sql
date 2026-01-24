-- Migration: Allow members to read their dealer's subscription and credits
-- This is needed for credit calculation when members submit bets

-- =============================================
-- 1. DEALER SUBSCRIPTIONS - Allow members to view
-- =============================================
DROP POLICY IF EXISTS "Members can view dealer subscriptions" ON dealer_subscriptions;

CREATE POLICY "Members can view dealer subscriptions" ON dealer_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_dealer_memberships 
      WHERE user_dealer_memberships.dealer_id = dealer_subscriptions.dealer_id
      AND user_dealer_memberships.user_id = auth.uid()
      AND user_dealer_memberships.status = 'active'
    )
  );

-- =============================================
-- 2. DEALER CREDITS - Allow members to view
-- =============================================
DROP POLICY IF EXISTS "Members can view dealer credits" ON dealer_credits;

CREATE POLICY "Members can view dealer credits" ON dealer_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_dealer_memberships 
      WHERE user_dealer_memberships.dealer_id = dealer_credits.dealer_id
      AND user_dealer_memberships.user_id = auth.uid()
      AND user_dealer_memberships.status = 'active'
    )
  );

-- =============================================
-- 3. DEALER CREDITS - Allow members to update pending_deduction
-- =============================================
DROP POLICY IF EXISTS "Members can update dealer pending deduction" ON dealer_credits;

CREATE POLICY "Members can update dealer pending deduction" ON dealer_credits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_dealer_memberships 
      WHERE user_dealer_memberships.dealer_id = dealer_credits.dealer_id
      AND user_dealer_memberships.user_id = auth.uid()
      AND user_dealer_memberships.status = 'active'
    )
  );
