-- Credit System Tables (Minimal version for quick setup)
-- Run this in Supabase SQL Editor

-- 1. PACKAGES TABLE
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    dealer_input_threshold DECIMAL(15,2) NOT NULL DEFAULT 100000,
    is_active BOOLEAN DEFAULT TRUE,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DEALER_CREDITS TABLE
CREATE TABLE IF NOT EXISTS dealer_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    package_id UUID REFERENCES packages(id),
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason TEXT,
    blocked_at TIMESTAMPTZ,
    warning_threshold DECIMAL(15,2) DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dealer_id)
);

-- 3. CREDIT_TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    performed_by UUID REFERENCES profiles(id),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_dealer_credits_dealer_id ON dealer_credits(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_dealer_id ON credit_transactions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);

-- Default Package
INSERT INTO packages (name, description, fee_percentage, dealer_input_threshold, features)
VALUES (
    'Standard',
    'แพ็คเกจมาตรฐาน - คิดค่าบริการ 0.5% จากยอดที่วิ่งผ่าน',
    0.5,
    100000,
    '{"max_members": 100, "max_upstream_dealers": 10}'
) ON CONFLICT DO NOTHING;

-- RLS POLICIES
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Packages are viewable by everyone" ON packages;
DROP POLICY IF EXISTS "Only superadmin can modify packages" ON packages;
DROP POLICY IF EXISTS "Dealers can view own credits" ON dealer_credits;
DROP POLICY IF EXISTS "Only superadmin can modify credits" ON dealer_credits;
DROP POLICY IF EXISTS "Dealers can view own transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Only system can insert transactions" ON credit_transactions;

-- Create policies
CREATE POLICY "Packages are viewable by everyone" ON packages FOR SELECT USING (true);
CREATE POLICY "Only superadmin can modify packages" ON packages FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Dealers can view own credits" ON dealer_credits FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Only superadmin can modify credits" ON dealer_credits FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Dealers can view own transactions" ON credit_transactions FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Only system can insert transactions" ON credit_transactions FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
