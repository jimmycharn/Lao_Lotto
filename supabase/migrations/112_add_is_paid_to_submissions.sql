-- Add is_paid column to submissions table
-- This tracks whether a bill/submission has been paid by the user
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
