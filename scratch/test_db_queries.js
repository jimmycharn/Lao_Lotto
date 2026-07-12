import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    // 1. Fetch rounds
    const { data: rounds, error: err1 } = await supabase
      .from('lottery_rounds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (err1) throw err1;

    console.log('--- Recent Lottery Rounds ---');
    rounds.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.lottery_name}, Type: ${r.lottery_type}, Date: ${r.round_date}, Status: ${r.status}, AnnounceDate: ${r.announce_date || 'N/A'}, Announced: ${r.is_result_announced}`);
    });

    // 2. Fetch profiles to find Jimmy
    const { data: profiles, error: err2 } = await supabase
      .from('profiles')
      .select('id, full_name, role');
    if (err2) throw err2;
    
    console.log('\n--- Profiles ---');
    profiles.forEach(p => {
      console.log(`ID: ${p.id}, Name: ${p.full_name}, Role: ${p.role}`);
    });

    // 3. Fetch groups
    const { data: groups, error: err3 } = await supabase
      .from('line_groups')
      .select('*');
    if (err3) throw err3;

    console.log('\n--- Line Groups ---');
    groups.forEach(g => {
      console.log(`ID: ${g.id}, GroupName: ${g.group_name || 'N/A'}, DealerId: ${g.dealer_id}, LotteryType: ${g.lottery_type}`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
