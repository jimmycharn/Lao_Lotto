-- Add self_bot_chat_mid column to line_groups
-- Stores the resolved linejs MID for the self-bot to use directly
-- This avoids needing group_name lookup every time
ALTER TABLE line_groups
  ADD COLUMN IF NOT EXISTS self_bot_chat_mid TEXT;

COMMENT ON COLUMN line_groups.self_bot_chat_mid IS
  'Internal MID used by linejs self-bot. Different from LINE Official Bot group ID (line_group_id).';
