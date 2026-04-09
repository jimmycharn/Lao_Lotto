-- =============================================
-- Add DELETE policy for round_history table
-- =============================================
-- Allows dealers to delete their own round history records

CREATE POLICY "Dealers can delete own round history"
    ON round_history FOR DELETE
    USING (dealer_id = auth.uid());
