# Design Specification: SuperAdmin Dealer Rounds Management & Submissions Cleanup

- **Date**: 2026-09-08
- **Feature**: Dealer Lottery Rounds Management & Cleanup for SuperAdmin
- **Status**: Approved by User

---

## 1. Problem Statement & Background

In the Big Lotto platform, each dealer creates lottery rounds (`lottery_rounds`) such as Lao Lotto, Thai Lotto, Hanoi, etc. Members and Line-bot users place bets which are recorded in `public.submissions`. Over time, a single round can accumulate tens of thousands of submission records (e.g., an announced round for dealer "เกมส์ สุราษฎร์" alone contains 12,020 submission rows).

When dealers do not regularly clean up their closed and announced rounds, the `submissions` table grows excessively, creating significant database overhead, slowing down queries, and increasing hosting storage costs.

Currently:
1. In `Admin.jsx`, the "จัดการงวดหวย" (Draw Management) tab only displays an obsolete `lottery_draws` table with a "+ เพิ่มงวดใหม่" button that is irrelevant to dealer-driven rounds.
2. SuperAdmin cannot see which rounds belong to which dealer, which rounds are open, closed, or announced, nor how many submission records are lingering in the database.
3. SuperAdmin has no tool to safely delete completed rounds and purge bulky submission records while preserving essential accounting/financial summaries for dealers and users.

---

## 2. Goals & User Requirements

1. **Dealer-Centric Rounds Overview**:
   - SuperAdmin can filter by specific dealer or view all dealers at once.
   - Displays all rounds categorized by status:
     - 🟢 **เปิดรับแทง (Open)**: Active rounds currently accepting bets.
     - 🟡 **ปิดรับแทง - รอผล (Closed)**: Closed rounds waiting for winning numbers.
     - 🟣 **ประกาศผลแล้ว (Announced)**: Finished rounds with winning numbers declared.
   - Clearly highlights the **number of submissions (`sub_count`)** and total bet volume (`total_amount`) per round so SuperAdmin can spot data bloat immediately.

2. **Safe Automatic Archiving & Deletion**:
   - When SuperAdmin deletes a completed/announced round:
     - The system automatically aggregates financial metrics (total entries, total bet amount, commission, payouts, net profit/loss) and writes them into `round_history` and `user_round_history` (if not already archived).
     - The round is deleted from `lottery_rounds`, which triggers `ON DELETE CASCADE` on `submissions`, `type_limits`, `number_limits`, and `bet_transfers`, permanently purging all submission records.
     - Dealer and member historical financial summaries remain intact in their respective history dashboards.

3. **Single & Bulk Cleanup Operations**:
   - Single round delete with detailed confirmation modal.
   - Bulk cleanup button: *"ล้างงวดที่ประกาศผลแล้วทั้งหมด"* to purge all completed rounds in a single operation.

4. **Responsive & Modern UI**:
   - Beautiful dark-themed responsive card grid matching Big Lotto styling.
   - 100% responsive across Desktop, Tablet, and Mobile: generous touch targets, well-balanced paddings, no horizontal scroll or cramped borders.

---

## 3. Architecture & Implementation Design

### 3.1 Database Architecture (Migration 195)

**Migration File**: `supabase/migrations/195_superadmin_dealer_rounds_management.sql`

#### A. PostgreSQL RPC: `superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)`
Returns a comprehensive list of rounds with aggregated stats:
- `id`, `dealer_id`, `dealer_name`, `dealer_email`
- `lottery_type`, `lottery_name`
- `round_date`, `open_time`, `close_time`
- `status`, `is_result_announced`, `winning_numbers`
- `submission_count`: `COUNT(s.id)`
- `total_amount`: `COALESCE(SUM(s.amount), 0)`
- `is_archived`: checks whether a corresponding row exists in `round_history`

#### B. PostgreSQL RPC: `superadmin_delete_round(p_round_id UUID)` (`SECURITY DEFINER`)
1. Verifies caller has `role = 'superadmin'`.
2. Inspects target round in `lottery_rounds`.
3. If `status = 'announced'`:
   - Checks if `round_history` already contains `round_id = p_round_id`.
   - If not present:
     - Aggregates `total_entries`, `total_amount`, `total_commission`, `total_payout`, and computes `profit`.
     - Inserts dealer summary into `public.round_history`.
     - Aggregates per-user submissions and inserts into `public.user_round_history`.
4. Deletes the row from `public.lottery_rounds` (cascades all `submissions`).
5. Returns JSON:
   ```json
   {
     "success": true,
     "round_id": "...",
     "deleted_submissions": 12020,
     "archived": true
   }
   ```

#### C. PostgreSQL RPC: `superadmin_bulk_cleanup_announced_rounds(p_dealer_id UUID DEFAULT NULL, p_round_ids UUID[] DEFAULT NULL)`
1. Verifies caller is superadmin.
2. Selects matching announced rounds.
3. For each round: archives to `round_history` if unarchived, then deletes the round.
4. Returns summary JSON:
   ```json
   {
     "success": true,
     "rounds_deleted": 4,
     "total_submissions_deleted": 14969
   }
   ```

---

### 3.2 Frontend Component Architecture

```
src/
├── components/
│   └── admin/
│       ├── DealerRoundsAdminTab.jsx       <-- Main tab component for draw management
│       ├── DealerRoundsAdminTab.css       <-- Responsive styles for cards, filters, stats
│       ├── DeleteRoundConfirmModal.jsx    <-- Safety confirmation modal for single delete
│       └── BulkCleanupConfirmModal.jsx    <-- Confirmation modal for bulk cleanup
└── pages/
    └── Admin.jsx                          <-- Integrates DealerRoundsAdminTab in activeTab === 'draws'
```

#### 1. `DealerRoundsAdminTab.jsx`
- **State Management**:
  - `dealers`: List of all dealers (`profiles` with `role = 'dealer'`).
  - `selectedDealerId`: `'all'` or specific `dealer.id`.
  - `statusFilter`: `'all'` | `'open'` | `'closed'` | `'announced'`.
  - `searchTerm`: Filter by lottery name or dealer name.
  - `rounds`: Data returned from `superadmin_get_dealer_rounds`.
  - `loading`: Boolean state with smooth spinner.
  - `deletingRound`: Round object targeted for single deletion.
  - `showBulkModal`: Boolean to show bulk cleanup modal.
- **Top Overview Stats**:
  - Total Rounds (`งวดทั้งหมด`)
  - Open (`เปิดรับแทง`)
  - Closed Pending Results (`ปิดรอผล`)
  - Announced (`ประกาศผลแล้ว`)
  - Total Lingering Submissions (`โพยรวมในระบบ`) with warning color indicator when high.
- **Quick Action Bar**:
  - Dealer Dropdown selector with count badges.
  - Status Pills Filter.
  - "ล้างงวดที่ประกาศผลแล้วทั้งหมด" button (enabled when `announced` rounds exist).

#### 2. `DeleteRoundConfirmModal.jsx`
- Displays:
  - Round Name & Date
  - Dealer Name & Email
  - Current Status Badge
  - Exact Submissions Count to be purged
  - Clear message:
    - If announced: Explains that financial summary will be preserved in history, and submissions will be permanently wiped to reduce database load.
    - If open/closed: Warns that bets are active and round is not yet finished.
- Confirm & Cancel buttons with active loading state.

#### 3. `BulkCleanupConfirmModal.jsx`
- Displays:
  - Selected scope (All dealers or specific dealer name)
  - Number of announced rounds to be deleted
  - Total submission records that will be permanently cleared
  - Explicit confirmation button: "ยืนยันล้างงวดที่ประกาศผลแล้วทั้งหมด"

---

### 3.3 Responsive Design (Mobile / Tablet / Desktop)

- **Mobile (< 768px)**:
  - Filter bar stacks vertically with clean margin/padding.
  - Cards take 100% width (1 column) with ample padding (`1rem`) and distinct sections.
  - Buttons have `min-height: 44px` for touch accessibility.
  - No horizontal scrolling; text wraps gracefully.
- **Tablet (768px - 1024px)**:
  - Grid with 2 columns.
  - Filter controls arranged in 2 rows.
- **Desktop (> 1024px)**:
  - Grid with 3 columns.
  - Glassmorphic card styling with subtle hover lift and borders matching Big Lotto design system.

---

## 4. Verification Plan

### Automated Verification
1. Run existing test suite (`cmd /c npm test -- --run`) to verify no regressions in admin, calculations, or parser.
2. Create unit test `src/components/admin/__tests__/DealerRoundsAdminTab.test.jsx` to test filtering, stat calculations, and modal triggers.
3. Run `cmd /c npm run build` to ensure error-free bundle compilation.

### Database & RPC Verification
1. Push migration `195_superadmin_dealer_rounds_management.sql` via `run_db_push.cjs`.
2. Test calling `superadmin_get_dealer_rounds` on remote database to verify return values and submission counts.
3. Test `superadmin_delete_round` on a test round or inspect execution plan to verify cascading delete on `submissions` and proper insertion into `round_history`.

### Manual & UI Verification
1. Inspect UI in browser on both Desktop and Mobile viewport sizes.
2. Verify dealer selection changes the displayed rounds correctly.
3. Verify status pills filter between Open, Closed, and Announced.
4. Verify delete modal shows accurate submission count and messages.
5. Verify deletion successfully removes round and refreshes stats.
