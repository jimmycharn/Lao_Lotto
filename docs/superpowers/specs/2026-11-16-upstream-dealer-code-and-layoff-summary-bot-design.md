# Design Specification: Upstream Dealer 5-digit Code & Line Bot Layoff Commands

**Date**: 2026-11-16  
**Status**: Approved by User  
**Author**: Antigravity Assistant  

---

## 1. Executive Summary & Objective

In lottery operations, dealers often transfer excess bets (layoff / ตีออก) to external or linked upstream dealers (`dealer_upstream_connections`). Currently, dealers have no quick way to inspect winning transferred bets, and external upstream dealers lack a standardized 5-digit identifier like regular members have (`profiles.member_code`).

This feature introduces:
1. **5-Digit Upstream Dealer Code**: Auto-generated sequential 5-digit identifier (e.g. `10001`, `10002`) for all upstream dealers, displayed via an ID badge in the web UI under **บุคลากร ➔ เจ้ามือตีออก**.
2. **LINE Bot Command `/สรุปตีออก` & `/สรุปตีออก [id]`**:
   - Authorized only for **Dealer / Admin / Manager (`line_managers`)**.
   - `/สรุปตีออก`: Returns a Flex Message displaying overall layoff financials (total sent, commission, win, net) and a ranked breakdown of all upstream dealers sorted by layoff amount descending (from highest to lowest).
   - `/สรุปตีออก [id]`: Returns a targeted Flex Message card showing detailed financial summary for that specific upstream dealer.
3. **LINE Bot Command `/โพยตีออกถูก` & `/โพยตีออกถูก [id]`**:
   - `/โพยตีออกถูก`: Lists all individual winning transferred bets across all upstream dealers for the active/latest announced round.
   - `/โพยตีออกถูก [id]`: Lists individual winning transferred bets for the specified upstream dealer.

---

## 2. Architecture & Database Changes

### 2.1 Database Schema (`dealer_upstream_connections`)

- Add `upstream_code` column to `public.dealer_upstream_connections`:
  ```sql
  ALTER TABLE public.dealer_upstream_connections
  ADD COLUMN IF NOT EXISTS upstream_code TEXT UNIQUE DEFAULT nextval('member_code_seq')::text;
  ```
- Backfill existing upstream connections with unique sequential codes:
  ```sql
  UPDATE public.dealer_upstream_connections
  SET upstream_code = nextval('member_code_seq')::text
  WHERE upstream_code IS NULL;
  ```
- Linked dealers (`is_linked = true`):
  If an upstream dealer is linked to an existing profile (`upstream_dealer_id IS NOT NULL`), fallback or resolve to `profiles.member_code` if present, ensuring complete interoperability.

---

## 3. Web App UI Changes

### 3.1 Upstream Dealer Accordion Badge (`src/components/dealer/UpstreamDealerAccordionItem.jsx`)
- In the accordion header next to `dealer.upstream_name`, render the ID badge:
  ```jsx
  {(dealer.upstream_code || dealer.upstream_profile?.member_code) && (
      <span
          className="dealer-id-badge"
          style={{
              fontSize: '0.75rem',
              color: 'var(--color-primary, #eab308)',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              padding: '0.1rem 0.45rem',
              borderRadius: '6px',
              fontWeight: '600',
              letterSpacing: '0.5px',
              display: 'inline-flex',
              alignItems: 'center'
          }}
          title={`รหัสเจ้ามือ: ${dealer.upstream_code || dealer.upstream_profile?.member_code}`}
      >
          ID: {dealer.upstream_code || dealer.upstream_profile?.member_code}
      </span>
  )}
  ```

### 3.2 Upstream Dealers Tab (`src/components/dealer/UpstreamDealersTab.jsx`)
- Ensure the query to `dealer_upstream_connections` includes `upstream_code` and `upstream_profile:upstream_dealer_id(member_code, ...)`.

---

## 4. LINE Bot Commands Implementation (`supabase/functions/line-bot/`)

### 4.1 Permission Control
Both commands require authorized sender status:
- Dealer (`profiles.role === 'dealer' && senderProfile.id === targetDealerId`)
- Superadmin / Admin (`profiles.role IN ('superadmin', 'admin')`)
- Manager (`line_managers` linked to current group and dealer)
Unauthorized senders will receive:
`❌ คำสั่งนี้ใช้ได้เฉพาะ เจ้ามือ / แอดมิน / ผู้จัดการ เท่านั้นค่ะ`

### 4.2 Data Fetching & Calculations (Adhering to Domain Rules)
- **Domain Rule #1 ("งวดวันที่")**: Use announced round close time/date (`close_time`).
- **Domain Rule #2 (Pagination)**: Query `bet_transfers` using pagination (`fetchAllRows` / range looping) with `.order('created_at', { ascending: false })`.
- Fetch `dealer_upstream_connections` for the dealer to resolve settings, commission, and `upstream_code`.
- For each transfer in `bet_transfers`:
  - Calculate win via canonical `calculateTransferWinning` / `checkTransferWin`.
  - Calculate commission via upstream settings.
  - Compute dealer aggregate totals: `totalBet`, `totalCommission`, `totalWin`, and net (`totalWin + totalCommission - totalBet`).

### 4.3 Command `/สรุปตีออก` & `/สรุปตีออก [id]`
- **Global Overview (`/สรุปตีออก`)**:
  - Sort dealers by `totalBet` descending (มากไปน้อย).
  - Generate LINE Flex Message:
    - **Header**: `สรุปตีออก (หวย...) / งวดวันที่: ... / ผลรางวัล: ...`
    - **Section 1: ภาพรวมการตีออก**:
      - ยอดส่งตีออกรวม, ค่าคอมมิชชั่นรวม, ยอดถูกรางวัลรวม, กำไรสุทธิรวม (`+฿...` หรือ `-฿...`)
    - **Section 2: รายละเอียดเจ้ามือตีออก**:
      - `ลำดับ. ชื่อเจ้ามือ (รหัส)`
      - ตีออก: `฿...` | เหลือสุทธิ: `฿...`
      - คอม: `฿...` | ถูก: `X ครั้ง/฿...`
      - สถานะ: `ต้องเก็บ ฿...` (สีเขียว) หรือ `ต้องจ่าย ฿...` (สีแดง)
- **Targeted Dealer Overview (`/สรุปตีออก [id]`)**:
  - Filter by `upstream_code` or `member_code` or name matching `[id]`.
  - If found: return single-dealer Flex card.
  - If not found: `❌ ไม่พบเจ้ามือตีออกที่มีรหัส "[id]" ในระบบค่ะ`

### 4.4 Command `/โพยตีออกถูก` & `/โพยตีออกถูก [id]`
- Filter `bet_transfers` where `isWinner = true` and `winAmount > 0`.
- If `[id]` specified: filter only transfers belonging to that target upstream dealer.
- If no winning transfers: return reply `🎉 ไม่มีรายการตีออกที่ถูกรางวัลในงวดนี้ค่ะ`.
- If winning transfers exist: return formatted message listing:
  ```text
  🏆 รายการตีออกที่ถูกรางวัล
  ประเภท: {LOTTERY_TYPE}
  งวดวันที่: {ROUND_DATE}
  🎯 ผลรางวัล: {WINNING_NUMBERS}
  -----------------------
  [เจ้ามือ: พี่จิ้ม อ้อมค่าย (10001)]
  - 654=30 (ตรง) [ถูกรางวัล: ฿16,500]
  - 06=100 (ล่าง) [ถูกรางวัล: ฿6,500]
  -----------------------
  รวมถูกรางวัลทั้งหมด: 2 รายการ
  💰 ยอดรวมรางวัล: ฿23,000
  ```

---

## 5. Verification & Testing Plan

1. **Database Migration**: Run migration, verify `upstream_code` created and backfilled with 5-digit codes.
2. **Web UI Verification**: Open Dealer Dashboard ➔ บุคลากร ➔ เจ้ามือตีออก, verify badge `ID: 10001` renders clearly beside the dealer name.
3. **Automated Unit Tests**:
   - Add unit tests in `supabase/functions/line-bot/` verifying:
     - Parser recognizes `/สรุปตีออก`, `/สรุปตีออก 10001`, `/โพยตีออกถูก`, `/โพยตีออกถูก 10001`.
     - Sorting by `totalBet` descending in `/สรุปตีออก`.
     - Calculation of winners in layoff bets.
     - Security check (unauthorized user rejection).
   - Run full test suite (`npm test`).
