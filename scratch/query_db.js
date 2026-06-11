import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSubmissions() {
  console.log("Checking submissions created today...");
  const today = '2026-06-09';
  const { data: subs, error: err } = await supabase
    .from('submissions')
    .select('id, bill_id, numbers, amount, bet_type, created_at')
    .gte('created_at', today)
    .order('created_at', { ascending: false })
    .limit(20);

  if (err) {
    console.error("Error fetching submissions:", err);
  } else {
    console.log("Recent submissions:", JSON.stringify(subs, null, 2));
  }
}

checkSubmissions();
