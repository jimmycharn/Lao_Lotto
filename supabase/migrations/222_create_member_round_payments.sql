-- Migration 222: Create member_round_payments table
CREATE TABLE IF NOT EXISTS public.member_round_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID NOT NULL,
    lottery_type TEXT,
    round_date DATE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('net_settlement', 'prize_payout')),
    direction TEXT NOT NULL CHECK (direction IN ('member_to_dealer', 'dealer_to_member')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_member_round_payments_lookup 
ON public.member_round_payments(dealer_id, round_id, user_id);

ALTER TABLE public.member_round_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can view and manage their member round payments" ON public.member_round_payments;
CREATE POLICY "Dealers can view and manage their member round payments"
ON public.member_round_payments
FOR ALL
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

DROP POLICY IF EXISTS "Superadmins have full access to member round payments" ON public.member_round_payments;
CREATE POLICY "Superadmins have full access to member round payments"
ON public.member_round_payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    )
);
