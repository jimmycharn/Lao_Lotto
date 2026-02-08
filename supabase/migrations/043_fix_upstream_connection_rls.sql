-- Fix RLS policy for dealer_upstream_connections
-- Allow upstream dealers (receivers) to update status of connections to them
-- This is needed for approving/rejecting connection requests

-- ============================================
-- STEP 1: Drop ALL existing policies first
-- ============================================
DROP POLICY IF EXISTS "Dealers can view own upstream connections" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Dealers can insert own upstream connections" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Dealers can update own upstream connections" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Dealers can delete own upstream connections" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Upstream dealers can view connections to them" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Upstream dealers can update connections to them" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Upstream dealers can delete connections to them" ON dealer_upstream_connections;
DROP POLICY IF EXISTS "Super admins full access on upstream connections" ON dealer_upstream_connections;

-- ============================================
-- STEP 2: Recreate ALL policies
-- ============================================

-- SELECT: Dealers can view their own connections (where they are dealer_id)
CREATE POLICY "Dealers can view own upstream connections"
    ON dealer_upstream_connections FOR SELECT
    USING (dealer_id = auth.uid());

-- SELECT: Upstream dealers can view connections to them (where they are upstream_dealer_id)
CREATE POLICY "Upstream dealers can view connections to them"
    ON dealer_upstream_connections FOR SELECT
    USING (upstream_dealer_id = auth.uid());

-- INSERT: Dealers can create their own connections
CREATE POLICY "Dealers can insert own upstream connections"
    ON dealer_upstream_connections FOR INSERT
    WITH CHECK (dealer_id = auth.uid());

-- UPDATE: Dealers can update their own connections
CREATE POLICY "Dealers can update own upstream connections"
    ON dealer_upstream_connections FOR UPDATE
    USING (dealer_id = auth.uid())
    WITH CHECK (dealer_id = auth.uid());

-- UPDATE: Upstream dealers can update connections to them (approve/reject/block)
CREATE POLICY "Upstream dealers can update connections to them"
    ON dealer_upstream_connections FOR UPDATE
    USING (upstream_dealer_id = auth.uid())
    WITH CHECK (upstream_dealer_id = auth.uid());

-- DELETE: Dealers can delete their own connections
CREATE POLICY "Dealers can delete own upstream connections"
    ON dealer_upstream_connections FOR DELETE
    USING (dealer_id = auth.uid());

-- DELETE: Upstream dealers can delete connections to them
CREATE POLICY "Upstream dealers can delete connections to them"
    ON dealer_upstream_connections FOR DELETE
    USING (upstream_dealer_id = auth.uid());

-- Super admins can do everything
CREATE POLICY "Super admins full access on upstream connections"
    ON dealer_upstream_connections FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    );

-- ============================================
-- STEP 3: Fix existing connections with NULL upstream_dealer_id
-- For connections where is_linked = true but upstream_dealer_id is NULL
-- We need to find the correct upstream_dealer_id from the invitation link
-- ============================================

-- Option 1: Delete invalid connections (connections with is_linked=true but no upstream_dealer_id)
-- DELETE FROM dealer_upstream_connections WHERE is_linked = true AND upstream_dealer_id IS NULL;

-- Option 2: If you know the upstream_dealer_id, update manually:
-- UPDATE dealer_upstream_connections 
-- SET upstream_dealer_id = 'YOUR_UPSTREAM_DEALER_ID'
-- WHERE id = 'CONNECTION_ID_HERE';
