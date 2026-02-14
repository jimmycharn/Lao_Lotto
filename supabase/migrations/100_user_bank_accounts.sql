-- =============================================
-- USER BANK ACCOUNTS TABLE
-- Allows users to store multiple bank accounts with a default selection
-- + link specific bank account to each dealer membership
-- =============================================

-- Create user_bank_accounts table (similar to dealer_bank_accounts)
CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  account_name TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts(user_id);

-- Enable RLS
ALTER TABLE user_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own bank accounts
CREATE POLICY "Users can view own bank accounts" ON user_bank_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own bank accounts
CREATE POLICY "Users can insert own bank accounts" ON user_bank_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own bank accounts
CREATE POLICY "Users can update own bank accounts" ON user_bank_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own bank accounts
CREATE POLICY "Users can delete own bank accounts" ON user_bank_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Dealers can view bank accounts of their members (via membership)
CREATE POLICY "Dealers can view member bank accounts" ON user_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_dealer_memberships udm
      WHERE udm.user_id = user_bank_accounts.user_id
      AND udm.dealer_id = auth.uid()
      AND udm.status = 'active'
    )
  );

-- Policy: Superadmins can view all bank accounts
CREATE POLICY "Superadmins can view all user bank accounts" ON user_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_user_bank_accounts_updated_at
  BEFORE UPDATE ON user_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default account per user
CREATE OR REPLACE FUNCTION ensure_single_default_user_bank_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE user_bank_accounts 
    SET is_default = FALSE 
    WHERE user_id = NEW.user_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for ensuring single default
CREATE TRIGGER ensure_single_default_user_bank_trigger
  AFTER INSERT OR UPDATE ON user_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_user_bank_account();

-- =============================================
-- ADD member_bank_account_id TO MEMBERSHIPS
-- Links a specific user bank account to a dealer membership
-- =============================================
ALTER TABLE user_dealer_memberships 
ADD COLUMN IF NOT EXISTS member_bank_account_id UUID REFERENCES user_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_member_bank 
ON user_dealer_memberships(member_bank_account_id);

COMMENT ON COLUMN user_dealer_memberships.member_bank_account_id 
IS 'Specific user bank account assigned to this dealer membership. NULL means dealer sees default bank account.';
