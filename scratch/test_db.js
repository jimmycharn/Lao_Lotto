import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env file manually
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      envConfig[key] = val;
    }
  });
}

const supabaseUrl = envConfig.VITE_SUPABASE_URL || '';
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSubmissions() {
  console.log(`Checking latest 30 submissions in database...`);

  const { data, error } = await supabase
    .from('submissions')
    .select('id, numbers, amount, bet_type, created_at, bill_id, bill_note, is_deleted')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching submissions:', error);
    return;
  }

  console.log(`Fetched ${data.length} submissions:`);
  data.forEach(sub => {
    console.log(`- ID: ${sub.id}, BillID: ${sub.bill_id}, Note: ${sub.bill_note}, Num: ${sub.numbers}, Amt: ${sub.amount}, Type: ${sub.bet_type}, CreatedAt: ${sub.created_at}, Deleted: ${sub.is_deleted}`);
  });
}

checkSubmissions();
