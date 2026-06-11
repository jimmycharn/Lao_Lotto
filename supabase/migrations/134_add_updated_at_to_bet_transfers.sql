-- =============================================
-- LAO LOTTO - Add updated_at to bet_transfers
-- Migration: 134_add_updated_at_to_bet_transfers.sql
-- =============================================
-- The line-bot edge function (performLayoff) inserts an `updated_at`
-- value when recording a layoff/transfer. The bet_transfers table was
-- originally created with only `created_at`, so the insert failed with
-- "column updated_at does not exist", surfacing in LINE as
-- "เกิดข้อผิดพลาดทางเทคนิคในการบันทึกการตีออก".
-- This migration adds the missing column and keeps it in sync on update.
-- =============================================

ALTER TABLE bet_transfers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows so updated_at is never null
UPDATE bet_transfers
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Keep updated_at fresh on every update
CREATE OR REPLACE FUNCTION update_bet_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_bet_transfers_updated_at ON bet_transfers;
CREATE TRIGGER trg_update_bet_transfers_updated_at
    BEFORE UPDATE ON bet_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_bet_transfers_updated_at();
