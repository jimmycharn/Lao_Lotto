const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

async function inspect() {
    const { data: rh } = await supabase
        .from('round_history')
        .select('*')
        .limit(10)
    console.log('Sample round_history:', rh);

    const { data: urh } = await supabase
        .from('user_round_history')
        .select('*')
        .limit(5)
    console.log('Sample user_round_history:', urh);
}

inspect();
