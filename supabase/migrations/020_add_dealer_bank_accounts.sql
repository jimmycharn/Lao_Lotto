-- =============================================
-- DEALER BANK ACCOUNTS TABLE
-- Allows dealers to store multiple bank accounts with a default selection
-- =============================================

-- Create dealer_bank_accounts table
CREATE TABLE IF NOT EXISTS dealer_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  account_name TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for dealer_id lookups
CREATE INDEX IF NOT EXISTS idx_dealer_bank_accounts_dealer_id ON dealer_bank_accounts(dealer_id);

-- Enable RLS
ALTER TABLE dealer_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Dealers can view their own bank accounts
CREATE POLICY "Dealers can view own bank accounts" ON dealer_bank_accounts
  FOR SELECT USING (auth.uid() = dealer_id);

-- Policy: Dealers can insert their own bank accounts
CREATE POLICY "Dealers can insert own bank accounts" ON dealer_bank_accounts
  FOR INSERT WITH CHECK (auth.uid() = dealer_id);

-- Policy: Dealers can update their own bank accounts
CREATE POLICY "Dealers can update own bank accounts" ON dealer_bank_accounts
  FOR UPDATE USING (auth.uid() = dealer_id);

-- Policy: Dealers can delete their own bank accounts
CREATE POLICY "Dealers can delete own bank accounts" ON dealer_bank_accounts
  FOR DELETE USING (auth.uid() = dealer_id);

-- Policy: Superadmins can view all bank accounts
CREATE POLICY "Superadmins can view all bank accounts" ON dealer_bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_dealer_bank_accounts_updated_at
  BEFORE UPDATE ON dealer_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default account per dealer
CREATE OR REPLACE FUNCTION ensure_single_default_bank_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    -- Set all other accounts for this dealer to non-default
    UPDATE dealer_bank_accounts 
    SET is_default = FALSE 
    WHERE dealer_id = NEW.dealer_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for ensuring single default
CREATE TRIGGER ensure_single_default_trigger
  AFTER INSERT OR UPDATE ON dealer_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_bank_account();
