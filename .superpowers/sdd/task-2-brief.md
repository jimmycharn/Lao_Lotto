### Task 2: Web Dashboard UI - LINE Group Settings
**Files:**
- Modify: `src/pages/Dealer.jsx` (Add toggle switches for group-level notification routing in the LINE Groups tab)

**Interfaces:**
- Consumes: Updated database schema columns for `line_groups`
- Produces: Enhanced UI settings in the LINE group listing/edit view

- [ ] **Step 1: Write UI code for toggles**
  Locate the LINE Groups list rendering block in `Dealer.jsx` and insert switches for:
  - `notify_round_created`
  - `notify_admin_alerts`
  - `notify_layoff_bets`
  - `notify_round_summary`
  - `notify_lottery_results`
  Include api handlers to update these switches inside the database via Supabase client.

- [ ] **Step 2: Verify compilation**
  Run: `powershell -ExecutionPolicy Bypass -Command "npm run build"`
  Expected: Successful compilation of UI without errors.

- [ ] **Step 3: Commit changes**

---
