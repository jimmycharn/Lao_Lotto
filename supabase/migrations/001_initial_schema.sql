-- =============================================
-- LAO LOTTO - Supabase Database Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'dealer', 'superadmin')),
  balance DECIMAL(12, 2) DEFAULT 0,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins and dealers can view all profiles
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('superadmin', 'dealer')
    )
  );

-- Allow insert for authenticated users (for registration)
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- LOTTERY DRAWS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS lottery_draws (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_date DATE NOT NULL UNIQUE,
  two_digit VARCHAR(2),
  three_digit VARCHAR(3),
  four_digit VARCHAR(4),
  six_digit VARCHAR(6),
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for lottery_draws
ALTER TABLE lottery_draws ENABLE ROW LEVEL SECURITY;

-- Everyone can view published draws
CREATE POLICY "Anyone can view published draws" ON lottery_draws
  FOR SELECT USING (is_published = TRUE);

-- Admins can view all draws
CREATE POLICY "Admins can view all draws" ON lottery_draws
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- Dealers can view all draws
CREATE POLICY "Dealers can view all draws" ON lottery_draws
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('superadmin', 'dealer')
    )
  );

-- Only admins can insert/update/delete draws
CREATE POLICY "Admins can manage draws" ON lottery_draws
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- PURCHASES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  draw_id UUID NOT NULL REFERENCES lottery_draws(id) ON DELETE CASCADE,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('two_digit', 'three_digit', 'four_digit', 'six_digit')),
  numbers TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 10),
  is_winner BOOLEAN DEFAULT FALSE,
  prize_amount DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users can view their own purchases
CREATE POLICY "Users can view own purchases" ON purchases
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert purchases
CREATE POLICY "Users can create purchases" ON purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins and dealers can view all purchases
CREATE POLICY "Admins can view all purchases" ON purchases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('superadmin', 'dealer')
    )
  );

-- Admins can update purchases (for marking winners)
CREATE POLICY "Admins can update purchases" ON purchases
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_draw_id ON purchases(draw_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lottery_draws_date ON lottery_draws(draw_date DESC);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for lottery_draws
CREATE TRIGGER update_lottery_draws_updated_at
  BEFORE UPDATE ON lottery_draws
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INITIAL DATA (Optional)
-- =============================================

-- Insert sample lottery draw (uncomment if needed)
-- INSERT INTO lottery_draws (draw_date, two_digit, three_digit, four_digit, six_digit, is_published)
-- VALUES 
--   (CURRENT_DATE - INTERVAL '1 day', '47', '892', '3521', '471892', TRUE),
--   (CURRENT_DATE, NULL, NULL, NULL, NULL, FALSE);
