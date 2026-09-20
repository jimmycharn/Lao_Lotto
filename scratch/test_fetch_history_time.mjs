import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const dealerId = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';

async function fetchAllRows(queryFn) {
    let allData = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data, error } = await queryFn(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return { data: allData };
}

async function testFetchRoundHistory() {
    const t0 = Date.now();
    console.log('Starting simulated fetchRoundHistory...');
    
    const [
        { data: dbHistoryList },
        { data: activeClosedRounds },
        { data: dealerUserSettings },
        { data: allUserHistories },
        { data: allMemberPayments },
        { data: allUpstreamPayments }
    ] = await Promise.all([
        fetchAllRows((from, to) =>
            supabase.from('round_history').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }).range(from, to)
        ),
        supabase.from('lottery_rounds').select('*').eq('dealer_id', dealerId).in('status', ['closed', 'announced']).order('close_time', { ascending: false }),
        supabase.from('user_settings').select('*').eq('dealer_id', dealerId),
        fetchAllRows((from, to) =>
            supabase.from('user_round_history').select('id, round_id, user_id, total_amount, total_commission, total_winnings, lottery_type, round_date, total_entries, open_time, close_time, lottery_name, winning_numbers').eq('dealer_id', dealerId).order('created_at', { ascending: false }).range(from, to)
        ),
        fetchAllRows((from, to) =>
            supabase.from('member_round_payments').select('id, round_id, user_id, amount, direction, payment_type, paid_at, notes, lottery_type, round_date').eq('dealer_id', dealerId).order('created_at', { ascending: false }).range(from, to)
        ),
        fetchAllRows((from, to) =>
            supabase.from('upstream_round_payments').select('id, round_id, upstream_dealer_name, amount, direction, payment_type, paid_at, notes, lottery_type, round_date').eq('dealer_id', dealerId).order('created_at', { ascending: false }).range(from, to)
        )
    ]);
    
    console.log(`Parallel fetch completed in ${Date.now() - t0} ms`);
    console.log(`dbHistoryList: ${dbHistoryList?.length}, activeClosedRounds: ${activeClosedRounds?.length}, allUserHistories: ${allUserHistories?.length}`);
    
    // Check active closed rounds processing
    for (const round of (activeClosedRounds || [])) {
        const { data: subs } = await fetchAllRows((from, to) =>
            supabase.from('submissions').select('amount, commission_amount, prize_amount, is_winner, bet_type, numbers, is_deleted, user_id').eq('round_id', round.id).eq('is_deleted', false).range(from, to)
        );
        console.log(`Round ${round.id} subs: ${subs?.length}`);
    }
    
    console.log(`Total fetchRoundHistory time: ${Date.now() - t0} ms`);
}

testFetchRoundHistory();
