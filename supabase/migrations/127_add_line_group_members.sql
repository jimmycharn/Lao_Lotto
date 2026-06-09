-- =============================================
-- LAO LOTTO - LINE Group Members Schema
-- Migration: 127_add_line_group_members.sql
-- =============================================

-- Create line_group_members table
CREATE TABLE IF NOT EXISTS line_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id TEXT NOT NULL REFERENCES line_groups(line_group_id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(line_group_id, line_user_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_line_group_members_group_id ON line_group_members(line_group_id);
CREATE INDEX IF NOT EXISTS idx_line_group_members_user_id ON line_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_line_group_members_line_user_id ON line_group_members(line_user_id);

-- Enable RLS
ALTER TABLE line_group_members ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Dealers and Superadmins can manage group members" ON line_group_members;

-- Create policy
CREATE POLICY "Dealers and Superadmins can manage group members" ON line_group_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM line_groups lg
            WHERE lg.line_group_id = line_group_members.line_group_id
              AND (lg.dealer_id = auth.uid() OR EXISTS (
                  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'
              ))
        )
    );

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trg_update_line_group_members_updated_at ON line_group_members;
CREATE TRIGGER trg_update_line_group_members_updated_at
    BEFORE UPDATE ON line_group_members
    FOR EACH ROW
    EXECUTE FUNCTION update_line_groups_updated_at();

-- Seeding query removed: do not seed group members by default.
-- Group members should be captured dynamically as they send messages to prevent incorrect associations.

