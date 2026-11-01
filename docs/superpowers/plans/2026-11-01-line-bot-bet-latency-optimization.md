# LINE Bot Bet Latency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce LINE bot response latency for bet messages from 3.5–7.0+ seconds down to 0.8–1.2 seconds without compromising validation rigor or data integrity.

**Architecture:** 
1. Fast-Path execution for bet messages (bypassing `pg_net` queue lag while keeping audit logging).
2. Parallelizing independent database lookups using `Promise.all` batches.
3. Targeted submissions lookup (`fetchMatchingSubmissionsTotals`) scoped only to numbers in the current bet instead of scanning the entire round's submissions table.

**Tech Stack:** Supabase Edge Functions (Deno / TypeScript), PostgreSQL (PostgREST), Vitest.

## Global Constraints

- Domain Rule #1: "งวดวันที่" (Round Date) must remain the close/draw date.
- Domain Rule #2: Supabase Free Tier 1,000 row cap requires pagination or targeted filtering; never scan unbounded tables in single requests.
- Domain Rule #3: Strict confirmation required before any DB deletion or data mutation.
- All existing validations (temp open / close time, blocked numbers, excess limits, user commission, dealer credit) must be preserved 100%.

---

### Task 1: Targeted Submissions Query Helper for Limits Validation

**Files:**
- Modify: `supabase/functions/line-bot/index.ts:19550-19565`
- Test: `supabase/functions/line-bot/__tests__/targetedSubmissions.test.ts` (or equivalent test file)

**Interfaces:**
- Consumes: `roundId: string`, `numbersList: string[]`, `isSetBasedLottery: boolean`
- Produces: `currentTotals: Map<string, number>`, `currentExactSetsMap: Map<string, number>`, `current3SetTotalMap: Map<string, number>`

- [x] **Step 1: Write unit test for targeted submissions filtering helper**
  Create test verifying that given a round ID and a list of numbers to bet (e.g. `['872', '827', '782', '728', '287', '278']`), the helper constructs the query matching only those numbers and correctly tallies totals into `Map<string, number>`.
- [x] **Step 2: Implement `fetchTargetedSubmissionsTotals` in `index.ts`**
  Implement function that extracts unique numbers and 4-digit last-3 suffixes from `processedInserts`, queries only matching records from `submissions` (`.in('numbers', numbersList)`), and returns the mapped totals.
- [x] **Step 3: Replace full-scan `fetchAllSubmissions(activeRound.id)` in bet processing**
  In `index.ts` (lines ~19550-19565), replace `await fetchAllSubmissions(activeRound.id)` with the targeted helper when evaluating limits for the incoming bet.
- [x] **Step 4: Run test suite to verify tests pass**
  Run `npm.cmd test` and ensure existing parser and slip tests pass.

---

### Task 2: Parallelize Core Validation Database Queries with `Promise.all`

**Files:**
- Modify: `supabase/functions/line-bot/index.ts:8620-8670, 19250-19548`

**Interfaces:**
- Consumes: `groupId`, `userId`, `activeDealerId`, `lotteryType`
- Produces: `groupLink`, `dealerProfile`, `senderProfile`, `memberRecord`, `managerRecord`, `membership`, `activeRound`, `userSettings`, `dealerSubscription`, `dealerCredit`

- [x] **Step 1: Group independent initial lookups into Batch 1**
  Group `line_groups` lookup (or `line_user_sessions`) and sender `profiles` lookup into a single `Promise.all([ groupPromise, profilePromise ])`.
- [x] **Step 2: Group core validation lookups into Batch 2**
  Once `dealerId`, `lotteryType`, and `profile.id` are resolved, query `profiles` (dealer settings), `line_group_members`, `line_managers`, `user_dealer_memberships`, `lottery_rounds`, and `user_settings` in a single `Promise.all`.
- [x] **Step 3: Bundle limits lookups into Batch 3**
  Fetch `type_limits` and `number_limits` (along with targeted `submissions` and `bet_transfers` if limits need enforcement) concurrently via `Promise.all`.
- [x] **Step 4: Inline / parallelize dealer credit check**
  Pre-fetch dealer credit status in Batch 2 so `checkDealerCreditForBet` resolves in 0ms without making additional sequential round trips.
- [x] **Step 5: Run tests to verify compatibility**
  Run `npm.cmd test` to confirm no regressions in bet processing logic.

---

### Task 3: Fast-Path Synchronous Processing for Bet Messages

**Files:**
- Modify: `supabase/functions/line-bot/index.ts:8320-8375`

**Interfaces:**
- Consumes: Incoming webhook request and parsed events
- Produces: Direct synchronous execution and fast reply, with background queue audit logging

- [x] **Step 1: Add bet message detection heuristic to webhook gateway**
  In `serve` handler (around line 8323), add a detector `hasBetEvent` checking if an incoming text event contains betting patterns (digits with `=`, `*`, `-`, `x`, or slash commands `/`).
- [x] **Step 2: Route bet events through Fast-Path alongside bank slip image events**
  Update `if (hasImageEvent || hasBetEvent)` to process synchronously rather than enqueuing into `line_webhook_queue` and waiting for `pg_net`.
- [x] **Step 3: Maintain audit logging in `line_webhook_queue`**
  Ensure the queue record is created with `status: 'processing'` and updated to `'completed'` for logging and debugging purposes.
- [x] **Step 4: Run test suite**
  Run `npm.cmd test` to ensure full test suite passes.

---

### Task 4: End-to-End Latency Verification & Safety Checks

**Files:**
- Test: Vitest test suite (`npm.cmd test`)
- Edge Function build verification: `npx.cmd supabase functions serve` or dry-run validation

- [x] **Step 1: Run complete test suite**
  Execute `npm.cmd test` and verify all 826+ tests pass.
- [x] **Step 2: Validate edge cases**
  - Member not linked -> sends prompt with User ID.
  - Round closed / temp access expired -> sends polite rejection.
  - Blocked numbers -> returns blocked numbers and accepts valid ones.
  - Exceeded limits -> returns excess amounts according to settings.
  - Dealer credit exhausted -> warns with remaining credit.
  - Valid bet -> replies "✅ บันทึกโพยสำเร็จ! ✅" with cancel code.

