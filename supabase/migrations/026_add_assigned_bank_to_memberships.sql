-- =============================================
-- ADD ASSIGNED BANK ACCOUNT TO MEMBERSHIPS
-- Allows dealers to assign specific bank accounts to members
-- =============================================

-- Add assigned_bank_account_id column to user_dealer_memberships
ALTER TABLE user_dealer_memberships 
ADD COLUMN IF NOT EXISTS assigned_bank_account_id UUID REFERENCES dealer_bank_accounts(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_bank 
ON user_dealer_memberships(assigned_bank_account_id);

-- Add comment
COMMENT ON COLUMN user_dealer_memberships.assigned_bank_account_id 
IS 'Specific bank account assigned to this member. NULL means use dealer default bank account.';
