# Line Key-in Assistants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable dealers to bind multiple LINE User IDs as key-in assistants to an existing primary member account (via both Web UI and LINE Bot commands), with per-assistant summary visibility toggle (default OFF: key-in only), own-bill-only cancellation, per-group auto-register toggle, and safe auto-cleanup of empty auto-created accounts.

**Architecture:** Add a dedicated `member_line_assistants` table plus `line_groups.disable_auto_register` and `submissions.submitted_by_line_user_id` columns, backed by an atomic PostgreSQL RPC `bind_member_line_assistant` shared by Web UI and LINE Bot. Encapsulate pure LINE Bot command parsing, note formatting, and permission logic in a unit-tested `assistantHelper.ts` module integrated into `line-bot/index.ts`, and expose management controls in `MemberAccordionItem.jsx` / `Dealer.jsx` and `DealerLineBotTab.jsx`.

**Tech Stack:** PostgreSQL / Supabase Migrations & RLS, Deno TypeScript (Supabase Edge Functions), React (Vite), Vitest.

## Global Constraints
- Never delete or destroy accounts that have existing `submissions`, `user_round_history`, or `member_round_payments` rows (Domain Rule #3).
- Default permission for every new key-in assistant is `can_view_summary = false` (key-in only); dealer can toggle ON/OFF per assistant.
- Key-in assistants can cancel (`/ยกเลิก`) ONLY bills they submitted themselves (`submitted_by_line_user_id === senderLineUserId`); primary account owner and dealer/admin/manager retain full cancel rights.
- All list queries on cumulative tables must respect Supabase 1,000-row pagination / ordering rules (Domain Rule #2).
- On Windows PowerShell, run `npx.cmd` and `npm.cmd`.

---

## File Structure Map
- **Create:** `supabase/migrations/264_add_member_line_assistants_and_auto_register_toggle.sql` — table, columns, indexes, RLS policies, and `bind_member_line_assistant` RPC.
- **Create:** `supabase/functions/line-bot/assistantHelper.ts` — pure command parsers, note formatter, permission guards, and empty-account check.
- **Create:** `supabase/functions/line-bot/assistantHelper.test.ts` — unit tests for `assistantHelper.ts`.
- **Modify:** `supabase/functions/line-bot/index.ts` — integrate `assistantHelper.ts` into `memberJoined`, sender resolution, bet submission (`submitted_by_line_user_id` & `bill_note`), `/ยกเลิก`, `/สรุป`/`/โพยถูก`/`/ยอดรวม`/`/บิล` gates, and staff commands (`/ผูกผู้ช่วย`, `/ยกเลิกผู้ช่วย`, `/ผู้ช่วย`, `/ปิดรับอัตโนมัติ`, `/เปิดรับอัตโนมัติ`, `/help`).
- **Modify:** `src/pages/Dealer.jsx` — fetch `member_line_assistants` and provide CRUD handlers (`handleAddMemberAssistant`, `handleToggleAssistantSummary`, `handleDeleteMemberAssistant`).
- **Modify:** `src/components/dealer/MemberAccordionItem.jsx` — render "ผู้ช่วยคีย์ข้อมูล (Line UIDs เพิ่มเติม)" UI under Line UID with add form, per-assistant summary toggle, and remove button.
- **Modify:** `src/components/dealer/DealerLineBotTab.jsx` — add `disable_auto_register` group toggle and display assistant badges in the expanded group member list.
- **Create:** `src/components/dealer/__tests__/MemberAssistants.test.jsx` — component tests for assistant management UI.

---

### Task 1: Database Migration (`264_add_member_line_assistants_and_auto_register_toggle.sql`)

**Files:**
- Create: `supabase/migrations/264_add_member_line_assistants_and_auto_register_toggle.sql`

**Interfaces:**
- Produces:
  - Table `public.member_line_assistants (id, dealer_id, profile_id, line_user_id, assistant_name, can_view_summary, is_active, created_at, updated_at)` with `UNIQUE (dealer_id, line_user_id)`
  - Column `public.line_groups.disable_auto_register BOOLEAN NOT NULL DEFAULT false`
  - Column `public.submissions.submitted_by_line_user_id TEXT`
  - RPC `public.bind_member_line_assistant(p_dealer_id UUID, p_profile_id UUID, p_line_user_id TEXT, p_assistant_name TEXT DEFAULT NULL) RETURNS JSONB`

- [ ] **Step 1: Write migration SQL file**
  - Create `member_line_assistants` table, indexes, `updated_at` trigger/default, and RLS policies for dealers, superadmins, and primary members.
  - Add `disable_auto_register` to `line_groups`.
  - Add `submitted_by_line_user_id` + index to `submissions`.
  - Implement `bind_member_line_assistant` RPC with caller auth check (`auth.uid() = p_dealer_id` OR superadmin OR service_role), conflict checks, safe auto-cleanup of empty `line_...@biglotto.app|gmail.com` accounts (0 submissions, 0 history, 0 payments), and upsert into `member_line_assistants`.
- [ ] **Step 2: Apply migration to linked Supabase DB**
  - Run: `npx.cmd supabase db push` (or execute via `npx.cmd supabase db query --linked` if push history requires, after verifying `supabase migration list`).
  - Verify table, columns, and RPC exist in `information_schema`.
- [ ] **Step 3: Commit**
  - Commit `supabase/migrations/264_add_member_line_assistants_and_auto_register_toggle.sql`.

---

### Task 2: LINE Bot Assistant Helper Module & Unit Tests

**Files:**
- Create: `supabase/functions/line-bot/assistantHelper.ts`
- Create: `supabase/functions/line-bot/assistantHelper.test.ts`

**Interfaces:**
- Produces:
  - `parseBindAssistantCommand(text: string): { primaryCode: string; targetRef: string; assistantName: string | null } | null`
  - `parseUnbindAssistantCommand(text: string): { targetRef: string } | null`
  - `parseListAssistantsCommand(text: string): { primaryCode: string } | null`
  - `parseAutoRegisterCommand(text: string): { disable: boolean } | null`
  - `formatAssistantBillNote(assistantName: string, buyerNote?: string | null): string`
  - `canAssistantRunCommand(assistant: { can_view_summary?: boolean } | null, category: 'bet' | 'cancel' | 'summary'): boolean`
  - `canAssistantCancelBill(params: { isMainOwner: boolean; isStaffOrManager: boolean; isAssistant: boolean; senderLineUserId: string; billSubmittedByLineUserId?: string | null }): boolean`
  - `isSafeAutoCreatedEmptyAccount(params: { email?: string | null; submissionCount: number; historyCount: number; paymentCount: number }): boolean`

- [ ] **Step 1: Write failing unit tests in `supabase/functions/line-bot/assistantHelper.test.ts`**
- [ ] **Step 2: Run `npx.cmd vitest run supabase/functions/line-bot/assistantHelper.test.ts` and confirm FAIL**
- [ ] **Step 3: Implement `supabase/functions/line-bot/assistantHelper.ts`**
- [ ] **Step 4: Run `npx.cmd vitest run supabase/functions/line-bot/assistantHelper.test.ts` and confirm PASS**
- [ ] **Step 5: Commit**

---

### Task 3: Integrate Assistants & Auto-Register Toggle into LINE Bot (`supabase/functions/line-bot/index.ts`)

**Files:**
- Modify: `supabase/functions/line-bot/index.ts`

**Interfaces:**
- Consumes: `assistantHelper.ts` exports and DB table `member_line_assistants`, RPC `bind_member_line_assistant`, columns `line_groups.disable_auto_register` & `submissions.submitted_by_line_user_id`.

- [ ] **Step 1: Import `assistantHelper.ts` in `supabase/functions/line-bot/index.ts`**
- [ ] **Step 2: Update `memberJoined` handler**
  - Select `disable_auto_register` on `line_groups`.
  - Check `member_line_assistants` first before checking `profiles` or creating new auth users.
  - Respect `groupLink.disable_auto_register`: when `true`, skip auto-creating auth/profile and reply with member's LINE UID + admin binding hint.
- [ ] **Step 3: Add Staff Commands in group/manager command section**
  - `/ผูกผู้ช่วย`: verify dealer/admin/manager, resolve primary member (`member_code`), resolve target UID (direct `U...` or 5-digit `member_code` lookup), call `bind_member_line_assistant` RPC, reply friendly Thai confirmation (noting if empty auto-created account was auto-cleaned).
  - `/ยกเลิกผู้ช่วย`: verify dealer/admin/manager, delete matching assistant row by UID or unique name under `dealerId`, reply confirmation.
  - `/ผู้ช่วย`: verify dealer/admin/manager, list all active assistants for primary member code with name, UID, and permission label (`คีย์อย่างเดียว` / `คีย์+ดูสรุป`).
  - `/ปิดรับอัตโนมัติ` & `/เปิดรับอัตโนมัติ`: verify dealer/admin/manager, update `line_groups.disable_auto_register`, reply confirmation.
  - Document new commands in staff `/help` Flex card.
- [ ] **Step 4: Update Sender Resolution & Permission Gates**
  - In manager/member slash-command handler (`/สรุป`, `/ยอดรวม`, `/โพยถูก`, `/ใบโพย`, `/บิล`): check `member_line_assistants` for `userId` under `activeDealerId`. If active assistant and `!can_view_summary` (and not staff/manager), reply permission denied message. If `can_view_summary === true`, resolve `profile` to primary account.
  - In `/ยกเลิก` handler: select `submitted_by_line_user_id` from `submissions`, check `member_line_assistants`, and apply `canAssistantCancelBill`. If assistant tries to cancel someone else's bill, reply `❌ คุณสามารถยกเลิกได้เฉพาะใบโพยที่คุณเป็นผู้คีย์เองเท่านั้น`.
  - In bet-submission flow: check `member_line_assistants` for `userId` under `activeDealerId`; resolve `profile` to primary member, set `bill_note` via `formatAssistantBillNote`, and persist `submitted_by_line_user_id: userId` on all inserted `submissions` rows.
  - In slip image handler: ignore/inform when sender is an assistant with `!can_view_summary`.
- [ ] **Step 5: Run full vitest suite and verify no regressions**
- [ ] **Step 6: Commit**

---

### Task 4: Frontend UI — Member Assistants Management (`Dealer.jsx` & `MemberAccordionItem.jsx`)

**Files:**
- Modify: `src/pages/Dealer.jsx`
- Modify: `src/components/dealer/MemberAccordionItem.jsx`
- Test: `src/components/dealer/__tests__/MemberAssistants.test.jsx`

**Interfaces:**
- Consumes: `member_line_assistants` table and `bind_member_line_assistant` RPC.
- Produces: Props `assistants`, `onAddAssistant`, `onToggleAssistantSummary`, `onDeleteAssistant` on `MemberAccordionItem`.

- [ ] **Step 1: Write failing component tests in `src/components/dealer/__tests__/MemberAssistants.test.jsx`**
- [ ] **Step 2: Run `npx.cmd vitest run src/components/dealer/__tests__/MemberAssistants.test.jsx` and confirm FAIL**
- [ ] **Step 3: Implement state & handlers in `src/pages/Dealer.jsx`**
  - Fetch `member_line_assistants` for dealer (`dealer_id = user.id`).
  - Implement `handleAddMemberAssistant(profileId, lineUserId, assistantName)` calling `supabase.rpc('bind_member_line_assistant', ...)` with clear toast messages for success, auto-cleanup notice, or conflict error.
  - Implement `handleToggleAssistantSummary(assistantId, canViewSummary)` updating `member_line_assistants.can_view_summary`.
  - Implement `handleDeleteMemberAssistant(assistantId)` deleting from `member_line_assistants`.
  - Pass filtered assistants and handlers to each `MemberAccordionItem`.
- [ ] **Step 4: Implement UI section in `src/components/dealer/MemberAccordionItem.jsx`**
  - Add "ผู้ช่วยคีย์ข้อมูล (Line UIDs เพิ่มเติม)" card under `Line UID` input in `info` tab.
  - Display list of bound assistants with copyable UID, summary toggle (`ดูสรุป/โพยถูก`, default OFF), and delete button.
  - Display inline add form (`Line UID`, optional `ชื่อเรียก`, `+ เพิ่มผู้ช่วย` button).
- [ ] **Step 5: Run `npx.cmd vitest run src/components/dealer/__tests__/MemberAssistants.test.jsx` and confirm PASS**
- [ ] **Step 6: Commit**

---

### Task 5: Frontend UI — Group Auto-Register Toggle & Assistant Badge (`DealerLineBotTab.jsx`)

**Files:**
- Modify: `src/components/dealer/DealerLineBotTab.jsx`

- [ ] **Step 1: Add `handleToggleDisableAutoRegister(groupId, disabled)` updating `line_groups.disable_auto_register`**
- [ ] **Step 2: Add Checkbox `"ปิดรับสมาชิกอัตโนมัติ"` next to `บอทไม่ตอบกลับ` / `อนุญาตส่งเลข` in group controls**
- [ ] **Step 3: Fetch `member_line_assistants` for dealer in `DealerLineBotTab.jsx` and show `ผู้ช่วยคีย์ → คุณ [ชื่อ] ([รหัส])` badge in expanded group member rows**
- [ ] **Step 4: Run `npx.cmd vitest run` & `npm.cmd run build` to verify clean build**
- [ ] **Step 5: Commit**

---

### Task 6: Final Verification, Edge Function Deployment & Git Push

- [ ] **Step 1: Run full test suite (`npx.cmd vitest run`) — verify 100% pass**
- [ ] **Step 2: Run production build (`npm.cmd run build`) — verify 0 errors**
- [ ] **Step 3: Deploy `line-bot` Edge Function (`npx.cmd supabase functions deploy line-bot`)**
- [ ] **Step 4: Push commits to `origin master` and report summary to user**
