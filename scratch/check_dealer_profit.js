import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
let supabaseKey = '';

try {
  const envText = fs.readFileSync('.env', 'utf8');
  for (const line of envText.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim();
    if (!supabaseKey && line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
  }
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, role');
  console.log('All profiles:', profiles);

  const { data: roundHist } = await supabase
    .from('round_history')
    .select('id, dealer_id, lottery_type, lottery_name, round_date, total_amount, total_entries, transferred_amount, transferred_entries')
    .gte('round_date', '2026-06-01')
    .lte('round_date', '2026-06-30');

  console.log('\n--- round_history in June 2026 ---');
  console.log(roundHist);

  const { data: lotteryRounds } = await supabase
    .from('lottery_rounds')
    .select('id, dealer_id, lottery_type, lottery_name, round_date, status')
    .gte('round_date', '2026-06-01')
    .lte('round_date', '2026-06-30');

  console.log('\n--- lottery_rounds in June 2026 ---');
  console.log(lotteryRounds);
}

main().catch(console.error);
