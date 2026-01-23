-- Admin Bank Accounts and Credit Topup System
-- Run this in Supabase SQL Editor

-- 1. ADMIN BANK ACCOUNTS TABLE (บัญชีธนาคารของ Super Admin)
CREATE TABLE IF NOT EXISTS admin_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_code TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DEALER BANK ASSIGNMENTS TABLE (ผูกบัญชีธนาคารกับ Dealer)
CREATE TABLE IF NOT EXISTS dealer_bank_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES admin_bank_accounts(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(dealer_id, bank_account_id)
);

-- 3. CREDIT TOPUP REQUESTS TABLE (คำขอเติมเครดิต + ข้อมูลสลิป)
CREATE TABLE IF NOT EXISTS credit_topup_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES admin_bank_accounts(id),
    amount DECIMAL(15,2) NOT NULL,
    slip_image_url TEXT,
    slip_data JSONB,
    trans_ref TEXT,
    trans_date TEXT,
    trans_time TEXT,
    sender_name TEXT,
    sender_account TEXT,
    receiver_name TEXT,
    receiver_account TEXT,
    status TEXT DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES profiles(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. USED SLIPS TABLE (เก็บ transRef เพื่อป้องกันสลิปซ้ำ)
CREATE TABLE IF NOT EXISTS used_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trans_ref TEXT NOT NULL UNIQUE,
    topup_request_id UUID REFERENCES credit_topup_requests(id),
    dealer_id UUID REFERENCES profiles(id),
    amount DECIMAL(15,2),
    used_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_admin_bank_accounts_active ON admin_bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_dealer_bank_assignments_dealer ON dealer_bank_assignments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_bank_assignments_bank ON dealer_bank_assignments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_credit_topup_requests_dealer ON credit_topup_requests(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_topup_requests_status ON credit_topup_requests(status);
CREATE INDEX IF NOT EXISTS idx_credit_topup_requests_trans_ref ON credit_topup_requests(trans_ref);
CREATE INDEX IF NOT EXISTS idx_used_slips_trans_ref ON used_slips(trans_ref);

-- RLS POLICIES
ALTER TABLE admin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_bank_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE used_slips ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Superadmin can manage bank accounts" ON admin_bank_accounts;
DROP POLICY IF EXISTS "Dealers can view assigned bank accounts" ON admin_bank_accounts;
DROP POLICY IF EXISTS "Superadmin can manage assignments" ON dealer_bank_assignments;
DROP POLICY IF EXISTS "Dealers can view own assignments" ON dealer_bank_assignments;
DROP POLICY IF EXISTS "Dealers can create topup requests" ON credit_topup_requests;
DROP POLICY IF EXISTS "Dealers can view own topup requests" ON credit_topup_requests;
DROP POLICY IF EXISTS "Superadmin can manage topup requests" ON credit_topup_requests;
DROP POLICY IF EXISTS "System can manage used slips" ON used_slips;

-- Admin Bank Accounts Policies
CREATE POLICY "Superadmin can manage bank accounts" ON admin_bank_accounts FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Dealers can view assigned bank accounts" ON admin_bank_accounts FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM dealer_bank_assignments dba 
            WHERE dba.bank_account_id = admin_bank_accounts.id 
            AND dba.dealer_id = auth.uid() 
            AND dba.is_active = true
        )
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Dealer Bank Assignments Policies
CREATE POLICY "Superadmin can manage assignments" ON dealer_bank_assignments FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Dealers can view own assignments" ON dealer_bank_assignments FOR SELECT 
    USING (dealer_id = auth.uid());

-- Credit Topup Requests Policies
CREATE POLICY "Dealers can create topup requests" ON credit_topup_requests FOR INSERT 
    WITH CHECK (dealer_id = auth.uid());

CREATE POLICY "Dealers can view own topup requests" ON credit_topup_requests FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Superadmin can manage topup requests" ON credit_topup_requests FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Used Slips Policies
CREATE POLICY "System can manage used slips" ON used_slips FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('superadmin', 'dealer')));

-- Function to check if slip is already used
CREATE OR REPLACE FUNCTION check_slip_used(p_trans_ref TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM used_slips WHERE trans_ref = p_trans_ref);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process topup after slip verification
CREATE OR REPLACE FUNCTION process_credit_topup(
    p_topup_request_id UUID,
    p_trans_ref TEXT,
    p_amount DECIMAL
)
RETURNS JSONB AS $$
DECLARE
    v_dealer_id UUID;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Check if slip already used
    IF EXISTS (SELECT 1 FROM used_slips WHERE trans_ref = p_trans_ref) THEN
        RETURN jsonb_build_object('success', false, 'error', 'สลิปนี้ถูกใช้ไปแล้ว');
    END IF;

    -- Get dealer_id from topup request
    SELECT dealer_id INTO v_dealer_id FROM credit_topup_requests WHERE id = p_topup_request_id;
    
    IF v_dealer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่พบคำขอเติมเครดิต');
    END IF;

    -- Get current balance
    SELECT balance INTO v_current_balance FROM dealer_credits WHERE dealer_id = v_dealer_id;
    
    IF v_current_balance IS NULL THEN
        -- Create new credit record
        INSERT INTO dealer_credits (dealer_id, balance) VALUES (v_dealer_id, p_amount);
        v_new_balance := p_amount;
    ELSE
        -- Update existing balance
        v_new_balance := v_current_balance + p_amount;
        UPDATE dealer_credits SET balance = v_new_balance, is_blocked = false, updated_at = NOW() 
        WHERE dealer_id = v_dealer_id;
    END IF;

    -- Record the used slip
    INSERT INTO used_slips (trans_ref, topup_request_id, dealer_id, amount)
    VALUES (p_trans_ref, p_topup_request_id, v_dealer_id, p_amount);

    -- Update topup request status
    UPDATE credit_topup_requests 
    SET status = 'approved', verified_at = NOW(), updated_at = NOW()
    WHERE id = p_topup_request_id;

    -- Record transaction
    INSERT INTO credit_transactions (dealer_id, transaction_type, amount, balance_after, reference_type, reference_id, description)
    VALUES (v_dealer_id, 'topup', p_amount, v_new_balance, 'topup_request', p_topup_request_id, 'เติมเครดิตผ่านสลิป');

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bank codes reference (Thai banks)
COMMENT ON TABLE admin_bank_accounts IS 'Bank codes: 002=BBL, 004=KBANK, 006=KTB, 011=TMB, 014=SCB, 025=BAY, 030=GSB, 069=KKP';

-- 9. CREATE STORAGE BUCKET FOR SLIPS
INSERT INTO storage.buckets (id, name, public)
VALUES ('slips', 'slips', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for slips bucket
CREATE POLICY "Anyone can view slips" ON storage.objects
    FOR SELECT USING (bucket_id = 'slips');

CREATE POLICY "Authenticated users can upload slips" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'slips' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own slips" ON storage.objects
    FOR UPDATE USING (bucket_id = 'slips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own slips" ON storage.objects
    FOR DELETE USING (bucket_id = 'slips' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 10. FUNCTION TO APPROVE TOPUP REQUEST (for Admin)
CREATE OR REPLACE FUNCTION approve_topup_request(
    p_request_id UUID,
    p_approved_by UUID
)
RETURNS jsonb AS $$
DECLARE
    v_request RECORD;
    v_new_balance DECIMAL(15,2);
BEGIN
    -- Get request details
    SELECT * INTO v_request FROM credit_topup_requests WHERE id = p_request_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request not found');
    END IF;
    
    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request already processed');
    END IF;
    
    -- Update request status
    UPDATE credit_topup_requests 
    SET status = 'approved', 
        verified_at = NOW(),
        verified_by = p_approved_by
    WHERE id = p_request_id;
    
    -- Update dealer credit
    INSERT INTO dealer_credits (dealer_id, balance)
    VALUES (v_request.dealer_id, v_request.amount)
    ON CONFLICT (dealer_id) DO UPDATE
    SET balance = dealer_credits.balance + v_request.amount,
        is_blocked = false,
        updated_at = NOW();
    
    -- Get new balance
    SELECT balance INTO v_new_balance FROM dealer_credits WHERE dealer_id = v_request.dealer_id;
    
    -- Record transaction
    INSERT INTO credit_transactions (dealer_id, transaction_type, amount, balance_after, description, performed_by)
    VALUES (v_request.dealer_id, 'topup', v_request.amount, v_new_balance, 'เติมเครดิตจากสลิป', p_approved_by);
    
    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. FUNCTION TO REJECT TOPUP REQUEST (for Admin)
CREATE OR REPLACE FUNCTION reject_topup_request(
    p_request_id UUID,
    p_rejected_by UUID,
    p_reason TEXT DEFAULT 'ไม่ผ่านการตรวจสอบ'
)
RETURNS jsonb AS $$
BEGIN
    UPDATE credit_topup_requests 
    SET status = 'rejected', 
        reject_reason = p_reason,
        verified_at = NOW(),
        verified_by = p_rejected_by
    WHERE id = p_request_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request not found or already processed');
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
