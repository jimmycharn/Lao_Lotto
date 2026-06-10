-- =============================================
-- LAO LOTTO - Sync Profile LINE User ID changes to Group Members
-- Migration: 129_sync_profile_line_user_id_to_group_members.sql
-- =============================================

-- Create trigger function
CREATE OR REPLACE FUNCTION sync_profile_line_user_id()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. If line_user_id changed on update, or on insert
    IF (TG_OP = 'INSERT') OR (NEW.line_user_id IS DISTINCT FROM OLD.line_user_id) THEN
        -- Clear user_id connection for group members that were previously associated with this profile
        -- but no longer match the new line_user_id (or if line_user_id was set to NULL)
        UPDATE line_group_members
        SET user_id = NULL, updated_at = NOW()
        WHERE user_id = NEW.id 
          AND (NEW.line_user_id IS NULL OR line_user_id <> NEW.line_user_id);

        -- Associate any group members that match the new line_user_id with this profile
        IF NEW.line_user_id IS NOT NULL THEN
            UPDATE line_group_members
            SET user_id = NEW.id, updated_at = NOW()
            WHERE line_user_id = NEW.line_user_id
              AND (user_id IS NULL OR user_id <> NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on profiles
DROP TRIGGER IF EXISTS trg_sync_profile_line_user_id ON profiles;
CREATE TRIGGER trg_sync_profile_line_user_id
    AFTER INSERT OR UPDATE OF line_user_id ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION sync_profile_line_user_id();

-- Run manual sync to fix any existing mismatches
UPDATE line_group_members lgm
SET user_id = p.id, updated_at = NOW()
FROM profiles p
WHERE lgm.line_user_id = p.line_user_id
  AND (lgm.user_id IS NULL OR lgm.user_id <> p.id);
