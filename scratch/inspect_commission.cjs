const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
env.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function run() {
    // 1. Find profile for "พี่อิ๋ว"
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .or('full_name.ilike.%อิ๋ว%,line_display_name.ilike.%อิ๋ว%');
    console.log('Profiles found:', profiles?.map(p => ({ id: p.id, name: p.full_name, line: p.line_display_name })));

    if (!profiles || profiles.length === 0) return;
    const userId = profiles[0].id;

    // 2. Find round 2026-09-16
    const { data: rounds } = await supabase
        .from('lottery_rounds')
        .select('id, round_date, lottery_type, status, set_prices, close_time')
        .eq('lottery_type', 'thai')
        .order('round_date', { ascending: false })
        .limit(5);
    console.log('Thai rounds found:', rounds);

    // 3. Find user_round_history for this user
    const { data: urh } = await supabase
        .from('user_round_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
    console.log('user_round_history for user:', urh);

    // 4. Find submissions for 2026-09-16 Thai round
    const round16 = rounds?.find(r => r.round_date === '2026-09-16' || r.close_time?.startsWith('2026-09-16'));
    if (round16) {
        const { data: subs, count } = await supabase
            .from('submissions')
            .select('id, bet_type, numbers, amount, commission_amount, prize_amount, is_winner', { count: 'exact' })
            .eq('user_id', userId)
            .eq('round_id', round16.id);
        console.log('Submissions count for round16:', count);
        if (subs && subs.length > 0) {
            let totalAmt = 0;
            let totalCommInSub = 0;
            const byType = {};
            subs.forEach(s => {
                totalAmt += Number(s.amount || 0);
                totalCommInSub += Number(s.commission_amount || 0);
                if (!byType[s.bet_type]) byType[s.bet_type] = { count: 0, amt: 0, comm: 0 };
                byType[s.bet_type].count++;
                byType[s.bet_type].amt += Number(s.amount || 0);
                byType[s.bet_type].comm += Number(s.commission_amount || 0);
            });
            console.log('Submissions aggregate:', { totalAmt, totalCommInSub, byType });
        }
    }

    // 5. Find user_settings
    const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId);
    console.log('user_settings thai:', JSON.stringify(settings?.[0]?.lottery_settings?.thai, null, 2));
}

run().catch(console.error);
