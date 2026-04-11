-- =============================================
-- Add transferred_entries column to round_history
-- =============================================
-- Stores the count of outgoing transfer entries (ตีออก)
-- so we can display it alongside ยอดส่ง in the history tab

ALTER TABLE round_history
ADD COLUMN IF NOT EXISTS transferred_entries INTEGER DEFAULT 0;
