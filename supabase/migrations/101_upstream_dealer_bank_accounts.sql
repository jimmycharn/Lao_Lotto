-- =============================================
-- UPSTREAM DEALER BANK ACCOUNTS TABLE
-- Allows dealers to store bank accounts for their external upstream dealers
-- =============================================

CREATE TABLE IF NOT EXISTS upstream_dealer_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES dealer_upstream_connections(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  account_name TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_upstream_bank_connection_id ON upstream_dealer_bank_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_upstream_bank_dealer_id ON upstream_dealer_bank_accounts(dealer_id);

-- Enable RLS
ALTER TABLE upstream_dealer_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Dealers can view their own upstream dealer bank accounts
CREATE POLICY "Dealers can view own upstream bank accounts" ON upstream_dealer_bank_accounts
  FOR SELECT USING (auth.uid() = dealer_id);

-- Policy: Dealers can insert their own upstream dealer bank accounts
CREATE POLICY "Dealers can insert own upstream bank accounts" ON upstream_dealer_bank_accounts
  FOR INSERT WITH CHECK (auth.uid() = dealer_id);

-- Policy: Dealers can update their own upstream dealer bank accounts
CREATE POLICY "Dealers can update own upstream bank accounts" ON upstream_dealer_bank_accounts
  FOR UPDATE USING (auth.uid() = dealer_id);

-- Policy: Dealers can delete their own upstream dealer bank accounts
CREATE POLICY "Dealers can delete own upstream bank accounts" ON upstream_dealer_bank_accounts
  FOR DELETE USING (auth.uid() = dealer_id);

-- Add trigger for updated_at
CREATE TRIGGER update_upstream_bank_accounts_updated_at
  BEFORE UPDATE ON upstream_dealer_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default account per connection
CREATE OR REPLACE FUNCTION ensure_single_default_upstream_bank_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE upstream_dealer_bank_accounts 
    SET is_default = FALSE 
    WHERE connection_id = NEW.connection_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_default_upstream_bank_trigger
  AFTER INSERT OR UPDATE ON upstream_dealer_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_upstream_bank_account();

-- Grant permissions
GRANT ALL ON upstream_dealer_bank_accounts TO authenticated;
