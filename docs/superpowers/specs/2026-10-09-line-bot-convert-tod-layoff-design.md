# Design Specification: LINE Bot Command `/ตีออกแปลง` (Convert 3-Tod to 3-Top Layoff)

## 1. Overview
เพิ่มคำสั่งใหม่ในระบบ LINE Bot คือ `/ตีออกแปลง` (และชื่อย่อ/คำพ้อง `/ตีออกแปลงเลข`) เพื่อให้เจ้ามือสามารถสั่งตีออกเฉพาะเลขที่กำหนด โดยมีพฤติกรรมและการรับพารามิเตอร์เหมือนคำสั่ง `/ตีออกเฉพาะ` ทุกประการ แต่หากในรายการที่จะตีออกมีเลข **3 ตัวโต๊ด (`3_tod`)** ระบบจะทำการแปลงเลขโต๊ดนั้นเป็น **3 ตัวตรง/บน (`3_top`)** ทุกประตู (Permutations) และหากมีเลข 3 ตัวตรงนั้นอยู่ในรายการตีออกอยู่แล้ว ระบบจะนำยอดเงินที่แปลงได้ไปบวกทบเข้ากับยอดเงินเดิมทันที พร้อมทั้งตัดหมวด 3 ตัวโต๊ดออกจากรายการตีออกทั้งหมด

## 2. Command Syntax & Supported Aliases
- คำสั่งหลัก: `/ตีออกแปลง`
- คำสั่งทางเลือก: `/ตีออกแปลงเลข`
- พารามิเตอร์: เหมือน `/ตีออกเฉพาะ` ทุกประการ เช่น
  - ตัวอย่างระบุเงื่อนไข:
    ```text
    /ตีออกแปลง
    258,259,805,938,995,152 100 บตก ตกลง
    ```
  - หรือสั่งโดยไม่ใส่คำว่า "ตกลง" เพื่อดูรายการสรุป Preview ก่อน:
    ```text
    /ตีออกแปลง
    258,259,805,938,995,152 100 บตก
    ```
    ระบบจะตอบกลับด้วยข้อความ Preview พร้อมปุ่ม Quick Reply:
    - **ตกลง**: ส่งคำสั่ง `/ตีออกแปลง\n... ตกลง`
    - **ยกเลิก**: ส่งคำว่า `ยกเลิก`

## 3. Data Processing & Calculation Flow

### 3.1 Flow Chart
```
[User sends /ตีออกแปลง]
          ↓
[Validate permissions & Active Round]
          ↓
[Parse input lines via parseSpecificLayoffLine]
          ↓
[Fetch Submissions, Limits, Existing Transfers]
          ↓
[Calculate Excess for specified numbers & bet types]
          ↓
[Is Command /ตีออกแปลง?]
    ├── Yes: Transform excessItems via convertAndMergeTodItems()
    │         - Generate unique permutations for each 3_tod
    │         - Amount per permutation = Math.ceil(tod.amount / perms.length)
    │         - Merge into 3_top (sum amounts if exists, or append new)
    │         - Remove 3_tod item from excess list
    │         - Add tod conversion metadata to transfer notes
    └── No: Keep original excessItems
          ↓
[Check if excessItems empty]
    ├── Empty: Reply "ℹ️ เลขที่ระบุไม่มีสัดส่วนที่เกินจากเกณฑ์..."
    └── Has Items:
          ↓
[Is Confirmed? (suffix ตกลง/ยืนยัน/y/yes)]
    ├── No: Send preview message with Quick Reply
    └── Yes: Call performLayoff() -> Insert bet_transfers -> Reply formatted summary
```

### 3.2 Conversion & Merging Logic (`convertAndMergeTodItems`)
1. **แยกรายการ**:
   - `todItems`: รายการที่มี `bet_type === '3_tod'`
   - `otherItems`: รายการอื่นๆ ทั้งหมด
2. **หากไม่มี `todItems`**: คืนค่า `otherItems` ตามเดิม
3. **การแปลงแต่ละรายการใน `todItems`**:
   - หา Unique Permutations ของตัวเลข 3 หลัก:
     - เลข 3 ตัวไม่ซ้ำ (เช่น `259`) -> 6 ประตู (`259, 295, 529, 592, 925, 952`)
     - เลขหาม/เบิ้ล (เช่น `995`) -> 3 ประตู (`995, 959, 599`)
     - เลขตอง (เช่น `111`) -> 1 ประตู (`111`)
   - คำนวณจำนวนเงินต่อ 1 ประตู:
     $$\text{perPermAmount} = \lceil \frac{\text{todAmount}}{\text{perms.length}} \rceil$$
   - กำหนดประเภทปลายทาง:
     - หวยไทย (`thai`): `3_top` (แสดงป้ายชื่อ "บน")
     - หวยลาว / ฮานอย (`lao`, `hanoi`): `3_top` (แสดงป้ายชื่อ "ตรง")
4. **การรวมยอด (Merge into `3_top`)**:
   - สร้าง Map ดัชนีด้วย `${bet_type}|${numbers}`
   - นำ `otherItems` ใส่ลงใน Map
   - สำหรับแต่ละประตูที่แปลงได้:
     - คีย์: `3_top|${perm}`
     - **กรณีมีคีย์นี้อยู่แล้วใน Map**:
       - บวกยอดเงิน: `existingItem.amount += perPermAmount`
       - บันทึก metadata เพื่อระบุว่ามีการรวมยอดจากโต๊ด
     - **กรณีไม่มีคีย์นี้ใน Map**:
       - สร้างรายการใหม่: `{ bet_type: '3_top', numbers: perm, amount: perPermAmount, ... }`
5. **Metadata บันทึกใน `bet_transfers.notes`**:
   - เพื่อให้สอดคล้องกับระบบคำนวณหักยอดบนหน้าเว็บ (`src/utils/layoffTodConverter.js` และ `calculateTransferDeduction`):
     - บันทึกสตริง `[TOD_CONV:{"orig_num":"...","orig_excess":...,"allocated":...,"is_merged":...}]`
     - ช่วยให้หน้าเว็บสามารถรู้ที่มาของยอดตัด และหักลบยอดคงเหลือในแท็บ "ยอดเหลือ" และ "ยอดเกิน" ได้ถูกต้องสมบูรณ์

## 4. Response & Output Formatting

### 4.1 ข้อความยืนยันก่อนตีออก (Preview)
- หัวข้อ: `⚡ ยืนยันการตีออกแปลงเลข\n`
- รายการเลขที่แสดง: จะแสดงเฉพาะรายการหลังแปลงแล้ว (ไม่มีรายการโต๊ด)
- ปุ่ม Quick Reply:
  - Label: `ตกลง`, Text: `/ตีออกแปลง\n${body} ตกลง`
  - Label: `ยกเลิก`, Text: `ยกเลิก`

### 4.2 ข้อความเมื่อตีออกสำเร็จ (Success Reply)
- เมื่อ `performLayoff` ทำงาน:
  - รายการจะถูกจัดกลุ่มแสดงผลตามหมวด:
    - `บน` (หรือ `ตรง`): รวมยอดที่ตีออกเดิมและยอดที่แปลงจากโต๊ดเรียบร้อย
    - `ล่าง` (ถ้ามี)
    - **จะไม่มีหมวด `โต๊ด` แสดงผลออกมาเลย**

## 5. Error Handling & Edge Cases
1. **กรณีไม่มีงวดเปิดรับแทง**: แจ้งเตือนเหมือนคำสั่งปกติ
2. **กรณีรูปแบบคำสั่งไม่ถูกต้อง**: แสดงข้อความแนะนำรูปแบบคำสั่ง `/ตีออกแปลง`
3. **กรณีไม่มีเลขที่เกินเกณฑ์ (Excess = 0)**: แจ้งเตือน `ℹ️ เลขที่ระบุไม่มีสัดส่วนที่เกินจากเกณฑ์ ไม่จำเป็นต้องตีออกค่ะ 🎉`
4. **กรณีมีเฉพาะเลข 2 ตัว หรือเลขวิ่ง (ไม่มี 3 ตัวโต๊ด)**: ทำงานได้ตามปกติเหมือน `/ตีออกเฉพาะ`
5. **กรณีเลขโต๊ดยอดเงินน้อย (เช่น 1 บาท)**: `Math.ceil(1 / 6) = 1` บาทต่อประตู เพื่อไม่ให้ยอดกลายเป็น 0

## 6. Testing & Verification Plan
1. **Unit Tests**:
   - ทดสอบฟังก์ชัน `convertAndMergeTodItems` ใน Edge Function test:
     - แปลงโต๊ด 6 กลับ (เช่น 259 ยอด 70 -> ประตูละ 12)
     - รวมยอดกับ 3 ตัวตรงเดิมที่มีอยู่แล้ว (133 + 12 = 145)
     - สร้างรายการ 3 ตัวตรงใหม่สำหรับประตูที่เดิมไม่มียอดเกิน
     - ตัดรายการโต๊ดเดิมทิ้ง 100%
     - ทดสอบกับหวยไทย (แสดง "บน") และหวยลาว/ฮานอย (แสดง "ตรง")
2. **Regression Testing**:
   - ตรวจสอบคำสั่ง `/ตีออกเฉพาะ` เดิม ยังคงทำงานได้เหมือนเดิมทุกประการ ไม่ได้รับผลกระทบ
   - รันเทสต์ vitest ทั้งหมดของระบบเพื่อให้แน่ใจว่าไม่มีข้อผิดพลาด
