-- =============================================
-- LAO LOTTO - Dealer Referral & Affiliate System
-- Migration: 187_add_dealer_referral_system.sql
-- =============================================

-- 1. Add referral_wallet_balance to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referral_wallet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- 2. Insert default settings into system_settings if not exist
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('default_dealer_referral_rate', '10.00', 'อัตราค่าคอมมิชชั่นแนะนำเจ้ามือเริ่มต้น (%)'),
    ('dealer_referral_enabled', 'true', 'เปิดใช้งานระบบแนะนำเจ้ามือ (true/false)')
ON CONFLICT (key) DO NOTHING;

-- 3. Create dealer_referrals table
CREATE TABLE IF NOT EXISTS public.dealer_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_dealer_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    commission_rate DECIMAL(5, 2) DEFAULT NULL, -- NULL means use system default rate
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dealer_referrals_referrer ON public.dealer_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_referrals_dealer ON public.dealer_referrals(referred_dealer_id);

-- 4. Create dealer_referral_commissions table
CREATE TABLE IF NOT EXISTS public.dealer_referral_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID REFERENCES public.dealer_referrals(id) ON DELETE SET NULL,
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID REFERENCES public.lottery_rounds(id) ON DELETE SET NULL,
    lottery_type TEXT,
    system_revenue DECIMAL(15, 2) NOT NULL,
    commission_rate DECIMAL(5, 2) NOT NULL,
    commission_amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_comm_referrer ON public.dealer_referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ref_comm_dealer ON public.dealer_referral_commissions(referred_dealer_id);
CREATE INDEX IF NOT EXISTS idx_ref_comm_round ON public.dealer_referral_commissions(round_id);

-- 5. Create referral_withdrawals table
CREATE TABLE IF NOT EXISTS public.referral_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    slip_url TEXT,
    rejected_reason TEXT,
    withdrawal_type TEXT NOT NULL DEFAULT 'cash' CHECK (withdrawal_type IN ('cash', 'convert_dealer_credit')),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_withdrawals_user ON public.referral_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_withdrawals_status ON public.referral_withdrawals(status);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.dealer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_withdrawals ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for dealer_referrals
DROP POLICY IF EXISTS "Referrers and dealers can view own referrals" ON public.dealer_referrals;
CREATE POLICY "Referrers and dealers can view own referrals" ON public.dealer_referrals
    FOR SELECT USING (
        auth.uid() = referrer_id 
        OR auth.uid() = referred_dealer_id 
        OR public.is_superadmin()
    );

DROP POLICY IF EXISTS "Superadmin can manage dealer_referrals" ON public.dealer_referrals;
CREATE POLICY "Superadmin can manage dealer_referrals" ON public.dealer_referrals
    FOR ALL USING (public.is_superadmin());

-- RLS for dealer_referral_commissions
DROP POLICY IF EXISTS "Referrers can view own referral commissions" ON public.dealer_referral_commissions;
CREATE POLICY "Referrers can view own referral commissions" ON public.dealer_referral_commissions
    FOR SELECT USING (
        auth.uid() = referrer_id 
        OR public.is_superadmin()
    );

DROP POLICY IF EXISTS "Superadmin can manage dealer_referral_commissions" ON public.dealer_referral_commissions;
CREATE POLICY "Superadmin can manage dealer_referral_commissions" ON public.dealer_referral_commissions
    FOR ALL USING (public.is_superadmin());

-- RLS for referral_withdrawals
DROP POLICY IF EXISTS "Users can view own referral withdrawals" ON public.referral_withdrawals;
CREATE POLICY "Users can view own referral withdrawals" ON public.referral_withdrawals
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_superadmin()
    );

DROP POLICY IF EXISTS "Users can insert own referral withdrawals" ON public.referral_withdrawals;
CREATE POLICY "Users can insert own referral withdrawals" ON public.referral_withdrawals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Superadmin can manage referral_withdrawals" ON public.referral_withdrawals;
CREATE POLICY "Superadmin can manage referral_withdrawals" ON public.referral_withdrawals
    FOR ALL USING (public.is_superadmin());

-- =============================================
-- 7. RPC FUNCTIONS
-- =============================================

-- Function: Bind referral relationship
CREATE OR REPLACE FUNCTION public.bind_dealer_referral(
    p_referred_dealer_id UUID,
    p_referrer_ref TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_referrer_id UUID;
    v_is_uuid BOOLEAN;
    v_default_rate DECIMAL(5, 2) := 10.00;
    v_enabled TEXT := 'true';
    v_new_id UUID;
BEGIN
    -- Check if feature enabled
    SELECT value INTO v_enabled FROM public.system_settings WHERE key = 'dealer_referral_enabled';
    IF v_enabled = 'false' THEN
        RETURN jsonb_build_object('success', false, 'message', 'ระบบแนะนำเจ้ามือปิดการใช้งานอยู่');
    END IF;

    -- Clean param
    p_referrer_ref := trim(p_referrer_ref);
    IF p_referrer_ref IS NULL OR p_referrer_ref = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่ระบุรหัสผู้แนะนำ');
    END IF;

    -- Resolve Referrer (by UUID or member_code)
    v_is_uuid := p_referrer_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    IF v_is_uuid THEN
        SELECT id INTO v_referrer_id FROM public.profiles WHERE id = p_referrer_ref::uuid;
    ELSE
        SELECT id INTO v_referrer_id FROM public.profiles WHERE member_code = p_referrer_ref;
    END IF;

    IF v_referrer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่พบข้อมูลผู้แนะนำ');
    END IF;

    -- Do not allow self-referral
    IF v_referrer_id = p_referred_dealer_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่สามารถแนะนำตัวเองได้');
    END IF;

    -- Get default rate
    SELECT COALESCE(NULLIF(value, '')::numeric, 10.00) INTO v_default_rate 
    FROM public.system_settings 
    WHERE key = 'default_dealer_referral_rate';

    -- Insert or ignore if already bound
    INSERT INTO public.dealer_referrals (
        referrer_id,
        referred_dealer_id,
        commission_rate,
        status
    ) VALUES (
        v_referrer_id,
        p_referred_dealer_id,
        v_default_rate,
        'active'
    )
    ON CONFLICT (referred_dealer_id) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'referral_id', v_new_id, 'referrer_id', v_referrer_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'ดีลเลอร์นี้มีผู้แนะนำอยู่แล้ว');
    END IF;
END;
$$;

-- Function: Process referral commission when credit is deducted from a round
CREATE OR REPLACE FUNCTION public.process_dealer_referral_commission(
    p_dealer_id UUID,
    p_round_id UUID,
    p_lottery_type TEXT,
    p_system_revenue DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_referral RECORD;
    v_comm_rate DECIMAL(5, 2);
    v_comm_amount DECIMAL(15, 2);
    v_default_rate DECIMAL(5, 2) := 10.00;
    v_enabled TEXT := 'true';
    v_comm_id UUID;
BEGIN
    -- Check if feature enabled
    SELECT value INTO v_enabled FROM public.system_settings WHERE key = 'dealer_referral_enabled';
    IF v_enabled = 'false' THEN
        RETURN jsonb_build_object('success', false, 'message', 'ระบบแนะนำเจ้ามือปิดอยู่');
    END IF;

    IF p_system_revenue IS NULL OR p_system_revenue <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่มีรายได้ระบบในงวดนี้');
    END IF;

    -- Find active referral relationship for this dealer
    SELECT * INTO v_referral
    FROM public.dealer_referrals
    WHERE referred_dealer_id = p_dealer_id AND status = 'active'
    LIMIT 1;

    IF v_referral IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'ดีลเลอร์รายนี้ไม่มีผู้แนะนำ');
    END IF;

    -- Determine commission rate
    IF v_referral.commission_rate IS NOT NULL AND v_referral.commission_rate > 0 THEN
        v_comm_rate := v_referral.commission_rate;
    ELSE
        SELECT COALESCE(NULLIF(value, '')::numeric, 10.00) INTO v_default_rate 
        FROM public.system_settings 
        WHERE key = 'default_dealer_referral_rate';
        v_comm_rate := v_default_rate;
    END IF;

    -- Calculate commission
    v_comm_amount := ROUND((p_system_revenue * (v_comm_rate / 100.0)), 2);

    IF v_comm_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'ยอดคอมมิชชั่นเป็น 0');
    END IF;

    -- Insert commission ledger
    INSERT INTO public.dealer_referral_commissions (
        referral_id,
        referrer_id,
        referred_dealer_id,
        round_id,
        lottery_type,
        system_revenue,
        commission_rate,
        commission_amount,
        status
    ) VALUES (
        v_referral.id,
        v_referral.referrer_id,
        p_dealer_id,
        p_round_id,
        p_lottery_type,
        p_system_revenue,
        v_comm_rate,
        v_comm_amount,
        'completed'
    )
    RETURNING id INTO v_comm_id;

    -- Update referrer wallet balance
    UPDATE public.profiles
    SET referral_wallet_balance = COALESCE(referral_wallet_balance, 0.00) + v_comm_amount
    WHERE id = v_referral.referrer_id;

    RETURN jsonb_build_object(
        'success', true,
        'commission_id', v_comm_id,
        'referrer_id', v_referral.referrer_id,
        'commission_rate', v_comm_rate,
        'commission_amount', v_comm_amount,
        'system_revenue', p_system_revenue
    );
END;
$$;

-- Function: Request referral withdrawal (for Member or Dealer)
CREATE OR REPLACE FUNCTION public.request_referral_withdrawal(
    p_amount DECIMAL,
    p_bank_name TEXT,
    p_account_number TEXT,
    p_account_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_bal DECIMAL(15, 2);
    v_withdrawal_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'กรุณาเข้าสู่ระบบก่อนทำรายการ');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'กรุณาระบุจำนวนเงินที่ถูกต้อง');
    END IF;

    -- Check current balance
    SELECT COALESCE(referral_wallet_balance, 0.00) INTO v_current_bal
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_current_bal < p_amount THEN
        RETURN jsonb_build_object('success', false, 'message', 'ยอดเงินในกระเป๋าค่าแนะนำไม่เพียงพอ');
    END IF;

    -- Deduct from wallet balance
    UPDATE public.profiles
    SET referral_wallet_balance = v_current_bal - p_amount
    WHERE id = v_user_id;

    -- Insert withdrawal request
    INSERT INTO public.referral_withdrawals (
        user_id,
        amount,
        bank_name,
        account_number,
        account_name,
        status,
        withdrawal_type
    ) VALUES (
        v_user_id,
        p_amount,
        trim(p_bank_name),
        trim(p_account_number),
        trim(p_account_name),
        'pending',
        'cash'
    )
    RETURNING id INTO v_withdrawal_id;

    RETURN jsonb_build_object(
        'success', true,
        'withdrawal_id', v_withdrawal_id,
        'remaining_balance', v_current_bal - p_amount
    );
END;
$$;

-- Function: Reject referral withdrawal (Superadmin only - refunds back to wallet)
CREATE OR REPLACE FUNCTION public.reject_referral_withdrawal(
    p_withdrawal_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_w RECORD;
BEGIN
    IF NOT public.is_superadmin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'เฉพาะ Super Admin เท่านั้นที่ทำรายการนี้ได้');
    END IF;

    SELECT * INTO v_w 
    FROM public.referral_withdrawals 
    WHERE id = p_withdrawal_id AND status = 'pending'
    FOR UPDATE;

    IF v_w IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่พบคำขอถอนเงินที่รอดำเนินการ');
    END IF;

    -- Refund back to profile referral wallet
    UPDATE public.profiles
    SET referral_wallet_balance = COALESCE(referral_wallet_balance, 0.00) + v_w.amount
    WHERE id = v_w.user_id;

    -- Update withdrawal record
    UPDATE public.referral_withdrawals
    SET 
        status = 'rejected',
        rejected_reason = trim(p_reason),
        processed_at = NOW(),
        processed_by = v_admin_id
    WHERE id = p_withdrawal_id;

    RETURN jsonb_build_object('success', true, 'message', 'ปฏิเสธคำขอและคืนเงินเข้ากระเป๋าเรียบร้อยแล้ว');
END;
$$;

-- Function: Approve referral withdrawal (Superadmin only)
CREATE OR REPLACE FUNCTION public.approve_referral_withdrawal(
    p_withdrawal_id UUID,
    p_slip_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_w RECORD;
BEGIN
    IF NOT public.is_superadmin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'เฉพาะ Super Admin เท่านั้นที่ทำรายการนี้ได้');
    END IF;

    SELECT * INTO v_w 
    FROM public.referral_withdrawals 
    WHERE id = p_withdrawal_id AND status = 'pending'
    FOR UPDATE;

    IF v_w IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'ไม่พบคำขอถอนเงินที่รอดำเนินการ');
    END IF;

    -- Update withdrawal record
    UPDATE public.referral_withdrawals
    SET 
        status = 'approved',
        slip_url = p_slip_url,
        processed_at = NOW(),
        processed_by = v_admin_id
    WHERE id = p_withdrawal_id;

    RETURN jsonb_build_object('success', true, 'message', 'อนุมัติการถอนเงินเรียบร้อยแล้ว');
END;
$$;

-- Function: Convert referral balance to dealer credit (Dealer only)
CREATE OR REPLACE FUNCTION public.convert_referral_to_dealer_credit(
    p_amount DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_current_bal DECIMAL(15, 2);
    v_dealer_credit_bal DECIMAL(15, 2);
    v_new_credit_bal DECIMAL(15, 2);
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'กรุณาเข้าสู่ระบบก่อนทำรายการ');
    END IF;

    SELECT role, COALESCE(referral_wallet_balance, 0.00) 
    INTO v_role, v_current_bal
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_role != 'dealer' THEN
        RETURN jsonb_build_object('success', false, 'message', 'เฉพาะบัญชี Dealer เท่านั้นที่สามารถแปลงเป็นเครดิตดีลเลอร์ได้');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'กรุณาระบุจำนวนเงินที่ถูกต้อง');
    END IF;

    IF v_current_bal < p_amount THEN
        RETURN jsonb_build_object('success', false, 'message', 'ยอดเงินในกระเป๋าค่าแนะนำไม่เพียงพอ');
    END IF;

    -- Deduct from referral wallet
    UPDATE public.profiles
    SET referral_wallet_balance = v_current_bal - p_amount
    WHERE id = v_user_id;

    -- Add to dealer_credits
    SELECT COALESCE(balance, 0.00) INTO v_dealer_credit_bal
    FROM public.dealer_credits
    WHERE dealer_id = v_user_id
    FOR UPDATE;

    IF v_dealer_credit_bal IS NULL THEN
        INSERT INTO public.dealer_credits (dealer_id, balance)
        VALUES (v_user_id, p_amount)
        RETURNING balance INTO v_new_credit_bal;
    ELSE
        UPDATE public.dealer_credits
        SET balance = balance + p_amount
        WHERE dealer_id = v_user_id
        RETURNING balance INTO v_new_credit_bal;
    END IF;

    -- Record credit transaction
    INSERT INTO public.credit_transactions (
        dealer_id,
        transaction_type,
        amount,
        balance_after,
        reference_type,
        description,
        performed_by
    ) VALUES (
        v_user_id,
        'topup',
        p_amount,
        v_new_credit_bal,
        'referral_conversion',
        'แปลงค่าคอมมิชชั่นแนะนำเจ้ามือเข้าเครดิตร้าน',
        v_user_id
    );

    -- Record in referral_withdrawals as completed conversion
    INSERT INTO public.referral_withdrawals (
        user_id,
        amount,
        bank_name,
        account_number,
        account_name,
        status,
        withdrawal_type,
        processed_at,
        processed_by
    ) VALUES (
        v_user_id,
        p_amount,
        'DEALER_CREDIT',
        'CREDIT_WALLET',
        'แปลงเป็นเครดิตร้าน',
        'approved',
        'convert_dealer_credit',
        NOW(),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'converted_amount', p_amount,
        'new_referral_balance', v_current_bal - p_amount,
        'new_dealer_credit', v_new_credit_bal
    );
END;
$$;
