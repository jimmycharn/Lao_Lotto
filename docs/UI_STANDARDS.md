# UI Standards - Lao Lotto

เอกสารนี้ใช้เป็นแนวทางในการพัฒนา UI ให้มีมาตรฐานเดียวกันทั้งระบบ

## 1. Layout & Alignment

### Security/Password Section
- **Alignment**: จัดให้อยู่ตรงกลาง (center)
- **Structure**:
  ```jsx
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    padding: '1.5rem', 
    background: 'var(--color-bg)', 
    borderRadius: '0.5rem' 
  }}>
    <div style={{ fontSize: '2rem', color: 'var(--color-gold)', marginBottom: '0.75rem' }}>
      <FiLock />
    </div>
    <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--color-text)' }}>รหัสผ่าน</h4>
    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
      เปลี่ยนรหัสผ่านเพื่อความปลอดภัย
    </p>
    <button className="btn btn-outline">เปลี่ยนรหัสผ่าน</button>
  </div>
  ```

### Form Sections
- **Labels**: อยู่ด้านบนของ input
- **Buttons**: จัดชิดขวาสำหรับ form actions (บันทึก, ยกเลิก)

### Card Headers
- **Title**: อยู่ด้านซ้าย
- **Action buttons**: อยู่ด้านขวา

## 2. Modal Standards

### Modal Overlay
- **Position**: fixed, inset: 0
- **Background**: rgba(0, 0, 0, 0.8)
- **Alignment**: center (ทั้ง desktop และ mobile)
- **Animation**: ใช้ scale animation ไม่ใช่ translateY (เพื่อไม่ให้เอียง)

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  overflow-y: auto;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Modal Content
- **Max-width**: 420px (small), 500px (default), 700px (large), 900px (xl)
- **Max-height**: 90vh
- **Border-radius**: 1rem
- **Animation**: modalFadeIn 0.2s ease

## 3. Color Variables

### Primary Colors
- `--color-gold`: สีทอง (primary)
- `--color-primary`: สีหลัก
- `--color-success`: สีเขียว (สำเร็จ)
- `--color-danger`: สีแดง (ผิดพลาด/ลบ)
- `--color-warning`: สีเหลือง (เตือน)

### Text Colors
- `--color-text`: สีข้อความหลัก
- `--color-text-muted`: สีข้อความรอง

### Background Colors
- `--color-bg`: พื้นหลังหลัก
- `--color-card`: พื้นหลัง card
- `--color-surface`: พื้นหลัง surface

## 4. Button Standards

### Button Sizes
- **Default**: padding 0.75rem 1.5rem
- **Small (btn-sm)**: padding 0.5rem 1rem
- **Block (btn-block)**: width 100%

### Button Variants
- `btn-primary`: ปุ่มหลัก (สีทอง)
- `btn-secondary`: ปุ่มรอง
- `btn-outline`: ปุ่มขอบ
- `btn-danger`: ปุ่มลบ/ยกเลิก

## 5. Responsive Breakpoints

- **Mobile**: max-width: 480px
- **Tablet**: max-width: 768px
- **Desktop**: min-width: 769px

## 6. Spacing

- **xs**: 0.25rem
- **sm**: 0.5rem
- **md**: 1rem
- **lg**: 1.5rem
- **xl**: 2rem

## 7. Icons

ใช้ `react-icons/fi` (Feather Icons) เป็นหลัก:
- `FiLock`: รหัสผ่าน/ความปลอดภัย
- `FiUser`: ผู้ใช้/โปรไฟล์
- `FiSettings`: ตั้งค่า
- `FiEdit2`: แก้ไข
- `FiTrash2`: ลบ
- `FiPlus`: เพิ่ม
- `FiCheck`: ยืนยัน/สำเร็จ
- `FiX`: ปิด/ยกเลิก

---

**หมายเหตุ**: เมื่อสร้าง component ใหม่ ให้ตรวจสอบว่า alignment และ styling เป็นไปตามมาตรฐานนี้
