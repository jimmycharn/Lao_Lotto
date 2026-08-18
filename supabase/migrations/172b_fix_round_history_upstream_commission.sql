-- =============================================
-- Fix round_history upstream_commission for past archived rounds
-- =============================================
-- For archived rounds where upstream_commission was stored as 0
-- but transferred_amount > 0, update upstream_commission based on
-- 25 Baht per 120 Baht set (4_set standard rate: 25/120 = ~20.83%)

UPDATE round_history
SET upstream_commission = ROUND(transferred_amount * (25.0 / 120.0)),
    profit = (total_amount - COALESCE(total_commission, 0) - COALESCE(total_payout, 0)) + (-transferred_amount + ROUND(transferred_amount * (25.0 / 120.0)) + COALESCE(upstream_winnings, 0))
WHERE (upstream_commission IS NULL OR upstream_commission = 0) AND transferred_amount > 0;
