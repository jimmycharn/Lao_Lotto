-- Migration: Add dealer upstream connections table
-- This table stores dealers that a dealer can transfer bets to (upstream/parent dealers)
-- Supports both:
-- 1. Manual entries (name + contact only, not linked to system)
-- 2. Linked entries (connected via QR/link to another dealer in system)

CREATE TABLE IF NOT EXISTS dealer_upstream_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,  -- This dealer (who is transferring bets)
    upstream_dealer_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Target dealer in system (nullable for manual entries)
    upstream_name TEXT NOT NULL,                                        -- Display name
    upstream_contact TEXT,                                              -- Phone/Line ID for manual entries
    is_linked BOOLEAN DEFAULT FALSE,                                    -- TRUE if connected to actual dealer in system
    notes TEXT,                                                         -- Optional notes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate links to same upstream dealer
    UNIQUE (dealer_id, upstream_dealer_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_upstream_dealer_id ON dealer_upstream_connections(dealer_id);
CREATE INDEX IF NOT EXISTS idx_upstream_target ON dealer_upstream_connections(upstream_dealer_id);

-- RLS Policies
ALTER TABLE dealer_upstream_connections ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own upstream connections
CREATE POLICY "Dealers can view own upstream connections"
    ON dealer_upstream_connections FOR SELECT
    USING (dealer_id = auth.uid());

-- Dealers can insert their own upstream connections  
CREATE POLICY "Dealers can insert own upstream connections"
    ON dealer_upstream_connections FOR INSERT
    WITH CHECK (dealer_id = auth.uid());

-- Dealers can update their own upstream connections
CREATE POLICY "Dealers can update own upstream connections"
    ON dealer_upstream_connections FOR UPDATE
    USING (dealer_id = auth.uid());

-- Dealers can delete their own upstream connections
CREATE POLICY "Dealers can delete own upstream connections"
    ON dealer_upstream_connections FOR DELETE
    USING (dealer_id = auth.uid());

-- Upstream dealers can view connections where they are the target (to see who's linked to them)
CREATE POLICY "Upstream dealers can view connections to them"
    ON dealer_upstream_connections FOR SELECT
    USING (upstream_dealer_id = auth.uid());

-- Super admins can do everything
CREATE POLICY "Super admins full access on upstream connections"
    ON dealer_upstream_connections FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    );

-- Grant permissions
GRANT ALL ON dealer_upstream_connections TO authenticated;
