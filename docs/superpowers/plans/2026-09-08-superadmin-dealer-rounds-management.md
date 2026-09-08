# SuperAdmin Dealer Rounds Management & Submissions Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an administrative interface in the "จัดการงวดหวย" tab for SuperAdmin to view and filter lottery rounds across all dealers by status (open, closed, announced), inspect lingering submission volume, and safely purge completed rounds with automatic archival of financial summaries to relieve database storage.

**Architecture:** 
- PostgreSQL RPC functions (`SECURITY DEFINER`) in Migration 195 aggregate submission counts and bet amounts directly in the database engine (overcoming Supabase's 1,000-row client-side query limit) and perform atomic auto-archiving into `round_history`/`user_round_history` before cascade-deleting rounds and their thousands of `submissions`.
- Dedicated React components (`DealerRoundsAdminTab`, `DeleteRoundConfirmModal`, `BulkCleanupConfirmModal`) integrated into `Admin.jsx` with responsive card layouts optimized for Mobile, Tablet, and Desktop.

**Tech Stack:** React 19, Supabase (PostgreSQL RPC & RLS), Vitest, React Icons, Vanilla CSS with Big Lotto design tokens.

## Global Constraints
- Database aggregation inside PostgreSQL RPC to bypass Supabase 1,000-row PostgREST limit (`max-rows = 1000`).
- Auto-archive financial metrics to `round_history` and `user_round_history` before deleting announced rounds.
- Strict role check: Only users with `role = 'superadmin'` can delete dealer rounds or perform bulk cleanup.
- Responsive design: 100% responsive across Desktop, Tablet, and Mobile without horizontal scroll or cramped borders.
- Preserve existing tests (11 test files, 272 passing tests).

---

### Task 1: Database Migration 195 (PostgreSQL RPC Functions)

**Files:**
- Create: `supabase/migrations/195_superadmin_dealer_rounds_management.sql`
- Test: Remote query execution via Supabase CLI

**Interfaces:**
- Produces:
  - `superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)` -> `TABLE (id UUID, dealer_id UUID, dealer_name TEXT, dealer_email TEXT, lottery_type TEXT, lottery_name TEXT, round_date DATE, open_time TIMESTAMPTZ, close_time TIMESTAMPTZ, status TEXT, is_result_announced BOOLEAN, winning_numbers JSONB, submission_count BIGINT, total_amount NUMERIC, is_archived BOOLEAN, created_at TIMESTAMPTZ)`
  - `superadmin_delete_round(p_round_id UUID)` -> `JSONB` (`{ success: true, round_id: UUID, deleted_submissions: INT, archived: BOOLEAN }`)
  - `superadmin_bulk_cleanup_announced_rounds(p_dealer_id UUID DEFAULT NULL, p_round_ids UUID[] DEFAULT NULL)` -> `JSONB` (`{ success: true, rounds_deleted: INT, total_submissions_deleted: INT }`)

- [ ] **Step 1: Write Migration 195**

```sql
-- Migration: 195_superadmin_dealer_rounds_management.sql
-- Description: RPC functions for SuperAdmin to view and manage dealer rounds with database-side aggregation (bypassing 1000 row limit) and atomic auto-archiving before deletion.

-- 1. RPC to get rounds with aggregated submission counts and dealer profiles
CREATE OR REPLACE FUNCTION public.superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    dealer_id UUID,
    dealer_name TEXT,
    dealer_email TEXT,
    lottery_type TEXT,
    lottery_name TEXT,
    round_date DATE,
    open_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    status TEXT,
    is_result_announced BOOLEAN,
    winning_numbers JSONB,
    submission_count BIGINT,
    total_amount NUMERIC,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- Only superadmin allowed
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can access dealer rounds overview';
    END IF;

    RETURN QUERY
    SELECT 
        lr.id,
        lr.dealer_id,
        COALESCE(p.full_name, 'ไม่ระบุชื่อ') AS dealer_name,
        COALESCE(p.email, '') AS dealer_email,
        lr.lottery_type,
        COALESCE(lr.lottery_name, lr.lottery_type) AS lottery_name,
        lr.round_date,
        lr.open_time,
        lr.close_time,
        lr.status,
        COALESCE(lr.is_result_announced, FALSE) AS is_result_announced,
        COALESCE(lr.winning_numbers, '{}'::jsonb) AS winning_numbers,
        COALESCE(s.sub_count, 0::BIGINT) AS submission_count,
        COALESCE(s.total_amt, 0::NUMERIC) AS total_amount,
        EXISTS(SELECT 1 FROM public.round_history rh WHERE rh.round_id = lr.id) AS is_archived,
        lr.created_at
    FROM public.lottery_rounds lr
    JOIN public.profiles p ON p.id = lr.dealer_id
    LEFT JOIN (
        SELECT 
            submissions.round_id,
            COUNT(submissions.id) AS sub_count,
            SUM(submissions.amount) AS total_amt
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.round_date DESC, lr.created_at DESC;
END;
$$;

-- 2. RPC to safely delete a round with auto-archiving
CREATE OR REPLACE FUNCTION public.superadmin_delete_round(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round RECORD;
    v_sub_count INT := 0;
    v_total_amt NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_total_payout NUMERIC := 0;
    v_transferred_amt NUMERIC := 0;
    v_upstream_comm NUMERIC := 0;
    v_upstream_winnings NUMERIC := 0;
    v_archived BOOLEAN := FALSE;
BEGIN
    -- Verify superadmin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can delete dealer rounds';
    END IF;

    -- Fetch round
    SELECT * INTO v_round FROM public.lottery_rounds WHERE id = p_round_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round not found';
    END IF;

    -- Count submissions
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_sub_count, v_total_amt
    FROM public.submissions
    WHERE round_id = p_round_id;

    -- If announced and not yet in round_history, archive summary
    IF v_round.status = 'announced' AND NOT EXISTS (SELECT 1 FROM public.round_history WHERE round_id = p_round_id) THEN
        SELECT 
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(commission_amount), 0),
            COALESCE(SUM(payout_amount), 0)
        INTO v_total_amt, v_total_comm, v_total_payout
        FROM public.submissions
        WHERE round_id = p_round_id;

        -- Check transfers
        SELECT 
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(winnings), 0)
        INTO v_transferred_amt, v_upstream_winnings
        FROM public.bet_transfers
        WHERE round_id = p_round_id;

        -- Insert dealer round_history
        INSERT INTO public.round_history (
            dealer_id,
            round_id,
            lottery_type,
            round_date,
            open_time,
            close_time,
            total_entries,
            total_amount,
            total_commission,
            total_payout,
            transferred_amount,
            upstream_commission,
            upstream_winnings,
            profit,
            deleted_at
        ) VALUES (
            v_round.dealer_id,
            p_round_id,
            v_round.lottery_type,
            v_round.round_date,
            v_round.open_time,
            v_round.close_time,
            v_sub_count,
            v_total_amt,
            v_total_comm,
            v_total_payout,
            v_transferred_amt,
            v_upstream_comm,
            v_upstream_winnings,
            (v_total_amt - v_total_comm - v_total_payout) + (-v_transferred_amt + v_upstream_comm + v_upstream_winnings),
            NOW()
        );

        -- Insert per-user summary into user_round_history
        INSERT INTO public.user_round_history (
            user_id,
            dealer_id,
            round_id,
            lottery_type,
            round_date,
            total_entries,
            total_amount,
            total_commission,
            total_winnings,
            profit_loss,
            deleted_at
        )
        SELECT 
            s.user_id,
            v_round.dealer_id,
            p_round_id,
            v_round.lottery_type,
            v_round.round_date,
            COUNT(s.id),
            COALESCE(SUM(s.amount), 0),
            COALESCE(SUM(s.commission_amount), 0),
            COALESCE(SUM(s.payout_amount), 0),
            COALESCE(SUM(s.payout_amount), 0) + COALESCE(SUM(s.commission_amount), 0) - COALESCE(SUM(s.amount), 0),
            NOW()
        FROM public.submissions s
        WHERE s.round_id = p_round_id
        GROUP BY s.user_id;

        v_archived := TRUE;
    END IF;

    -- Delete round (cascades submissions, type_limits, number_limits, bet_transfers)
    DELETE FROM public.lottery_rounds WHERE id = p_round_id;

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'deleted_submissions', v_sub_count,
        'archived', v_archived
    );
END;
$$;

-- 3. RPC to bulk cleanup announced rounds
CREATE OR REPLACE FUNCTION public.superadmin_bulk_cleanup_announced_rounds(
    p_dealer_id UUID DEFAULT NULL,
    p_round_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round_id UUID;
    v_rounds_deleted INT := 0;
    v_total_subs_deleted INT := 0;
    v_res JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can bulk cleanup dealer rounds';
    END IF;

    FOR v_round_id IN 
        SELECT id FROM public.lottery_rounds
        WHERE status = 'announced'
          AND (p_dealer_id IS NULL OR dealer_id = p_dealer_id)
          AND (p_round_ids IS NULL OR id = ANY(p_round_ids))
    LOOP
        v_res := public.superadmin_delete_round(v_round_id);
        v_rounds_deleted := v_rounds_deleted + 1;
        v_total_subs_deleted := v_total_subs_deleted + COALESCE((v_res->>'deleted_submissions')::INT, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'rounds_deleted', v_rounds_deleted,
        'total_submissions_deleted', v_total_subs_deleted
    );
END;
$$;
```

- [ ] **Step 2: Deploy migration 195 to remote DB and verify**

Run: `cmd /c node scratch/run_db_push.cjs`
Expected: Migration 195 applied successfully.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/195_superadmin_dealer_rounds_management.sql
git commit -m "feat(db): add rpc functions for superadmin dealer rounds management and cleanup"
```

---

### Task 2: Delete & Cleanup Confirmation Modals

**Files:**
- Create: `src/components/admin/DeleteRoundConfirmModal.jsx`
- Create: `src/components/admin/BulkCleanupConfirmModal.jsx`
- Test: `src/components/admin/__tests__/DeleteRoundConfirmModal.test.jsx`

**Interfaces:**
- `DeleteRoundConfirmModal`: props `{ round, isOpen, onClose, onConfirm, isDeleting }`
- `BulkCleanupConfirmModal`: props `{ isOpen, onClose, onConfirm, isCleaning, dealerName, roundCount, totalSubmissions }`

- [ ] **Step 1: Write test for DeleteRoundConfirmModal**

Create `src/components/admin/__tests__/DeleteRoundConfirmModal.test.jsx` testing rendering, submission count display, warning text for open vs announced, and confirm/cancel button clicks.

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npm test -- src/components/admin/__tests__/DeleteRoundConfirmModal.test.jsx --run`
Expected: FAIL (component not created yet).

- [ ] **Step 3: Implement DeleteRoundConfirmModal.jsx**

Create `src/components/admin/DeleteRoundConfirmModal.jsx` with clear formatting for round name, dealer name, submission count highlight, auto-archive notice, and confirm/cancel buttons with spinner.

- [ ] **Step 4: Implement BulkCleanupConfirmModal.jsx**

Create `src/components/admin/BulkCleanupConfirmModal.jsx` summarizing scope (specific dealer or all dealers), count of announced rounds, total submissions to be purged, and confirmation button.

- [ ] **Step 5: Run test to verify it passes**

Run: `cmd /c npm test -- src/components/admin/__tests__/DeleteRoundConfirmModal.test.jsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/DeleteRoundConfirmModal.jsx src/components/admin/BulkCleanupConfirmModal.jsx src/components/admin/__tests__/DeleteRoundConfirmModal.test.jsx
git commit -m "feat(admin): add delete round and bulk cleanup confirmation modals"
```

---

### Task 3: DealerRoundsAdminTab Component & Styling

**Files:**
- Create: `src/components/admin/DealerRoundsAdminTab.jsx`
- Create: `src/components/admin/DealerRoundsAdminTab.css`
- Test: `src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx`

**Interfaces:**
- `DealerRoundsAdminTab`: props `{ currentUser }`
- Calls `supabase.rpc('superadmin_get_dealer_rounds', { p_dealer_id })`
- Calls `supabase.rpc('superadmin_delete_round', { p_round_id })`
- Calls `supabase.rpc('superadmin_bulk_cleanup_announced_rounds', { p_dealer_id })`

- [ ] **Step 1: Write test for DealerRoundsAdminTab**

Create `src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx` testing stats calculation, status tab filtering, dealer selection, and modal opening.

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npm test -- src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement DealerRoundsAdminTab.jsx**

Build component with:
- Top overview counter cards (Total, Open, Closed, Announced, Total Submissions).
- Dealer selector dropdown with search and round count badges.
- Status filter tabs (`ทั้งหมด`, `เปิดรับแทง`, `ปิดรอผล`, `ประกาศผลแล้ว`).
- Action bar with refresh button and "ล้างงวดที่ประกาศผลแล้วทั้งหมด" bulk cleanup button.
- Responsive round cards with lottery badges, dealer info, submission counter (highlighted in orange/red if > 1,000), winning numbers (if announced), and delete button.
- Integration with `DeleteRoundConfirmModal` and `BulkCleanupConfirmModal`.

- [ ] **Step 4: Implement DealerRoundsAdminTab.css**

Responsive CSS matching Big Lotto dark theme with:
- Desktop: 2-3 column grid.
- Tablet: 2 column grid.
- Mobile: 1 column card stack with touch-friendly 44px buttons, balanced padding (no horizontal overflow).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cmd /c npm test -- src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/DealerRoundsAdminTab.jsx src/components/admin/DealerRoundsAdminTab.css src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx
git commit -m "feat(admin): create responsive dealer rounds management tab and styling"
```

---

### Task 4: Integration into `Admin.jsx` & Final Verification

**Files:**
- Modify: `src/pages/Admin.jsx`
- Test: Full Vitest suite & Vite build

- [ ] **Step 1: Update Admin.jsx**

In `src/pages/Admin.jsx`:
- Import `DealerRoundsAdminTab` from `../components/admin/DealerRoundsAdminTab`.
- In `activeTab === 'draws'`, replace the obsolete `lottery_draws` table and "+ เพิ่มงวดใหม่" button with `<DealerRoundsAdminTab currentUser={currentUser} />`.
- Clean up unused `draws` state / `fetchDraws` if not needed elsewhere.

- [ ] **Step 2: Run all unit tests**

Run: `cmd /c npm test -- --run`
Expected: All tests pass.

- [ ] **Step 3: Run production build**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Verify in browser**

Launch dev server / browser subagent to verify visual appearance on desktop and mobile viewports.

- [ ] **Step 5: Final Commit & Push**

```bash
git add src/pages/Admin.jsx
git commit -m "feat(admin): integrate dealer rounds management tab into admin page"
git push origin master
```
