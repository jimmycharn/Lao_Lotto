import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

let supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
let supabaseKey = ''

try {
  const envText = fs.readFileSync('.env', 'utf8')
  for (const line of envText.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim()
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim()
    if (!supabaseKey && line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim()
  }
} catch (e) {}

if (!supabaseKey) {
  try {
    const envText = fs.readFileSync('.env.local', 'utf8')
    for (const line of envText.split('\n')) {
      if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim()
      if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim()
      if (!supabaseKey && line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim()
    }
  } catch (e) {}
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAutomation() {
    try {
        console.log('=== 1. Checking Profiles for Dealers ===')
        const { data: profiles, error: pErr } = await supabase
            .from('profiles')
            .select('id, full_name, role, email')
            .eq('role', 'dealer')

        if (pErr) console.error('Profiles err:', pErr)
        console.log('Dealers:', profiles)

        console.log('=== 2. Checking dealer_automation_jobs ===')
        const { data: jobs, error: jErr } = await supabase
            .from('dealer_automation_jobs')
            .select('*')
        
        if (jErr) console.error('Jobs err:', jErr)
        console.log('Automation Jobs:', JSON.stringify(jobs, null, 2))

        console.log('=== 3. Checking recent Lao lottery_rounds ===')
        const { data: rounds, error: rErr } = await supabase
            .from('lottery_rounds')
            .select('id, dealer_id, lottery_type, lottery_name, round_date, status, created_at, created_by_job_id, notify_close_to_groups, close_notified_at')
            .eq('lottery_type', 'lao')
            .order('created_at', { ascending: false })
            .limit(5)
        
        if (rErr) console.error('Rounds err:', rErr)
        console.log('Recent Lao Rounds:', JSON.stringify(rounds, null, 2))

        console.log('=== 4. Checking line_groups ===')
        const { data: groups, error: gErr } = await supabase
            .from('line_groups')
            .select('id, dealer_id, group_name, line_group_id, lottery_type, is_active, notify_round_summary, notify_layoff_bets')
        
        if (gErr) console.error('Groups err:', gErr)
        console.log('Line Groups:', JSON.stringify(groups, null, 2))

    } catch (err) {
        console.error('Error:', err)
    }
}

checkAutomation()
