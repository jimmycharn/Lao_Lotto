import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugState() {
  try {
    console.log("Fetching line_groups...")
    const { data: groups, error: gErr } = await supabase
      .from('line_groups')
      .select('line_group_id, group_name, lottery_type, poy_display, poy_format, dealer_poy_display, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (gErr) throw gErr;
    console.log("Latest Line Groups:", JSON.stringify(groups, null, 2));

    if (groups && groups.length > 0) {
      const latestGroupId = groups[0].line_group_id;
      console.log(`\nFetching members for latest group: ${latestGroupId} (${groups[0].group_name || 'unnamed'})...`);
      const { data: members, error: mErr } = await supabase
        .from('line_group_members')
        .select('id, display_name, line_user_id, poy_display, admin_poy_display')
        .eq('line_group_id', latestGroupId)
        .limit(10);
      if (mErr) throw mErr;
      console.log("Members:", JSON.stringify(members, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

debugState();
