# Design Spec: แสดงกำไร/ขาดทุน บนการ์ดงวดหวยในหน้าจัดการงวดหวย (Admin)

- **Date:** 2026-09-09
- **Status:** Approved
- **Scope:** Superadmin Admin Dashboard (`/admin` -> แอดมิน / จัดการงวดหวย)

---

## 1. วัตถุประสงค์ (Objective)

เพิ่มการแสดงผลข้อมูลทางการเงิน ได้แก่ **กำไร/ขาดทุน (Profit / Loss)**, **ยอดจ่ายรางวัล (Payout)**, **ยอดคอมมิชชั่น (Commission)** และ **ยอดแทงสุทธิหลังหักคอมมิชชั่น (Net Bet)** บนการ์ดงวดหวยแต่ละใบในแท็บ "จัดการงวดหวย" (`DealerRoundsAdminTab.jsx`) เพื่อให้ Superadmin สามารถตรวจสอบผลประกอบการของแต่ละงวดของแต่ละเจ้ามือได้อย่างรวดเร็ว

---

## 2. กฎการแสดงผลตามสถานะงวด (Business Rules)

1. **งวดที่ประกาศผลแล้ว (`is_result_announced = true` หรือ `status = 'announced'`):**
   - แสดง **ยอดจ่ายรางวัล (Total Payout):** `฿X,XXX`
   - แสดง **กำไร/ขาดทุน สุทธิ (Net Profit / Loss):** 
     - หาก `net_profit > 0`: แสดง `กำไรสุทธิ +฿X,XXX` (ตัวเลขและไอคอนสีเขียว `#22c55e`)
     - หาก `net_profit < 0`: แสดง `ขาดทุน -฿X,XXX` (ตัวเลขและไอคอนสีแดง `#ef4444`)
     - หาก `net_profit == 0`: แสดง `เสมอตัว ฿0` (สีเทาอ่อน `#94a3b8`)
   - สูตรกำไรสุทธิ:
     `net_profit = (ยอดแทงรวม - คอมมิชชั่นรวม - ยอดจ่ายรางวัล) + (-ยอดตีออก + คอมมิชชั่นตีออก)`

2. **งวดที่ยังไม่ประกาศผล (`status = 'open'` หรือ `status = 'closed'`):**
   - แสดง **คอมมิชชั่น (Commission):** `฿X,XXX`
   - แสดง **ยอดแทง - คอมมิชชั่น (Net Bet):** `฿X,XXX` (สีฟ้า `#38bdf8`) พร้อมป้ายกำกับจิ๋ว `(รอผลรางวัล)`
   - สูตร:
     `net_pending = (ยอดแทงรวม - คอมมิชชั่นรวม) + (-ยอดตีออก + คอมมิชชั่นตีออก)`

---

## 3. สถาปัตยกรรมและการเปลี่ยนแปลงข้อมูล (Architecture & Data Layer)

### 3.1 ฐานข้อมูล (Supabase Database Migration)
สร้าง Migration ใหม่ เช่น `supabase/migrations/198_add_financial_metrics_to_superadmin_rounds.sql` เพื่ออัปเดตฟังก์ชัน `superadmin_get_dealer_rounds`:

- **เพิ่มคอลัมน์ผลลัพธ์ใน RETURNS TABLE:**
  - `total_commission NUMERIC`
  - `total_payout NUMERIC`
  - `transferred_amount NUMERIC`
  - `upstream_commission NUMERIC`
  - `net_profit NUMERIC`
- **การรวมข้อมูล (Aggregation Logic):**
  - จาก `submissions`:
    - `total_amt`: `SUM(CASE WHEN COALESCE(is_deleted, FALSE) = FALSE THEN amount ELSE 0 END)`
    - `total_comm`: `SUM(CASE WHEN COALESCE(is_deleted, FALSE) = FALSE THEN COALESCE(commission_amount, 0) ELSE 0 END)`
    - `total_payout`: `SUM(CASE WHEN COALESCE(is_deleted, FALSE) = FALSE AND is_winner = TRUE THEN COALESCE(prize_amount, 0) ELSE 0 END)`
  - จาก `bet_transfers`:
    - `transferred_amt`: `COALESCE(SUM(amount), 0)`
    - `upstream_comm`: `CASE WHEN transferred_amt > 0 THEN ROUND(transferred_amt * (25.0 / 120.0)) ELSE 0 END`
  - กรณีงวดมีข้อมูลสรุปใน `round_history` แล้ว:
    - ดึงค่า `total_commission`, `total_payout`, `transferred_amount`, `upstream_commission`, `profit` จาก `round_history` มาแสดงเป็นลำดับแรก (COALESCE)

### 3.2 Frontend UI Component & Styling

1. **`src/components/admin/DealerRoundsAdminTab.jsx`:**
   - นำค่า `total_commission`, `total_payout`, `net_profit` จาก API มาคำนวณและแสดงผลในการ์ด
   - เพิ่มกล่อง `financial-metric-box` วางอยู่ใต้ `submissions-metric-box`
   - สลับการแสดงผลตามสถานะ `isAnnounced`:
     - ประกาศผลแล้ว: ฝั่งซ้ายแสดงยอดจ่ายรางวัล, ฝั่งขวาแสดงกำไร/ขาดทุน
     - ยังไม่ประกาศผล: ฝั่งซ้ายแสดงคอมมิชชั่น, ฝั่งขวาแสดงยอดแทง-คอม พร้อมข้อความกำกับ `รอผลรางวัล`

2. **`src/components/admin/DealerRoundsAdminTab.css`:**
   - สไตล์สำหรับ `.financial-metric-box` ให้มีสไตล์ Glassmorphic dark card เข้ากับดีไซน์เดิม
   - สไตล์สถานะกำไร `.profit-positive` (สีเขียว), ขาดทุน `.profit-negative` (สีแดง), เสมอตัว `.profit-neutral` (สีเทา)
   - ป้ายกำกับเล็ก `.pending-badge` (สีเหลือง/ส้มอ่อน) สำหรับงวดที่ยังไม่ออกผล

---

## 4. แผนการทดสอบและการตรวจสอบ (Verification Plan)

1. **การตรวจสอบ Database Migration:**
   - รัน SQL Migration หรือทดสอบ RPC `superadmin_get_dealer_rounds` ให้แน่ใจว่าคืนค่าครบทุกคอลัมน์ ไม่เกิด Syntax error หรือ Permission error
2. **การตรวจสอบ UI ในหน้าเว็บจริง:**
   - ตรวจสอบงวดที่ **เปิดรับแทง** (เช่น หวยลาวพัฒนา 9 ก.ย.): แสดงยอดแทง - คอมมิชชั่น พร้อมป้าย `(รอผลรางวัล)`
   - ตรวจสอบงวดที่ **ประกาศผลแล้ว** (เช่น หวยลาวพัฒนา 8 ก.ย.): แสดงยอดจ่ายรางวัล และ กำไรสุทธิ/ขาดทุน ที่มีสีเขียว/แดงตรงตามผลลัพธ์
   - ตรวจสอบ Responsiveness บนหน้าจอขนาดต่างๆ ไม่ให้ตัวเลขตกบรรทัดหรือล้นการ์ด
