const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = 'f:\\Web App\\Lao_Lotto\\supabase\\migrations';
const tempDir = 'f:\\Web App\\Lao_Lotto\\supabase\\temp_migrations';

const filesToMove = [
    '042_add_min_max_deduction_and_expiry.sql',
    '043_update_credit_system_v3.sql',
    '117_otp_email_via_pg_net.sql'
];

try {
    // 1. Create temp directory
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    // 2. Move files to temp directory
    console.log('Moving duplicate files to temporary directory...');
    for (const file of filesToMove) {
        const src = path.join(migrationsDir, file);
        const dest = path.join(tempDir, file);
        if (fs.existsSync(src)) {
            fs.renameSync(src, dest);
            console.log(`Moved: ${file}`);
        } else {
            console.log(`File not found, skipping: ${file}`);
        }
    }
    
    // 3. Execute supabase db push
    console.log('Executing supabase db push...');
    try {
        const output = execSync('npx.cmd supabase db push', { cwd: 'f:\\Web App\\Lao_Lotto', encoding: 'utf8' });
        console.log(output);
    } catch (pushError) {
        console.error('Error executing db push:', pushError.message);
        if (pushError.stdout) console.log(pushError.stdout);
        if (pushError.stderr) console.error(pushError.stderr);
    }
    
} finally {
    // 4. Move files back
    console.log('Restoring files from temporary directory...');
    for (const file of filesToMove) {
        const src = path.join(tempDir, file);
        const dest = path.join(migrationsDir, file);
        if (fs.existsSync(src)) {
            fs.renameSync(src, dest);
            console.log(`Restored: ${file}`);
        }
    }
    
    // 5. Remove temp directory
    if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
        console.log('Removed temporary directory.');
    }
}
