# Dealer History Upstream Layoff Settlement Payments Design

**Date:** 2026-09-10  
**Topic:** บันทึกการรับ-จ่ายเงินและแสดงยอดคงค้างของเจ้ามือรับตีออกในหน้างวดหวยแท็บประวัติ (Dealer History Tab Upstream Settlement)  
**Status:** Approved by User  

---

## 1. Overview & Problem Statement

ในหน้า **Dealer Dashboard** ที่แท็บ **ประวัติ** (History) เมื่อขยายดูรายละเอียดของงวดที่ประกาศผลแล้ว จะมีตาราง *"🚀 รายละเอียดการตีออกให้เจ้ามือในงวดนี้"* ซึ่งแสดงรายการเจ้ามือรับตีออก, จำนวนรายการ, ยอดตีออก, ค่าคอมได้รับ, รับคืนรางวัล, และกำไรจากการตีออก

อย่างไรก็ตาม ในการดำเนินงานจริงของเจ้ามือหวย:
1. การส่งโพยตีออกไปยังเจ้ามือรับตีออก (Upstream Dealer / Layoff) มีเรื่องของยอดเงินที่ต้องชำระระหว่างกัน
2. โดยปกติ เจ้ามือเราต้องโอนจ่าย **ยอดส่งตีออกสุทธิ** (ยอดตีออกหักส่วนลดค่าคอม) ให้กับเจ้ามือรับตีออก
3. ในขณะเดียวกัน หากโพยที่ตีออกไปถูกรางวัล เจ้ามือรับตีออกจะต้องโอนจ่าย **รับคืนรางวัล** กลับคืนมาให้เรา
4. ปัจจุบันยังไม่มีระบบบันทึกรายการจ่ายเงินหรือรับเงินสำหรับเจ้ามือรับตีออก ทำให้เจ้ามือไม่ทราบว่า **เรายังค้างเจ้ามือรับตีออกเท่าไร** หรือ **เจ้ามือรับตีออกยังค้างจ่ายรางวัลให้เราเท่าไร**
5. ผู้ใช้ต้องการระบบชำระ/รับชำระสำหรับเจ้ามือรับตีออกในรูปแบบเดียวกับระบบชำระของสมาชิก เพื่อให้การบริหารจัดการบัญชีหวยในงวดประวัติครบวงจร 100%

---

## 2. Settlement Logic & Accounting Math

### 2.1 ยอดตั้งต้นในแต่ละงวด (Initial Balance)

สำหรับเจ้ามือรับตีออกแต่ละรายในงวดนั้น:
$$\text{Net Layoff} = \text{ยอดตีออก} - \text{ค่าคอมได้รับ}$$
$$\text{Initial Balance} = \text{Net Layoff} - \text{รับคืนรางวัล}$$

*(เปรียบเทียบกับกำไรจากการตีออก: $\text{Profit} = -(\text{ยอดตีออก} - \text{ค่าคอมได้รับ}) + \text{รับคืนรางวัล} = -\text{Initial Balance}$)*

- **ถ้า Initial Balance > 0:** เรามียอดติดค้างที่ต้องจ่ายให้เจ้ามือรับตีออก (แสดงเป็นลบ `-฿X (เราค้างเจ้ามือ)`)
- **ถ้า Initial Balance < 0:** เจ้ามือรับตีออกมียอดติดค้างที่ต้องจ่ายคืนเรา (แสดงเป็นบวก `+฿X (เจ้ามือค้างเรา)`)
- **ถ้า Initial Balance = 0:** เสมอตัว ไม่มียอดค้างชำระ

### 2.2 การบันทึกรายการจ่าย/รับเงิน (Payment Transactions)

รองรับ 2 ประเภทรายการหลัก:
1. **เคลียร์ยอดสุทธิ (Net Settlement):**
   - ทิศทาง **เราจ่ายให้เจ้ามือรับตีออก** (`dealer_to_upstream`): เราโอนเงินค่าหวยตีออกให้เจ้ามือรับตีออก
   - ทิศทาง **เจ้ามือรับตีออกจ่ายให้เรา** (`upstream_to_dealer`): เจ้ามือรับตีออกโอนเงินเคลียร์ยอดให้เรา
2. **รับคืนเงินรางวัลเฉพาะส่วน (Prize Collection Only):**
   - เจ้ามือรับตีออกโอนเงินรางวัลคืนให้เราก่อนแยกต่างหาก โดยยังไม่หักลบยอดแทง
   - ทิศทาง: `upstream_to_dealer`

### 2.3 การคำนวณยอดคงค้างปัจจุบัน (Current Outstanding Balance)

$$\text{Current Balance} = \text{Initial Balance} - \sum \text{Paid By Dealer To Upstream} + \sum \text{Paid By Upstream To Dealer}$$

- **Current Balance > 0:** แสดง `-฿X (เราค้างเจ้ามือ)` 🔴/🟠 (เรายังติดหนี้เจ้ามือรับตีออก)
- **Current Balance < 0:** แสดง `+฿X (เจ้ามือค้างเรา)` 🟢 (เจ้ามือรับตีออกยังค้างจ่ายเงินเรา)
- **Current Balance = 0:** แสดง `฿0` 🟢 (เคลียร์ครบถ้วน)

---

## 3. Database Schema Design (Migration 223)

สร้างตารางใหม่เฉพาะ `public.upstream_round_payments` เพื่อแยกบริบทของคู่ค้าออกจากสมาชิก และรองรับทั้งคู่ค้าในระบบ (Linked) และคู่ค้าภายนอก (Unlinked by name):

```sql
CREATE TABLE IF NOT EXISTS public.upstream_round_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID NOT NULL,
    lottery_type TEXT,
    round_date DATE,
    upstream_dealer_name TEXT NOT NULL,
    upstream_dealer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('net_settlement', 'prize_collection')),
    direction TEXT NOT NULL CHECK (direction IN ('dealer_to_upstream', 'upstream_to_dealer')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_upstream_round_payments_lookup 
ON public.upstream_round_payments(dealer_id, round_id, upstream_dealer_name);

ALTER TABLE public.upstream_round_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers can view and manage their upstream round payments"
ON public.upstream_round_payments
FOR ALL
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

CREATE POLICY "Superadmins have full access to upstream round payments"
ON public.upstream_round_payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    )
);
```

---

## 4. UI/UX Specifications

### 4.1 ตารางรายละเอียดการตีออกในงวดนี้ (Upstream Layoff Breakdown Table)
- เพิ่มคอลัมน์ด้านขวาสุด: **"สถานะ / ยอดคงค้าง"**
- แต่ละแถวของเจ้ามือรับตีออกมี Badge แสดงยอดคงค้างปัจจุบัน:
  - 🟠/🔴 `-฿6,030 (เราค้างเจ้ามือ)`
  - 🟢 `+฿1,500 (เจ้ามือค้างเรา)`
  - 🟢 `฿0` (ชำระครบถ้วน)
- คลิกที่แถวหรือ Badge เพื่อขยาย Inline Sub-row แสดง `<UpstreamSettlementInline />`

### 4.2 แถบสรุปสถานะการเงินย่อย (Inline Breakdown Strip)
เมื่อคลิกขยาย จะมีกล่องสรุป 4 กล่องย่อย:
1. **ยอดตีออกสุทธิ (หักคอม):** `฿...`
2. **รับคืนรางวัล:** `฿...`
3. **ชำระแล้ว (เราจ่าย / เจ้ามือจ่าย):** `฿X / ฿Y`
4. **ยอดคงค้างปัจจุบัน:** Badge แสดงสถานะและยอดคงเหลือ

### 4.3 ปุ่ม Quick Action `⚡ เคลียร์ครบ` & Confirmation Modal
- แสดงปุ่มสีเขียว `⚡ เคลียร์ครบ (ยอดคงค้าง)` เมื่อยังมียอดคงเหลือ
- กดแล้วเปิด Modal แสดง:
  - สรุปยอดและทิศทางที่จะเคลียร์
  - ช่อง **วันที่จ่าย** พร้อมชิปปุ่มลัด `[ วันนี้ ]`, `[ วันที่งวดหวย ]`
  - ช่อง **หมายเหตุ** พร้อมชิปปุ่มลัด `[ เคลียร์ยอดครบจำนวน ]`, `[ โอนแล้ว ]`, `[ เงินสด ]`
  - ปุ่มกดยืนยันบันทึก

### 4.4 ฟอร์มบันทึกการจ่าย/รับเงิน (`+ บันทึกการจ่าย/รับเงิน`)
- **แท็บประเภทเงิน:**
  - `เคลียร์ยอดสุทธิ` (Net Settlement)
  - `รับคืนเงินรางวัล` (Prize Collection - แสดงเมื่อ `winnings > 0`)
  - **Default บนการเปิดฟอร์ม:** หากมียอดรับคืนรางวัล > 0 ให้เริ่มที่ `รับคืนเงินรางวัล` หากไม่มีให้เริ่มที่ `เคลียร์ยอดสุทธิ`
- **ทิศทาง:**
  - `🔴 เราจ่ายให้เจ้ามือรับตีออก` (เมื่อเราเป็นฝ่ายติดค้าง)
  - `🟢 เจ้ามือรับตีออกจ่ายคืนเรา` (เมื่อเจ้ามือเป็นฝ่ายติดค้าง)
- **จำนวนเงิน (Amount):**
  - ใส่อัตโนมัติตามแท็บที่เลือก
  - มีปุ่มลัดชิป `[ ยอดคงค้าง ฿... ]` และ `[ รับคืนรางวัล ฿... ]` (Active Highlight)
- **วันที่จ่าย (Paid Date):**
  - ค่าเริ่มต้นเป็น **วันที่งวดหวย** ทันที พร้อมปุ่มลัด `[ วันนี้ ]`, `[ วันที่งวดหวย ]` (Active Highlight)
- **หมายเหตุ (Notes):**
  - ค่าเริ่มต้นเป็น **`โอนแล้ว`** ทันที พร้อมปุ่มลัด `[ โอนแล้ว ]`, `[ เงินสด ]` (Active Highlight)

### 4.5 ตารางประวัติการรับ-จ่ายเงิน (Payment History Logs)
- แสดงรายการที่เคยบันทึกไว้ในงวดนี้ของเจ้ามือรับตีออกรายนั้น
- มีคอลัมน์: วันที่จ่าย, ประเภท, ทิศทาง (เราจ่าย / เจ้ามือจ่าย), จำนวนเงิน, หมายเหตุ, จัดการ (ปุ่มลบ 🗑️)
- เมื่อลบรายการ ยอดคงค้างจะคำนวณคืนทันทีแบบ Real-time

---

## 5. Technical Architecture & File Changes

1. **Database Migration:**
   - `supabase/migrations/223_create_upstream_round_payments.sql`
2. **Settlement Calculator:**
   - `src/utils/memberSettlementCalculator.js`
     - เพิ่ม `calculateUpstreamInitialBalance(transfer)`
     - เพิ่ม `calculateUpstreamCurrentBalance(initialBalance, payments)`
     - เพิ่ม `getUpstreamSettlementStatus(currentBalance)`
     - เพิ่ม `getUpstreamPaymentPresetAmount(transfer, payments, paymentType)`
   - `src/utils/memberSettlementCalculator.test.js`
     - เพิ่ม Unit Tests ครอบคลุมฟังก์ชันของ Upstream Settlement
3. **UI Component:**
   - `src/components/dealer/UpstreamSettlementInline.jsx`
   - `src/components/dealer/UpstreamSettlementInline.css`
4. **Integration in Dealer Dashboard:**
   - `src/pages/Dealer.jsx`
     - Query `upstream_round_payments` ใน `fetchHistoryDetails`
     - เพิ่ม `handleSaveUpstreamPayment` และ `handleDeleteUpstreamPayment`
     - เชื่อมต่อในตาราง `🚀 รายละเอียดการตีออกให้เจ้ามือในงวดนี้`
     - ลบข้อมูลใน `upstream_round_payments` เมื่อมีการลบงวดประวัติใน `confirmDeleteHistoryRecord`

---

## 6. Verification Plan

1. **Automated Unit Tests:**
   - รัน `npm test` เพื่อตรวจสอบสูตรคำนวณ Initial Balance, Current Balance, Status badges, และ Preset amounts
2. **Build Verification:**
   - รัน `npm run build` ตรวจสอบความถูกต้องของ JSX, CSS, และ Module Imports
3. **Functional Verification:**
   - ตรวจสอบการแสดงผลคอลัมน์ "สถานะ / ยอดคงค้าง"
   - ทดสอบการกด `⚡ เคลียร์ครบ` พร้อมบันทึกวันที่และหมายเหตุ
   - ทดสอบการเปิดฟอร์ม `+ บันทึกการจ่าย/รับเงิน` พร้อมตรวจเช็คค่า Default (รับคืนรางวัล, วันที่งวด, โอนแล้ว)
   - ทดสอบการลบรายการชำระเงินและดูยอดคงค้างที่คืนค่าแบบ Real-time
