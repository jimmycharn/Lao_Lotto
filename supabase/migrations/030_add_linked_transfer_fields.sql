-- =============================================
-- LAO LOTTO - Add Linked Transfer Fields
-- Migration: 030_add_linked_transfer_fields.sql
-- =============================================
-- Adds fields to bet_transfers for tracking linked dealer transfers
-- When a transfer is made to a linked dealer, we can create a submission
-- in their round automatically
-- =============================================

-- Add new columns to bet_transfers
ALTER TABLE bet_transfers 
ADD COLUMN IF NOT EXISTS upstream_dealer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_linked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS target_round_id UUID REFERENCES lottery_rounds(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS target_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL;

-- Add index for upstream dealer lookups
CREATE INDEX IF NOT EXISTS idx_bet_transfers_upstream_dealer ON bet_transfers(upstream_dealer_id);
CREATE INDEX IF NOT EXISTS idx_bet_transfers_target_round ON bet_transfers(target_round_id);

-- Update RLS policy to allow upstream dealers to view transfers to them
DROP POLICY IF EXISTS "upstream_dealers_view_transfers" ON bet_transfers;
CREATE POLICY "upstream_dealers_view_transfers" ON bet_transfers
    FOR SELECT USING (upstream_dealer_id = auth.uid());

-- =============================================
-- RLS Policy for submissions from transfers
-- Allow dealers to insert submissions on behalf of other dealers (for transfers)
-- =============================================

-- Drop and recreate the insert policy to allow transfer submissions
DROP POLICY IF EXISTS "dealers_insert_transfer_submissions" ON submissions;
CREATE POLICY "dealers_insert_transfer_submissions" ON submissions
    FOR INSERT WITH CHECK (
        -- Normal user submission
        user_id = auth.uid()
        OR
        -- Transfer submission: the round belongs to the current user (dealer)
        -- and the submission is being created by another dealer transferring to them
        round_id IN (
            SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
        )
    );

-- Allow dealers to view submissions in their rounds (including transfers)
DROP POLICY IF EXISTS "dealers_view_round_submissions" ON submissions;
CREATE POLICY "dealers_view_round_submissions" ON submissions
    FOR SELECT USING (
        -- User's own submissions
        user_id = auth.uid()
        OR
        -- Dealer viewing submissions in their rounds
        round_id IN (
            SELECT id FROM lottery_rounds WHERE dealer_id = auth.uid()
        )
    );
