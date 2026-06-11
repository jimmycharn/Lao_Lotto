const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('submissions')
    .select('bill_id, is_deleted, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }
  console.log("Recent submissions:");
  console.log(data);
}
run();
