# Auto-Detect Settlement Mode & Thank You Message Design

## 1. Overview & Problem Statement
Currently, each LINE group must be statically configured to one of two settlement modes:
- `immediate` (งวดต่องวด - ชำระทันที)
- `cross_round` (งวดชนงวด - หักรางวัล/ยกยอด)

### Problems Identified:
1. **Mismatch False Rejections**: If a group is set to `immediate` (e.g. พี่ชัช 10013 in group 'กฤษฎิ์ชัช_มาลาเวช'), the bot calculates `pastDebts + currentRoundDebt = 13,526` and rejects the member's slip of `5,107` (which was calculated under cross-round mode or current net debt).
2. **Operational Overhead**: Dealers have to manually guess or switch the mode for each group.
3. **Receipt Closing Message**: The user requested that the success receipt ending be changed from:
   ```text
   ✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว
   ```
   to:
   ```text
   ✅ บันทึกตัดชำระเรียบร้อยแล้ว✅
   🙏 ขอบคุณมากค่ะ 🙏
   ```

---

## 2. Solution: Auto-Detect Settlement Mode (`auto`)
Add a new settlement mode option **"ตรวจสอบอัตโนมัติ (แนะนำ)"** (`value="auto"`) and make it the system default.

### 2.1 Matching Rules & Priority in `auto` Mode
When a slip is verified by SlipOK, the system evaluates three possible payment targets using member data already in memory:

| Candidate | Target Amount Formula | Matching Settlement Mode | LINE Notification Label |
| :--- | :--- | :--- | :--- |
| **Candidate 1** | ยอดค้างงวดปัจจุบัน (`currentRoundDebt`) | `immediate` (เคลียร์งวดต่องวด) | `📌 รูปแบบ: เคลียร์งวดต่องวด` |
| **Candidate 2** | หนี้ค้างเก่า - รางวัลงวดล่าสุด (`netPastDebt`) | `cross_round` (เคลียร์งวดชนงวด) | `📌 รูปแบบ: เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)` |
| **Candidate 3** | หนี้ค้างเก่า + หนี้งวดปัจจุบัน - รางวัล (`totalDebtWithCurrent`) | `cross_round` with current round (หักลบทั้งหมด) | `📌 รูปแบบ: เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)` |

#### Matching Details:
- Each candidate is evaluated against `slipAmount` with tolerance check (`Math.abs(slipAmount - candidateAmount) <= toleranceAmount`).
- If multiple candidates match (e.g., if Candidate 1 and Candidate 2 have the same amount), Candidate 2 (cross-round) or Candidate 1 takes precedence based on whether past debts exist.
- If none match, output `amount_mismatch` showing the expected amounts so the member/dealer knows what amount was expected.

---

## 3. Architecture & Data Flow

### 3.1 Database (`public.line_groups`)
- Migration `262_add_auto_settlement_mode.sql`:
  - Update `chk_line_groups_settlement_mode` check constraint from `('immediate', 'cross_round')` to `('auto', 'immediate', 'cross_round')`.
  - Set column default to `'auto'`.

### 3.2 Frontend UI (`src/components/dealer/DealerLineBotTab.jsx`)
- In settlement mode dropdowns (Table view and Mobile view):
  - Add `<option value="auto">ตรวจสอบอัตโนมัติ (แนะนำ)</option>` as first/default option.
  - Keep `<option value="immediate">งวดต่องวด (ชำระทันที)</option>`.
  - Keep `<option value="cross_round">งวดชนงวด (หักรางวัล/ยกยอด)</option>`.
  - Update default state / fallback to `'auto'`.

### 3.3 Backend Edge Function (`supabase/functions/line-bot`)
- **Performance Guarantee**:
  - `historyPreloadPromise` already pre-fetches `payments`, `user_round_history`, and `lottery_rounds` in parallel with SlipOK API call.
  - In `auto` mode, calculate `immediateRes = calculateImmediateModeDebt(...)` and `crossRes = calculateCrossRoundModeDebt(...)`.
  - Both calculations run entirely in memory within `< 2 ms`.
  - **Zero extra database queries** are performed. The response is sent via `replyToken` well within LINE's 30-second window (usually within 2-4 seconds total).
- **Execution**:
  - If matched Candidate 1: execute `allocateImmediateSettlement`.
  - If matched Candidate 2: execute `allocateCrossRoundOffset` (for past debts).
  - If matched Candidate 3: execute `allocateCrossRoundOffset` (including current round).

### 3.4 Message Formatting (`slipSettlementHelper.ts`)
- Update footer message in `formatSlipSettlementLineMessage`:
  ```typescript
  lines.push('✅ บันทึกตัดชำระเรียบร้อยแล้ว✅')
  lines.push('🙏 ขอบคุณมากค่ะ 🙏')
  ```

---

## 4. Test Strategy
1. Unit tests in `slipSettlementHelper.test.ts`:
   - Test auto-detect matching Candidate 1 (งวดต่องวด).
   - Test auto-detect matching Candidate 2 (งวดชนงวด).
   - Test auto-detect matching Candidate 3 (หักลบทั้งหมด).
   - Test auto-detect mismatch reporting.
   - Test updated thank you closing message with wai emoji.
2. Full Vitest test suite regression (all 48 test files, 785+ tests).
3. Edge function deployment verification via Supabase CLI.
