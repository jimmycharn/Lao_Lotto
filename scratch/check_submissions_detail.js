import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSubmissionsDetail() {
  const roundIds = ['a58d4ec9-74e4-4525-acf1-282ba7d18f63', 'dc9cfe88-714c-42ee-ad5e-d200e940fde4'];
  
  // We can create or use an RPC to inspect submissions by round
  const { data, error } = await supabase.rpc('debug_inspect_round_user_histories', {
    p_round_ids: roundIds
  });

  console.log('User Histories count:', data?.length);
  const byRound = {};
  data?.forEach(u => {
    if (!byRound[u.round_id]) byRound[u.round_id] = { totalAmount: 0, totalComm: 0, totalWin: 0, users: [] };
    byRound[u.round_id].totalAmount += Number(u.total_amount || 0);
    byRound[u.round_id].totalComm += Number(u.total_commission || 0);
    byRound[u.round_id].totalWin += Number(u.total_winnings || 0);
    byRound[u.round_id].users.push({ name: u.user_name, amt: u.total_amount, comm: u.total_commission, win: u.total_winnings });
  });

  console.log('By Round Totals:', JSON.stringify(byRound, null, 2));
}

checkSubmissionsDetail();
