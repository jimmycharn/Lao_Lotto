-- Fix user_settings RLS policy for INSERT operations
-- The previous policy used USING which doesn't work for INSERT

-- Drop the existing write policy
DROP POLICY IF EXISTS "authenticated_write_user_settings" ON user_settings;

-- Create separate policies for each operation
-- Read: All authenticated users can read
-- Already exists: authenticated_read_user_settings

-- Insert: Dealers can insert settings for users they manage
CREATE POLICY "authenticated_insert_user_settings" ON user_settings
    FOR INSERT TO authenticated WITH CHECK (
        dealer_id = auth.uid() OR user_id = auth.uid()
    );

-- Update: Dealers can update settings for users they manage
CREATE POLICY "authenticated_update_user_settings" ON user_settings
    FOR UPDATE TO authenticated USING (
        dealer_id = auth.uid() OR user_id = auth.uid()
    );

-- Delete: Dealers can delete settings for users they manage
CREATE POLICY "authenticated_delete_user_settings" ON user_settings
    FOR DELETE TO authenticated USING (
        dealer_id = auth.uid() OR user_id = auth.uid()
    );
