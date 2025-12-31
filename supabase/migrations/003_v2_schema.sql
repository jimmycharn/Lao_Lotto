-- =============================================
-- LAO LOTTO v2 - Database Schema Update
-- =============================================
-- Run this AFTER 001_initial_schema.sql
-- =============================================

-- =============================================
-- ADD dealer_id to profiles (for user-dealer relationship)
-- =============================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_profiles_dealer_id ON profiles(dealer_id);

-- =============================================
-- LOTTERY ROUNDS TABLE (งวดหวย - แทนที่ lottery_draws สำหรับ dealer)
-- =============================================
CREATE TABLE IF NOT EXISTS lottery_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- ประเภทหวย
  lottery_type TEXT NOT NULL DEFAULT 'lao' CHECK (lottery_type IN ('thai', 'lao', 'hanoi', 'yeekee', 'other')),
  lottery_name TEXT, -- ชื่อเรียกเอง เช่น "หวยลาว VIP"
  
  -- วันที่และเวลา
  round_date DATE NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  close_time TIMESTAMPTZ NOT NULL,
  delete_before_minutes INT DEFAULT 30, -- ลบได้ก่อนปิดกี่นาที
  
  -- ผลรางวัล (เก็บเป็น JSON)
  winning_numbers JSONB DEFAULT '{}',
  -- ตัวอย่าง: {"2_top": "47", "3_top": "892", "3_tod": ["289","928","892"], "2_bottom": "21"}
  
  -- สถานะ
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'announced')),
  is_result_announced BOOLEAN DEFAULT FALSE,
  
  -- สกุลเงิน
  currency_symbol TEXT DEFAULT '฿',
  currency_name TEXT DEFAULT 'บาท',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for lottery_rounds
ALTER TABLE lottery_rounds ENABLE ROW LEVEL SECURITY;

-- Dealer can manage their own rounds
CREATE POLICY "Dealers can manage own rounds" ON lottery_rounds
  FOR ALL USING (auth.uid() = dealer_id);

-- Users can view rounds from their dealer
CREATE POLICY "Users can view dealer rounds" ON lottery_rounds
  FOR SELECT USING (
    dealer_id IN (
      SELECT dealer_id FROM profiles WHERE id = auth.uid()
    )
  );

-- SuperAdmin can view all rounds
CREATE POLICY "Admins can view all rounds" ON lottery_rounds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- TYPE LIMITS TABLE (ค่าอั้นตามประเภท)
-- =============================================
CREATE TABLE IF NOT EXISTS type_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  
  bet_type TEXT NOT NULL CHECK (bet_type IN (
    '2_top', '2_bottom', 
    '3_top', '3_tod', '3_front', '3_back',
    '4_tod',
    '6_top'
  )),
  
  max_per_number DECIMAL(12, 2) NOT NULL, -- รับสูงสุดต่อเลข (เช่น เลข 3 ตัวรับตัวละ 100)
  payout_rate DECIMAL(8, 2) NOT NULL, -- อัตราจ่าย (เช่น 500 = จ่าย 500 เท่า)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(round_id, bet_type)
);

-- RLS for type_limits
ALTER TABLE type_limits ENABLE ROW LEVEL SECURITY;

-- Dealers can manage limits for their rounds
CREATE POLICY "Dealers can manage type limits" ON type_limits
  FOR ALL USING (
    round_id IN (
      SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
    )
  );

-- Users can view limits
CREATE POLICY "Users can view type limits" ON type_limits
  FOR SELECT USING (
    round_id IN (
      SELECT lr.id FROM lottery_rounds lr
      JOIN profiles p ON p.dealer_id = lr.dealer_id
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- NUMBER LIMITS TABLE (ค่าอั้นเฉพาะเลข)
-- =============================================
CREATE TABLE IF NOT EXISTS number_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  
  bet_type TEXT NOT NULL CHECK (bet_type IN (
    '2_top', '2_bottom', 
    '3_top', '3_tod', '3_front', '3_back',
    '4_tod',
    '6_top'
  )),
  
  numbers TEXT NOT NULL, -- เลขที่อั้น เช่น "123"
  max_amount DECIMAL(12, 2) NOT NULL, -- รับสูงสุดเฉพาะเลขนี้
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(round_id, bet_type, numbers)
);

-- RLS for number_limits
ALTER TABLE number_limits ENABLE ROW LEVEL SECURITY;

-- Dealers can manage number limits
CREATE POLICY "Dealers can manage number limits" ON number_limits
  FOR ALL USING (
    round_id IN (
      SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
    )
  );

-- Users can view number limits
CREATE POLICY "Users can view number limits" ON number_limits
  FOR SELECT USING (
    round_id IN (
      SELECT lr.id FROM lottery_rounds lr
      JOIN profiles p ON p.dealer_id = lr.dealer_id
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- SUBMISSIONS TABLE (รายการส่งเลข)
-- =============================================
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  bet_type TEXT NOT NULL CHECK (bet_type IN (
    '2_top', '2_bottom', 
    '3_top', '3_tod', '3_front', '3_back',
    '4_tod',
    '6_top'
  )),
  
  numbers TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  
  -- สถานะ
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  -- ผลรางวัล
  is_winner BOOLEAN DEFAULT FALSE,
  prize_amount DECIMAL(14, 2) DEFAULT 0,
  
  -- ค่าคอมมิชชั่น
  commission_rate DECIMAL(5, 2) DEFAULT 0, -- % คอม
  commission_amount DECIMAL(12, 2) DEFAULT 0, -- จำนวนเงินคอม
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for submissions
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own submissions
CREATE POLICY "Users can view own submissions" ON submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert submissions" ON submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions" ON submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- Dealers can view submissions for their rounds
CREATE POLICY "Dealers can view round submissions" ON submissions
  FOR SELECT USING (
    round_id IN (
      SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
    )
  );

-- Dealers can update submissions (for calculating winners)
CREATE POLICY "Dealers can update submissions" ON submissions
  FOR UPDATE USING (
    round_id IN (
      SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
    )
  );

-- SuperAdmin can view all
CREATE POLICY "Admins can view all submissions" ON submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- USER SETTINGS TABLE (ค่าคอมและอัตราจ่ายแต่ละ user)
-- =============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Commission rates (% ที่ user ได้)
  commission_rates JSONB DEFAULT '{
    "2_top": 10, "2_bottom": 10,
    "3_top": 10, "3_tod": 10, "3_front": 10, "3_back": 10,
    "4_tod": 10,
    "6_top": 10
  }',
  
  -- Payout rates (อัตราจ่ายเฉพาะ user นี้ ถ้าต่างจาก default)
  -- NULL = ใช้ค่าจาก type_limits
  custom_payout_rates JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, dealer_id)
);

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can view their own settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Dealers can manage settings for their users
CREATE POLICY "Dealers can manage user settings" ON user_settings
  FOR ALL USING (auth.uid() = dealer_id);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_dealer ON lottery_rounds(dealer_id);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_date ON lottery_rounds(round_date DESC);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_status ON lottery_rounds(status);
CREATE INDEX IF NOT EXISTS idx_submissions_round ON submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_type_limits_round ON type_limits(round_id);
CREATE INDEX IF NOT EXISTS idx_number_limits_round ON number_limits(round_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_dealer ON user_settings(dealer_id);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_lottery_rounds_updated_at
  BEFORE UPDATE ON lottery_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to check if a number exceeds limit
CREATE OR REPLACE FUNCTION check_number_limit(
  p_round_id UUID,
  p_bet_type TEXT,
  p_numbers TEXT,
  p_amount DECIMAL
) RETURNS TABLE (
  is_exceeded BOOLEAN,
  current_total DECIMAL,
  max_allowed DECIMAL,
  limit_type TEXT
) AS $$
DECLARE
  v_type_limit DECIMAL;
  v_number_limit DECIMAL;
  v_current_total DECIMAL;
  v_max_allowed DECIMAL;
BEGIN
  -- Get type limit
  SELECT max_per_number INTO v_type_limit
  FROM type_limits
  WHERE round_id = p_round_id AND bet_type = p_bet_type;
  
  -- Get specific number limit (if exists)
  SELECT max_amount INTO v_number_limit
  FROM number_limits
  WHERE round_id = p_round_id AND bet_type = p_bet_type AND numbers = p_numbers;
  
  -- Use the smaller limit
  v_max_allowed := COALESCE(v_number_limit, v_type_limit, 999999999);
  
  -- Get current total for this number
  SELECT COALESCE(SUM(amount), 0) INTO v_current_total
  FROM submissions
  WHERE round_id = p_round_id 
    AND bet_type = p_bet_type 
    AND numbers = p_numbers
    AND is_deleted = FALSE;
  
  -- Check if adding this amount would exceed
  RETURN QUERY SELECT 
    (v_current_total + p_amount) > v_max_allowed,
    v_current_total,
    v_max_allowed,
    CASE WHEN v_number_limit IS NOT NULL THEN 'number' ELSE 'type' END;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate winners for a round
CREATE OR REPLACE FUNCTION calculate_round_winners(p_round_id UUID) 
RETURNS INTEGER AS $$
DECLARE
  v_round lottery_rounds%ROWTYPE;
  v_submission RECORD;
  v_win_count INTEGER := 0;
  v_winning_number TEXT;
  v_payout_rate DECIMAL;
BEGIN
  -- Get round data
  SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL OR v_round.winning_numbers IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Loop through all submissions
  FOR v_submission IN 
    SELECT s.*, us.commission_rates
    FROM submissions s
    LEFT JOIN user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_round.dealer_id
    WHERE s.round_id = p_round_id AND s.is_deleted = FALSE
  LOOP
    -- Get winning number for this bet type
    v_winning_number := v_round.winning_numbers->>v_submission.bet_type;
    
    -- Check if winner (handle tod types with array)
    IF v_winning_number IS NOT NULL THEN
      -- For tod types, check if number is in array
      IF v_submission.bet_type LIKE '%_tod' AND jsonb_typeof(v_round.winning_numbers->v_submission.bet_type) = 'array' THEN
        IF v_submission.numbers = ANY(ARRAY(SELECT jsonb_array_elements_text(v_round.winning_numbers->v_submission.bet_type))) THEN
          -- Get payout rate
          SELECT payout_rate INTO v_payout_rate 
          FROM type_limits 
          WHERE round_id = p_round_id AND bet_type = v_submission.bet_type;
          
          -- Update as winner
          UPDATE submissions SET 
            is_winner = TRUE,
            prize_amount = v_submission.amount * COALESCE(v_payout_rate, 1)
          WHERE id = v_submission.id;
          
          v_win_count := v_win_count + 1;
        END IF;
      ELSE
        -- Direct match
        IF v_submission.numbers = v_winning_number THEN
          SELECT payout_rate INTO v_payout_rate 
          FROM type_limits 
          WHERE round_id = p_round_id AND bet_type = v_submission.bet_type;
          
          UPDATE submissions SET 
            is_winner = TRUE,
            prize_amount = v_submission.amount * COALESCE(v_payout_rate, 1)
          WHERE id = v_submission.id;
          
          v_win_count := v_win_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_win_count;
END;
$$ LANGUAGE plpgsql;
