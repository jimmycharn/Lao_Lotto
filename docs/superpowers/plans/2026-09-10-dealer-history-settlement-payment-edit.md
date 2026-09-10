# Dealer History Settlement Payment Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มปุ่มแก้ไข (✏️) และหน้าต่าง Edit Modal สำหรับรายการชำระเงินทั้งฝั่งสมาชิกและเจ้ามือรับตีออกในหน้างวดหวยแท็บประวัติ เพื่อให้ผู้ใช้แก้ไขรายการที่ป้อนผิดได้ทันทีโดยไม่ต้องลบทิ้งแล้วสร้างใหม่

**Architecture:** 
1. เพิ่มฟังก์ชัน `handleUpdateMemberPayment` และ `handleUpdateUpstreamPayment` ใน `Dealer.jsx` เพื่อส่งคำสั่ง `UPDATE` ไปยัง Supabase และอัปเดต React State (`historyDetails` และ `settlementOverview`)
2. ขยายคอมโพเนนต์ `MemberSettlementInline.jsx` และ `UpstreamSettlementInline.jsx` ให้มีปุ่มไอคอนดินสอ `<FiEdit2 />` ในตารางประวัติ และแสดง Modal สำหรับแก้ไขข้อมูลผ่าน `createPortal`
3. คำนวณยอดคงค้างและสี Badge ใหม่แบบเรียลไทม์ทันทีหลังจากแก้ไขข้อมูลสำเร็จ

**Tech Stack:** React, Supabase JS Client, React Icons (`fi`), Vanilla CSS (Glassmorphism theme)

---

## Global Constraints
- ห้ามทำลาย UI/UX เดิม ให้ใช้สไตล์สีและ Glassmorphism ที่สอดคล้องกับธีมมืดเดิมของระบบ
- ช่องจำนวนเงินต้องตรวจสอบ `amount > 0` เสมอ
- ปุ่มแก้ไขต้องมีขนาดกะทัดรัด สบายตา วางคู่กับปุ่มลบในคอลัมน์จัดการ

---

## Tasks

### Task 1: เพิ่มฟังก์ชันจัดการ Update Payments ใน `src/pages/Dealer.jsx`

**Files:**
- Modify: `src/pages/Dealer.jsx:640-670`
- Modify: `src/pages/Dealer.jsx:3855-3920`

**Interfaces:**
- Produces: 
  - `handleUpdateMemberPayment({ historyItem, paymentId, paymentData })`: Promise<boolean>
  - `handleUpdateUpstreamPayment({ historyItem, paymentId, paymentData })`: Promise<boolean>
- Pass as `onUpdatePayment` prop to `<MemberSettlementInline />` and `<UpstreamSettlementInline />`

- [ ] **Step 1: เขียนฟังก์ชัน `handleUpdateMemberPayment` ใน `Dealer.jsx`**
- [ ] **Step 2: เขียนฟังก์ชัน `handleUpdateUpstreamPayment` ใน `Dealer.jsx`**
- [ ] **Step 3: เชื่อมต่อ prop `onUpdatePayment` ใน JSX ของ Dealer**
- [ ] **Step 4: ทดสอบ build ด้วย `npm.cmd run build`**
- [ ] **Step 5: Commit การเปลี่ยนแปลง**

---

### Task 2: เพิ่มปุ่มแก้ไขและ Modal ใน `MemberSettlementInline.jsx` & CSS

**Files:**
- Modify: `src/components/dealer/MemberSettlementInline.css`
- Modify: `src/components/dealer/MemberSettlementInline.jsx`

**Interfaces:**
- Consumes: `onUpdatePayment(paymentId, paymentData)`
- Produces: Edit button in action column + Edit Payment Modal

- [ ] **Step 1: เพิ่ม CSS สไตล์ `.btn-edit-log` ใน `MemberSettlementInline.css`**
- [ ] **Step 2: อัปเดต `MemberSettlementInline.jsx` นำเข้า `FiEdit2` และสร้าง State สำหรับ Edit Modal**
- [ ] **Step 3: เพิ่ม Handler สำหรับเปิดและบันทึกการแก้ไข (`handleOpenEditModal`, `handleConfirmEditPayment`)**
- [ ] **Step 4: ใส่ปุ่มแก้ไขในตารางประวัติ และ Render Edit Modal ผ่าน `createPortal`**
- [ ] **Step 5: ทดสอบ build ด้วย `npm.cmd run build`**
- [ ] **Step 6: Commit การเปลี่ยนแปลง**

---

### Task 3: เพิ่มปุ่มแก้ไขและ Modal ใน `UpstreamSettlementInline.jsx` & CSS

**Files:**
- Modify: `src/components/dealer/UpstreamSettlementInline.css`
- Modify: `src/components/dealer/UpstreamSettlementInline.jsx`

- [ ] **Step 1: เพิ่ม CSS `.btn-edit-log` ใน `UpstreamSettlementInline.css`**
- [ ] **Step 2: นำเข้า `FiEdit2` และเพิ่ม State & Handlers ใน `UpstreamSettlementInline.jsx`**
- [ ] **Step 3: ใส่ปุ่มแก้ไขในแถวตาราง และ Render Edit Modal ผ่าน `createPortal`**
- [ ] **Step 4: ทดสอบ build ด้วย `npm.cmd run build`**
- [ ] **Step 5: Commit การเปลี่ยนแปลง**

---

### Task 4: ตรวจสอบและทดสอบการทำงานทั้งหมด (Verification)

- [ ] **Step 1: รัน Automated Tests (`npm.cmd test`)**
- [ ] **Step 2: รัน Build Verification (`npm.cmd run build`)**
- [ ] **Step 3: ตรวจสอบความถูกต้องของ UI และฟังก์ชัน**
