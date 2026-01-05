-- =============================================
-- LAO LOTTO - Bet Transfers Table (ยอดตีออก)
-- =============================================
-- Run this to add the bet_transfers table for tracking
-- bets that are transferred to other dealers when limits are exceeded
-- =============================================

-- Create bet_transfers table
CREATE TABLE IF NOT EXISTS bet_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  
  -- What was transferred
  bet_type TEXT NOT NULL,
  numbers TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  
  -- Who it was transferred to
  target_dealer_name TEXT NOT NULL,
  target_dealer_contact TEXT, -- Phone/Line ID (optional)
  
  -- Grouping (for batch transfers made at the same time)
  transfer_batch_id UUID DEFAULT uuid_generate_v4(),
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bet_transfers_round ON bet_transfers(round_id);
CREATE INDEX IF NOT EXISTS idx_bet_transfers_batch ON bet_transfers(transfer_batch_id);
CREATE INDEX IF NOT EXISTS idx_bet_transfers_created ON bet_transfers(created_at DESC);

-- Enable RLS
ALTER TABLE bet_transfers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "dealers_manage_transfers" ON bet_transfers;
DROP POLICY IF EXISTS "dealers_view_transfers" ON bet_transfers;

-- Dealers can manage (CRUD) transfers for their own rounds
CREATE POLICY "dealers_manage_transfers" ON bet_transfers
  FOR ALL USING (
    round_id IN (SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid())
  );

-- Authenticated users can read transfers (for viewing)
CREATE POLICY "authenticated_read_transfers" ON bet_transfers
  FOR SELECT USING (auth.uid() IS NOT NULL);
