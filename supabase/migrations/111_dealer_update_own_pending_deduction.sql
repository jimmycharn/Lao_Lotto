-- =============================================
-- Allow dealers to update their own pending_deduction in dealer_credits
-- Previously only superadmin could modify dealer_credits (policy from 021)
-- and members could update pending_deduction (policy from 036)
-- but the dealer themselves could NOT update their own record
-- This caused updatePendingDeduction() to silently fail on the client side
-- =============================================

DROP POLICY IF EXISTS "Dealers can update own pending deduction" ON dealer_credits;

CREATE POLICY "Dealers can update own pending deduction" ON dealer_credits
  FOR UPDATE USING (
    dealer_id = auth.uid()
  )
  WITH CHECK (
    dealer_id = auth.uid()
  );
