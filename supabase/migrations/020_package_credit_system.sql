-- Package and Credit System for Dealers
-- This migration creates tables for managing dealer packages and credits

-- =====================================================
-- 1. PACKAGES TABLE - Define package types and rates
-- =====================================================
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Percentage fee charged on volume
    fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    
    -- Threshold for dealer's own input (only charge on amount exceeding this)
    dealer_input_threshold DECIMAL(15,2) NOT NULL DEFAULT 100000,
    
    -- Whether this package is active
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Package features (JSON for flexibility)
    features JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. DEALER_CREDITS TABLE - Track dealer credit balance
-- =====================================================
CREATE TABLE IF NOT EXISTS dealer_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Current credit balance
    balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Package assigned to this dealer
    package_id UUID REFERENCES packages(id),
    
    -- Credit status
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason TEXT,
    blocked_at TIMESTAMPTZ,
    
    -- Low credit warning threshold
    warning_threshold DECIMAL(15,2) DEFAULT 1000,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(dealer_id)
);

-- =====================================================
-- 3. CREDIT_TRANSACTIONS TABLE - Track all credit changes
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Transaction type: 'topup', 'deduction', 'refund', 'adjustment'
    transaction_type TEXT NOT NULL,
    
    -- Amount (positive for topup, negative for deduction)
    amount DECIMAL(15,2) NOT NULL,
    
    -- Balance after this transaction
    balance_after DECIMAL(15,2) NOT NULL,
    
    -- Reference to what caused this transaction
    reference_type TEXT, -- 'round', 'bank_transfer', 'admin_topup', 'admin_adjustment'
    reference_id UUID,
    
    -- Who performed this transaction
    performed_by UUID REFERENCES profiles(id),
    
    -- Additional details
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ROUND_VOLUME_SUMMARY TABLE - Track volume per round per dealer
-- =====================================================
CREATE TABLE IF NOT EXISTS round_volume_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Volume breakdown
    dealer_input_volume DECIMAL(15,2) DEFAULT 0,      -- Dealer's own input
    member_input_volume DECIMAL(15,2) DEFAULT 0,      -- From dealer's members
    upstream_volume DECIMAL(15,2) DEFAULT 0,          -- From other dealers
    
    -- Total volume (sum of above, but dealer_input only counts excess over threshold)
    total_chargeable_volume DECIMAL(15,2) DEFAULT 0,
    
    -- Fee calculation
    fee_percentage DECIMAL(5,2),
    fee_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Status
    is_charged BOOLEAN DEFAULT FALSE,
    charged_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(round_id, dealer_id)
);

-- =====================================================
-- 5. BANK_TRANSFERS TABLE - Track bank transfers for auto-topup
-- =====================================================
CREATE TABLE IF NOT EXISTS bank_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Transfer details
    bank_name TEXT,
    account_number TEXT,
    transfer_amount DECIMAL(15,2) NOT NULL,
    transfer_date TIMESTAMPTZ,
    transfer_reference TEXT,
    
    -- Matching to dealer
    dealer_id UUID REFERENCES profiles(id),
    matched_at TIMESTAMPTZ,
    matched_by TEXT, -- 'auto' or admin user_id
    
    -- Status: 'pending', 'matched', 'rejected', 'processed'
    status TEXT DEFAULT 'pending',
    
    -- If processed, link to credit transaction
    credit_transaction_id UUID REFERENCES credit_transactions(id),
    
    -- Additional info
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_dealer_credits_dealer_id ON dealer_credits(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_dealer_id ON credit_transactions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_round_volume_summary_round_id ON round_volume_summary(round_id);
CREATE INDEX IF NOT EXISTS idx_round_volume_summary_dealer_id ON round_volume_summary(dealer_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_status ON bank_transfers(status);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_dealer_id ON bank_transfers(dealer_id);

-- =====================================================
-- DEFAULT PACKAGE
-- =====================================================
INSERT INTO packages (name, description, fee_percentage, dealer_input_threshold, features)
VALUES (
    'Standard',
    'แพ็คเกจมาตรฐาน - คิดค่าบริการ 0.5% จากยอดที่วิ่งผ่าน',
    0.5,
    100000,
    '{"max_members": 100, "max_upstream_dealers": 10}'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get dealer's current credit balance
CREATE OR REPLACE FUNCTION get_dealer_credit(p_dealer_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_balance DECIMAL;
BEGIN
    SELECT balance INTO v_balance
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check if dealer has sufficient credit for estimated volume
CREATE OR REPLACE FUNCTION check_dealer_credit(p_dealer_id UUID, p_estimated_fee DECIMAL DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
    v_credit dealer_credits%ROWTYPE;
    v_result JSONB;
BEGIN
    SELECT * INTO v_credit
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    IF v_credit IS NULL THEN
        -- No credit record, create one with 0 balance
        INSERT INTO dealer_credits (dealer_id, balance)
        VALUES (p_dealer_id, 0)
        RETURNING * INTO v_credit;
    END IF;
    
    v_result := jsonb_build_object(
        'balance', v_credit.balance,
        'is_blocked', v_credit.is_blocked,
        'blocked_reason', v_credit.blocked_reason,
        'warning_threshold', v_credit.warning_threshold,
        'has_sufficient_credit', (v_credit.balance >= p_estimated_fee AND NOT v_credit.is_blocked),
        'is_low_credit', (v_credit.balance <= v_credit.warning_threshold)
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to add credit (topup)
CREATE OR REPLACE FUNCTION add_dealer_credit(
    p_dealer_id UUID,
    p_amount DECIMAL,
    p_transaction_type TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_credit dealer_credits%ROWTYPE;
    v_new_balance DECIMAL;
    v_transaction_id UUID;
BEGIN
    -- Get or create credit record
    SELECT * INTO v_credit
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    IF v_credit IS NULL THEN
        INSERT INTO dealer_credits (dealer_id, balance)
        VALUES (p_dealer_id, 0)
        RETURNING * INTO v_credit;
    END IF;
    
    -- Calculate new balance
    v_new_balance := v_credit.balance + p_amount;
    
    -- Update credit balance
    UPDATE dealer_credits
    SET 
        balance = v_new_balance,
        updated_at = NOW(),
        -- Unblock if was blocked due to insufficient credit and now has credit
        is_blocked = CASE 
            WHEN is_blocked AND blocked_reason = 'insufficient_credit' AND v_new_balance > 0 
            THEN FALSE 
            ELSE is_blocked 
        END,
        blocked_reason = CASE 
            WHEN is_blocked AND blocked_reason = 'insufficient_credit' AND v_new_balance > 0 
            THEN NULL 
            ELSE blocked_reason 
        END,
        blocked_at = CASE 
            WHEN is_blocked AND blocked_reason = 'insufficient_credit' AND v_new_balance > 0 
            THEN NULL 
            ELSE blocked_at 
        END
    WHERE dealer_id = p_dealer_id;
    
    -- Record transaction
    INSERT INTO credit_transactions (
        dealer_id,
        transaction_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        performed_by,
        description
    ) VALUES (
        p_dealer_id,
        p_transaction_type,
        p_amount,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        p_performed_by,
        p_description
    ) RETURNING id INTO v_transaction_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'transaction_id', v_transaction_id,
        'previous_balance', v_credit.balance,
        'amount', p_amount,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql;

-- Function to deduct credit
CREATE OR REPLACE FUNCTION deduct_dealer_credit(
    p_dealer_id UUID,
    p_amount DECIMAL,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_credit dealer_credits%ROWTYPE;
    v_new_balance DECIMAL;
    v_transaction_id UUID;
BEGIN
    -- Get credit record
    SELECT * INTO v_credit
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    IF v_credit IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No credit record found'
        );
    END IF;
    
    -- Calculate new balance (allow negative for tracking purposes)
    v_new_balance := v_credit.balance - p_amount;
    
    -- Update credit balance
    UPDATE dealer_credits
    SET 
        balance = v_new_balance,
        updated_at = NOW(),
        -- Block if balance goes to 0 or negative
        is_blocked = CASE WHEN v_new_balance <= 0 THEN TRUE ELSE is_blocked END,
        blocked_reason = CASE WHEN v_new_balance <= 0 THEN 'insufficient_credit' ELSE blocked_reason END,
        blocked_at = CASE WHEN v_new_balance <= 0 AND NOT is_blocked THEN NOW() ELSE blocked_at END
    WHERE dealer_id = p_dealer_id;
    
    -- Record transaction
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
        -p_amount,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        p_description
    ) RETURNING id INTO v_transaction_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'transaction_id', v_transaction_id,
        'previous_balance', v_credit.balance,
        'amount', -p_amount,
        'new_balance', v_new_balance,
        'is_blocked', (v_new_balance <= 0)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to calculate and record round volume for a dealer
CREATE OR REPLACE FUNCTION calculate_round_volume(p_round_id UUID, p_dealer_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_dealer_input DECIMAL := 0;
    v_member_input DECIMAL := 0;
    v_upstream_volume DECIMAL := 0;
    v_total_chargeable DECIMAL := 0;
    v_threshold DECIMAL;
    v_fee_percentage DECIMAL;
    v_fee_amount DECIMAL;
    v_package packages%ROWTYPE;
    v_credit dealer_credits%ROWTYPE;
BEGIN
    -- Get dealer's package
    SELECT p.* INTO v_package
    FROM packages p
    JOIN dealer_credits dc ON dc.package_id = p.id
    WHERE dc.dealer_id = p_dealer_id;
    
    -- Use default values if no package assigned
    v_threshold := COALESCE(v_package.dealer_input_threshold, 100000);
    v_fee_percentage := COALESCE(v_package.fee_percentage, 0.5);
    
    -- Calculate dealer's own input (submissions where dealer entered for themselves)
    SELECT COALESCE(SUM(amount), 0) INTO v_dealer_input
    FROM submissions
    WHERE round_id = p_round_id
      AND dealer_id = p_dealer_id
      AND user_id = p_dealer_id  -- Dealer entered for themselves
      AND is_deleted = FALSE;
    
    -- Calculate member input (submissions from dealer's members)
    SELECT COALESCE(SUM(amount), 0) INTO v_member_input
    FROM submissions s
    JOIN profiles p ON s.user_id = p.id
    WHERE s.round_id = p_round_id
      AND s.dealer_id = p_dealer_id
      AND s.user_id != p_dealer_id  -- Not dealer's own input
      AND p.dealer_id = p_dealer_id  -- User is member of this dealer
      AND s.is_deleted = FALSE;
    
    -- Calculate upstream volume (submissions from other dealers)
    SELECT COALESCE(SUM(amount), 0) INTO v_upstream_volume
    FROM submissions s
    JOIN profiles p ON s.user_id = p.id
    WHERE s.round_id = p_round_id
      AND s.dealer_id = p_dealer_id
      AND s.user_id != p_dealer_id
      AND (p.dealer_id IS NULL OR p.dealer_id != p_dealer_id)  -- User is NOT member of this dealer (likely another dealer)
      AND s.is_deleted = FALSE;
    
    -- Calculate total chargeable volume
    -- Dealer input: only count amount exceeding threshold
    v_total_chargeable := GREATEST(v_dealer_input - v_threshold, 0) + v_member_input + v_upstream_volume;
    
    -- Calculate fee
    v_fee_amount := v_total_chargeable * (v_fee_percentage / 100);
    
    -- Upsert volume summary
    INSERT INTO round_volume_summary (
        round_id,
        dealer_id,
        dealer_input_volume,
        member_input_volume,
        upstream_volume,
        total_chargeable_volume,
        fee_percentage,
        fee_amount
    ) VALUES (
        p_round_id,
        p_dealer_id,
        v_dealer_input,
        v_member_input,
        v_upstream_volume,
        v_total_chargeable,
        v_fee_percentage,
        v_fee_amount
    )
    ON CONFLICT (round_id, dealer_id) DO UPDATE SET
        dealer_input_volume = EXCLUDED.dealer_input_volume,
        member_input_volume = EXCLUDED.member_input_volume,
        upstream_volume = EXCLUDED.upstream_volume,
        total_chargeable_volume = EXCLUDED.total_chargeable_volume,
        fee_percentage = EXCLUDED.fee_percentage,
        fee_amount = EXCLUDED.fee_amount,
        updated_at = NOW();
    
    RETURN jsonb_build_object(
        'dealer_input_volume', v_dealer_input,
        'member_input_volume', v_member_input,
        'upstream_volume', v_upstream_volume,
        'threshold', v_threshold,
        'dealer_input_chargeable', GREATEST(v_dealer_input - v_threshold, 0),
        'total_chargeable_volume', v_total_chargeable,
        'fee_percentage', v_fee_percentage,
        'fee_amount', v_fee_amount
    );
END;
$$ LANGUAGE plpgsql;

-- Function to charge dealer for a round (called when round is closed)
CREATE OR REPLACE FUNCTION charge_dealer_for_round(p_round_id UUID, p_dealer_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_summary round_volume_summary%ROWTYPE;
    v_deduction_result JSONB;
BEGIN
    -- Get or calculate volume summary
    SELECT * INTO v_summary
    FROM round_volume_summary
    WHERE round_id = p_round_id AND dealer_id = p_dealer_id;
    
    IF v_summary IS NULL THEN
        -- Calculate if not exists
        PERFORM calculate_round_volume(p_round_id, p_dealer_id);
        SELECT * INTO v_summary
        FROM round_volume_summary
        WHERE round_id = p_round_id AND dealer_id = p_dealer_id;
    END IF;
    
    -- Check if already charged
    IF v_summary.is_charged THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Already charged for this round'
        );
    END IF;
    
    -- Skip if no fee to charge
    IF v_summary.fee_amount <= 0 THEN
        UPDATE round_volume_summary
        SET is_charged = TRUE, charged_at = NOW()
        WHERE id = v_summary.id;
        
        RETURN jsonb_build_object(
            'success', TRUE,
            'fee_amount', 0,
            'message', 'No fee to charge'
        );
    END IF;
    
    -- Deduct credit
    v_deduction_result := deduct_dealer_credit(
        p_dealer_id,
        v_summary.fee_amount,
        'round',
        p_round_id,
        'ค่าบริการงวด ' || p_round_id::TEXT
    );
    
    -- Mark as charged
    UPDATE round_volume_summary
    SET is_charged = TRUE, charged_at = NOW()
    WHERE id = v_summary.id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'fee_amount', v_summary.fee_amount,
        'total_volume', v_summary.total_chargeable_volume,
        'deduction_result', v_deduction_result
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_volume_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfers ENABLE ROW LEVEL SECURITY;

-- Packages: Everyone can read, only superadmin can modify
CREATE POLICY "Packages are viewable by everyone" ON packages FOR SELECT USING (true);
CREATE POLICY "Only superadmin can modify packages" ON packages FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Dealer Credits: Dealers can view their own, superadmin can view all
CREATE POLICY "Dealers can view own credits" ON dealer_credits FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Only superadmin can modify credits" ON dealer_credits FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Credit Transactions: Dealers can view their own, superadmin can view all
CREATE POLICY "Dealers can view own transactions" ON credit_transactions FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Only system can insert transactions" ON credit_transactions FOR INSERT 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Round Volume Summary: Dealers can view their own, superadmin can view all
CREATE POLICY "Dealers can view own volume" ON round_volume_summary FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Bank Transfers: Dealers can view their own, superadmin can view/modify all
CREATE POLICY "Dealers can view own transfers" ON bank_transfers FOR SELECT 
    USING (dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));
CREATE POLICY "Only superadmin can modify transfers" ON bank_transfers FOR ALL 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_dealer_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_dealer_credit(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION add_dealer_credit(UUID, DECIMAL, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_dealer_credit(UUID, DECIMAL, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_round_volume(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION charge_dealer_for_round(UUID, UUID) TO authenticated;
