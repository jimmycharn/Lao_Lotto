import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load .env if present
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...rest] = trimmed.split('=')
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = rest.join('=').trim()
      }
    }
  })
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

async function verifyWithCli() {
  const query = 'SELECT id, upstream_name, upstream_code FROM public.dealer_upstream_connections LIMIT 5;'
  const output = execSync(`npx.cmd supabase db query --linked "${query}"`, {
    encoding: 'utf8'
  })
  
  // Extract JSON output from supabase db query output
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonStr = output.substring(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(jsonStr)
    return parsed.rows || []
  }
  return []
}

async function test() {
  try {
    let connections = []
    
    // First attempt via Supabase client if service role key is available
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data, error } = await supabase
        .from('dealer_upstream_connections')
        .select('id, upstream_name, upstream_code')
        .limit(5)
      if (!error && data && data.length > 0) {
        connections = data
      }
    }
    
    // If empty (e.g. anon RLS), use Supabase CLI Management API
    if (connections.length === 0) {
      connections = await verifyWithCli()
    }

    if (!connections || connections.length === 0) {
      console.error('FAIL: No records found in dealer_upstream_connections')
      process.exitCode = 1
      return
    }

    // Verify all have upstream_code and length is at least 5 digits
    const hasInvalid = connections.some(c => !c.upstream_code || c.upstream_code.length < 5)
    if (hasInvalid) {
      console.error('FAIL: Found records without valid upstream_code:', connections)
      process.exitCode = 1
      return
    }

    console.log('PASS: upstream connections fetched:', connections)
  } catch (err) {
    console.error('FAIL:', err.message)
    process.exitCode = 1
  }
}

test()
