# Dealer History Member Settlement Payments Design

**Date:** 2026-09-10  
**Topic:** บันทึกการรับ-จ่ายเงินและแสดงยอดคงค้างของสมาชิกในหน้างวดหวยแท็บประวัติ (Dealer History Tab Settlement)  
**Status:** Approved by User  

---

## 1. Overview & Problem Statement

ในหน้า **Dealer Dashboard** ที่แท็บ **ประวัติ** (History) เมื่อขยายดูรายละเอียดของงวดที่ประกาศผลแล้ว จะมีตารางสรุป *"รายละเอียดการส่งเลขของสมาชิกในงวดนี้"* ซึ่งแสดงรายการสมาชิก, จำนวนรายการ, ยอดส่ง, ค่าคอม, ถูกรางวัล, และกำไรเจ้ามือ

อย่างไรก็ตาม ในการดำเนินงานจริงของเจ้ามือหวย:
1. สมาชิกแต่ละคนอาจยังไม่ได้ชำระเงินค่าหวยให้เจ้ามือทันที
2. เจ้ามืออาจต้องจ่ายเงินรางวัลให้สมาชิกที่ถูกรางวัล หรือหักลบกลบหนี้กับยอดแทง
3. ปัจจุบันยังไม่มีฟังก์ชันบันทึกการรับเงิน/จ่ายเงินในแต่ละงวด ทำให้เจ้ามือไม่ทราบว่า **ใครยังค้างเจ้ามือเท่าไร** หรือ **เจ้ามือยังค้างใครเท่าไร**
4. เจ้ามือต้องการบันทึก วันที่จ่าย, จำนวนเงิน, ประเภทรายการ (จ่ายเฉพาะเงินรางวัล หรือ เคลียร์ยอดสุทธิ) และดูยอดคงค้างแบบเรียลไทม์ได้ทั้งบน Desktop และ Mobile

---

## 2. Settlement Logic & Accounting Math

### 2.1 ยอดตั้งต้นในแต่ละงวด (Initial Balance)

สำหรับสมาชิกแต่ละคนในงวดนั้น:
$$\text{Initial Balance} = (\text{ยอดส่ง} - \text{ค่าคอม}) - \text{ถูกรางวัล}$$
*(หมายเหตุ: ยอดนี้คือค่าเดียวกับ `กำไรเจ้ามือ` ในตารางสรุป)*

- **ถ้า Initial Balance > 0:** สมาชิก/คนส่งเลขต้องจ่ายเงินให้เจ้ามือ (แสดงเป็นค่าบวก `+`)
- **ถ้า Initial Balance < 0:** เจ้ามือต้องจ่ายเงินรางวัลให้สมาชิก (แสดงเป็นค่าลบ `-`)
- **ถ้า Initial Balance = 0:** เสมอตัว ไม่มียอดต้องชำระ

### 2.2 การบันทึกรายการจ่าย/รับเงิน (Payment Transactions)

รองรับ 2 ประเภทรายการหลัก:
1. **เคลียร์ยอดสุทธิ (Net Settlement):**
   - ทิศทาง **ผู้ส่งเลขจ่ายให้เจ้ามือ** (`member_to_dealer`): สมาชิกโอนเงินค่าหวยให้เจ้ามือ
   - ทิศทาง **เจ้ามือจ่ายให้ผู้ส่งเลข** (`dealer_to_member`): เจ้ามือโอนเงินเคลียร์ยอดให้สมาชิก
2. **เจ้ามือจ่ายเฉพาะเงินถูกรางวัล (Prize Payout Only):**
   - เจ้ามือโอนเงินรางวัลให้สมาชิกก่อนแยกต่างหาก โดยยังไม่หักลบค่าหวย
   - ทิศทาง: `dealer_to_member`

### 2.3 การคำนวณยอดคงค้างปัจจุบัน (Current Outstanding Balance)

$$\text{Current Balance} = \text{Initial Balance} - \sum \text{Paid By Member} + \sum \text{Paid By Dealer}$$

- **Current Balance > 0:** แสดง `+฿X` 🟡 (คนส่งยังค้างเจ้ามือ)
- **Current Balance < 0:** แสดง `-฿X` 🔴 (เจ้ามือยังค้างคนส่ง)
- **Current Balance = 0:** แสดง `฿0` หรือ `ชำระครบแล้ว` 🟢 (เคลียร์ครบถ้วน)

---

## 3. UI/UX Specifications

### 3.1 ตารางหลัก (Member Breakdown Table)
- เพิ่มคอลัมน์ด้านขวาสุด: **"สถานะ / ยอดคงค้าง"**
- แต่ละแถวของสมาชิกมี Badge แสดงยอดคงค้างปัจจุบัน:
  - 🟡 `+฿2,229` (ค้างชำระเจ้ามือ)
  - 🔴 `-฿1,400` (เจ้ามือค้างจ่าย)
  - 🟢 `ชำระครบแล้ว` (฿0)
- คลิกที่แถวของสมาชิก หรือไอคอนลูกศร เพื่อ **คลี่เปิดแถบย่อขยายด้านล่าง (Inline Expandable Sub-Row)**

### 3.2 แถบคลี่ขยายใต้แถว (Expanded Inline Panel)
เมื่อคลิกเปิดแถวสมาชิก จะแสดงแผงการเงินแบบ Inline ประกอบด้วย 3 ส่วน:

1. **แถบสรุปสถานะการเงิน (Summary Strip):**
   - แสดงตัวเลขสี่ช่อง:
     - `ยอดส่งสุทธิ (ยอดส่ง - คอม)`
     - `เงินถูกรางวัล`
     - `ชำระแล้ว (รวม)`
     - `ยอดคงค้างปัจจุบัน (+ / -)` พร้อมไฮไลต์สีตามสถานะ
2. **ปุ่มการทำงานด่วน (Quick Actions):**
   - **ปุ่ม "⚡ เคลียร์ครบจำนวน":** กดแล้วกรอกยอดค้างให้อัตโนมัติในคลิกเดียว พร้อมบันทึกทันที
   - **ปุ่ม "+ บันทึกการจ่าย/รับเงิน":** เปิดฟอร์มบันทึกแบบ Inline ให้ระบุยอดและวันที่เอง
3. **ฟอร์มบันทึกการเงิน (Inline Compact Form):**
   - **ประเภทรายการ (Toggle Button):**
     - โหมดเคลียร์ยอดสุทธิ (`คนส่งจ่ายเจ้ามือ` หรือ `เจ้ามือจ่ายคนส่ง`) - ระบบเลือกทิศทางเริ่มต้นตามยอดคงค้างให้อัตโนมัติ
     - โหมดเจ้ามือจ่ายเฉพาะรางวัล (แสดงเมื่อมีเงินถูกรางวัล)
   - **วันที่ทำรายการ (Date Picker):** ค่าเริ่มต้นคือ "วันนี้"
   - **จำนวนเงิน (Amount):** มีปุ่ม Preset ให้กด เช่น `[ยอดค้าง ฿X]` หรือพิมพ์จำนวนเอง (รองรับผ่อนชำระ/จ่ายบางส่วน)
   - **หมายเหตุ (Notes):** ข้อความสั้นๆ เช่น ธนาคาร, วิธีชำระ
   - **ปุ่มบันทึก / ยกเลิก**
4. **ตารางประวัติการชำระเงิน (Payment History Logs):**
   - วันที่ | ประเภทรายการ | จำนวนเงิน | หมายเหตุ | ปุ่มลบ `🗑`
   - หากมีการกดลบรายการ ระบบจะคืนยอดคงค้างกลับอัตโนมัติแบบเรียลไทม์

### 3.3 การรองรับ Mobile & Desktop
- **Desktop:** วางแถบ Inline Sub-Row เป็น `<tr><td colspan="7">...</td></tr>` เต็มความกว้างตาราง สวยงามในธีม Dark Glassmorphism
- **Mobile:** ตารางเปิด Scroll ตามแนวนอน หรือปรับการ์ดให้แสดงผลปุ่มกดขนาดใหญ่ขึ้น เหมาะกับสัมผัส (Touch targets >= 44px)

---

## 4. Database Schema & Migration

สร้างตาราง `public.member_round_payments`:

```sql
CREATE TABLE IF NOT EXISTS public.member_round_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID NOT NULL,
    lottery_type TEXT,
    round_date DATE,
    payment_type TEXT NOT NULL, -- 'net_settlement' | 'prize_payout'
    direction TEXT NOT NULL,    -- 'member_to_dealer' | 'dealer_to_member'
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_member_round_payments_lookup 
ON public.member_round_payments(dealer_id, round_id, user_id);

-- RLS Policies
ALTER TABLE public.member_round_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers can manage their own member round payments"
ON public.member_round_payments
FOR ALL
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

CREATE POLICY "Superadmins have full access to member round payments"
ON public.member_round_payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    )
);
```

---

## 5. Frontend Architecture & State Management

1. **การดึงข้อมูล (`fetchHistoryDetails` ใน `Dealer.jsx`):**
   - เมื่อขยายงวดประวัติ ดึงข้อมูล `member_round_payments` ของ `round_id` นั้นมาพร้อมกับ `userHistories`
   - แมป payments เข้ากับ `user_id` แต่ละคน
2. **Component Structure:**
   - สร้าง Component แยกหรือ sub-render ใน `Dealer.jsx` เช่น `MemberSettlementRow.jsx` หรือฟังก์ชันจัดการ Inline settlement เพื่อให้โค้ดสะอาดและดูแลรักษาง่าย
3. **Optimistic Updates & Toasts:**
   - เมื่อกดบันทึกหรือลบ payment อัปเดต React State ทันทีเพื่อให้ตัวเลขเปลี่ยนแบบไร้รอยต่อ
   - แสดงข้อความ Toast แจ้งเตือน: *"บันทึกรายการสำเร็จ"* หรือ *"ลบรายการแล้ว"*

---

## 6. Verification Plan

1. **Database Tests:**
   - รัน SQL Migration และทดสอบ Insert/Select/Delete ตามสิทธิ์ RLS ของ Dealer
2. **Calculation Unit Tests:**
   - ทดสอบกรณีสมาชิกค้างเจ้ามือ (บวก) แล้วจ่ายเต็มจำนวน -> เหลือ ฿0
   - ทดสอบกรณีผ่อนจ่ายบางส่วน -> ยอดคงค้างลดลงถูกต้อง
   - ทดสอบกรณีเจ้ามือค้างคนส่ง (ลบ) แล้วเจ้ามือจ่ายเคลียร์ -> เหลือ ฿0
   - ทดสอบกรณีเจ้ามือจ่ายเฉพาะรางวัล -> ยอดคงค้างปรับเป็นบวกตามค่าหวยที่สมาชิกต้องจ่าย
   - ทดสอบการลบรายการจ่าย -> ยอดคงค้างคืนกลับสู่ค่าเดิม
3. **UI / E2E Verification:**
   - ตรวจสอบบนหน้าจอ Desktop และทดสอบ Responsive โหมดมือถือ
   - รัน `npm test` และ `npm run build` เพื่อการันตีความถูกต้อง 100%
