# Design Spec: ตัวกรองประเภทหวยในแท็บงวดที่ปิดแล้ว (Dealer Dashboard)

## 1. ปัญหาและเป้าหมาย (Background & Goal)
ในหน้า Dealer Dashboard แท็บ **"งวดที่ปิดแล้ว"** (Closed Rounds) ปัจจุบันแสดงรายการงวดหวยทั้งหมดที่ปิดรับแทงแล้วเรียงต่อกันโดยไม่มีตัวกรองแยกประเภทหวย ทำให้เมื่อมีงวดที่ปิดแล้วหลายประเภท (เช่น หวยลาว, หวยฮานอย, หวยไทย) เจ้ามือต้องเลื่อนค้นหาด้วยสายตา

เป้าหมายคือเพิ่ม Dropdown ตัวกรองประเภทหวยในแท็บ **"งวดที่ปิดแล้ว"** โดย:
- ค่าเริ่มต้นคือ **"หวยทุกประเภท"** (`all`)
- ตัวเลือกใน Dropdown แสดงเฉพาะประเภทหวยที่มีอยู่ในรายการงวดที่ปิดแล้วจริง
- ตัวเลขนับจำนวนบนปุ่มแท็บ `งวดที่ปิดแล้ว (...)` อัปเดตตามจำนวนงวดที่กรองได้จริง
- สไตล์ UI เข้ากับธีม Dark Mode ของระบบอย่างลงตัว

---

## 2. การจัดการสถานะและการประมวลผลข้อมูล (State & Logic)

### 2.1 State
ใน `src/pages/Dealer.jsx`:
```javascript
const [closedLotteryTypeFilter, setClosedLotteryTypeFilter] = useState('all')
```

### 2.2 การสกัดประเภทหวยที่มีอยู่จริง (Available Closed Lottery Types)
```javascript
const availableClosedLotteryTypes = useMemo(() => {
    const typeSet = new Set()
    closedRounds.forEach(r => {
        if (r.lottery_type) typeSet.add(r.lottery_type)
    })
    return Array.from(typeSet)
}, [closedRounds])
```

### 2.3 การกรองงวดที่ปิดแล้ว (Filtered Closed Rounds)
```javascript
const filteredClosedRounds = useMemo(() => {
    if (closedLotteryTypeFilter === 'all') return closedRounds
    return closedRounds.filter(r => r.lottery_type === closedLotteryTypeFilter)
}, [closedRounds, closedLotteryTypeFilter])
```

### 2.4 การแสดงผลจำนวนในปุ่มแท็บ
- ปุ่ม `งวดที่ปิดแล้ว`: แสดงข้อความ `งวดที่ปิดแล้ว (${filteredClosedRounds.length})`
- เมื่อ `roundsTab === 'closed'` รายการที่จะนำไป render ใน `<div className="rounds-list">` จะใช้ `filteredClosedRounds`

---

## 3. การออกแบบหน้าจอ (UI & Layout)

### 3.1 ตำแหน่งของ Filter Bar
- แสดงเฉพาะเมื่อ `roundsTab === 'closed'`
- วางคั่นระหว่างแถบปุ่มแท็บย่อย (`<div className="rounds-sub-tabs">`) และส่วนแสดงรายการงวด (`<div className="rounds-list">` หรือ empty state)

### 3.2 โครงสร้าง JSX
```jsx
{roundsTab === 'closed' && closedRounds.length > 0 && (
    <div className="closed-rounds-filter-bar">
        <div className="closed-rounds-filter-item">
            <label>🎯 ประเภทหวย:</label>
            <select
                className="form-control"
                value={closedLotteryTypeFilter}
                onChange={e => setClosedLotteryTypeFilter(e.target.value)}
            >
                <option value="all">หวยทุกประเภท</option>
                {availableClosedLotteryTypes.map(type => (
                    <option key={type} value={type}>
                        {LOTTERY_TYPES[type] || type}
                    </option>
                ))}
            </select>
        </div>
    </div>
)}
```

### 3.3 การจัดรูปแบบ CSS (`Dealer.css`)
- `.closed-rounds-filter-bar`:
  - `display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;`
  - `background: var(--color-surface); padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid var(--color-border);`
- `.closed-rounds-filter-item`:
  - ป้ายกำกับสี `var(--color-text-muted)` ขนาด font 0.85rem
  - `<select class="form-control">` ช่องเลือกสไตล์ Dark mode ความสูง 38px เข้ากันได้กับส่วนตัวกรองในแท็บประวัติ

### 3.4 การจัดการ Empty State
- หาก `closedRounds.length === 0`: แสดงกล่อง empty state เดิม (`ไม่มีงวดที่ปิดแล้ว`)
- หาก `closedRounds.length > 0` แต่ `filteredClosedRounds.length === 0`:
  แสดงข้อความ *"ไม่พบงวดที่ปิดแล้วสำหรับประเภทที่เลือก"* พร้อมปุ่ม *"แสดงหวยทุกประเภท"* เพื่อกดรีเซ็ต `setClosedLotteryTypeFilter('all')`

---

## 4. แผนการทดสอบและการตรวจสอบ (Verification Plan)
1. ตรวจสอบการเลือก `"หวยทุกประเภท"`: แสดงงวดที่ปิดแล้วทั้งหมด
2. ตรวจสอบการเลือกประเภทใดประเภทหนึ่ง (เช่น `"หวยลาว"`): แสดงเฉพาะงวดของประเภทนั้น
3. ตรวจสอบจำนวนบนปุ่มแท็บ `งวดที่ปิดแล้ว (...)`: แสดงจำนวนที่ตรงกับงวดที่ถูกกรอง
4. ตรวจสอบการสลับแท็บไปมาระหว่าง `งวดที่เปิดอยู่`, `งวดที่ปิดแล้ว`, `ประวัติ`: แถบตัวกรองแสดงเฉพาะในแท็บ `งวดที่ปิดแล้ว`
5. ตรวจสอบการ build / lint เพื่อความมั่นใจว่าไม่มี syntax หรือ runtime error
