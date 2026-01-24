-- Add is_default column to subscription_packages table
ALTER TABLE subscription_packages 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Add is_default column to admin_bank_accounts table
ALTER TABLE admin_bank_accounts 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Create function to ensure only one default package
CREATE OR REPLACE FUNCTION ensure_single_default_package()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE subscription_packages 
        SET is_default = FALSE 
        WHERE id != NEW.id AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription_packages
DROP TRIGGER IF EXISTS trigger_single_default_package ON subscription_packages;
CREATE TRIGGER trigger_single_default_package
    BEFORE INSERT OR UPDATE ON subscription_packages
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_package();

-- Create function to ensure only one default bank account
CREATE OR REPLACE FUNCTION ensure_single_default_bank_account()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE admin_bank_accounts 
        SET is_default = FALSE 
        WHERE id != NEW.id AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for admin_bank_accounts
DROP TRIGGER IF EXISTS trigger_single_default_bank_account ON admin_bank_accounts;
CREATE TRIGGER trigger_single_default_bank_account
    BEFORE INSERT OR UPDATE ON admin_bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_bank_account();

-- Function to get default package
CREATE OR REPLACE FUNCTION get_default_package()
RETURNS UUID AS $$
DECLARE
    default_pkg_id UUID;
BEGIN
    SELECT id INTO default_pkg_id
    FROM subscription_packages
    WHERE is_default = TRUE AND is_active = TRUE
    LIMIT 1;
    
    RETURN default_pkg_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get default bank account
CREATE OR REPLACE FUNCTION get_default_bank_account()
RETURNS UUID AS $$
DECLARE
    default_bank_id UUID;
BEGIN
    SELECT id INTO default_bank_id
    FROM admin_bank_accounts
    WHERE is_default = TRUE AND is_active = TRUE
    LIMIT 1;
    
    RETURN default_bank_id;
END;
$$ LANGUAGE plpgsql;
