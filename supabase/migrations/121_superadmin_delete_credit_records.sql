-- Allow SuperAdmin to DELETE credit_transactions records
-- Previously only SELECT and INSERT policies existed, blocking delete operations

-- Drop existing restrictive policies and recreate with full access for superadmin
DROP POLICY IF EXISTS "Only system can insert transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Superadmin can manage transactions" ON credit_transactions;

-- Superadmin can do everything (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Superadmin can manage transactions" ON credit_transactions FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Keep dealer SELECT policy (already exists from migration 021)
-- "Dealers can view own transactions" ON credit_transactions FOR SELECT
