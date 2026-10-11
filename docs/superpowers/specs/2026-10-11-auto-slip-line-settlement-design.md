# Design Document: ระบบรับชำระเงินอัตโนมัติผ่านการตรวจ Slip ในกลุ่ม LINE (Automated LINE Slip Verification & Settlement System)

**Date:** 2026-10-11  
**Status:** In Review  
**Author:** Pair Programming Assistant & User  

---

## 1. บทนำและปัญหา (Overview & Problem Statement)

ในระบบการบริหารจัดการหวยของดีลเลอร์ (Dealer) สมาชิก (ผู้ส่งโพย/แทงหวย) ส่วนใหญ่จะส่งโพยและชำระเงินผ่านกลุ่ม LINE เป็นหลัก โดยเมื่อถึงเวลาชำระเงิน สมาชิกจะโอนเงินผ่าน Mobile Banking แล้ว **"โยนรูป Slip ธนาคารลงในกลุ่ม LINE"**

ในปัจจุบัน ดีลเลอร์ต้องคอยเปิดดูรูปสลิปในกลุ่ม LINE ทีละรูป ตรวจสอบยอดเงิน และสลับเข้ามาที่หน้าเว็บเพื่อกดบันทึกรับชำระเงินด้วยตนเอง (Manual Entry) ซึ่งมีภาระงานสูงและอาจเกิดความผิดพลาดได้ง่าย นอกจากนี้ยังมีความซับซ้อนในเชิงพฤติกรรมการชำระเงินดังนี้:

1. **ความแตกต่างของประเภทหวยและรอบการเคลียร์เงิน:**
   - **แบบงวดต่องวด (ชำระทันที / Immediate Settlement):** เช่น หวยฮานอย, หวยหุ้น, หวยยี่กี หรือหวยรายวัน เมื่อออกผลเสร็จ สมาชิกจะเคลียร์ยอดงวดนั้นทันที
   - **แบบงวดชนงวด (Cross-Round Offset Settlement):** เช่น สลากกินแบ่งรัฐบาลไทย หรือหวยลาวพัฒนา สมาชิกจะยังไม่ชำระงวดปัจจุบันทันที แต่รอให้งวดถัดไปออกผลก่อน:
     - *กรณีถูกรางวัลงวดใหม่:* นำเงินรางวัลของงวดใหม่ไปหักลบกับหนี้ค้างของงวดก่อนหน้า แล้วโอนเฉพาะส่วนต่างสุทธิที่เหลือ
     - *กรณีไม่ถูกรางวัล:* สมาชิกจะโอนเฉพาะยอดหนี้ค้างของงวดก่อนหน้า ส่วนยอดแทงของงวดใหม่จะยกยอดไปรอเคลียร์ในงวดถัดไป
2. **การปัดเศษยอดเงิน (Amount Difference / Tolerance):** สมาชิกมักโอนยอดเงินปัดเศษให้ลงตัว เช่น ยอดที่ต้องชำระ 505 บาท แต่สมาชิกโอนมา 500 บาท (ขาด 5 บาท) หรือ ยอด 498 บาท แต่โอน 500 บาท ดีลเลอร์ต้องการให้ระบบยอมรับส่วนต่างตามเกณฑ์ที่กำหนดได้ (เช่น ต่างกันไม่เกิน 5 หรือ 10 บาท)
3. **การแยกผู้ให้บริการและบัญชีของแต่ละ Dealer (Multi-Dealer Provider & Bank Configuration):** ดีลเลอร์แต่ละคนมีบัญชีธนาคารสำหรับรับเงินของตนเอง และสมัครใช้งาน API ตรวจสลิป (เช่น SlipOK) แยกของตนเอง จึงต้องสามารถตั้งค่า API Key และบัญชีรับเงินแยกรายดีลเลอร์ได้อิสระ

---

## 2. เป้าหมาย (Goals & Scope)

1. **ดักจับรูปสลิปในกลุ่ม LINE อัตโนมัติ (LINE Bot Image Detection):** LINE Bot ตรวจจับข้อความรูปภาพ ดึงไฟล์รูป และส่งตรวจสอบสลิปผ่านผู้ให้บริการที่ดีลเลอร์ตั้งค่าไว้ (SlipOK)
2. **ตั้งค่าแยกรายดีลเลอร์ (Dealer-Level Configuration):**
   - ดีลเลอร์สามารถกรอก SlipOK API Key / Branch ID ของตนเองได้ในหน้าเว็บ
   - ดีลเลอร์สามารถเลือกบัญชีธนาคารรับเงินเพื่อตรวจสอบปลายทางในสลิป
   - ดีลเลอร์สามารถกำหนดค่าความต่างของยอดเงินที่ยอมรับได้ (Tolerance Amount) และเลือกว่าจะ "ปัดเศษยกประโยชน์ให้" หรือ "ตัดตามจริงเหลือเศษค้างต่อ"
3. **รองรับทั้ง 2 โหมดการเคลียร์เงิน:**
   - โหมด `immediate`: ชำระยอดงวดต่องวด
   - โหมด `cross_round`: หักล้างงวดชนงวด (คำนวณหักล้างรางวัลอัตโนมัติแบบเดียวกับ `CrossRoundOffsetModal`)
4. **บันทึกประวัติอัตโนมัติ (Automated Settlement Logging):** บันทึกการชำระเงินลงตาราง `member_round_payments` โดยอัตโนมัติ พร้อมอ้างอิงงวดและหมายเหตุที่ชัดเจน และบันทึกรหัสธุรกรรมลง `used_slips` เพื่อป้องกันการใช้สลิปซ้ำ
5. **ตอบกลับสรุปในกลุ่ม LINE (Instant Group Notification):** ส่งข้อความสรุปรายละเอียดการตัดชำระคืนในกลุ่ม LINE เพื่อให้สมาชิกและดีลเลอร์รับทราบทันที

---

## 3. สถาปัตยกรรมระบบ (System Architecture)

```
[สมาชิกส่งรูปสลิปในกลุ่ม LINE]
            │
            ▼
[LINE Webhook: supabase/functions/line-bot]
    ├── 1. ตรวจสอบ event.type === 'message' && event.message.type === 'image'
    ├── 2. ตรวจสอบกลุ่ม LINE (line_groups) -> ระบุ dealer_id และ lottery_type
    ├── 3. ตรวจสอบผู้ส่ง (line_user_id) -> ระบุ member_id (profiles.id)
    └── 4. ดึง Binary รูปภาพจาก LINE Content API (GET /v2/bot/message/{id}/content)
            │
            ▼
[Slip Verification Service (SlipOK)]
    ├── เรียก SlipOK API ด้วย API Key ของดีลเลอร์
    ├── ตรวจสอบ transRef ซ้ำใน used_slips (Replay Attack Prevention)
    ├── ตรวจสอบเลขบัญชีผู้รับโอน ตรงกับบัญชีของ Dealer หรือไม่
    └── ได้ยอดเงินที่โอนจริง (slipAmount)
            │
            ▼
[Settlement Engine & Mode Resolution]
    ├── ตรวจสอบ settlement_mode ของกลุ่มหรือประเภทหวย (immediate vs cross_round)
    │
    ├── [กรณี immediate (งวดต่องวด)]:
    │     └── หางวดล่าสุดที่ปิดแล้ว -> คำนวณ netDebt = ยอดแทง - คอมมิชชั่น - รางวัล - ชำระแล้ว
    │
    └── [กรณี cross_round (งวดชนงวด)]:
          ├── ดึงหนี้ค้างงวดเก่าทั้งหมด (pastDebts)
          ├── ดึงรางวัลงวดปัจจุบัน (currentRoundPrize)
          └── คำนวณ expectedAmount = pastDebts - currentRoundPrize
            │
            ▼
[Tolerance Validation]
    ├── diff = |slipAmount - expectedAmount|
    ├── หาก diff > dealer.tolerance_amount -> แจ้งเตือนยอดเงินไม่ตรงใน LINE
    └── หาก diff <= dealer.tolerance_amount -> ผ่านการตรวจสอบ
            │
            ▼
[Database Atomic Settlement]
    ├── 1. บันทึก used_slips (trans_ref, dealer_id, member_id, amount)
    ├── 2. บันทึก member_round_payments (ตัดหนี้งวดเก่า / งวดปัจจุบัน / บันทึกรางวัลหักลบ)
    └── 3. บันทึก adjustment note หากมีส่วนต่างยอดเงิน
            │
            ▼
[LINE Group Reply]
    └── ส่งข้อความแจ้งผลการรับชำระเงินและสรุปยอดคงเหลือลงในกลุ่ม LINE
```

---

## 4. การเปลี่ยนแปลงฐานข้อมูล (Database Schema Changes)

### 4.1 ตาราง `profiles` (เพิ่มฟิลด์การตั้งค่าสลิปของดีลเลอร์)
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slip_provider TEXT DEFAULT 'slipok',
ADD COLUMN IF NOT EXISTS slipok_api_key TEXT,
ADD COLUMN IF NOT EXISTS slipok_branch_id TEXT,
ADD COLUMN IF NOT EXISTS slip_tolerance_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS slip_tolerance_mode TEXT DEFAULT 'forgive_difference' 
    CHECK (slip_tolerance_mode IN ('forgive_difference', 'carry_remainder')),
ADD COLUMN IF NOT EXISTS auto_slip_verification_enabled BOOLEAN DEFAULT FALSE;
```
*คำอธิบาย:*
- `slip_tolerance_amount`: ยอดเงินส่วนต่างที่ยอมรับได้ (เช่น `5.00` บาท, `10.00` บาท)
- `slip_tolerance_mode`:
  - `'forgive_difference'`: ปัดเศษยกประโยชน์ให้สมาชิก (ตัดหนี้เต็มยอด เช่น หนี้ 505 โอน 500 ตัดหนี้งวดนั้นหมด 505)
  - `'carry_remainder'`: ตัดตามยอดเงินโอนจริง (โอน 500 ตัด 500 เหลือหนี้ค้าง 5 บาท ไปสะสมงวดถัดไป)
- `auto_slip_verification_enabled`: สวิตช์เปิด/ปิดระบบตรวจสลิปอัตโนมัติของดีลเลอร์

### 4.2 ตาราง `line_groups` (เพิ่มการระบุโหมดการเคลียร์เงิน)
```sql
ALTER TABLE public.line_groups
ADD COLUMN IF NOT EXISTS settlement_mode TEXT DEFAULT 'immediate'
    CHECK (settlement_mode IN ('immediate', 'cross_round'));
```
*คำอธิบาย:*
- กำหนดรูปแบบการเคลียร์เงินรายกลุ่ม LINE โดยตรง ซึ่งสอดคล้องกับประเภทหวยที่กลุ่มนั้นเล่นอยู่:
  - `'immediate'`: เคลียร์งวดต่องวด (ชำระทันทีหลังออกผล)
  - `'cross_round'`: เคลียร์แบบงวดชนงวด

### 4.3 ตาราง `used_slips` (รองรับการผูกกับสมาชิกและดีลเลอร์)
```sql
ALTER TABLE public.used_slips
ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.member_round_payments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS slip_data JSONB;
```

---

## 5. การตั้งค่าหน้าเว็บของ Dealer (Dealer Settings UI)

เพิ่มส่วนตั้งค่าใน **`DealerLineBotTab.jsx`** หรือ **`DealerProfileTab.jsx`**:

### 5.1 การตั้งค่าระบบตรวจสลิป (Slip Verification Card)
- **สวิตช์เปิด/ปิด**: เปิดใช้งานระบบตรวจสลิปอัตโนมัติในกลุ่ม LINE
- **ผู้ให้บริการ (Provider)**: Dropdown เลือก `SlipOK` (พร้อมรองรับ Provider อื่นในอนาคต)
- **API Key**: ช่องกรอก API Key ของ SlipOK (แสดงเป็นรหัสผ่าน ซ่อน/แสดงได้)
- **Branch ID**: ช่องกรอก Branch ID (ถ้ามี)
- **ปุ่มทดสอบการเชื่อมต่อ (Test Connection)**: ทดสอบยิงเช็คสถานะ API กับ SlipOK
- **การยอมรับส่วนต่างยอดเงิน (Tolerance Settings)**:
  - ช่องกรอกจำนวนเงินส่วนต่างที่ยอมรับได้: เช่น `5` บาท (ยอมรับได้ตั้งแต่ 0 - 50 บาท)
  - ตัวเลือกวิธียอมรับส่วนต่าง (Radio Buttons):
    - 🔘 **ปัดเศษยกประโยชน์ให้สมาชิก (เคลียร์ยอดงวดนั้นให้ครบ)**
    - 🔘 **ตัดตามยอดโอนจริง (ยอดที่เหลือค้างไว้เคลียร์ต่องวดถัดไป)**

### 5.2 การตั้งค่าโหมดเคลียร์เงินในกลุ่ม LINE (Group Settlement Mode)
- ในส่วนตารางกลุ่ม LINE (`line_groups`) เพิ่ม Dropdown เลือกรูปแบบการเคลียร์เงินของกลุ่ม:
  - `⚡ เคลียร์งวดต่องวด (ชำระทันที)`
  - `🔄 เคลียร์งวดชนงวด (หักล้างข้ามงวด)`

---

## 6. ลอจิกการคำนวณและการตัดยอด (Settlement Logic)

### 6.1 โหมดที่ 1: งวดต่องวด (`immediate`)
1. ค้นหางวดล่าสุดที่ปิดแล้ว (`close_time` / `close_date`) ของประเภทหวยในกลุ่มนั้น
2. ดึงยอดส่งแทง, คอมมิชชั่น, ยอดถูกรางวัล และยอดที่เคยชำระแล้วของสมาชิกในงวดนั้น
3. คำนวณยอดที่ต้องชำระ:
   $$\text{ExpectedAmount} = \text{ยอดแทงสุทธิ} - \text{ยอดถูกรางวัล} - \text{ยอดที่เคยชำระแล้ว}$$
4. ตรวจสอบกับยอดในสลิป (`slipAmount`):
   - หาก $|\text{slipAmount} - \text{ExpectedAmount}| \le \text{tolerance}$: ผ่าน
   - ทำการบันทึกลง `member_round_payments`:
     - หากเลือก `forgive_difference` และโอนขาด: บันทึก amount = `ExpectedAmount` พร้อมหมายเหตุว่า "ปัดเศษส่วนต่าง ฿X ให้สมาชิก"
     - หากเลือก `carry_remainder`: บันทึก amount = `slipAmount`

### 6.2 โหมดที่ 2: งวดชนงวด (`cross_round`)
1. ดึงรายการงวดก่อนหน้าทั้งหมดที่สมาชิกยังมียอดค้างชำระ (`pastDebts`) เรียงตามลำดับเวลา (FIFO)
2. ดึงงวดปัจจุบัน (งวดล่าสุดที่ออกผลแล้ว):
   - หากงวดปัจจุบัน **ถูกรางวัล (`currentRoundPrize > 0`)**:
     $$\text{NetPayable} = \text{รวมหนี้งวดเก่า} - \text{รางวัลงวดปัจจุบัน}$$
     - หาก $\text{NetPayable} > 0$: สมาชิกต้องโอนยอดส่วนต่าง $\text{ExpectedAmount} = \text{NetPayable}$
     - เมื่อได้รับสลิปที่มียอดตรงตามส่วนต่าง:
       - เรียกใช้ฟังก์ชัน `allocateCrossRoundOffsetPayments`
       - บันทึกตัดหนี้งวดเก่าตามลำดับ (FIFO)
       - บันทึก `prize_payout` ของงวดปัจจุบัน เพื่อแสดงว่านำรางวัลไปหักล้างหนี้งวดเก่าเรียบร้อย
   - หากงวดปัจจุบัน **ไม่ถูกรางวัล (`currentRoundPrize == 0`)**:
     $$\text{ExpectedAmount} = \text{รวมหนี้งวดเก่า}$$
     - สมาชิกโอนเฉพาะยอดหนี้ค้างของงวดก่อนหน้า
     - บันทึกตัดหนี้งวดเก่าทั้งหมด
     - ส่วนยอดแทงของงวดปัจจุบันจะคงสถานะค้างไว้ เพื่อยกยอดไปรอเคลียร์ในงวดถัดไป

---

## 7. การตอบกลับในกลุ่ม LINE (LINE Group Messages)

### 7.1 กรณีตรวจสอบและบันทึกสำเร็จ (Success)
```
🧾 บันทึกการชำระเงินอัตโนมัติ
👤 สมาชิก: คุณสมชาย ใจดี (M-008)
🎯 ประเภทหวย: หวยรัฐบาลไทย
📌 รูปแบบ: เคลียร์งวดชนงวด (หักล้างรางวัล)
----------------------------
- ค้างชำระงวด 1 ต.ค. 69: ฿1,000.00
- หักรางวัลคืนงวด 16 ต.ค. 69: -฿500.00
- รวมยอดที่ต้องโอน: ฿500.00
💰 ยอดเงินตามสลิป: ฿500.00
💳 บัญชีรับเงิน: กสิกรไทย (xxx-x-x1234-x)
----------------------------
✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว
```

### 7.2 กรณียอดเงินไม่ตรงเกินเกณฑ์ที่กำหนด (Amount Mismatch)
```
⚠️ แจ้งเตือนยอดเงินไม่ตรง
👤 สมาชิก: คุณสมชาย ใจดี (M-008)
🎯 ประเภทหวย: หวยฮานอยพิเศษ
----------------------------
- ยอดที่ต้องชำระ: ฿550.00
- ยอดเงินในสลิป: ฿500.00
- ส่วนต่าง: ฿50.00 (เกินเกณฑ์ที่ยอมรับได้ ฿5.00)
----------------------------
❌ ยังไม่ได้ตัดยอดในระบบ กรุณาติดต่อเจ้ามือเพื่อตรวจสอบ
```

### 7.3 กรณีสลิปซ้ำ (Duplicate Slip)
```
⚠️ สลิปนี้เคยใช้งานในระบบแล้ว
รหัสอ้างอิง: 2026101112345678
วันที่โอน: 11 ต.ค. 2569 15:30 น.
❌ ระบบปฏิเสธการทำรายการ กรุณาตรวจสอบ
```

### 7.4 กรณีผู้ส่งยังไม่ได้ผูกบัญชีสมาชิก (Unlinked Member)
```
ℹ️ ตรวจพบสลิปโอนเงิน ฿500.00
⚠️ ไม่สามารถตัดยอดอัตโนมัติได้ เนื่องจากบัญชี LINE ของท่านยังไม่ได้ผูกกับรหัสสมาชิก
กรุณาแจ้งรหัสสมาชิกให้เจ้ามือผูกบัญชีในระบบ
```

---

## 8. กฎความปลอดภัยและการป้องกันข้อผิดพลาด (Safety & Security)

1. **Strict Data Safety (กฎเหล็ก):** ระบบจะไม่ลบหรือแก้ไขข้อมูลประวัติเดิม และไม่สร้าง mock data ใดๆ ลงฐานข้อมูล
2. **Round Date Convention (กฎเหล็ก):** วันที่งวดที่นำมาอ้างอิงต้องใช้ `close_time` / `close_date` ของงวดเสมอตามกฎหมายและโดเมนหวย
3. **Pagination & Query Limits:** การดึงข้อมูลประวัติงวดและรายการชำระเงินต้องระบุ `.order('created_at', { ascending: false })` และใช้ `fetchAllRows` เมื่อต้องดึงข้อมูลสะสม
4. **Duplicate Slip Prevention:** ตรวจสอบ `trans_ref` ในตาราง `used_slips` ทุกครั้งก่อนทำการตัดยอดเสมอ
5. **Destination Bank Account Verification:** ตรวจสอบว่าบัญชีปลายทางในสลิป ตรงกับหนึ่งในบัญชีธนาคารของ Dealer ที่ตั้งไว้ เพื่อป้องกันการส่งสลิปโอนเงินให้บุคคลภายนอกมาแอบอ้าง

---

## 9. แผนการตรวจสอบและทดสอบ (Testing & Verification Plan)

1. **Unit Testing:**
   - ทดสอบ Tolerance calculation (ทั้งกรณีโอนตรง, โอนขาดในเกณฑ์, โอนเกินในเกณฑ์, โอนขาดเกินเกณฑ์)
   - ทดสอบ Allocation ข้ามงวด (`immediate` vs `cross_round`)
2. **Integration Testing:**
   - Mock SlipOK Webhook/API response ตรวจสอบ flow การบันทึก `member_round_payments` และ `used_slips`
   - ทดสอบการตรวจจับสลิปซ้ำ (Replay test)
   - ทดสอบบัญชีผู้รับเงินไม่ตรง (Wrong bank test)
3. **End-to-End Simulation:**
   - ทดสอบส่งรูปสลิปจำลองผ่าน LINE Bot Webhook แล้วตรวจดูผลลัพธ์ในหน้าประวัติ `MemberSettlementInline` ของ Dealer

---
