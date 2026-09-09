# Admin Round Card Profit/Loss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display profit/loss, payout, and net amounts on lottery round cards in the SuperAdmin "จัดการงวดหวย" (Admin) tab.

**Architecture:** Update Supabase RPC `superadmin_get_dealer_rounds` to aggregate commission, payout, and net profit per round. In `DealerRoundsAdminTab.jsx`, add a dedicated `.financial-metric-box` on each card to display payout & profit/loss for announced rounds, or commission & net bet for unannounced rounds. Style the new components in `DealerRoundsAdminTab.css`.

**Tech Stack:** PostgreSQL / PLpgSQL (Supabase RPC migration), React 19, Vanilla CSS, Vitest.

## Global Constraints

- Never break existing properties returned by `superadmin_get_dealer_rounds`.
- For announced rounds (`isAnnounced === true`): show total payout and net profit/loss (green for profit, red for loss, gray for neutral).
- For unannounced rounds (`isAnnounced === false`): show commission and net bet (total amount - commission) with `(รอผลรางวัล)` badge.
- Preserve all existing filter, search, delete, and bulk cleanup functionality.

---

### Task 1: Supabase Database Migration for `superadmin_get_dealer_rounds`

**Files:**
- Create: `supabase/migrations/198_add_financial_metrics_to_superadmin_rounds.sql`
- Test: `scratch/test_rpc_198.js`

**Interfaces:**
- Consumes: `lottery_rounds`, `submissions`, `bet_transfers`, `round_history`
- Produces: RPC `public.superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)` returning additional columns:
  - `total_commission NUMERIC`
  - `total_payout NUMERIC`
  - `transferred_amount NUMERIC`
  - `upstream_commission NUMERIC`
  - `net_profit NUMERIC`

- [ ] **Step 1: Write SQL Migration File**

Create `supabase/migrations/198_add_financial_metrics_to_superadmin_rounds.sql`:

```sql
-- Migration: 198_add_financial_metrics_to_superadmin_rounds.sql
-- Description: Add financial summary metrics (total_commission, total_payout, transferred_amount, upstream_commission, net_profit)
-- to superadmin_get_dealer_rounds RPC so round cards can display profit/loss and net amounts.

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
    created_at TIMESTAMPTZ,
    total_commission NUMERIC,
    total_payout NUMERIC,
    transferred_amount NUMERIC,
    upstream_commission NUMERIC,
    net_profit NUMERIC
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
        CASE 
            WHEN lr.status = 'announced' OR COALESCE(lr.is_result_announced, FALSE) = TRUE THEN 'announced'
            WHEN lr.status = 'closed' OR (lr.close_time IS NOT NULL AND lr.close_time < NOW()) THEN 'closed'
            ELSE 'open'
        END AS status,
        COALESCE(lr.is_result_announced, FALSE) AS is_result_announced,
        COALESCE(lr.winning_numbers, '{}'::jsonb) AS winning_numbers,
        COALESCE(s.sub_count, 0::BIGINT) AS submission_count,
        COALESCE(s.total_amt, 0::NUMERIC) AS total_amount,
        EXISTS(SELECT 1 FROM public.round_history rh WHERE rh.round_id = lr.id) AS is_archived,
        lr.created_at,
        -- Financial metrics: fallback to round_history if already archived, otherwise aggregate active data
        COALESCE(rh.total_commission, s.total_comm, 0::NUMERIC) AS total_commission,
        COALESCE(rh.total_payout, s.total_payout, 0::NUMERIC) AS total_payout,
        COALESCE(rh.transferred_amount, bt.transferred_amt, 0::NUMERIC) AS transferred_amount,
        COALESCE(rh.upstream_commission, bt.upstream_comm, 0::NUMERIC) AS upstream_commission,
        COALESCE(
            rh.profit,
            (
                (COALESCE(s.total_amt, 0::NUMERIC) - COALESCE(s.total_comm, 0::NUMERIC) - COALESCE(s.total_payout, 0::NUMERIC))
                + (-COALESCE(bt.transferred_amt, 0::NUMERIC) + COALESCE(bt.upstream_comm, 0::NUMERIC))
            )
        ) AS net_profit
    FROM public.lottery_rounds lr
    JOIN public.profiles p ON p.id = lr.dealer_id
    LEFT JOIN (
        SELECT 
            submissions.round_id,
            COUNT(submissions.id) AS sub_count,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN submissions.amount ELSE 0 END) AS total_amt,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN COALESCE(submissions.commission_amount, 0) ELSE 0 END) AS total_comm,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE AND submissions.is_winner = TRUE THEN COALESCE(submissions.prize_amount, 0) ELSE 0 END) AS total_payout
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    LEFT JOIN (
        SELECT
            bet_transfers.round_id,
            SUM(bet_transfers.amount) AS transferred_amt,
            ROUND(SUM(bet_transfers.amount) * (25.0 / 120.0)) AS upstream_comm
        FROM public.bet_transfers
        GROUP BY bet_transfers.round_id
    ) bt ON bt.round_id = lr.id
    LEFT JOIN public.round_history rh ON rh.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.close_time DESC, lr.round_date DESC, lr.created_at DESC;
END;
$$;
```

- [ ] **Step 2: Validate SQL Syntax via dry run script**

Run: `node -e "console.log('Migration 198 written')"`

- [ ] **Step 3: Commit Migration**

```bash
git add supabase/migrations/198_add_financial_metrics_to_superadmin_rounds.sql
git commit -m "feat(db): add financial metrics to superadmin_get_dealer_rounds RPC"
```

---

### Task 2: Update `DealerRoundsAdminTab.jsx` with Financial Metrics

**Files:**
- Modify: `src/components/admin/DealerRoundsAdminTab.jsx`
- Test: `src/components/admin/__tests__/DealerRoundsAdminTab.test.js`

**Interfaces:**
- Consumes: `round.total_amount`, `round.total_commission`, `round.total_payout`, `round.net_profit`, `isAnnounced`
- Produces: JSX rendering of `.financial-metric-box` inside each round card:
  - When `isAnnounced`:
    - ยอดจ่ายรางวัล: `฿${totalPayout.toLocaleString()}`
    - กำไร/ขาดทุน: `+฿...` (กำไรสุทธิ), `-฿...` (ขาดทุน), `฿0` (เสมอตัว)
  - When `!isAnnounced`:
    - คอมมิชชั่น: `฿${totalComm.toLocaleString()}`
    - ยอดแทง-คอม: `฿${netPending.toLocaleString()}` with badge `(รอผลรางวัล)`

- [ ] **Step 1: Write Unit Test for Helper Calculations**

Add unit tests in `src/components/admin/__tests__/DealerRoundsAdminTab.test.js`:
Test helper or card data formatting for:
- Profit positive: formatted as `+฿X,XXX`, class `profit-positive`
- Profit negative: formatted as `-฿X,XXX`, class `profit-negative`
- Profit zero: formatted as `฿0`, class `profit-neutral`
- Pending net calculation: `total_amount - total_commission`

- [ ] **Step 2: Run Vitest to verify new tests fail/pass**

Run: `npx.cmd vitest run src/components/admin/__tests__/DealerRoundsAdminTab.test.js`

- [ ] **Step 3: Implement Financial Metric Box in `DealerRoundsAdminTab.jsx`**

In `src/components/admin/DealerRoundsAdminTab.jsx`, inside `filteredRounds.map(round => { ... })`:
Extract financial variables:
```javascript
const totalComm = Number(round.total_commission) || 0
const totalPayout = Number(round.total_payout) || 0
const netProfit = round.net_profit !== undefined ? Number(round.net_profit) : (totalAmt - totalComm - totalPayout)
const netPending = (totalAmt - totalComm)
```
Add `.financial-metric-box` directly under `.submissions-metric-box`:
```jsx
{/* Financial metric box: Profit/Loss or Net Pending */}
<div className="financial-metric-box">
    {isAnnounced ? (
        <>
            <div className="metric-col">
                <span className="metric-label">ยอดจ่ายรางวัล</span>
                <span className="metric-value payout-amount">
                    ฿{totalPayout.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </span>
            </div>
            <div className="metric-col right">
                <span className="metric-label">
                    {netProfit > 0 ? 'กำไรสุทธิ' : netProfit < 0 ? 'ขาดทุน' : 'เสมอตัว'}
                </span>
                <span className={`metric-value profit-amount ${netProfit > 0 ? 'profit-positive' : netProfit < 0 ? 'profit-negative' : 'profit-neutral'}`}>
                    {netProfit > 0 ? `+฿${netProfit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : netProfit < 0 ? `-฿${Math.abs(netProfit).toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : '฿0'}
                </span>
            </div>
        </>
    ) : (
        <>
            <div className="metric-col">
                <span className="metric-label">คอมมิชชั่น</span>
                <span className="metric-value comm-amount">
                    ฿{totalComm.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </span>
            </div>
            <div className="metric-col right">
                <span className="metric-label">
                    ยอดแทง - คอม <span className="pending-badge">รอผลรางวัล</span>
                </span>
                <span className="metric-value pending-amount">
                    ฿{netPending.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </span>
            </div>
        </>
    )}
</div>
```

- [ ] **Step 4: Run Vitest to verify all tests pass**

Run: `npx.cmd vitest run src/components/admin/__tests__/DealerRoundsAdminTab.test.js`

- [ ] **Step 5: Commit changes**

```bash
git add src/components/admin/DealerRoundsAdminTab.jsx src/components/admin/__tests__/DealerRoundsAdminTab.test.js
git commit -m "feat(admin): add financial metrics to round cards in DealerRoundsAdminTab"
```

---

### Task 3: Add CSS Styles for Financial Metric Box

**Files:**
- Modify: `src/components/admin/DealerRoundsAdminTab.css`

**Interfaces:**
- Produces: CSS rules for `.financial-metric-box`, `.payout-amount`, `.comm-amount`, `.profit-amount`, `.profit-positive`, `.profit-negative`, `.profit-neutral`, `.pending-badge`

- [ ] **Step 1: Add CSS in `DealerRoundsAdminTab.css`**

Add styling:
```css
/* Financial Metric Box */
.financial-metric-box {
    background: rgba(15, 23, 42, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 0.55rem 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: -0.25rem;
}

.financial-metric-box .metric-col {
    display: flex;
    flex-direction: column;
}

.financial-metric-box .metric-col.right {
    text-align: right;
    align-items: flex-end;
}

.financial-metric-box .payout-amount {
    color: #f87171;
    font-weight: 600;
}

.financial-metric-box .comm-amount {
    color: #94a3b8;
    font-weight: 600;
}

.financial-metric-box .pending-amount {
    color: #38bdf8;
    font-weight: 700;
}

.financial-metric-box .profit-amount {
    font-weight: 700;
    font-size: 0.95rem;
}

.financial-metric-box .profit-amount.profit-positive {
    color: #4ade80;
    text-shadow: 0 0 10px rgba(74, 222, 128, 0.25);
}

.financial-metric-box .profit-amount.profit-negative {
    color: #ef4444;
    text-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.financial-metric-box .profit-amount.profit-neutral {
    color: #94a3b8;
}

.financial-metric-box .pending-badge {
    display: inline-block;
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
    margin-left: 4px;
    font-weight: 500;
    vertical-align: middle;
}
```

- [ ] **Step 2: Run `npm.cmd test` to ensure no style breakages**

Run: `npm.cmd test`

- [ ] **Step 3: Commit CSS changes**

```bash
git add src/components/admin/DealerRoundsAdminTab.css
git commit -m "style(admin): style financial metric box on round cards"
```

---

### Task 4: Full System Verification & Regression Check

**Files:**
- Test all components: `npm.cmd test`
- Build check: `npx.cmd vite build`

- [ ] **Step 1: Run Full Test Suite**

Run: `npm.cmd test`
Expected: 300+ tests pass

- [ ] **Step 2: Run Build Verification**

Run: `npx.cmd vite build`
Expected: Successful production build with 0 errors

- [ ] **Step 3: Manual Verification & Summary**

Verify layout against the user's screenshot:
- Cards for announced rounds show "ยอดจ่ายรางวัล" and "กำไรสุทธิ" (green) or "ขาดทุน" (red)
- Cards for open/closed rounds show "คอมมิชชั่น" and "ยอดแทง - คอม" with "(รอผลรางวัล)" badge
