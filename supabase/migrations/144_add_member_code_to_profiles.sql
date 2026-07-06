-- Create a sequence starting at 10001 for member codes
CREATE SEQUENCE IF NOT EXISTS member_code_seq START WITH 10001;

-- Add member_code column to profiles table with sequence default
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS member_code TEXT UNIQUE DEFAULT nextval('member_code_seq')::text;
