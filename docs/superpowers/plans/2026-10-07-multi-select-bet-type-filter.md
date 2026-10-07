# Multi-Select Bet Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนตัวกรองประเภทเลขจากการเลือกแบบ Single Dropdown เป็น Multi-Select Chips Filter สไตล์กล่องเลือกสมาชิก พร้อมรายการประเภทเลขตามชนิดหวย (หวยไทย 17 ประเภท, หวยลาว/ฮานอย 18 ประเภท, หวยหุ้น 2 ประเภท)

**Architecture:** แยก Helper และการตั้งค่าประเภทเลขไว้ที่ `src/utils/betTypeFilterHelper.js`, สร้าง Component อิสระ `src/components/dealer/BetTypeChipsFilter.jsx` สำหรับเรนเดอร์กล่องชิปและการเลือก, และเชื่อมโยงเข้ากับ `RoundAccordionItem.jsx` เพื่อกรองข้อมูลทุกแท็บ

**Tech Stack:** React 19, Vite, Vitest, CSS / Vanilla UI Components

## Global Constraints
- ไม่แตะต้อง/แก้ไข/ลบข้อมูลในฐานข้อมูลเด็ดขาด (No DB mutation)
- ห้ามใช้คำสั่ง `cd`
- รักษาความเข้ากันได้ของการทำงานเดิม (Backward compatibility) ทั้งหมด
- รองรับประเภทหวย: `thai`, `lao`, `hanoi`, `stock` (และ fallback สำหรับหวยอื่นๆ)

---

### Task 1: Bet Type Filter Helper & Unit Tests

**Files:**
- Create: `src/utils/betTypeFilterHelper.js`
- Create: `src/utils/betTypeFilterHelper.test.js`

**Interfaces:**
- Produces:
  - `FILTER_BET_TYPES_BY_LOTTERY`: Object mapping ชนิดหวยกับรายการประเภทเลข
  - `getFilterBetTypes(lotteryType)`: คืนค่า Array ของ `{ id: string, label: string }`
  - `isBetTypeMatched(betType, selectedTypes)`: คืนค่า `boolean` บ่งบอกว่า `betType` ตรงกับรายการที่ถูกเลือกหรือไม่

- [ ] **Step 1: Write failing unit tests for `betTypeFilterHelper`**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement `src/utils/betTypeFilterHelper.js`**
- [ ] **Step 4: Run tests to verify all pass**
- [ ] **Step 5: Commit changes**

---

### Task 2: UI Component `BetTypeChipsFilter`

**Files:**
- Create: `src/components/dealer/BetTypeChipsFilter.jsx`

**Interfaces:**
- Consumes:
  - `getFilterBetTypes(lotteryType)` จาก `src/utils/betTypeFilterHelper.js`
- Produces:
  - `<BetTypeChipsFilter lotteryType={string} selectedTypes={string[]} onChange={function} />`

- [ ] **Step 1: Implement `BetTypeChipsFilter.jsx` with header, chips, and add-dropdown matching the UI design of MemberTimeExtensionModal**
- [ ] **Step 2: Verify component rendering and syntax**
- [ ] **Step 3: Commit changes**

---

### Task 3: Integrate with `RoundAccordionItem.jsx`

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`

**Interfaces:**
- Consumes:
  - `<BetTypeChipsFilter />` จาก `src/components/dealer/BetTypeChipsFilter.jsx`
  - `isBetTypeMatched` จาก `src/utils/betTypeFilterHelper.js`

- [ ] **Step 1: Replace `inlineBetTypeFilter` state with `inlineSelectedBetTypes`**
- [ ] **Step 2: Replace the single dropdown UI with `<BetTypeChipsFilter />` under search input**
- [ ] **Step 3: Update filter conditions in Total Tab (Summary, Grouped, Bills)**
- [ ] **Step 4: Update filter conditions in Remaining Tab, Excess Tab, and Transferred Tab**
- [ ] **Step 5: Commit changes**

---

### Task 4: System Verification & Build

- [ ] **Step 1: Run full vitest suite (`npx.cmd vitest run`)**
- [ ] **Step 2: Run Vite build (`npm.cmd run build`)**
- [ ] **Step 3: Commit final integration changes**
