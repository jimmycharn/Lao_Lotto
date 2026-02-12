-- Migration: Add immediate billing cycle option for percentage packages
-- =====================================================

-- 1. Update billing_cycle constraint to include 'immediate' option
ALTER TABLE dealer_subscriptions 
DROP CONSTRAINT IF EXISTS dealer_subscriptions_billing_cycle_check;

ALTER TABLE dealer_subscriptions 
ADD CONSTRAINT dealer_subscriptions_billing_cycle_check 
CHECK (billing_cycle IN ('monthly', 'yearly', 'immediate'));

COMMENT ON COLUMN dealer_subscriptions.billing_cycle IS 'รอบการเรียกเก็บ: monthly=รายเดือน, yearly=รายปี, immediate=เก็บทันทีหลังปิดงวด';

-- 2. Create dealer_billing_records table for tracking billing/payment records
CREATE TABLE IF NOT EXISTS dealer_billing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Dealer info
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES dealer_subscriptions(id) ON DELETE SET NULL,
    
    -- Round info (for immediate billing)
    round_id UUID REFERENCES lottery_rounds(id) ON DELETE SET NULL,
    
    -- Billing details
    billing_type TEXT NOT NULL CHECK (billing_type IN ('immediate', 'monthly', 'yearly')),
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    
    -- Amount details
    total_volume DECIMAL(15,2) DEFAULT 0, -- ยอดขายรวม
    chargeable_volume DECIMAL(15,2) DEFAULT 0, -- ยอดที่คิดค่าธรรมเนียม (หลังหัก min_amount)
    percentage_rate DECIMAL(5,2) DEFAULT 0, -- อัตราเปอร์เซ็นต์
    amount DECIMAL(15,2) NOT NULL, -- จำนวนเงินที่ต้องชำระ
    
    -- Payment status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',      -- รอชำระ
        'paid',         -- ชำระแล้ว
        'deducted',     -- หักจากเครดิตแล้ว
        'cancelled',    -- ยกเลิก
        'overdue'       -- เกินกำหนด
    )),
    
    -- Payment details
    paid_at TIMESTAMPTZ,
    paid_amount DECIMAL(15,2),
    payment_method TEXT, -- 'credit_deduction', 'bank_transfer', 'cash', etc.
    payment_reference TEXT,
    payment_note TEXT,
    
    -- Credit deduction details
    credit_deducted DECIMAL(15,2) DEFAULT 0,
    credit_balance_before DECIMAL(15,2),
    credit_balance_after DECIMAL(15,2),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    
    -- Description
    description TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_billing_records_dealer ON dealer_billing_records(dealer_id);
CREATE INDEX IF NOT EXISTS idx_billing_records_round ON dealer_billing_records(round_id);
CREATE INDEX IF NOT EXISTS idx_billing_records_status ON dealer_billing_records(status);
CREATE INDEX IF NOT EXISTS idx_billing_records_created ON dealer_billing_records(created_at DESC);

-- Enable RLS
ALTER TABLE dealer_billing_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Super admin can see all
CREATE POLICY "Super admin can manage all billing records"
ON dealer_billing_records
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
    )
);

-- Dealers can see their own billing records
CREATE POLICY "Dealers can view own billing records"
ON dealer_billing_records
FOR SELECT
TO authenticated
USING (dealer_id = auth.uid());

-- 3. Add default_billing_cycle to subscription_packages
ALTER TABLE subscription_packages 
ADD COLUMN IF NOT EXISTS default_billing_cycle TEXT DEFAULT 'monthly' 
CHECK (default_billing_cycle IN ('monthly', 'yearly', 'immediate'));

COMMENT ON COLUMN subscription_packages.default_billing_cycle IS 'รอบการเรียกเก็บเริ่มต้นสำหรับแพ็คเกจนี้';

-- 4. Function to create billing record when round is closed (for immediate billing)
CREATE OR REPLACE FUNCTION create_immediate_billing_record(
    p_round_id UUID,
    p_dealer_id UUID
) RETURNS UUID AS $$
DECLARE
    v_subscription RECORD;
    v_credit RECORD;
    v_total_volume DECIMAL(15,2);
    v_chargeable_volume DECIMAL(15,2);
    v_min_amount DECIMAL(15,2);
    v_percentage_rate DECIMAL(5,2);
    v_amount DECIMAL(15,2);
    v_billing_id UUID;
    v_credit_before DECIMAL(15,2);
    v_credit_after DECIMAL(15,2);
BEGIN
    -- Get dealer's subscription
    SELECT ds.*, sp.percentage_rate, sp.min_amount_before_charge
    INTO v_subscription
    FROM dealer_subscriptions ds
    JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE ds.dealer_id = p_dealer_id
    AND ds.status IN ('active', 'trial')
    AND ds.billing_cycle = 'immediate'
    ORDER BY ds.created_at DESC
    LIMIT 1;
    
    -- If no immediate billing subscription, return null
    IF v_subscription IS NULL THEN
        RETURN NULL;
    END IF;
    
    v_percentage_rate := COALESCE(v_subscription.percentage_rate, 0);
    v_min_amount := COALESCE(v_subscription.min_amount_before_charge, 0);
    
    -- Calculate total volume for this round
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_volume
    FROM submissions
    WHERE round_id = p_round_id
    AND is_deleted = false;
    
    -- Calculate chargeable volume (apply min_amount threshold)
    IF v_total_volume > v_min_amount THEN
        v_chargeable_volume := v_total_volume - v_min_amount;
    ELSE
        v_chargeable_volume := 0;
    END IF;
    
    -- Calculate amount
    v_amount := v_chargeable_volume * (v_percentage_rate / 100);
    
    -- If no amount to charge, skip
    IF v_amount <= 0 THEN
        RETURN NULL;
    END IF;
    
    -- Get current credit balance
    SELECT balance INTO v_credit_before
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    v_credit_before := COALESCE(v_credit_before, 0);
    
    -- Deduct from credit
    UPDATE dealer_credits
    SET balance = balance - v_amount,
        pending_deduction = GREATEST(0, pending_deduction - v_amount),
        updated_at = NOW()
    WHERE dealer_id = p_dealer_id;
    
    -- Get new balance
    SELECT balance INTO v_credit_after
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    v_credit_after := COALESCE(v_credit_after, 0);
    
    -- Create credit transaction record
    INSERT INTO credit_transactions (
        dealer_id,
        transaction_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description
    ) VALUES (
        p_dealer_id,
        'deduction',
        -v_amount,
        v_credit_after,
        'round',
        p_round_id,
        'ค่าธรรมเนียมทันที (' || v_percentage_rate || '%) - งวด ' || p_round_id::TEXT
    );
    
    -- Create billing record
    INSERT INTO dealer_billing_records (
        dealer_id,
        subscription_id,
        round_id,
        billing_type,
        billing_period_start,
        billing_period_end,
        total_volume,
        chargeable_volume,
        percentage_rate,
        amount,
        status,
        paid_at,
        paid_amount,
        payment_method,
        credit_deducted,
        credit_balance_before,
        credit_balance_after,
        description
    ) VALUES (
        p_dealer_id,
        v_subscription.id,
        p_round_id,
        'immediate',
        NOW(),
        NOW(),
        v_total_volume,
        v_chargeable_volume,
        v_percentage_rate,
        v_amount,
        'deducted',
        NOW(),
        v_amount,
        'credit_deduction',
        v_amount,
        v_credit_before,
        v_credit_after,
        'หักค่าธรรมเนียมทันทีหลังปิดงวด'
    ) RETURNING id INTO v_billing_id;
    
    RETURN v_billing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_immediate_billing_record(UUID, UUID) TO authenticated;

-- 5. Function to auto-create subscription for new dealers
CREATE OR REPLACE FUNCTION auto_create_dealer_subscription()
RETURNS TRIGGER AS $$
DECLARE
    v_default_package_id UUID;
    v_default_billing_cycle TEXT;
    v_default_trial_days INTEGER;
    v_package RECORD;
    v_end_date DATE;
BEGIN
    -- Only trigger for dealers
    IF NEW.role != 'dealer' THEN
        RETURN NEW;
    END IF;
    
    -- Get default settings
    SELECT value::text INTO v_default_package_id
    FROM system_settings WHERE key = 'default_dealer_package';
    
    SELECT value::text INTO v_default_billing_cycle
    FROM system_settings WHERE key = 'default_billing_cycle';
    
    SELECT COALESCE(value::integer, 30) INTO v_default_trial_days
    FROM system_settings WHERE key = 'default_trial_days';
    
    -- Default values if not set
    v_default_billing_cycle := COALESCE(TRIM(BOTH '"' FROM v_default_billing_cycle), 'immediate');
    v_default_trial_days := COALESCE(v_default_trial_days, 30);
    
    -- If no default package, skip auto-creation
    IF v_default_package_id IS NULL OR v_default_package_id = '' THEN
        RETURN NEW;
    END IF;
    
    -- Remove quotes from UUID if present
    v_default_package_id := TRIM(BOTH '"' FROM v_default_package_id)::UUID;
    
    -- Get package info
    SELECT * INTO v_package
    FROM subscription_packages
    WHERE id = v_default_package_id AND is_active = true;
    
    IF v_package IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Calculate end date based on trial
    v_end_date := CURRENT_DATE + v_default_trial_days;
    
    -- Create subscription with trial status
    INSERT INTO dealer_subscriptions (
        dealer_id,
        package_id,
        billing_model,
        billing_cycle,
        start_date,
        end_date,
        is_trial,
        trial_days,
        status
    ) VALUES (
        NEW.id,
        v_default_package_id,
        v_package.billing_model,
        v_default_billing_cycle,
        CURRENT_DATE,
        v_end_date,
        true,
        v_default_trial_days,
        'trial'
    );
    
    -- Create dealer_credits record
    INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
    VALUES (NEW.id, 0, 0)
    ON CONFLICT (dealer_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto subscription
DROP TRIGGER IF EXISTS trigger_auto_dealer_subscription ON profiles;
CREATE TRIGGER trigger_auto_dealer_subscription
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_dealer_subscription();
