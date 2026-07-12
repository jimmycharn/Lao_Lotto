### Task 5: Auto-Layoff and Close summaries Trigger
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Extend `auto_close_notify` callback to execute auto-layoff calculations and route closing reports)

**Interfaces:**
- Consumes: Closed round ID
- Produces: Stored layoff entries and formatted messages sent to correct LINE groups

- [ ] **Step 1: Extend auto-close callback logic**
  In the `auto_close_notify` handler:
  - If `template.auto_layoff_enabled` is active, fetch bets, invoke `layoffCalculator`, and format messages.
  - Send the layoff message to groups matching `notify_layoff_bets = true`.
  - Calculate total bets, remaining stakes, and list of senders. Format and send this closing summary report to groups matching `notify_round_summary = true`.

- [ ] **Step 2: Deploy and verify Deno edge function compilation**
  Run: `powershell -ExecutionPolicy Bypass -Command "supabase functions deploy line-bot --no-verify-jwt"`
  Expected: Successful deployment.

- [ ] **Step 3: Commit changes**

---
