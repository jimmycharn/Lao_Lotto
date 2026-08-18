-- =============================================
-- Add DELETE policy for user_round_history table
-- =============================================
-- Allows dealers to delete member round history records for their rounds

CREATE POLICY "Dealers can delete member round history"
    ON user_round_history FOR DELETE
    USING (dealer_id = auth.uid());
