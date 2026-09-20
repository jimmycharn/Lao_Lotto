// Final comprehensive check: verify all data for the 2 restored rounds
const SUPABASE_URL = 'https://nmumnletxkeflmsythsn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const DEALER_ID = 'cee2094a-580c-4a95-9bf4-e522e1e29e98';

async function callRPC(funcName, params) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(params)
    });
    return res.json();
}

async function main() {
    const data = await callRPC('debug_inspect_upstream_data', { p_dealer_id: DEALER_ID });
    const rounds = await callRPC('debug_verify_restored_rounds', { p_dealer_id: DEALER_ID });
    
    // Focus on the 2 restored rounds
    const ROUND_A58D = 'a58d4ec9-74e4-4525-acf1-282ba7d18f63';
    const ROUND_DC9C = 'dc9cfe88-714c-42ee-ad5e-d200e940fde4';
    
    console.log('=== ROUND STATUS ===');
    for (const r of rounds.rounds || []) {
        if (r.id === ROUND_A58D || r.id === ROUND_DC9C) {
            console.log(`  ${r.id.substring(0,8)} | date: ${r.round_date} | status: ${r.status} | announced: ${r.is_result_announced} | active: ${r.is_active}`);
            console.log(`    winning_numbers: ${JSON.stringify(r.winning_numbers)}`);
        }
    }
    
    console.log('\n=== BET TRANSFERS ===');
    const transfersByRound = {};
    for (const t of data.transfers || []) {
        if (t.round_id === ROUND_A58D || t.round_id === ROUND_DC9C) {
            if (!transfersByRound[t.round_id]) transfersByRound[t.round_id] = [];
            transfersByRound[t.round_id].push(t);
        }
    }
    
    for (const [roundId, transfers] of Object.entries(transfersByRound)) {
        const roundDate = roundId === ROUND_A58D ? '16 ก.ย.' : '1 ก.ย.';
        const totalAmt = transfers.reduce((s, t) => s + t.amount, 0);
        console.log(`\n  Round ${roundId.substring(0,8)} (${roundDate}):`);
        for (const t of transfers) {
            console.log(`    ${t.bet_type} ${t.numbers} = ${t.amount} | status: ${t.status} | batch: ${t.transfer_batch_id?.substring(0,8)}`);
        }
        console.log(`    TOTAL: ${totalAmt}`);
        
        // Calculate commission with upstream settings
        const conn = (data.connections || []).find(c => c.upstream_name === 'พี่จิ้ม อ้อมค่าย');
        const settings = conn?.lottery_settings?.thai;
        let totalComm = 0;
        for (const t of transfers) {
            const rate = settings?.[t.bet_type]?.commission || 0;
            const comm = t.amount * (rate / 100);
            totalComm += comm;
            console.log(`    ${t.bet_type}: ${t.amount} × ${rate}% = ${comm}`);
        }
        console.log(`    TOTAL COMMISSION: ${totalComm} (rounded: ${Math.round(totalComm)})`);
    }
    
    // Expected values from screenshots
    console.log('\n=== VERIFICATION vs SCREENSHOTS ===');
    console.log('Round a58d4ec9 (16 ก.ย.):');
    console.log(`  Expected: transfer=9,342, commission=3,250, profit=-6,092`);
    const a58d_transfers = transfersByRound[ROUND_A58D] || [];
    const a58d_total = a58d_transfers.reduce((s, t) => s + t.amount, 0);
    console.log(`  Actual:   transfer=${a58d_total.toLocaleString()}`);
    console.log(`  MATCH: ${a58d_total === 9342 ? '✅' : '❌'}`);
    
    console.log('\nRound dc9cfe88 (1 ก.ย.):');
    console.log(`  Expected: transfer=8,608, commission=3,003, profit=-5,605`);
    const dc9c_transfers = transfersByRound[ROUND_DC9C] || [];
    const dc9c_total = dc9c_transfers.reduce((s, t) => s + t.amount, 0);
    console.log(`  Actual:   transfer=${dc9c_total.toLocaleString()}`);
    console.log(`  MATCH: ${dc9c_total === 8608 ? '✅' : '❌'}`);
    
    // Check dc9cfe88 status issue - it's 'closed' but should be 'announced'
    const dc9c_round = rounds.rounds?.find(r => r.id === ROUND_DC9C);
    if (dc9c_round) {
        console.log(`\n⚠️ dc9cfe88 status: '${dc9c_round.status}' (is_result_announced: ${dc9c_round.is_result_announced})`);
        if (dc9c_round.status === 'closed' && dc9c_round.is_result_announced) {
            console.log('  WARNING: status should be "announced" since results are announced!');
        }
    }
    
    // Check submission counts per round
    console.log('\n=== SUBMISSION COUNTS ===');
    console.log(`Total submissions across all rounds: ${rounds.total_submissions}`);
}

main().catch(console.error);
