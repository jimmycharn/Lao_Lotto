-- =============================================
-- SUPER ADMIN SYSTEM - Database Schema
-- =============================================
-- Run this AFTER 020_add_dealer_bank_accounts.sql
-- =============================================

-- =============================================
-- 1. SYSTEM SETTINGS TABLE (ค่าตั้งระบบ Super Admin)
-- =============================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('default_trial_days', '30', 'จำนวนวันทดลองใช้งานเริ่มต้น'),
  ('auto_deactivation_days', '3', 'จำนวนวันหลังหมดอายุก่อน deactivate อัตโนมัติ'),
  ('default_currency', '"THB"', 'สกุลเงินหลักของระบบ'),
  ('currency_symbol', '"฿"', 'สัญลักษณ์สกุลเงิน')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- 2. SUBSCRIPTION PACKAGES TABLE (แพ็คเกจที่เปิดให้เลือก)
-- =============================================
CREATE TABLE IF NOT EXISTS subscription_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Billing Model
  billing_model TEXT NOT NULL CHECK (billing_model IN ('per_device', 'package', 'percentage')),
  
  -- Pricing (Thai Baht)
  monthly_price DECIMAL(12,2) DEFAULT 0,
  yearly_price DECIMAL(12,2) DEFAULT 0,
  percentage_rate DECIMAL(5,2) DEFAULT 0, -- สำหรับ percentage model (%)
  
  -- Device/User Limits
  dealer_count INTEGER DEFAULT 1, -- จำนวน dealer ที่รวมในแพ็คเกจ
  max_users INTEGER DEFAULT 0, -- จำนวน user สูงสุดที่รวม (0 = unlimited)
  extra_user_price DECIMAL(12,2) DEFAULT 0, -- ราคาต่อ user เพิ่มเติม
  
  -- Features
  features JSONB DEFAULT '[]', -- รายการ features ที่รวม
  
  -- Display
  is_featured BOOLEAN DEFAULT FALSE, -- แพ็คเกจแนะนำ
  sort_order INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for subscription_packages
ALTER TABLE subscription_packages ENABLE ROW LEVEL SECURITY;

-- Everyone can view active packages
CREATE POLICY "Anyone can view active packages" ON subscription_packages
  FOR SELECT USING (is_active = TRUE);

-- SuperAdmin can manage all packages
CREATE POLICY "SuperAdmin can manage packages" ON subscription_packages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- 3. DEALER SUBSCRIPTIONS TABLE (subscription ของแต่ละ dealer)
-- =============================================
CREATE TABLE IF NOT EXISTS dealer_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES subscription_packages(id) ON DELETE SET NULL,
  
  -- Package snapshot (เก็บข้อมูล ณ เวลาที่สมัคร)
  package_snapshot JSONB, -- เก็บ copy ของ package เผื่อ package เปลี่ยนแปลง
  
  -- Billing
  billing_model TEXT NOT NULL CHECK (billing_model IN ('per_device', 'package', 'percentage')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Trial
  is_trial BOOLEAN DEFAULT FALSE,
  trial_days INTEGER DEFAULT 30,
  
  -- Custom settings
  custom_trial_days INTEGER, -- ถ้ากำหนดเอง
  custom_deactivation_days INTEGER, -- ถ้ากำหนดเอง
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active',      -- ใช้งานปกติ
    'trial',       -- ทดลองใช้
    'pending',     -- รอชำระเงิน
    'expired',     -- หมดอายุ
    'suspended',   -- ระงับชั่วคราว
    'cancelled'    -- ยกเลิก
  )),
  
  -- Auto-renew
  auto_renew BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for dealer_subscriptions
ALTER TABLE dealer_subscriptions ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own subscriptions
CREATE POLICY "Dealers can view own subscriptions" ON dealer_subscriptions
  FOR SELECT USING (auth.uid() = dealer_id);

-- SuperAdmin can manage all subscriptions
CREATE POLICY "SuperAdmin can manage subscriptions" ON dealer_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- 4. INVOICES TABLE (ใบแจ้งหนี้)
-- =============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL,
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES dealer_subscriptions(id) ON DELETE SET NULL,
  
  -- Billing Period
  billing_period_start DATE,
  billing_period_end DATE,
  
  -- Amounts (Thai Baht)
  base_amount DECIMAL(12,2) DEFAULT 0, -- ค่าแพ็คเกจพื้นฐาน
  extra_users_count INTEGER DEFAULT 0, -- จำนวน user เกิน
  extra_users_amount DECIMAL(12,2) DEFAULT 0, -- ค่า user เกิน
  percentage_amount DECIMAL(12,2) DEFAULT 0, -- ค่า % (สำหรับ percentage model)
  percentage_base_amount DECIMAL(12,2) DEFAULT 0, -- ยอดที่ใช้คำนวณ %
  discount_amount DECIMAL(12,2) DEFAULT 0, -- ส่วนลด
  discount_reason TEXT,
  total_amount DECIMAL(12,2) NOT NULL, -- ยอดรวมที่ต้องชำระ
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'draft',     -- ร่าง
    'pending',   -- รอชำระ
    'paid',      -- ชำระแล้ว
    'overdue',   -- เกินกำหนด
    'cancelled', -- ยกเลิก
    'refunded'   -- คืนเงิน
  )),
  
  -- Dates
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,
  
  -- Notes
  notes TEXT,
  internal_notes TEXT, -- หมายเหตุสำหรับ admin
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own invoices
CREATE POLICY "Dealers can view own invoices" ON invoices
  FOR SELECT USING (auth.uid() = dealer_id);

-- SuperAdmin can manage all invoices
CREATE POLICY "SuperAdmin can manage invoices" ON invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- 5. PAYMENTS TABLE (การชำระเงิน)
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Amount
  amount DECIMAL(12,2) NOT NULL,
  
  -- Payment Details
  payment_method TEXT CHECK (payment_method IN (
    'bank_transfer',   -- โอนธนาคาร
    'promptpay',       -- PromptPay
    'cash',            -- เงินสด
    'credit',          -- เครดิต/ส่วนลด
    'other'            -- อื่นๆ
  )),
  payment_reference TEXT, -- เลขอ้างอิง/เลขสลิป
  payment_proof_url TEXT, -- URL รูปหลักฐาน
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  
  -- Bank info (สำหรับ bank_transfer)
  bank_name TEXT,
  account_number TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',    -- รอตรวจสอบ
    'confirmed',  -- ยืนยันแล้ว
    'rejected'    -- ปฏิเสธ
  )),
  
  -- Confirmation
  confirmed_by UUID REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own payments
CREATE POLICY "Dealers can view own payments" ON payments
  FOR SELECT USING (auth.uid() = dealer_id);

-- Dealers can insert payments (แนบหลักฐาน)
CREATE POLICY "Dealers can insert payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = dealer_id);

-- SuperAdmin can manage all payments
CREATE POLICY "SuperAdmin can manage payments" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- 6. DEALER ACTIVITY LOG (ประวัติกิจกรรม)
-- =============================================
CREATE TABLE IF NOT EXISTS dealer_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  action TEXT NOT NULL CHECK (action IN (
    'subscription_created',
    'subscription_renewed',
    'subscription_expired',
    'subscription_suspended',
    'subscription_cancelled',
    'subscription_activated',
    'trial_started',
    'trial_ended',
    'payment_submitted',
    'payment_confirmed',
    'payment_rejected',
    'invoice_generated',
    'manual_activation',
    'manual_deactivation',
    'auto_deactivation'
  )),
  
  description TEXT,
  metadata JSONB, -- ข้อมูลเพิ่มเติม
  
  performed_by UUID REFERENCES profiles(id), -- ใครทำ (null = system)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for dealer_activity_log
ALTER TABLE dealer_activity_log ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own activity
CREATE POLICY "Dealers can view own activity" ON dealer_activity_log
  FOR SELECT USING (auth.uid() = dealer_id);

-- SuperAdmin can view and manage all activity
CREATE POLICY "SuperAdmin can manage activity" ON dealer_activity_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- =============================================
-- 7. ADD COLUMNS TO PROFILES TABLE
-- =============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' 
  CHECK (subscription_status IN ('active', 'trial', 'pending', 'expired', 'suspended', 'inactive'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- =============================================
-- 8. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_subscription_packages_active ON subscription_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_dealer_subscriptions_dealer ON dealer_subscriptions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_subscriptions_status ON dealer_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_dealer_subscriptions_end_date ON dealer_subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_invoices_dealer ON invoices(dealer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_dealer ON payments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_dealer_activity_log_dealer ON dealer_activity_log(dealer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- =============================================
-- 9. TRIGGERS
-- =============================================
CREATE TRIGGER update_subscription_packages_updated_at
  BEFORE UPDATE ON subscription_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dealer_subscriptions_updated_at
  BEFORE UPDATE ON dealer_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 10. HELPER FUNCTIONS
-- =============================================

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  v_year TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE);
  
  v_number := 'INV-' || v_year || v_month || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Function to check and update dealer subscription status
CREATE OR REPLACE FUNCTION check_dealer_subscription_status(p_dealer_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_subscription dealer_subscriptions%ROWTYPE;
  v_deactivation_days INTEGER;
  v_new_status TEXT;
BEGIN
  -- Get latest subscription
  SELECT * INTO v_subscription
  FROM dealer_subscriptions
  WHERE dealer_id = p_dealer_id
  ORDER BY end_date DESC
  LIMIT 1;
  
  IF v_subscription IS NULL THEN
    v_new_status := 'inactive';
  ELSIF v_subscription.status = 'trial' THEN
    IF CURRENT_DATE > v_subscription.end_date THEN
      v_new_status := 'expired';
    ELSE
      v_new_status := 'trial';
    END IF;
  ELSIF v_subscription.status = 'active' THEN
    IF CURRENT_DATE > v_subscription.end_date THEN
      v_new_status := 'expired';
    ELSE
      v_new_status := 'active';
    END IF;
  ELSE
    v_new_status := v_subscription.status;
  END IF;
  
  -- Update profile
  UPDATE profiles SET subscription_status = v_new_status WHERE id = p_dealer_id;
  
  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate percentage revenue for a dealer in a period
CREATE OR REPLACE FUNCTION calculate_dealer_revenue(
  p_dealer_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(s.amount), 0) INTO v_total
  FROM submissions s
  JOIN lottery_rounds lr ON lr.id = s.round_id
  WHERE lr.dealer_id = p_dealer_id
    AND s.is_deleted = FALSE
    AND s.created_at::DATE >= p_start_date
    AND s.created_at::DATE <= p_end_date;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 11. INITIAL PACKAGES (ตัวอย่างแพ็คเกจ)
-- =============================================
INSERT INTO subscription_packages (name, description, billing_model, monthly_price, yearly_price, max_users, features, is_featured, sort_order) VALUES
  ('เริ่มต้น', 'เหมาะสำหรับผู้เริ่มต้น รองรับลูกค้า 10 คน', 'package', 500, 5000, 10, '["รองรับลูกค้า 10 คน", "หวย 4 ประเภท", "รายงานพื้นฐาน"]', FALSE, 1),
  ('มาตรฐาน', 'เหมาะสำหรับธุรกิจขนาดกลาง รองรับลูกค้า 50 คน', 'package', 1500, 15000, 50, '["รองรับลูกค้า 50 คน", "หวย 4 ประเภท", "รายงานระดับกลาง", "Export PDF"]', TRUE, 2),
  ('พรีเมียม', 'ไม่จำกัดลูกค้า เหมาะสำหรับธุรกิจขนาดใหญ่', 'package', 3000, 30000, 0, '["ไม่จำกัดลูกค้า", "หวย 4 ประเภท", "รายงานขั้นสูง", "Export PDF", "Priority Support"]', FALSE, 3)
ON CONFLICT DO NOTHING;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE subscription_packages IS 'แพ็คเกจสมัครสมาชิกที่ Super Admin สร้าง';
COMMENT ON TABLE dealer_subscriptions IS 'การสมัครสมาชิกของแต่ละ dealer';
COMMENT ON TABLE invoices IS 'ใบแจ้งหนี้ทั้งหมด';
COMMENT ON TABLE payments IS 'การชำระเงินทั้งหมด';
COMMENT ON TABLE dealer_activity_log IS 'ประวัติกิจกรรมของ dealer';
COMMENT ON TABLE system_settings IS 'ค่าตั้งระบบสำหรับ Super Admin';
