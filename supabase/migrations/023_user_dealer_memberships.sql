-- =============================================
-- LAO LOTTO - User-Dealer Memberships (Multi-Dealer Support)
-- Migration: 023_user_dealer_memberships.sql
-- =============================================

-- Create user_dealer_memberships table for many-to-many relationship
CREATE TABLE IF NOT EXISTS user_dealer_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ,
    UNIQUE(user_id, dealer_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_user ON user_dealer_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_dealer ON user_dealer_memberships(dealer_id);
CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_status ON user_dealer_memberships(status);

-- Enable RLS
ALTER TABLE user_dealer_memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own memberships" ON user_dealer_memberships;
DROP POLICY IF EXISTS "Dealers can view memberships to them" ON user_dealer_memberships;
DROP POLICY IF EXISTS "Users can insert memberships" ON user_dealer_memberships;
DROP POLICY IF EXISTS "Dealers can update memberships" ON user_dealer_memberships;

-- Users can view their own memberships
CREATE POLICY "Users can view their own memberships" ON user_dealer_memberships
    FOR SELECT USING (auth.uid() = user_id);

-- Dealers can view memberships where they are the dealer
CREATE POLICY "Dealers can view memberships to them" ON user_dealer_memberships
    FOR SELECT USING (auth.uid() = dealer_id);

-- Anyone can insert a membership request (user requesting to join dealer)
CREATE POLICY "Users can insert memberships" ON user_dealer_memberships
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Dealers can update membership status (approve, reject, block)
CREATE POLICY "Dealers can update memberships" ON user_dealer_memberships
    FOR UPDATE USING (auth.uid() = dealer_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_membership_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
        NEW.approved_at = NOW();
    END IF;
    IF NEW.status = 'blocked' AND OLD.status != 'blocked' THEN
        NEW.blocked_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_dealer_memberships_updated_at ON user_dealer_memberships;
CREATE TRIGGER update_user_dealer_memberships_updated_at
    BEFORE UPDATE ON user_dealer_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_membership_updated_at();

-- =============================================
-- MIGRATE EXISTING DATA
-- =============================================

-- Migrate existing users with dealer_id to memberships table
-- Set status to 'active' since they were already approved (legacy flow)
INSERT INTO user_dealer_memberships (user_id, dealer_id, status, approved_at)
SELECT id, dealer_id, 'active', NOW()
FROM profiles
WHERE dealer_id IS NOT NULL
  AND role = 'user'
ON CONFLICT (user_id, dealer_id) DO NOTHING;

-- =============================================
-- UPDATE RLS POLICIES FOR lottery_rounds
-- Users should see rounds from dealers they have active membership with
-- =============================================

-- Drop and recreate the user view policy for lottery_rounds
DROP POLICY IF EXISTS "Users can view their dealer rounds" ON lottery_rounds;
DROP POLICY IF EXISTS "Users view dealer rounds via membership" ON lottery_rounds;

CREATE POLICY "Users view dealer rounds via membership" ON lottery_rounds
    FOR SELECT USING (
        -- Dealer can see their own rounds
        dealer_id = auth.uid()
        OR
        -- Users can see rounds from dealers they have active membership with
        dealer_id IN (
            SELECT m.dealer_id FROM user_dealer_memberships m 
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    );

-- =============================================
-- UPDATE RLS POLICIES FOR submissions
-- Users should only submit to rounds from their active dealers
-- =============================================

DROP POLICY IF EXISTS "Users can submit to dealer rounds" ON submissions;
DROP POLICY IF EXISTS "Users submit to dealer rounds via membership" ON submissions;

CREATE POLICY "Users submit to dealer rounds via membership" ON submissions
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND
        round_id IN (
            SELECT lr.id FROM lottery_rounds lr
            WHERE lr.dealer_id IN (
                SELECT m.dealer_id FROM user_dealer_memberships m 
                WHERE m.user_id = auth.uid() AND m.status = 'active'
            )
        )
    );

-- =============================================
-- VIEW FOR USER'S ACTIVE DEALERS
-- =============================================

CREATE OR REPLACE VIEW user_active_dealers AS
SELECT 
    m.user_id,
    m.dealer_id,
    m.status,
    m.approved_at,
    p.full_name as dealer_name,
    p.email as dealer_email
FROM user_dealer_memberships m
JOIN profiles p ON p.id = m.dealer_id
WHERE m.status = 'active';

-- Grant access to the view
GRANT SELECT ON user_active_dealers TO authenticated;
