import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkProfile() {
    try {
        console.log(`Checking all profiles...`)
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, line_user_id, is_active')
        
        if (error) throw error
        console.log('Profiles in DB:', JSON.stringify(profiles, null, 2))
    } catch (err) {
        console.error('Error:', err)
    }
}

checkProfile()
