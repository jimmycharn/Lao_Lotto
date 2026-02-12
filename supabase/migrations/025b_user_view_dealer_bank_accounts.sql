-- =============================================
-- ADD RLS POLICY FOR USERS TO VIEW DEALER BANK ACCOUNTS
-- Allows users who are members of a dealer to view that dealer's bank accounts
-- =============================================

-- Policy: Users can view bank accounts of dealers they are members of
CREATE POLICY "Users can view dealer bank accounts" ON dealer_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_dealer_memberships 
      WHERE user_dealer_memberships.user_id = auth.uid() 
      AND user_dealer_memberships.dealer_id = dealer_bank_accounts.dealer_id
      AND user_dealer_memberships.status = 'active'
    )
  );
