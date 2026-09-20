import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  const dealerId = 'cee2094a-580c-4a95-9bf4-e522e1e29e98';
  const { data, error } = await supabase.rpc('debug_verify_restored_rounds', {
    p_dealer_id: dealerId
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== RESTORE VERIFICATION ===');
  console.log('Dealer ID:', dealerId);
  console.log('Total Rounds in lottery_rounds:', data.rounds?.length);
  console.log('Total Submissions across rounds:', data.total_submissions);
  console.log('\nRounds details:');
  data.rounds?.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.id}]`);
    console.log(`   Name: ${r.lottery_name} (${r.lottery_type})`);
    console.log(`   Round Date: ${r.round_date}`);
    console.log(`   Close Time: ${r.close_time}`);
    console.log(`   Status: ${r.status}, Announced: ${r.is_result_announced}`);
    console.log(`   Winning Numbers:`, JSON.stringify(r.winning_numbers));
  });
}

verify();
