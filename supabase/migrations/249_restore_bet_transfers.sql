-- Migration 249: Restore outgoing bet_transfers for rounds a58d4ec9 and dc9cfe88
-- Restores transfers to upstream dealer 'พี่จิ้ม อ้อมค่าย'

DO $$
DECLARE
    v_batch_dc UUID := gen_random_uuid();
    v_batch_a5 UUID := gen_random_uuid();
BEGIN
    -- 1. Restore transfers for round dc9cfe88-714c-42ee-ad5e-d200e940fde4 (31 ส.ค. 2569)
    -- Total transfer: 8,608 (3_top: 8,508 @ 35% comm = 2,977.8 | 2_bottom: 100 @ 25% comm = 25 | Total comm: 3,003)
    IF NOT EXISTS (
        SELECT 1 FROM public.bet_transfers 
        WHERE round_id = 'dc9cfe88-714c-42ee-ad5e-d200e940fde4'
    ) THEN
        INSERT INTO public.bet_transfers (
            id,
            round_id,
            bet_type,
            numbers,
            amount,
            status,
            is_linked,
            target_dealer_name,
            target_dealer_contact,
            transfer_batch_id,
            created_at,
            updated_at
        ) VALUES 
        (
            gen_random_uuid(),
            'dc9cfe88-714c-42ee-ad5e-d200e940fde4',
            '3_top',
            '212',
            8508,
            'active',
            false,
            'พี่จิ้ม อ้อมค่าย',
            '0887533184',
            v_batch_dc,
            '2026-09-01 07:00:00+00',
            '2026-09-01 07:00:00+00'
        ),
        (
            gen_random_uuid(),
            'dc9cfe88-714c-42ee-ad5e-d200e940fde4',
            '2_bottom',
            '04',
            100,
            'active',
            false,
            'พี่จิ้ม อ้อมค่าย',
            '0887533184',
            v_batch_dc,
            '2026-09-01 07:00:00+00',
            '2026-09-01 07:00:00+00'
        );
    END IF;

    -- 2. Restore transfers for round a58d4ec9-74e4-4525-acf1-282ba7d18f63 (16 ก.ย. 2569)
    -- Total transfer: 9,342 (3_top: 9,145 @ 35% comm = 3,200.75 | 2_bottom: 197 @ 25% comm = 49.25 | Total comm: 3,250)
    IF NOT EXISTS (
        SELECT 1 FROM public.bet_transfers 
        WHERE round_id = 'a58d4ec9-74e4-4525-acf1-282ba7d18f63'
    ) THEN
        INSERT INTO public.bet_transfers (
            id,
            round_id,
            bet_type,
            numbers,
            amount,
            status,
            is_linked,
            target_dealer_name,
            target_dealer_contact,
            transfer_batch_id,
            created_at,
            updated_at
        ) VALUES 
        (
            gen_random_uuid(),
            'a58d4ec9-74e4-4525-acf1-282ba7d18f63',
            '3_top',
            '640',
            9145,
            'active',
            false,
            'พี่จิ้ม อ้อมค่าย',
            '0887533184',
            v_batch_a5,
            '2026-09-16 07:00:00+00',
            '2026-09-16 07:00:00+00'
        ),
        (
            gen_random_uuid(),
            'a58d4ec9-74e4-4525-acf1-282ba7d18f63',
            '2_bottom',
            '64',
            197,
            'active',
            false,
            'พี่จิ้ม อ้อมค่าย',
            '0887533184',
            v_batch_a5,
            '2026-09-16 07:00:00+00',
            '2026-09-16 07:00:00+00'
        );
    END IF;

END $$;

NOTIFY pgrst, 'reload schema';
