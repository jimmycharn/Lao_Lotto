# Dealer History Settlement Payment Edit Design

**Date:** 2026-09-10  
**Topic:** เพิ่มปุ่มและหน้าต่างแก้ไขรายการชำระเงินในหน้างวดหวยแท็บประวัติ (Dealer History Settlement Payment Edit)  
**Status:** Approved by User  

---

## 1. Overview & Problem Statement

ในหน้า **Dealer Dashboard** ที่แท็บ **ประวัติ** (History) เมื่อขยายดูรายละเอียดงวดหวยและเปิดแถบการเงินของสมาชิก (`MemberSettlementInline`) หรือเจ้ามือรับตีออก (`UpstreamSettlementInline`):
1. ในตาราง *"📜 ประวัติการรับ-จ่ายเงินในงวดนี้"* มีรายการที่บันทึกไว้ เช่น วันที่จ่าย, ประเภทรายการ, ทิศทางการเงิน, จำนวนเงิน, และหมายเหตุ
2. ปัจจุบันในคอลัมน์ขวาสุดมีเพียงปุ่มลบรายการ 🗑️ (`<FiTrash2 />`) เท่านั้น
3. หากผู้ใช้ป้อนข้อมูลผิดพลาด (เช่น ใส่จำนวนเงินผิด, ใส่วันที่ผิด, หรือเลือกทิศทางเงินผิด) ผู้ใช้จำเป็นต้องกดลบรายการทิ้ง แล้วเริ่มกรอกฟอร์มใหม่ทั้งหมดตั้งแต่ต้น
4. ผู้ใช้ต้องการปุ่มแก้ไขเล็กๆ (ไอคอน ✏️) ในตาราง เพื่อกดแก้ไขรายการเดิมได้ทันทีอย่างสะดวกรวดเร็ว โดยไม่ต้องลบทิ้งแล้วเริ่มป้อนใหม่ทุกครั้ง

---

## 2. UI/UX Specifications

### 2.1 ปุ่มแก้ไขในตารางประวัติการรับ-จ่ายเงิน (Action Buttons)
- ในตารางประวัติการรับ-จ่ายเงินทั้งของสมาชิก (`MemberSettlementInline`) และเจ้ามือรับตีออก (`UpstreamSettlementInline`):
  - ขยายความกว้างของคอลัมน์จัดการด้านขวาสุด (`width: 70px`) และจัดวางปุ่มแนวนอนกึ่งกลาง
  - เพิ่มปุ่มแก้ไขสีเหลืองทอง ✏️ (`<FiEdit2 size={13} />`, คลาส `.btn-edit-log`) อยู่ด้านหน้าปุ่มลบ 🗑️ (`<FiTrash2 size={14} />`, คลาส `.btn-delete-log`)
  - มี Tooltip: `"แก้ไขรายการนี้"`
  - สไตล์ Hover ให้มีพื้นหลังโปร่งแสงสีเหลืองอ่อนนวลตา รองรับทั้ง Desktop และ Touch target ที่เหมาะสมบน Mobile

### 2.2 หน้าต่างป๊อปอัปแก้ไขรายการ (Edit Payment Modal)
เมื่อคลิกปุ่ม ✏️ จะเปิด Modal แบบ Dark Glassmorphism (สร้างผ่าน `createPortal` ไปยัง `document.body` คล้าย Quick Settle Modal):

1. **Header:**
   - หัวข้อ: `✏️ แก้ไขรายการชำระเงิน`
   - ปุ่มปิด `✕` ด้านขวาบน
2. **Body:**
   - **กล่องสรุปข้อมูลคู่สัญญา:** แสดงชื่อสมาชิก / เจ้ามือรับตีออก
   - **ประเภท & ทิศทางการเงิน:**
     - โหมดเคลียร์ยอดสุทธิ: มี Dropdown ให้เลือกทิศทาง (`🟢 คนส่งจ่ายให้เจ้ามือ (รับชำระ)` หรือ `🔴 เจ้ามือจ่ายให้คนส่ง (เคลียร์ยอด)`)
     - โหมดจ่ายเงินรางวัล (สำหรับสมาชิกที่มีเงินรางวัล) / รับคืนเงินรางวัล (สำหรับเจ้ามือรับตีออกที่มีเงินรางวัล)
   - **จำนวนเงิน (Amount):**
     - ช่อง Input ตัวเลข แสดงยอดเดิม และให้พิมพ์แก้ไขได้
     - ชิปปุ่มลัด Preset เช่น `[ ยอดคงค้าง ฿... ]`, `[ เงินรางวัล ฿... ]`
   - **วันที่จ่าย (Paid Date):**
     - ช่อง Date Picker แสดงวันที่เดิม
     - ชิปปุ่มลัด `[ วันนี้ ]`, `[ วันที่งวดหวย ]`
   - **หมายเหตุ (Notes):**
     - ช่อง Input ข้อความ แสดงหมายเหตุเดิม
     - ชิปปุ่มลัด `[ โอนแล้ว ]`, `[ เงินสด ]`, `[ เคลียร์ยอดครบจำนวน ]`
3. **Footer:**
   - ปุ่ม **"ยกเลิก"**
   - ปุ่ม **"💾 บันทึกการแก้ไข"** (พร้อมสถานะ Loading `"กำลังบันทึก..."` เมื่อกำลังส่งข้อมูล)

---

## 3. Data Flow & State Management

### 3.1 Dealer Dashboard (`src/pages/Dealer.jsx`)
เพิ่ม 2 ฟังก์ชันจัดการ Update:
1. `handleUpdateMemberPayment({ historyItem, paymentId, paymentData })`:
   - ตรวจสอบความถูกต้องของ `amount > 0`
   - ยิง `supabase.from('member_round_payments').update(payload).eq('id', paymentId).eq('dealer_id', user.id).select().single()`
   - อัปเดต React State ใน `historyDetails[historyItem.id].payments` โดยแทนที่ element ที่มี `id === paymentId` ด้วยข้อมูลใหม่
   - อัปเดต React State ใน `settlementOverview.memberPayments` เช่นเดียวกัน
   - ส่ง Toast แจ้งเตือน: *"แก้ไขรายการชำระเงินเรียบร้อยแล้ว"*
2. `handleUpdateUpstreamPayment({ historyItem, paymentId, paymentData })`:
   - ตรวจสอบความถูกต้องของ `amount > 0`
   - ยิง `supabase.from('upstream_round_payments').update(payload).eq('id', paymentId).eq('dealer_id', user.id).select().single()`
   - อัปเดต React State ใน `historyDetails[historyItem.id].upstreamPayments`
   - อัปเดต React State ใน `settlementOverview.upstreamPayments`
   - ส่ง Toast แจ้งเตือน: *"แก้ไขรายการชำระเงินเรียบร้อยแล้ว"*

### 3.2 Real-time Recalculation
- เนื่องจากยอดคงค้าง (`currentBalance`) และ Badge สถานะ (`getMemberSettlementStatus` / `getUpstreamSettlementStatus`) คำนวณจาก `payments` Array ที่ส่งเข้ามาแบบ Pure Function
- เมื่อ `payments` ใน State ถูกอัปเดต ยอดคงค้าง, ยอดรวมที่ชำระแล้ว, และสีของ Badge ทั้งบนแถบขยายและในตารางสรุปจะอัปเดตตามทันที 100%

---

## 4. Components & File Changes

1. **`src/pages/Dealer.jsx`:**
   - เพิ่มฟังก์ชัน `handleUpdateMemberPayment` และ `handleUpdateUpstreamPayment`
   - ส่ง prop `onUpdatePayment` ไปยัง `<MemberSettlementInline />` และ `<UpstreamSettlementInline />`
2. **`src/components/dealer/MemberSettlementInline.jsx`:**
   - รับ prop `onUpdatePayment`
   - เพิ่ม State สำหรับ Edit Modal: `editingPayment` (เก็บ object รายการที่กำลังแก้ไข หรือ null), และ state ฟอร์มแก้ไข
   - เพิ่มปุ่มแก้ไข `<FiEdit2 />` ในแต่ละแถวของตาราง `settlement-logs-table`
   - แสดง Edit Modal ผ่าน `createPortal`
3. **`src/components/dealer/MemberSettlementInline.css`:**
   - เพิ่มคลาส `.btn-edit-log` พร้อม hover effect
   - ปรับแต่ง `.settlement-logs-table` คอลัมน์จัดการให้จัดวางปุ่มคู่กันได้สวยงาม
4. **`src/components/dealer/UpstreamSettlementInline.jsx` & `.css`:**
   - รับ prop `onUpdatePayment`
   - เพิ่มปุ่มแก้ไข `<FiEdit2 />` และ Edit Modal ในลักษณะเดียวกัน เพื่อความสมบูรณ์เป็นมาตรฐานเดียวกันทั่วทั้งระบบ

---

## 5. Verification Plan

1. **Automated Unit & Build Tests:**
   - รัน `npm test` เพื่อให้มั่นใจว่า settlement calculators และ unit tests อื่นๆ ยังผ่านสมบูรณ์
   - รัน `npm run build` เพื่อตรวจจับ syntax error, import error, หรือ JSX linting
2. **Manual Functional Tests:**
   - เปิดแถบประวัติงวดหวย และขยายแถวสมาชิกที่มีรายการชำระเงิน
   - กดปุ่มแก้ไข ✏️ ตรวจสอบว่าหน้าต่าง Edit Modal เปิดขึ้นพร้อมข้อมูลเดิมถูกต้องครบถ้วน
   - แก้ไขจำนวนเงิน / วันที่ / หมายเหตุ แล้วกดบันทึก
   - ตรวจสอบว่าตารางประวัติแสดงข้อมูลใหม่ทันที
   - ตรวจสอบว่ายอดคงค้างปัจจุบันและ Badge เปลี่ยนแปลงตัวเลขตามที่คำนวณใหม่แบบเรียลไทม์
   - ทดสอบยกเลิกการแก้ไข ข้อมูลต้องไม่เปลี่ยน
