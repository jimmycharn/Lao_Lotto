-- =============================================
-- Round History Tables for Dealer and User
-- =============================================
-- This migration creates tables to store round history summaries
-- when a dealer deletes a round, preserving important financial data

-- Table for dealer round history (summary when round is deleted)
CREATE TABLE IF NOT EXISTS round_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    round_id UUID, -- Original round ID (may be null after deletion)
    lottery_type TEXT NOT NULL,
    round_date DATE NOT NULL,
    open_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    
    -- Financial summary
    total_entries INTEGER DEFAULT 0, -- จำนวนรายการ
    total_amount DECIMAL(12,2) DEFAULT 0, -- ยอดรับรวม
    total_commission DECIMAL(12,2) DEFAULT 0, -- ค่าคอมรวม
    total_payout DECIMAL(12,2) DEFAULT 0, -- จ่ายถูก (จ่ายคนที่ถูกหวย)
    
    -- Upstream dealer related
    transferred_amount DECIMAL(12,2) DEFAULT 0, -- ยอดส่งไป dealer อื่น
    upstream_commission DECIMAL(12,2) DEFAULT 0, -- ค่าคอมที่ได้จาก dealer อื่น
    upstream_winnings DECIMAL(12,2) DEFAULT 0, -- รับถูก (เงินถูกหวยจาก dealer อื่น)
    
    -- Profit calculation
    -- กำไร = (ยอดรับ - ค่าคอม - จ่ายถูก) + (ยอดส่ง - (ค่าคอมที่ได้ + รับถูก))
    profit DECIMAL(12,2) DEFAULT 0,
    
    -- Metadata
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for user round history (summary of user's submissions in a round)
CREATE TABLE IF NOT EXISTS user_round_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    round_id UUID, -- Original round ID (may be null after deletion)
    lottery_type TEXT NOT NULL,
    round_date DATE NOT NULL,
    
    -- User's submission summary
    total_entries INTEGER DEFAULT 0, -- จำนวนรายการ
    total_amount DECIMAL(12,2) DEFAULT 0, -- ยอดส่งรวม
    total_commission DECIMAL(12,2) DEFAULT 0, -- ค่าคอมที่ได้
    total_winnings DECIMAL(12,2) DEFAULT 0, -- ยอดถูกหวย
    
    -- Profit/Loss calculation
    -- กำไร/ขาดทุน = ยอดถูกหวย + ค่าคอม - ยอดส่ง
    profit_loss DECIMAL(12,2) DEFAULT 0,
    
    -- Metadata
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_round_history_dealer_id ON round_history(dealer_id);
CREATE INDEX IF NOT EXISTS idx_round_history_deleted_at ON round_history(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_history_lottery_type ON round_history(lottery_type);

CREATE INDEX IF NOT EXISTS idx_user_round_history_user_id ON user_round_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_round_history_dealer_id ON user_round_history(dealer_id);
CREATE INDEX IF NOT EXISTS idx_user_round_history_deleted_at ON user_round_history(deleted_at DESC);

-- RLS Policies
ALTER TABLE round_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_round_history ENABLE ROW LEVEL SECURITY;

-- Dealer can view their own round history
CREATE POLICY "Dealers can view own round history"
    ON round_history FOR SELECT
    USING (dealer_id = auth.uid());

-- Dealer can insert their own round history
CREATE POLICY "Dealers can insert own round history"
    ON round_history FOR INSERT
    WITH CHECK (dealer_id = auth.uid());

-- User can view their own round history
CREATE POLICY "Users can view own round history"
    ON user_round_history FOR SELECT
    USING (user_id = auth.uid());

-- Dealer can insert user round history for their members
CREATE POLICY "Dealers can insert user round history"
    ON user_round_history FOR INSERT
    WITH CHECK (dealer_id = auth.uid());

-- Dealer can view user round history for their members
CREATE POLICY "Dealers can view member round history"
    ON user_round_history FOR SELECT
    USING (dealer_id = auth.uid());
