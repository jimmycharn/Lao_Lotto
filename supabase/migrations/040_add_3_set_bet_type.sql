-- Migration: Add 3_set bet type to constraints
-- =====================================================

-- 1. submissions
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_bet_type_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_bet_type_check CHECK (bet_type IN (
    'run_top', 'run_bottom',
    'front_top_1', 'middle_top_1', 'back_top_1',
    'front_bottom_1', 'back_bottom_1',
    'pak_top', 'pak_bottom',
    '2_top', '2_bottom', '2_front', '2_back', '2_spread', '2_have', '2_run', '2_center', '2_front_single',
    '2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev',
    '3_top', '3_tod', '3_front', '3_back', '3_bottom', '3_straight', '3_tod_single',
    '3_set', '3_straight_set', '3_tod_set',
    '4_top', '4_tod', '4_set', '4_float', '4_run',
    '5_float', '5_run',
    '6_top'
));

-- 2. type_limits
ALTER TABLE type_limits DROP CONSTRAINT IF EXISTS type_limits_bet_type_check;
ALTER TABLE type_limits ADD CONSTRAINT type_limits_bet_type_check CHECK (bet_type IN (
    'run_top', 'run_bottom',
    'front_top_1', 'middle_top_1', 'back_top_1',
    'front_bottom_1', 'back_bottom_1',
    'pak_top', 'pak_bottom',
    '2_top', '2_bottom', '2_front', '2_back', '2_spread', '2_have', '2_run', '2_center', '2_front_single',
    '2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev',
    '3_top', '3_tod', '3_front', '3_back', '3_bottom', '3_straight', '3_tod_single',
    '3_set', '3_straight_set', '3_tod_set',
    '4_top', '4_tod', '4_set', '4_float', '4_run',
    '5_float', '5_run',
    '6_top'
));

-- 3. number_limits
ALTER TABLE number_limits DROP CONSTRAINT IF EXISTS number_limits_bet_type_check;
ALTER TABLE number_limits ADD CONSTRAINT number_limits_bet_type_check CHECK (bet_type IN (
    'run_top', 'run_bottom',
    'front_top_1', 'middle_top_1', 'back_top_1',
    'front_bottom_1', 'back_bottom_1',
    'pak_top', 'pak_bottom',
    '2_top', '2_bottom', '2_front', '2_back', '2_spread', '2_have', '2_run', '2_center', '2_front_single',
    '2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev',
    '3_top', '3_tod', '3_front', '3_back', '3_bottom', '3_straight', '3_tod_single',
    '3_set', '3_straight_set', '3_tod_set',
    '4_top', '4_tod', '4_set', '4_float', '4_run',
    '5_float', '5_run',
    '6_top'
));

-- 4. bet_transfers (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bet_transfers') THEN
        ALTER TABLE bet_transfers DROP CONSTRAINT IF EXISTS bet_transfers_bet_type_check;
        ALTER TABLE bet_transfers ADD CONSTRAINT bet_transfers_bet_type_check CHECK (bet_type IN (
            'run_top', 'run_bottom',
            'front_top_1', 'middle_top_1', 'back_top_1',
            'front_bottom_1', 'back_bottom_1',
            'pak_top', 'pak_bottom',
            '2_top', '2_bottom', '2_front', '2_back', '2_spread', '2_have', '2_run', '2_center', '2_front_single',
            '2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev',
            '3_top', '3_tod', '3_front', '3_back', '3_bottom', '3_straight', '3_tod_single',
            '3_set', '3_straight_set', '3_tod_set',
            '4_top', '4_tod', '4_set', '4_float', '4_run',
            '5_float', '5_run',
            '6_top'
        ));
    END IF;
END $$;
