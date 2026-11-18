# Design Spec: Line Key-in Assistants (ระบบผู้ช่วยคีย์ข้อมูลในกลุ่ม LINE)

**Date:** 2026-11-18  
**Status:** Approved  

---

## 1. Overview & Goals
Enable dealers to assign multiple LINE users (by LINE User ID / UID) as **Key-in Assistants (ผู้ช่วยคีย์ข้อมูล)** mapped to an existing primary member account (Many-to-One). When any linked assistant submits lottery bets in a bound LINE group, the bets are recorded under the primary member's account (inheriting their commissions, payout rates, and settlement ledger), with clear audit trails and strict per-assistant permission controls.

Additionally, provide a per-group toggle (`disable_auto_register`) and bot commands (`/ปิดรับอัตโนมัติ`, `/เปิดรับอัตโนมัติ`) so dealers can prevent automatic account creation for new group members when desired, plus safe auto-cleanup when converting freshly auto-created empty accounts into assistants.

---

## 2. Database Schema (Migration `264_add_member_line_assistants_and_auto_register_toggle.sql`)

### 2.1 New Table: `public.member_line_assistants`
```sql
CREATE TABLE IF NOT EXISTS public.member_line_assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL,
    assistant_name TEXT,
    can_view_summary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT member_line_assistants_dealer_line_uid_unique UNIQUE (dealer_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_line_assistants_dealer_profile
    ON public.member_line_assistants (dealer_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_member_line_assistants_line_uid
    ON public.member_line_assistants (line_user_id)
    WHERE is_active = true;
```

**RLS Policies:**
- Dealer (`dealer_id = auth.uid()`) and SuperAdmin (`role = 'superadmin'`) have full `SELECT`, `INSERT`, `UPDATE`, `DELETE` access.
- Primary member (`profile_id = auth.uid()`) has `SELECT` access to view their own assistants.

### 2.2 Alter Table: `public.line_groups`
```sql
ALTER TABLE public.line_groups
    ADD COLUMN IF NOT EXISTS disable_auto_register BOOLEAN NOT NULL DEFAULT false;
```

### 2.3 Alter Table: `public.submissions`
```sql
ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS submitted_by_line_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_bill_submitted_by
    ON public.submissions (bill_id, submitted_by_line_user_id)
    WHERE bill_id IS NOT NULL;
```

### 2.4 Atomic RPC: `public.bind_member_line_assistant`
Single source of truth used by both Web UI and LINE Bot (`SECURITY DEFINER`, verifying `auth.uid() = p_dealer_id`, superadmin role, or service_role):
- Inputs: `(p_dealer_id UUID, p_profile_id UUID, p_line_user_id TEXT, p_assistant_name TEXT DEFAULT NULL)`
- Validates `p_profile_id` is an active member of `p_dealer_id`.
- Checks if `p_line_user_id` is already the primary `line_user_id` of `p_profile_id` → returns `{ success: false, error_code: 'ALREADY_PRIMARY_UID' }`.
- Checks if `p_line_user_id` is bound to another profile `v_other`:
  - Checks `v_other.email ~* '^line_.*@(biglotto\.app|gmail\.com)$'` AND `submissions = 0`, `user_round_history = 0`, `member_round_payments = 0`.
  - If safe empty auto-created account: sets `profiles.line_user_id = NULL` on `v_other` and sets `user_dealer_memberships.status = 'inactive'` for `(v_other.id, p_dealer_id)`, and sets `v_cleaned_up = true`.
  - Otherwise: returns `{ success: false, error_code: 'UID_IN_USE_WITH_HISTORY', conflict_name: v_other.full_name, conflict_code: v_other.member_code }`.
- Upserts into `member_line_assistants` (`ON CONFLICT (dealer_id, line_user_id) DO UPDATE`) setting `profile_id = p_profile_id`, `assistant_name = COALESCE(NULLIF(TRIM(p_assistant_name), ''), v_default_name)`, `can_view_summary = false`, `is_active = true`, `updated_at = now()`.
- Returns JSONB `{ success: true, assistant: row, cleaned_up: v_cleaned_up, cleaned_up_name: v_cleaned_up_name }`.

---

## 3. Core Logic & LINE Bot Behavior

### 3.1 Modular Helper (`supabase/functions/line-bot/assistantHelper.ts`)
Encapsulate pure parsing, permission checking, note formatting, and cleanup safety checks:
- `parseBindAssistantCommand(text)`:
  - Matches `/ผูกผู้ช่วย <primaryMemberCode5Digits> <targetUidOrMemberCode5Digits> [optionalAssistantName]`
- `parseUnbindAssistantCommand(text)`:
  - Matches `/ยกเลิกผู้ช่วย <uidOrAssistantName>`
- `parseListAssistantsCommand(text)`:
  - Matches `/ผู้ช่วย <primaryMemberCode5Digits>`
- `parseAutoRegisterCommand(text)`:
  - Matches `/ปิดรับอัตโนมัติ` → `{ action: 'disable' }` and `/เปิดรับอัตโนมัติ` → `{ action: 'enable' }`
- `formatAssistantBillNote(assistantName, buyerNote)`:
  - If `buyerNote` is non-empty: `${buyerNote} (ผู้ช่วย: ${assistantName})`
  - Else: `ผู้ช่วย: ${assistantName}`
- `canAssistantRunCommand(assistant, commandCategory)`:
  - `bet`: always allowed (subject to group bet permissions)
  - `cancel`: allowed at command gate, then verified per-bill via `canAssistantCancelBill`
  - `summary` (`/สรุป`, `/ยอดรวม`, `/โพยถูก`, `/ใบโพย`, `/บิล`): allowed **only if** `assistant.can_view_summary === true`
- `canAssistantCancelBill({ isMainOwner, isStaffOrManager, isAssistant, senderLineUserId, billSubmittedByLineUserId })`:
  - Main owner (`senderProfile.id === submission.user_id`) → `true`
  - Dealer / Admin / Active Manager → `true`
  - Assistant → `true` **only if** `billSubmittedByLineUserId === senderLineUserId`
- `isSafeAutoCreatedEmptyAccount({ email, submissionCount, historyCount, paymentCount })`:
  - Returns `true` ONLY when `email` matches `/^line_.*@(biglotto\.app|gmail\.com)$/i` AND `submissionCount === 0 && historyCount === 0 && paymentCount === 0`.

### 3.2 `memberJoined` Handling (`supabase/functions/line-bot/index.ts`)
When a user joins a bound group (`groupLink`):
1. Check `member_line_assistants` for `(dealer_id = groupLink.dealer_id, line_user_id = mUserId, is_active = true)` joined with primary `profiles(full_name, member_code)`.
   - If found: **do NOT create any auth user or profile**. Ensure `line_group_members` is upserted with `user_id = assistant.profile_id`. Reply welcoming them as assistant of the primary account.
2. Otherwise check existing `profiles.line_user_id = mUserId`.
   - If found: existing welcome-back behavior.
3. Otherwise (brand-new LINE user):
   - If `groupLink.disable_auto_register === true`: **do NOT create auth user or profile**. Upsert `line_group_members` with `user_id = null`. Reply welcoming them with their LINE UID and instructing admin to bind them via `/ผูกผู้ช่วย [รหัสสมาชิก] [UID]` or Web UI.
   - If `groupLink.disable_auto_register === false`: existing auto-registration flow.

### 3.3 Sender Resolution & Bet Submission (`supabase/functions/line-bot/index.ts`)
For group messages (when `groupLink` is active):
1. Query `member_line_assistants` for `(dealer_id = activeDealerId, line_user_id = userId, is_active = true)`.
2. If an active assistant record exists (`groupAssistant`):
   - Resolve `profile` from `profiles` where `id = groupAssistant.profile_id` and `is_active = true`.
   - Do NOT treat sender as `isDealer` / `isAdmin` even if primary account had elevated role (assistant stays scoped to key-in role unless they are also a `line_managers` entry).
   - When submitting bets:
     - Store `user_id = profile.id` (primary member).
     - Store `submitted_by_line_user_id = userId` (assistant's actual LINE UID).
     - Format `bill_note` using `formatAssistantBillNote(assistantDisplayName, buyerNote)`.
3. For non-assistant LINE submissions: also store `submitted_by_line_user_id = userId` for consistency.

### 3.4 Permission Gates for Assistants
- **Summary / Report commands (`/สรุป`, `/ยอดรวม`, `/โพยถูก`, `/ใบโพย`, `/บิล`):**
  - If sender is resolved via `groupAssistant` and `!groupAssistant.can_view_summary` (and not dealer/admin/manager): reply `❌ บัญชีผู้ช่วยคีย์ของคุณเปิดสิทธิ์ไว้สำหรับคีย์โพยเท่านั้น หากต้องการดูสรุปยอดกรุณาแจ้งเจ้ามือเปิดสิทธิ์ให้ค่ะ` and stop.
  - If `groupAssistant.can_view_summary === true`: allow running own-account summary/winning-ticket queries using `profile.id` (primary member).
- **Cancel command (`/ยกเลิก [bill_id]`):**
  - Fetch `submitted_by_line_user_id` alongside `id, user_id, amount, round_id` from `submissions`.
  - Apply `canAssistantCancelBill`. If assistant attempts to cancel a bill with `submitted_by_line_user_id !== userId`, reply `❌ คุณสามารถยกเลิกได้เฉพาะใบโพยที่คุณเป็นผู้คีย์เองเท่านั้น`.
- **Bank Slips (Image messages):**
  - If sender is `groupAssistant` and `!groupAssistant.can_view_summary`, ignore or gently inform that slip settlement must be sent by the primary account or admin.

### 3.5 Staff Commands (Dealer / Admin / Active Manager only)
1. `/ผูกผู้ช่วย [primaryCode] [uidOrCode] [optionalName]`:
   - Resolve primary member by `member_code = primaryCode` belonging to `dealerId` (`user_dealer_memberships`).
   - Resolve target `line_user_id`:
     - If `uidOrCode` starts with `U` and length >= 20 → treat as direct LINE UID.
     - Else if 5-digit code → look up profile by `member_code` to get its `line_user_id` (and `full_name` as default `assistant_name`).
   - Validate UID is not already bound as primary `profiles.line_user_id` of an active member with history:
     - If UID belongs to another profile: check `isSafeAutoCreatedEmptyAccount` (count `submissions`, `user_round_history`, `member_round_payments`).
     - If safe empty auto-created account: unlink `profiles.line_user_id = null` and set `user_dealer_memberships.status = 'inactive'` for that dealer (preserving DB safety while cleanly removing the ghost entry from active member lists).
     - If that profile has existing transactions/bets: refuse and warn dealer to clear/review it manually.
   - Upsert into `member_line_assistants` with `can_view_summary = false`, `is_active = true`.
   - Reply confirmation with primary member name, assistant name, UID, and default permission (`คีย์โพยอย่างเดียว`).
2. `/ยกเลิกผู้ช่วย [uidOrName]`:
   - Find matching active assistant under `dealerId` by exact `line_user_id` or case-insensitive `assistant_name` (if ambiguous name, ask to specify UID).
   - Delete (or deactivate) the record and reply confirmation.
3. `/ผู้ช่วย [primaryCode]`:
   - List all active assistants linked to that member under `dealerId`, showing name, UID, and permission badge (`คีย์อย่างเดียว` / `คีย์+ดูสรุป`).
4. `/ปิดรับอัตโนมัติ` & `/เปิดรับอัตโนมัติ`:
   - Update `line_groups.disable_auto_register` to `true` / `false` for the current group and reply confirmation.
5. Update `/help` / `/คำสั่ง` guide for staff to document the new commands.

---

## 4. Web Frontend UI

### 4.1 Member Management (`src/components/dealer/MemberAccordionItem.jsx` & `src/pages/Dealer.jsx`)
- Fetch dealer's `member_line_assistants` in `Dealer.jsx` and pass `assistants` (filtered by `profile_id === member.id`) plus CRUD handlers (`onAddAssistant`, `onToggleAssistantSummary`, `onDeleteAssistant`) down to `MemberAccordionItem`.
- Inside the "ข้อมูลทั่วไป" tab, directly below the existing **Line UID** field:
  - Section title: **"ผู้ช่วยคีย์ข้อมูล (Line UIDs เพิ่มเติม)"** with count badge.
  - List of current assistants: each row displays:
    - Assistant Name + Line UID (monospaced, copyable)
    - Toggle switch: **"ดูสรุป/โพยถูก"** (`can_view_summary`, default OFF = คีย์อย่างเดียว)
    - Delete button (`×`) with confirmation
  - Inline add form:
    - Input: `Line UID ผู้ช่วย (เช่น U94906fc...)`
    - Input: `ชื่อเรียกผู้ช่วย (ไม่บังคับ)`
    - Button: `+ เพิ่มผู้ช่วย`
  - Auto-Cleanup on Web Add: mirrors the same safety check (if the entered UID is attached to a freshly auto-created empty account with 0 submissions/history/payments, automatically unlink and deactivate that empty membership under this dealer; otherwise show clear error message).

### 4.2 LINE Group Settings (`src/components/dealer/DealerLineBotTab.jsx`)
- Add checkbox **"ปิดรับสมาชิกอัตโนมัติ"** (`disable_auto_register`) next to `บอทไม่ตอบกลับ` and `อนุญาตส่งเลข` in each group card.
- In the expanded group member list table (`renderExpandedGroupContent`), check if a member's `line_user_id` is in `member_line_assistants` and display a clear badge: `ผู้ช่วยคีย์ → คุณ [ชื่อบัญชีหลัก] ([รหัส 5 ตัว])`.

---

## 5. Verification Plan
1. **Unit tests (`supabase/functions/line-bot/assistantHelper.test.ts`):**
   - Command parsers (`/ผูกผู้ช่วย`, `/ยกเลิกผู้ช่วย`, `/ผู้ช่วย`, `/ปิดรับอัตโนมัติ`, `/เปิดรับอัตโนมัติ`)
   - Bill note formatting (with and without buyer note)
   - Permission gates (bet, summary with flag false/true, cancel own vs others vs main owner vs manager)
   - Safe auto-cleanup eligibility (`isSafeAutoCreatedEmptyAccount`)
2. **Frontend component tests (`src/components/dealer/__tests__/MemberAssistants.test.jsx`):**
   - Renders assistants list, default summary toggle OFF, add assistant callback, toggle permission callback, delete callback.
3. **Database migration verification:** Apply `264_add_member_line_assistants_and_auto_register_toggle.sql` via Supabase CLI and verify table/columns/constraints.
4. **Full test suite & build:** `npx.cmd vitest run` + `npm.cmd run build` + `npx.cmd supabase functions deploy line-bot`.
