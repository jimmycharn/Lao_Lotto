-- Fix RLS for submitted_by column
-- Allow dealers to insert submissions with submitted_by field

-- Drop and recreate the insert policy for submissions to include submitted_by
DROP POLICY IF EXISTS "Users can insert own submissions" ON submissions;

CREATE POLICY "Users can insert submissions" ON submissions
    FOR INSERT WITH CHECK (
        -- User can insert for themselves
        auth.uid() = user_id
        OR
        -- Dealer can insert on behalf of their members
        EXISTS (
            SELECT 1 FROM user_dealer_memberships udm
            JOIN lottery_rounds lr ON lr.dealer_id = udm.dealer_id
            WHERE udm.user_id = submissions.user_id
            AND lr.id = submissions.round_id
            AND udm.dealer_id = auth.uid()
            AND udm.status = 'approved'
        )
    );
