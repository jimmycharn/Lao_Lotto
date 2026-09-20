-- Migration 247: Restore deleted rounds into lottery_rounds and restore submissions from user_round_history
-- This restores the 4 rounds belonging to dealer cee2094a-580c-4a95-9bf4-e522e1e29e98 (จิมมี่ ชาน)

DO $$
DECLARE
    v_dealer_id UUID := 'cee2094a-580c-4a95-9bf4-e522e1e29e98';
    v_urh RECORD;
BEGIN
    -- 1. Restore round: a58d4ec9-74e4-4525-acf1-282ba7d18f63 (หวยไทย 16 ก.ย. 2569)
    INSERT INTO public.lottery_rounds (
        id,
        dealer_id,
        lottery_type,
        lottery_name,
        round_date,
        open_time,
        close_time,
        status,
        is_result_announced,
        winning_numbers,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        'a58d4ec9-74e4-4525-acf1-282ba7d18f63',
        v_dealer_id,
        'thai',
        'หวยไทย',
        '2026-09-16',
        '2026-09-14 23:00:00+00',
        '2026-09-16 07:05:00+00',
        'announced',
        true,
        '{"2_top": "40", "3_top": "640", "6_top": "730640", "2_bottom": "64", "3_bottom": []}'::jsonb,
        true,
        '2026-09-14 23:00:00+00',
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        is_result_announced = EXCLUDED.is_result_announced,
        winning_numbers = EXCLUDED.winning_numbers,
        is_active = true;

    -- 2. Restore round: dc9cfe88-714c-42ee-ad5e-d200e940fde4 (หวยไทย 31 ส.ค. 2569)
    INSERT INTO public.lottery_rounds (
        id,
        dealer_id,
        lottery_type,
        lottery_name,
        round_date,
        open_time,
        close_time,
        status,
        is_result_announced,
        winning_numbers,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        'dc9cfe88-714c-42ee-ad5e-d200e940fde4',
        v_dealer_id,
        'thai',
        'หวยไทย',
        '2026-08-31',
        '2026-08-30 23:00:00+00',
        '2026-09-01 16:59:59+00',
        'closed',
        true,
        '{"2_top": "12", "3_top": "212", "6_top": "417212", "2_bottom": "04", "3_bottom": []}'::jsonb,
        true,
        '2026-08-30 23:00:00+00',
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        is_result_announced = EXCLUDED.is_result_announced,
        winning_numbers = EXCLUDED.winning_numbers,
        is_active = true;

    -- 3. Restore round: 07418b1c-1fcd-4684-86fc-98bea943556b (หวยไทย 20 ก.ย. 2569)
    INSERT INTO public.lottery_rounds (
        id,
        dealer_id,
        lottery_type,
        lottery_name,
        round_date,
        open_time,
        close_time,
        status,
        is_result_announced,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        '07418b1c-1fcd-4684-86fc-98bea943556b',
        v_dealer_id,
        'thai',
        'หวยไทย',
        '2026-09-20',
        '2026-09-19 23:00:00+00',
        '2026-09-20 07:05:00+00',
        'open',
        false,
        true,
        '2026-09-19 23:00:00+00',
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        is_active = true;

    -- 4. Restore round: 33018669-c000-4e9f-8421-df6cd12c8643 (หวยไทย 20 ก.ย. 2569)
    INSERT INTO public.lottery_rounds (
        id,
        dealer_id,
        lottery_type,
        lottery_name,
        round_date,
        open_time,
        close_time,
        status,
        is_result_announced,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        '33018669-c000-4e9f-8421-df6cd12c8643',
        v_dealer_id,
        'thai',
        'หวยไทย',
        '2026-09-20',
        '2026-09-19 23:00:00+00',
        '2026-09-20 07:05:00+00',
        'open',
        false,
        true,
        '2026-09-19 23:00:00+00',
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        is_active = true;

    -- 5. Restore submissions for a58d4ec9 and dc9cfe88 based on user_round_history
    -- For each member, create records matching their total amount, commission, and winnings
    FOR v_urh IN 
        SELECT * FROM public.user_round_history 
        WHERE round_id IN ('a58d4ec9-74e4-4525-acf1-282ba7d18f63', 'dc9cfe88-714c-42ee-ad5e-d200e940fde4')
    LOOP
        -- Check if submissions already exist for this user in this round
        IF NOT EXISTS (
            SELECT 1 FROM public.submissions 
            WHERE round_id = v_urh.round_id AND user_id = v_urh.user_id
        ) THEN
            -- Insert a consolidated summary submission for this user
            INSERT INTO public.submissions (
                round_id,
                user_id,
                bet_type,
                numbers,
                amount,
                commission_amount,
                is_winner,
                prize_amount,
                is_deleted,
                created_at,
                updated_at
            ) VALUES (
                v_urh.round_id,
                v_urh.user_id,
                '2_top',
                COALESCE(v_urh.winning_numbers->>'2_top', '40'),
                COALESCE(v_urh.total_amount, 0),
                COALESCE(v_urh.total_commission, 0),
                (COALESCE(v_urh.total_winnings, 0) > 0),
                COALESCE(v_urh.total_winnings, 0),
                false,
                COALESCE(v_urh.created_at, NOW()),
                NOW()
            );
        END IF;
    END LOOP;

    -- 6. Re-create default type_limits for restored rounds if missing
    INSERT INTO public.type_limits (round_id, bet_type, max_per_number, payout_rate)
    SELECT r.id, t.bet_type, 0, t.payout
    FROM (
        SELECT 'a58d4ec9-74e4-4525-acf1-282ba7d18f63'::UUID AS id
        UNION ALL SELECT 'dc9cfe88-714c-42ee-ad5e-d200e940fde4'::UUID
        UNION ALL SELECT '07418b1c-1fcd-4684-86fc-98bea943556b'::UUID
        UNION ALL SELECT '33018669-c000-4e9f-8421-df6cd12c8643'::UUID
    ) r
    CROSS JOIN (
        VALUES 
            ('3_top', 550), ('3_tod', 100), ('2_top', 65), ('2_bottom', 65),
            ('run_top', 3), ('run_bottom', 4), ('3_front', 100), ('3_back', 135),
            ('3_bottom', 135), ('2_front', 65), ('2_center', 65), ('2_run', 10),
            ('pak_top', 8), ('pak_bottom', 6)
    ) AS t(bet_type, payout)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.type_limits tl 
        WHERE tl.round_id = r.id AND tl.bet_type = t.bet_type
    );

END $$;

-- 7. Also create a security definer verification RPC so we can verify the restored rounds
CREATE OR REPLACE FUNCTION public.debug_verify_restored_rounds(p_dealer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rounds JSONB;
    v_subs_count INT;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'lottery_name', r.lottery_name,
            'lottery_type', r.lottery_type,
            'round_date', r.round_date,
            'open_time', r.open_time,
            'close_time', r.close_time,
            'status', r.status,
            'is_result_announced', r.is_result_announced,
            'winning_numbers', r.winning_numbers,
            'is_active', r.is_active
        ) ORDER BY r.close_time DESC
    )
    INTO v_rounds
    FROM public.lottery_rounds r
    WHERE r.dealer_id = p_dealer_id;

    SELECT COUNT(*) INTO v_subs_count
    FROM public.submissions s
    JOIN public.lottery_rounds r ON r.id = s.round_id
    WHERE r.dealer_id = p_dealer_id;

    RETURN jsonb_build_object(
        'rounds', v_rounds,
        'total_submissions', v_subs_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_verify_restored_rounds(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
