import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyTransfers() {
  const { data, error } = await supabase.rpc('debug_inspect_upstream_data', {
    p_dealer_id: 'cee2094a-580c-4a95-9bf4-e522e1e29e98'
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const transfers = data?.transfers || [];
  console.log('=== TRANSFERS RESTORATION VERIFICATION ===');
  console.log('Total Transfers in DB across all rounds:', transfers.length);

  const targetRoundIds = [
    'a58d4ec9-74e4-4525-acf1-282ba7d18f63',
    'dc9cfe88-714c-42ee-ad5e-d200e940fde4',
    '23024de1-d178-4862-ad25-e8833b70ca03'
  ];

  targetRoundIds.forEach(rid => {
    const roundTransfers = transfers.filter(t => t.round_id === rid);
    const totalAmt = roundTransfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    console.log(`\nRound ${rid}:`);
    console.log(`  Count: ${roundTransfers.length}`);
    console.log(`  Total Amount: ฿${totalAmt.toLocaleString()}`);
    roundTransfers.forEach(t => {
      console.log(`    - ${t.target_dealer_name} | Type: ${t.bet_type} | Num: ${t.numbers} | Amount: ฿${t.amount}`);
    });
  });
}

verifyTransfers();
