import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const roundIds = ['a58d4ec9-74e4-4525-acf1-282ba7d18f63', 'dc9cfe88-714c-42ee-ad5e-d200e940fde4'];
  for (const rid of roundIds) {
    // Check via debug RPC or count
    const { data: count, error } = await supabase.rpc('debug_check_round_submissions_count', {
      p_round_id: rid
    });
    console.log(`Round ${rid} submissions count:`, count, error);
  }
}

// Let's create the debug RPC if needed, or run verification
