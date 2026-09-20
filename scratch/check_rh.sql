SELECT 
    id, round_id, lottery_type, round_date, total_entries, total_amount, total_commission, total_payout, transferred_amount, upstream_commission, upstream_winnings, profit, created_at
FROM public.round_history 
WHERE dealer_id = 'cee2094a-580c-4a95-9bf4-e522e1e29e98'
ORDER BY round_date DESC, created_at DESC;
