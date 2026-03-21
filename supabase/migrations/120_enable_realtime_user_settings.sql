-- Enable Realtime for user_settings (for blocked lottery types instant sync to user dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
