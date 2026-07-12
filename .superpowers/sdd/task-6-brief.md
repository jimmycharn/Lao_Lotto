### Task 6: Centralized AI Search & URL Memory Crawler
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Create crawling engine calling OpenRouter, prioritizing sources, mapping results, and importing to dealer rounds)

**Interfaces:**
- Consumes: Closed dates, OpenRouter API keys from system settings
- Produces: Central results records, updated URL scores, and automatic round winners calculation

- [ ] **Step 1: Implement AI Crawler in index.ts**
  Add a handler for `action: 'central_crawl_results'`.
  - Retrieve closed dates without entries in `central_lottery_results`.
  - Query remembered URLs from `central_lottery_sources`.
  - Call OpenRouter with Web Search grounding. Prompt: *"Find win numbers for [type] on [date]. Try these sources first if valid: [urls]. Return JSON."*
  - On success: write to `central_lottery_results`, increment success count in `central_lottery_sources`, and auto-import results into all matching dealer rounds (running payouts automatically and posting results /สรุป to group channels matching `notify_lottery_results = true`).
  - On failure: retry. If retries exhausted, send warning message to Superadmin groups matching `notify_admin_alerts = true`.

- [ ] **Step 2: Schedule Crawler cron job**
  Schedule via SQL:
  ```sql
  SELECT cron.schedule('process-result-crawler', '*/10 * * * *', 'SELECT process_centralized_result_crawler();');
  ```

- [ ] **Step 3: Deploy & commit**

---
