### Task 7: LINE Command /แจ้งผล [งวดวันที่]
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Parse and execute winner announcement command)

**Interfaces:**
- Consumes: LINE chat message `/แจ้งผล`
- Produces: Specific group payout report showing member names, winning amounts, and total group summary

- [ ] **Step 1: Implement `/แจ้งผล` parsing and processing**
  Under webhook parser:
  - If text starts with `/แจ้งผล`:
    - Parse target date.
    - Check if group is bound to a dealer.
    - Retrieve calculated winners for this round restricted to members of this group.
    - Generate a beautiful announcement Flex message showing winner names and amounts.
    - Reply to group.

- [ ] **Step 2: Deploy LINE Bot and verify build**
  Run: `powershell -ExecutionPolicy Bypass -Command "supabase functions deploy line-bot --no-verify-jwt"`
  Expected: Success.

- [ ] **Step 3: Commit and Push**
