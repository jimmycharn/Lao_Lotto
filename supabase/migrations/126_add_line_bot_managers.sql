-- =============================================
-- LAO LOTTO - LINE Bot Managers Schema
-- Migration: 126_add_line_bot_managers.sql
-- =============================================

-- Create line_managers table
CREATE TABLE IF NOT EXISTS line_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL, -- The LINE user ID of the manager (starts with U...)
    nickname TEXT NOT NULL, -- The display name given by the dealer
    permissions JSONB DEFAULT '{}'::jsonb NOT NULL, -- permissions e.g., {"can_view_stats": true, "can_view_total": true, "can_view_excess": true, "can_transfer": true}
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(dealer_id, line_user_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_line_managers_dealer_id ON line_managers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_line_managers_line_user_id ON line_managers(line_user_id);

-- Enable RLS
ALTER TABLE line_managers ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Dealers and Superadmins can manage line managers" ON line_managers;

-- Create policy
CREATE POLICY "Dealers and Superadmins can manage line managers" ON line_managers
    FOR ALL USING (
        auth.uid() = dealer_id
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trg_update_line_managers_updated_at ON line_managers;
CREATE TRIGGER trg_update_line_managers_updated_at
    BEFORE UPDATE ON line_managers
    FOR EACH ROW
    EXECUTE FUNCTION update_line_groups_updated_at(); -- Re-use existing updated_at trigger function
