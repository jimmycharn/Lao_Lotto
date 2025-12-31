-- Add dealer_id to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES profiles(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_dealer_id ON profiles(dealer_id);

-- Update RLS policies to allow dealers to view their own members
CREATE POLICY "Dealers can view their members" ON profiles
  FOR SELECT USING (
    dealer_id = auth.uid()
  );
