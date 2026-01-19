-- Add INSERT policy for dealers to create memberships for their users
-- This allows dealers to add members directly

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Dealers can insert memberships" ON user_dealer_memberships;

-- Create INSERT policy for dealers
CREATE POLICY "Dealers can insert memberships"
ON user_dealer_memberships
FOR INSERT
WITH CHECK (dealer_id = auth.uid());
