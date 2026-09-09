-- Migration: 198_add_financial_metrics_to_superadmin_rounds.sql
-- Description: Add financial summary metrics (total_commission, total_payout, transferred_amount, upstream_commission, net_profit)
-- to superadmin_get_dealer_rounds RPC so round cards can display profit/loss and net amounts.

DROP FUNCTION IF EXISTS public.superadmin_get_dealer_rounds(UUID);

CREATE OR REPLACE FUNCTION public.superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    dealer_id UUID,
    dealer_name TEXT,
    dealer_email TEXT,
    lottery_type TEXT,
    lottery_name TEXT,
    round_date DATE,
    open_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    status TEXT,
    is_result_announced BOOLEAN,
    winning_numbers JSONB,
    submission_count BIGINT,
    total_amount NUMERIC,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ,
    total_commission NUMERIC,
    total_payout NUMERIC,
    transferred_amount NUMERIC,
    upstream_commission NUMERIC,
    net_profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- Only superadmin allowed
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can access dealer rounds overview';
    END IF;

    RETURN QUERY
    SELECT 
        lr.id,
        lr.dealer_id,
        COALESCE(p.full_name, 'ไม่ระบุชื่อ') AS dealer_name,
        COALESCE(p.email, '') AS dealer_email,
        lr.lottery_type,
        COALESCE(lr.lottery_name, lr.lottery_type) AS lottery_name,
        lr.round_date,
        lr.open_time,
        lr.close_time,
        CASE 
            WHEN lr.status = 'announced' OR COALESCE(lr.is_result_announced, FALSE) = TRUE THEN 'announced'
            WHEN lr.status = 'closed' OR (lr.close_time IS NOT NULL AND lr.close_time < NOW()) THEN 'closed'
            ELSE 'open'
        END AS status,
        COALESCE(lr.is_result_announced, FALSE) AS is_result_announced,
        COALESCE(lr.winning_numbers, '{}'::jsonb) AS winning_numbers,
        COALESCE(s.sub_count, 0::BIGINT) AS submission_count,
        COALESCE(s.total_amt, 0::NUMERIC) AS total_amount,
        EXISTS(SELECT 1 FROM public.round_history rh_check WHERE rh_check.round_id = lr.id) AS is_archived,
        lr.created_at,
        -- Financial metrics: fallback to round_history if already archived, otherwise aggregate active data
        COALESCE(rh.total_commission, s.total_comm, 0::NUMERIC) AS total_commission,
        COALESCE(rh.total_payout, s.total_payout, 0::NUMERIC) AS total_payout,
        COALESCE(rh.transferred_amount, bt.transferred_amt, 0::NUMERIC) AS transferred_amount,
        COALESCE(rh.upstream_commission, bt.upstream_comm, 0::NUMERIC) AS upstream_commission,
        COALESCE(
            rh.profit,
            (
                (COALESCE(s.total_amt, 0::NUMERIC) - COALESCE(s.total_comm, 0::NUMERIC) - COALESCE(s.total_payout, 0::NUMERIC))
                + (-COALESCE(bt.transferred_amt, 0::NUMERIC) + COALESCE(bt.upstream_comm, 0::NUMERIC))
            )
        ) AS net_profit
    FROM public.lottery_rounds lr
    JOIN public.profiles p ON p.id = lr.dealer_id
    LEFT JOIN (
        SELECT 
            submissions.round_id,
            COUNT(submissions.id) AS sub_count,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN submissions.amount ELSE 0 END) AS total_amt,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN COALESCE(submissions.commission_amount, 0) ELSE 0 END) AS total_comm,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE AND submissions.is_winner = TRUE THEN COALESCE(submissions.prize_amount, 0) ELSE 0 END) AS total_payout
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    LEFT JOIN (
        SELECT
            bet_transfers.round_id,
            SUM(bet_transfers.amount) AS transferred_amt,
            ROUND(SUM(bet_transfers.amount) * (25.0 / 120.0)) AS upstream_comm
        FROM public.bet_transfers
        GROUP BY bet_transfers.round_id
    ) bt ON bt.round_id = lr.id
    LEFT JOIN public.round_history rh ON rh.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.close_time DESC, lr.round_date DESC, lr.created_at DESC;
END;
$$;
