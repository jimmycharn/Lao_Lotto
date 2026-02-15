-- =============================================
-- LAO LOTTO - RLS policies for bank account visibility via dealer_upstream_connections
-- Migration: 104_bank_accounts_rls_for_connections.sql
-- =============================================
--
-- Problem: dealer-to-dealer QR connections create dealer_upstream_connections records
-- but NOT user_dealer_memberships records. The existing RLS policies only allow
-- bank account access via memberships, so connected dealers can't see each other's banks.
--
-- This migration adds RLS policies so that:
-- 1. Downstream dealers can view upstream dealer's dealer_bank_accounts (to see assigned bank)
-- 2. Upstream dealers can view downstream dealer's dealer_bank_accounts (to see member's bank)
-- 3. Upstream dealers can view downstream dealer's user_bank_accounts (to see member's bank)

-- =============================================
-- 1. Downstream dealer can view upstream dealer's dealer_bank_accounts
--    (คุณแมว can see เกมส์'s bank accounts via the connection)
-- =============================================
DROP POLICY IF EXISTS "Connected dealers can view upstream dealer bank accounts" ON dealer_bank_accounts;
CREATE POLICY "Connected dealers can view upstream dealer bank accounts" ON dealer_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dealer_upstream_connections duc
      WHERE duc.dealer_id = auth.uid()
      AND duc.upstream_dealer_id = dealer_bank_accounts.dealer_id
    )
  );

-- =============================================
-- 2. Upstream dealer can view downstream dealer's dealer_bank_accounts
--    (เกมส์ can see คุณแมว's dealer bank accounts via the connection)
-- =============================================
DROP POLICY IF EXISTS "Upstream dealers can view downstream dealer bank accounts" ON dealer_bank_accounts;
CREATE POLICY "Upstream dealers can view downstream dealer bank accounts" ON dealer_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dealer_upstream_connections duc
      WHERE duc.upstream_dealer_id = auth.uid()
      AND duc.dealer_id = dealer_bank_accounts.dealer_id
    )
  );

-- =============================================
-- 3. Upstream dealer can view downstream dealer's user_bank_accounts
--    (เกมส์ can see คุณแมว's user bank accounts via the connection)
-- =============================================
DROP POLICY IF EXISTS "Upstream dealers can view connected dealer user bank accounts" ON user_bank_accounts;
CREATE POLICY "Upstream dealers can view connected dealer user bank accounts" ON user_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dealer_upstream_connections duc
      WHERE duc.upstream_dealer_id = auth.uid()
      AND duc.dealer_id = user_bank_accounts.user_id
    )
  );
