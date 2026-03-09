-- Migration: Add per_user_yearly billing model
-- =====================================================
-- This adds a new billing model "per_user_yearly" that:
-- 1. Charges per user per year (e.g. 3000 baht/user/year)
-- 2. Dealer account itself is free (no credit deduction, unlimited usage)
-- 3. Credit is deducted when dealer creates/accepts/renews a user
-- 4. Each user has an expiry date PER DEALER (user can be member of multiple dealers)
-- 5. Expired users cannot submit numbers to that dealer
-- 6. Only applies to regular users (not downstream dealers)
-- =====================================================

-- 1. Update billing_model CHECK constraint to include per_user_yearly
ALTER TABLE subscription_packages DROP CONSTRAINT IF EXISTS subscription_packages_billing_model_check;
ALTER TABLE subscription_packages ADD CONSTRAINT subscription_packages_billing_model_check 
  CHECK (billing_model IN ('per_device', 'package', 'percentage', 'profit_percentage', 'per_user_yearly'));

ALTER TABLE dealer_subscriptions DROP CONSTRAINT IF EXISTS dealer_subscriptions_billing_model_check;
ALTER TABLE dealer_subscriptions ADD CONSTRAINT dealer_subscriptions_billing_model_check 
  CHECK (billing_model IN ('per_device', 'package', 'percentage', 'profit_percentage', 'per_user_yearly'));

-- 2. Add price_per_user_per_year column to subscription_packages
ALTER TABLE subscription_packages
ADD COLUMN IF NOT EXISTS price_per_user_per_year DECIMAL(15,2) DEFAULT 0;

COMMENT ON COLUMN subscription_packages.price_per_user_per_year IS 'ราคาต่อสมาชิกต่อปี - ใช้กับ billing_model = per_user_yearly';

-- 3. Add membership_expires_at column to user_dealer_memberships
-- This tracks expiry per dealer (since user can be member of multiple dealers)
ALTER TABLE user_dealer_memberships
ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN user_dealer_memberships.membership_expires_at IS 'วันหมดอายุสมาชิก - ใช้กับแพ็คเกจ per_user_yearly (NULL = ไม่มีกำหนด)';

-- 4. Add membership_years column to track how many years were purchased
ALTER TABLE user_dealer_memberships
ADD COLUMN IF NOT EXISTS membership_years INTEGER DEFAULT NULL;

COMMENT ON COLUMN user_dealer_memberships.membership_years IS 'จำนวนปีที่ซื้อล่าสุด';

-- 5. Add index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_user_dealer_memberships_expires 
  ON user_dealer_memberships(membership_expires_at) 
  WHERE membership_expires_at IS NOT NULL;

-- 6. RLS policy: allow dealers to update membership_expires_at for their members
-- (existing policy "Dealers can update memberships" should cover this since it uses dealer_id = auth.uid())

-- Done!
SELECT 'Migration 115_per_user_yearly_package completed!' as status;
