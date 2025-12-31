# Lao Lottery App - Task Checklist v2

## Phase 1: Initial Setup ✅
- [x] Project setup (Vite + React + Supabase)
- [x] Basic authentication
- [x] Initial database schema
- [x] Basic UI components

---

## Phase 2: Database Schema Update
- [ ] Create new migration file
- [ ] Add `lottery_rounds` table (งวดหวย)
- [ ] Add `submissions` table (รายการส่งเลข)
- [ ] Add `user_settings` table (ค่าคอม/อัตราจ่าย)
- [ ] Add `number_limits` table (ค่าอั้น)
- [ ] Run migration on Supabase

---

## Phase 3: Dealer Dashboard
- [ ] **งวดหวย**
  - [ ] สร้างงวดใหม่
  - [ ] แก้ไขงวด
  - [ ] ปิดงวด
- [ ] **ตั้งค่า User**
  - [ ] ตั้งค่าคอมมิชชั่น
  - [ ] ตั้งอัตราจ่าย
- [ ] **ค่าอั้น**
  - [ ] ตั้งค่าอั้นแต่ละเลข
  - [ ] ดูเลขเกินค่าอั้น
- [ ] **ดูเลขที่ส่ง**
  - [ ] ภาพรวมตามประเภท
  - [ ] รายละเอียดรายคน
- [ ] **ตรวจผลรางวัล**
  - [ ] ใส่เลขที่ออก
  - [ ] คำนวณผู้ชนะ
  - [ ] สรุปภาพรวม

---

## Phase 4: User Dashboard
- [ ] **ดูงวดเปิดรับ**
  - [ ] แสดงประเภทหวย
  - [ ] แสดงเวลาเปิด-ปิด
  - [ ] Countdown timer
- [ ] **ส่งเลข**
  - [ ] ป้อนเลข + จำนวนเงิน
  - [ ] ลบเลขได้ตามเวลา
- [ ] **ดูเลขที่ส่ง**
- [ ] **ค่าคอมมิชชั่น**
- [ ] **ผลรางวัล**

---

## Phase 5: SuperAdmin Dashboard
- [ ] ภาพรวมระบบ
- [ ] ดูข้อมูล Dealer
- [ ] มุมมอง Dealer

---

## Phase 6: Polish & Testing
- [ ] Responsive design
- [ ] Error handling
- [ ] Test all features
- [ ] Deploy
