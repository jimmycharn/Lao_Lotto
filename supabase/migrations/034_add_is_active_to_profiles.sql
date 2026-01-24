-- Add is_active column to profiles table if not exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add deactivated_at column if not exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ DEFAULT NULL;

-- Add deactivated_by column if not exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deactivated_by UUID DEFAULT NULL;

-- Add deactivation_reason column if not exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT NULL;

-- Update existing dealers to have is_active = true if null
UPDATE profiles 
SET is_active = TRUE 
WHERE role = 'dealer' AND is_active IS NULL;

-- Drop existing update policies that might conflict
DROP POLICY IF EXISTS "Superadmin can update dealer profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Create policy to allow superadmin to update ANY profile
CREATE POLICY "Superadmin can update all profiles" ON profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'superadmin'
        )
    );
