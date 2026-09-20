import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

console.log('Testing RPC sync_round_to_history...');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
    const t0 = Date.now();
    const roundId = '5b5c0870-ae3d-446a-b173-5c93e2e3c1e7';
    const dealerId = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';
    
    console.log(`Calling sync_round_to_history for round ${roundId} and dealer ${dealerId}...`);
    const { data, error } = await supabase.rpc('sync_round_to_history', {
        p_round_id: roundId,
        p_dealer_id: dealerId
    });
    
    console.log(`Elapsed: ${Date.now() - t0} ms`);
    console.log('Result data:', data);
    console.log('Result error:', error);
}

test();
