-- =============================================
-- LAO LOTTO - Add bank account columns to dealer_upstream_connections
-- Migration: 103_add_my_bank_to_upstream_connections.sql
-- =============================================
-- 
-- Two bank account columns for the two sides of a dealer-to-dealer connection:
--
-- 1. my_bank_account_id: The SENDING dealer's bank account that the UPSTREAM dealer sees.
--    (Dealer B sets this so Dealer A can see Dealer B's bank account)
--
-- 2. assigned_bank_account_id: The UPSTREAM dealer's bank account that the SENDING dealer sees.
--    (Dealer A sets this so Dealer B can see Dealer A's bank account)
--
-- This is needed because dealer-to-dealer connections via QR do NOT create 
-- user_dealer_memberships records. Only regular user-to-dealer joins create memberships.

-- Column 1: Sending dealer's bank for upstream dealer to see
ALTER TABLE dealer_upstream_connections 
ADD COLUMN IF NOT EXISTS my_bank_account_id UUID REFERENCES dealer_bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN dealer_upstream_connections.my_bank_account_id 
IS 'The sending dealer''s own bank account to show to the upstream dealer. NULL means use default.';

-- Column 2: Upstream dealer's bank for sending dealer to see
ALTER TABLE dealer_upstream_connections 
ADD COLUMN IF NOT EXISTS assigned_bank_account_id UUID REFERENCES dealer_bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN dealer_upstream_connections.assigned_bank_account_id 
IS 'The upstream dealer''s bank account assigned for the sending dealer to see. NULL means use default.';

-- RLS: Allow upstream dealers to update assigned_bank_account_id on connections targeting them
-- (Dealer A sets which of their bank accounts Dealer B sees)
DROP POLICY IF EXISTS "Upstream dealers can update assigned bank on connections" ON dealer_upstream_connections;
CREATE POLICY "Upstream dealers can update assigned bank on connections"
    ON dealer_upstream_connections FOR UPDATE
    USING (upstream_dealer_id = auth.uid())
    WITH CHECK (upstream_dealer_id = auth.uid());
