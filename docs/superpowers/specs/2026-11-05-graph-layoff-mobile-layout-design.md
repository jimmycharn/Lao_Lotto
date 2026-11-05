# Design Specification: Graph-based Layoff Mobile Responsive Layout (จัด Layout กราฟตัดยอดสำหรับมือถือ)

**Date**: 2026-11-05  
**Status**: Approved by User (Approach 1: Stacked Toolbar + Bottom Sheet)  
**Target Files**:
- `src/components/dealer/GraphLayoffModal.css` (New Dedicated Stylesheet)
- `src/components/dealer/GraphLayoffModal.jsx` (Component Layout & Responsive Refactor)
- `src/components/dealer/__tests__/GraphLayoffModal.test.jsx` (Unit & Responsive Tests)

---

## 1. Background & Goals
The Graph Layoff modal (`GraphLayoffModal.jsx`) provides a visual tool for dealers to inspect accumulated bets across numbers and set threshold price lines to cut excess bets into a staging basket. While functional on desktop widescreen displays, on mobile devices (smartphones with screen widths 360px–430px and tablets up to 768px), the layout suffers from several usability issues:
1. **Window Margins & Wasted Space:** On mobile, a `92vh` centered window with margins wastes valuable vertical and horizontal screen real estate.
2. **Crowded Header:** The title, source badge, three dropdown triggers (3 ตัว, 2 ตัว, 1 ตัว), and the close button are forced into a single nowrap row, causing overflow or clipping on screens under 500px.
3. **Disorganized Control Toolbar:** All line buttons, line pills, cut modes, amount modes, impact summary, and "ตัดยอดเข้าตะกร้า" button are lumped into a single flex container. On narrow screens, this wraps haphazardly into 4+ uneven lines, pushing down the chart and leaving almost no room for the canvas.
4. **Touch Ergonomics for Dragging Lines:** Threshold lines on touch devices need a larger touch hit target (threshold) than precision mouse cursors.
5. **Staging Basket Drawer (Bottom Sheet):** The collapsible drawer at the bottom needs to function like a native mobile bottom sheet with clear thumb-friendly buttons that don't get squished.

The user selected **Approach 1: Responsive Layout แบบ Stacked Toolbar + Bottom Sheet** to make the mobile layout beautiful, clean, and intuitive to use with one hand.

---

## 2. User-Approved Design

### 2.1 CSS Architecture
To avoid massive inline ternary style expressions in JSX, create `src/components/dealer/GraphLayoffModal.css` using modern CSS container queries / media queries:
- Standard desktop styles as base.
- `@media (max-width: 768px)` for tablets and small laptops.
- `@media (max-width: 480px)` for smartphones.

### 2.2 Modal Window Container
- **Desktop:** `max-width: 1200px`, `height: 92vh`, `border-radius: 12px`, centered with backdrop.
- **Mobile ($\le 768$px):**
  - `width: 100vw`, `height: 100dvh` (or `100vh`), `max-width: 100vw`, `border-radius: 0`.
  - Padding around overlay: `0`.
  - Uses `display: flex; flex-direction: column; overflow: hidden;`.

### 2.3 Mobile Header (2-Row Structure)
On screens $\le 768$px:
- **Row 1 (Title Bar):**
  - Left: Icon + "ตัดยอดตีออกจากกราฟ" (compact text on small screens: "ตัดยอดจากกราฟ") + Source badge (`ยอดเหลือ` / `ยอดเกิน`).
  - Right: Close button `✕` with comfortable touch padding ($36 \times 36$px tap target).
- **Row 2 (Category Selector Bar):**
  - Full-width tab container with 3 equal columns (`flex: 1` each):
    - `3 ตัว: [เลือกประเภท]`
    - `2 ตัว: [เลือกประเภท]`
    - `1 ตัว: [เลือกประเภท]`
  - Dropdown menu panels on mobile: Anchored below the tab row, styled with clean elevation, z-index, and full-width or neat positioning without overflowing screen edges.

### 2.4 Control Toolbar (Stacked Segmented Rows)
On screens $\le 768$px, the toolbar is organized into 3 logical, compact rows:
- **Row 1: Line Management**
  - `+ เพิ่มเส้น` button (compact, icon + text).
  - Active line badges (pills): e.g. `● เส้นบน: ฿80 ✎ ✕` with easy-to-tap `✎` and `✕` buttons.
- **Row 2: Cut & Amount Mode Toggles**
  - Segmented control 1 (Cut Mode):
    - 1 line: `🔴 ตัดบน` / `🔵 ตัดล่าง`
    - 2 lines: `🟡 ระหว่างเส้น` / `🟣 นอกเส้น`
  - Segmented control 2 (Amount Mode):
    - `ส่วนต่าง` / `เต็มจำนวน`
  - Displayed side-by-side or horizontally scrollable if viewport is under 380px.
- **Row 3: Impact Summary & Action Bar**
  - Left: `เข้าเงื่อนไข: X เลข` | `ยอดตัด: ฿Y` (clear, readable text).
  - Right: `✂️ ตัดยอดเข้าตะกร้า` button (prominent green button, min-height 38px, easy for thumb tap).

### 2.5 Canvas Chart Area (Touch-Friendly)
- Chart container has `flex: 1` with `min-height: 200px` on mobile.
- Touch drag detection threshold increased from 15px to 22px on touch/pointer devices so fingers can easily grab the threshold line.
- The drag badge at the right edge is sized appropriately ($56 \times 20$px) with a touch hit radius.
- Tooltip on touch: Positioned safely within chart container bounds, never clipped by screen top/bottom edges.

### 2.6 Staging Basket (Mobile Bottom Sheet)
- **Collapsed Bar (Sticky at bottom):**
  - Left: `🛒 (X รายการ) รวม: ฿Y`
  - Right: `ล้าง` (compact text/icon) + `ส่งตีออก (X)` button + chevron expand icon.
- **Expanded Drawer (Bottom Sheet):**
  - `max-height: 40vh` (or up to 260px) with smooth scrolling.
  - Table columns optimized for narrow screens:
    - `เลข` (with sort indicator `↑`/`↓`/`↕`)
    - `ประเภท` (compact text)
    - `ยอดตัดออก` (with sort indicator `↑`/`↓`/`↕`, text-align right)
    - `จัดการ` (tap `✕` to delete)
  - Table padding and font sizes optimized for mobile readability without horizontal overflow.

---

## 3. Implementation Steps
1. Create `src/components/dealer/GraphLayoffModal.css` defining responsive classes (`.graph-layoff-modal`, `.graph-modal-header`, `.graph-category-tabs`, `.graph-toolbar`, `.graph-toolbar-row`, `.graph-basket-drawer`, etc.).
2. Refactor `GraphLayoffModal.jsx` to apply semantic responsive classes alongside existing CSS variables.
3. Add enlarged touch hit detection threshold (`hitDistance = e.pointerType === 'touch' ? 22 : 14`) for line dragging.
4. Update unit tests in `src/components/dealer/__tests__/GraphLayoffModal.test.jsx` to verify responsive class structure and functionality.
5. Run Vitest, ESLint, and Vite build to confirm zero regressions.
