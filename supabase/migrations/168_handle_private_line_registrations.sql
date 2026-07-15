-- =============================================
-- Migration: 168_handle_private_line_registrations.sql
-- =============================================

-- Create line_user_sessions table
CREATE TABLE IF NOT EXISTS line_user_sessions (
    line_user_id TEXT PRIMARY KEY,
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lottery_type TEXT NOT NULL DEFAULT 'lao',
    is_assistant BOOLEAN NOT NULL DEFAULT false,
    assistant_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE line_user_sessions ENABLE ROW LEVEL SECURITY;

-- Allow select/insert/update/delete by service role (no policies needed as Edge Functions run with Service Role)
-- But we can add public read/write policies or standard policies if needed. Let's make it unrestricted for simplicity/robustness, or keep policies disabled.
-- We don't add client-side policies since only the Edge Function (service role) queries this table.

-- Create trigger function to clean up auth.users when a pending LINE membership is rejected or deleted
CREATE OR REPLACE FUNCTION handle_pending_membership_rejection_or_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- Retrieve email of the user
  SELECT email INTO v_user_email FROM auth.users WHERE id = OLD.user_id;

  -- Only target LINE bot auto-created accounts (ends with @gmail.com and starts with line_)
  IF v_user_email LIKE 'line_%@gmail.com' THEN
    -- If membership status is updated to 'rejected' and OLD status was 'pending'
    -- OR if the membership is deleted while still 'pending' or 'rejected'
    IF (TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status = 'pending')
       OR (TG_OP = 'DELETE' AND OLD.status IN ('pending', 'rejected')) THEN
       
       -- Delete the user from auth.users (which cascades to delete profile and memberships)
       IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
         DELETE FROM auth.users WHERE id = OLD.user_id;
       END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_pending_membership_cleanup ON user_dealer_memberships;

-- Create trigger
CREATE TRIGGER trg_pending_membership_cleanup
  AFTER UPDATE OR DELETE ON user_dealer_memberships
  FOR EACH ROW
  EXECUTE FUNCTION handle_pending_membership_rejection_or_deletion();
