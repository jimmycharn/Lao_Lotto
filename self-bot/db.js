const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

// 1. Load self-bot/.env if exists, or fallback to root .env
if (fs.existsSync(path.join(__dirname, ".env"))) {
    require("dotenv").config({ path: path.join(__dirname, ".env") });
}
if (fs.existsSync(path.join(__dirname, "..", ".env"))) {
    require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
}

// 2. Resolve URL and Key (supporting VITE_ prefixed keys from main app)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Error: SUPABASE_URL or SUPABASE_ANON_KEY is missing in .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
