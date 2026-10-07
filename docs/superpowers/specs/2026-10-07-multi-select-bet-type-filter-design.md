# Design Specification: Multi-Select Bet Type Filter (ตัวกรองประเภทเลขแบบเลือกได้หลายประเภท)

**Date**: 2026-10-07  
**Status**: Proposed  
**Author**: Antigravity  

---

## 1. Background & Problem Statement
ในหน้าจัดการงวดของเจ้ามือ (`RoundAccordionItem.jsx`) ปัจจุบันมีช่องค้นหาตัวเลขและบันทึกช่วยจำ ควบคู่กับ Dropdown เลือกประเภทเลข ("ทุกประเภท", "2 ตัวบน", ฯลฯ) ซึ่ง:
- เลือกดูได้ทีละประเภทเดียวเท่านั้น ไม่สามารถเลือกดูพร้อมกัน 2-3 ประเภทได้ (เช่น อยากดูเฉพาะ 3 ตัวบน และ 3 ตัวโต๊ด พร้อมกัน)
- รายการประเภทเลขใน Dropdown ยังไม่ครอบคลุมครบตามที่ผู้ใช้ต้องการสำหรับแต่ละประเภทหวย (หวยไทย, หวยลาว/ฮานอย, หวยหุ้น)

## 2. Goals & Key Requirements
1. **Multi-Select Filter UI (แบบที่ 1)**:
   - นำดีไซน์กล่องเลือกแบบชิป (Chips / Tags) สไตล์เดียวกับ Modal ขยายเวลาเฉพาะบุคคลมาใช้
   - วางอยู่ใต้ช่องค้นหาเลขหรือบันทึกช่วยจำ
   - มีหัวข้อ `ประเภทเลขที่เลือก (X)` พร้อมปุ่มทางขวา:
     - `เลือกทั้งหมด (X)`: เลือกทุกประเภทของหวยงวดนั้น
     - `ล้าง`: ล้างตัวเลือกทั้งหมด (กลับสู่โหมดแสดงทุกประเภท / ไม่กรอง)
   - แต่ละประเภทเลขที่ถูกเลือกจะแสดงเป็นชิปแท็กสีทอง (Amber) พร้อมปุ่ม `✕` เพื่อคลิกเอาออกทีละตัวได้
   - ด้านล่างมี Dropdown: `➕ เลือกเพิ่มประเภทเลข... (เหลืออีก X ประเภท)`
   - หากยังไม่ได้เลือกประเภทใด (หรือกดล้าง) จะแสดงข้อความระบุว่า `"แสดงทุกประเภทเลข (กดเลือกประเภทจากเมนูด้านล่างเพื่อกรองเจาะจง)"`

2. **รายการประเภทเลขตามชนิดหวย (Lottery Type Configuration)**:
   - **หวยไทย (`thai`) - 17 ประเภท**:
     1. ลอยบน (`run_top`)
     2. ลอยล่าง (`run_bottom`)
     3. ปักหน้าบน (`front_top_1`)
     4. ปักกลางบน (`middle_top_1`)
     5. ปักหลังบน (`back_top_1`)
     6. ปักหน้าล่าง (`front_bottom_1`)
     7. ปักหลังล่าง (`back_bottom_1`)
     8. 2 ตัวบน (`2_top`)
     9. 2 ตัวหน้า (`2_front`)
     10. 2 ตัวถ่าง (`2_center`)
     11. 2 ตัวล่าง (`2_bottom`)
     12. 2 ตัวลอย (`2_run`)
     13. 3 ตัวบน (`3_top`)
     14. 3 ตัวโต๊ด (`3_tod`)
     15. 3 ตัวล่าง (`3_bottom`)
     16. 4 ตัวลอย (`4_float`)
     17. 5 ตัวลอย (`5_float`)
   - **หวยลาว (`lao`) & หวยฮานอย (`hanoi`) - 18 ประเภท**:
     1. เลข 4ตัวชุด (`4_set`)
     2. ลอยบน (`run_top`)
     3. ลอยล่าง (`run_bottom`)
     4. ปักหน้าบน (`front_top_1`)
     5. ปักกลางบน (`middle_top_1`)
     6. ปักหลังบน (`back_top_1`)
     7. ปักหน้าล่าง (`front_bottom_1`)
     8. ปักหลังล่าง (`back_bottom_1`)
     9. 2 ตัวบน (`2_top`)
     10. 2 ตัวหน้า (`2_front`)
     11. 2 ตัวถ่าง (`2_center`)
     12. 2 ตัวล่าง (`2_bottom`)
     13. 2 ตัวลอย (`2_run`)
     14. 3 ตัวบน (`3_top`)
     15. 3 ตัวโต๊ด (`3_tod`)
     16. 3 ตัวล่าง (`3_bottom`)
     17. 4 ตัวลอย (`4_float`)
     18. 5 ตัวลอย (`5_float`)
   - **หวยหุ้น (`stock`) - 2 ประเภท**:
     1. 2 ตัวบน (`2_top`)
     2. 2 ตัวล่าง (`2_bottom`)
   - **หวยอื่นๆ (Fallback)**:
     - ใช้ชุด 17 ประเภทของหวยไทยเป็นค่ามาตรฐาน

3. **Bet Type Matching & Alias Support**:
   - รองรับรูปแบบ alias และ subtype ของแต่ละประเภทอย่างสมบูรณ์:
     - `2_top`: `2_top`, `2_top_rev`, `2_back`
     - `2_front`: `2_front`, `2_front_rev`, `2_front_single`
     - `2_center`: `2_center`, `2_spread`, `2_tang`, `2_spread_rev`, `2_center_rev`
     - `2_bottom`: `2_bottom`, `2_bottom_rev`
     - `2_run`: `2_run`, `2_have`, `2_teng`, `2_run_rev`
     - `3_top`: `3_top`, `3_straight`
     - `3_tod`: `3_tod`, `3_tod_single`
     - `3_bottom`: `3_bottom`
     - `4_set`: `4_set`, `4_straight_set`, `3_set`, `3_straight_set`, `3_tod_set`, `2_front_set`, `2_back_set`
     - `front_top_1`, `middle_top_1`, `back_top_1`, `front_bottom_1`, `back_bottom_1`
     - หากเป็น `pak_top` หรือ `pak_bottom` ให้แมปเข้ากับกลุ่มปักบน/ปักล่างได้อย่างเหมาะสม
   - ฟังก์ชันตรวจสอบ:
     ```javascript
     function isBetTypeMatched(betType, selectedTypes) {
         if (!selectedTypes || selectedTypes.length === 0) return true
         // เช็คว่า betType ตรงกับประเภทที่เลือก (direct หรือผ่าน alias map)
         ...
     }
     ```

4. **Integration with All Tabs in `RoundAccordionItem.jsx`**:
   - แท็บ **ยอดรวม (Total)**: กรองทั้งแบบสรุปรวม (Summary), แบบแยกเลข (Grouped), และแบบใบโพย (Bills)
   - แท็บ **ยอดเหลือ (Remaining)**: กรองรายการตัวเลขตามประเภทที่เลือก
   - แท็บ **ยอดเกิน (Excess)**: กรองรายการตัวเลขเกินตามประเภทที่เลือก
   - แท็บ **ยอดตีออก (Transferred)**: กรองรายการตีออกตามประเภทที่เลือก

---

## 3. Architecture & Component Structure

### 3.1 New Helper / Constant Module: `src/utils/betTypeFilterHelper.js`
- นิยาม `FILTER_BET_TYPES_BY_LOTTERY`:
  - `thai`: 17 ประเภท
  - `lao`: 18 ประเภท
  - `hanoi`: 18 ประเภท
  - `stock`: 2 ประเภท
- ฟังก์ชัน `getFilterBetTypes(lotteryType)`: คืนค่ารายการประเภทเลข `[{ id, label }]`
- ฟังก์ชัน `isBetTypeMatched(betType, selectedTypes)`: ตรวจสอบการจับคู่ประเภทเลข
- พร้อม Unit Tests ครอบคลุมทุกเงื่อนไข

### 3.2 UI Component: `src/components/dealer/BetTypeChipsFilter.jsx`
- Props:
  - `lotteryType`: ชนิดหวย
  - `selectedTypes`: array ของ betType ID ที่ถูกเลือก
  - `onChange`: callback ส่ง array ใหม่กลับไป
- โครงสร้าง:
  - Header: ไอคอน + จำนวนที่เลือก + ปุ่ม "เลือกทั้งหมด" + ปุ่ม "ล้าง"
  - Chips list: แสดงชิปที่ถูกเลือก พร้อมปุ่ม `✕`
  - Dropdown: สำหรับเลือกเพิ่มประเภทที่ยังไม่ได้เลือก

### 3.3 Integration in `RoundAccordionItem.jsx`
- เพิ่ม State: `const [inlineSelectedBetTypes, setInlineSelectedBetTypes] = useState([])`
- นำ `BetTypeChipsFilter` ไปวางใต้แถบค้นหา `search-input-wrapper`
- นำ `isBetTypeMatched` ไปใช้แทนเงื่อนไข `s.bet_type === inlineBetTypeFilter` ในทุกจุด

---

## 4. Verification & Testing
1. Unit Tests สำหรับ `betTypeFilterHelper.test.js`:
   - ตรวจสอบจำนวนและชื่อประเภทของ หวยไทย (17), หวยลาว (18), หวยฮานอย (18), หวยหุ้น (2)
   - ตรวจสอบฟังก์ชัน `isBetTypeMatched`: เมื่อไม่ได้เลือก (ว่าง), เมื่อเลือกบางตัว, และการจับคู่ alias (`2_top_rev`, `2_center`, `pak_top` ฯลฯ)
2. Run vitest ทั้งระบบ เพื่อยืนยันว่าไม่มีผลกระทบต่อโมดูลอื่น
3. Run vite build เพื่อยืนยันว่าการ build ผ่าน 100%
