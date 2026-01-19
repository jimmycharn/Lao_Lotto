-- Add DELETE policy for user_dealer_memberships table
-- Allows dealers to delete memberships where they are the dealer

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Dealers can delete their own memberships" ON user_dealer_memberships;

-- Create DELETE policy
CREATE POLICY "Dealers can delete their own memberships"
ON user_dealer_memberships
FOR DELETE
USING (dealer_id = auth.uid());
