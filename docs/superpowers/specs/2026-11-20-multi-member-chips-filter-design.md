# Design Spec: Multi-Member Chips Filter with Include/Exclude Mode

## 1. Background & Problem Statement
Currently, in the Dealer Dashboard (`RoundAccordionItem.jsx` - Tab: `ยอดรวม`), member filtering is restricted to single-selection via a `<SearchableDropdown>` (either "ทุกคน" or one individual member).
Dealers cannot:
1. Filter submissions and bills for multiple specific members simultaneously (e.g. Member A and Member B).
2. Exclude specific members from the view (e.g. viewing all submissions EXCEPT Member C, who may have submitted high volumes or noise).
3. The "เขียนโพย" (Write Bet) button was previously shown when any single member was selected, but with multi-member selection, it must only appear when exactly one member is selected in include mode to avoid ambiguity about whose account the bet is being written for.

## 2. Requirements & User Stories
- **Multi-Selection with Chips**: Dealers can select multiple members. Selected members appear as interactive chips/tags (e.g. `[ คุณเบญ ✕ ]`, `[ สุพรรณี ✕ ]`), similar to the `BetTypeChipsFilter`.
- **Include / Exclude Switch**: Dealers can toggle between:
  - `แสดงเฉพาะ` (Include mode, default): Displays submissions, bills, and summary totals ONLY for the selected members.
  - `ไม่เอา` / `ยกเว้น` (Exclude mode): Displays submissions, bills, and summary totals for everyone EXCEPT the selected members.
- **Write Bet Gating**:
  - The `[ 📝 เขียนโพย ]` button MUST ONLY be visible when:
    1. Mode is `แสดงเฉพาะ` (Include).
    2. Exactly 1 member is selected.
    3. The dealer has permission to key on behalf of that member (`canDealerKeyForMember`).
  - When multiple members are selected, or when in exclude mode, or when no specific member is selected (everyone), the button is hidden.
- **Clear All**: A clear button and chip dismiss (`✕`) allowing dealers to quickly reset to viewing all members.
- **Copy Text**: When copying total receipts (`คัดลอก`), the sender text reflects the active selection (e.g., `ผู้ส่ง: คุณเบญ, สุพรรณี` or `ผู้ส่ง: ยกเว้น (คุณเบญ)`).

## 3. Architecture & State Management

In `RoundAccordionItem.jsx`:
- Replace single-member string state `inlineUserFilter` with:
  ```javascript
  const [inlineSelectedMembers, setInlineSelectedMembers] = useState([]) // string[]: names of selected members
  const [inlineMemberSelectMode, setInlineMemberSelectMode] = useState('include') // 'include' | 'exclude'
  ```
- **Helper function `isMemberMatched(userName)`**:
  ```javascript
  const isMemberMatched = (userName) => {
      if (!inlineSelectedMembers || inlineSelectedMembers.length === 0) return true
      const isSelected = inlineSelectedMembers.includes(userName)
      return inlineMemberSelectMode === 'exclude' ? !isSelected : isSelected
  }
  ```
- **SearchableDropdown Integration**:
  - Acts as a member selector / adder.
  - Displays placeholder: `+ ค้นหาและเลือกสมาชิก...`
  - When a member is chosen from the dropdown:
    ```javascript
    const handleAddMember = (memberName) => {
        if (!memberName || memberName === 'all') {
            setInlineSelectedMembers([])
            return
        }
        if (!inlineSelectedMembers.includes(memberName)) {
            setInlineSelectedMembers(prev => [...prev, memberName])
        }
    }
    ```
  - Dropdown options list members according to `memberFilterMode` (`'all'` vs `'submitted'`).

- **Write Bet Handling**:
  ```javascript
  const canWriteBetForSelectedMember = () => {
      if (inlineMemberSelectMode !== 'include') return false
      if (inlineSelectedMembers.length !== 1) return false
      const memberName = inlineSelectedMembers[0]
      const member = allowedMembers.find(m => 
          (m.full_name || m.email || 'ไม่ระบุ') === memberName
      )
      return canDealerKeyForMember(member)
  }
  ```

## 4. UI / UX Design

### Row 0.5: Member Filter Controls
1. **Mode Switch Bar**:
   - `แสดงเฉพาะ` button:
     - Active style: `border: 1px solid var(--color-primary); background: var(--color-primary); color: #000; font-weight: 600;`
   - `ไม่เอา` / `ยกเว้น` button:
     - Active style: `border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.18); color: #ef4444; font-weight: 600;`
2. **SearchableDropdown (Selector)**:
   - Compact dropdown next to the mode switch or in the same row.
3. **Selected Chips Bar** (rendered when `inlineSelectedMembers.length > 0`):
   - Header label:
     - `inlineMemberSelectMode === 'include'`: `สมาชิกที่เลือก (${inlineSelectedMembers.length}):`
     - `inlineMemberSelectMode === 'exclude'`: `🚫 ยกเว้นสมาชิก (${inlineSelectedMembers.length}):`
   - Chips:
     - Include mode: Amber/primary chips with `✕` dismiss button.
     - Exclude mode: Red/danger tinted chips with `✕` dismiss button.
   - `ล้างสมาชิก`: Text button to clear all selected chips.
4. **Action Buttons**:
   - `[ 📝 เขียนโพย ]` (conditionally shown for exactly 1 member in include mode)
   - `[ 📋 คัดลอก ]`
   - `[ ⏰ ขยายเวลา ]`

## 5. Scope of Filtering Effect
The `isMemberMatched(userName)` filter applies consistently to:
1. **Summary Cards** (ยอดรวม, ค่าคอม, เหลือรับ, ถูกรางวัล, กำไร)
2. **Total View: รวมเลข** (Pre-filtered data, table display, and grouped summaries)
3. **Total View: ใบโพย** (`filteredBills` filtering each bill `b.user_name`)
4. **Copy Total Text** (`handleCopyTotal`)

## 6. Testing Strategy
1. **Unit Tests** for `isMemberMatched`:
   - Empty selection returns true for any member.
   - Include mode returns true only for members in the list.
   - Exclude mode returns true only for members NOT in the list.
2. **Write Bet Button Gating Tests**:
   - Hidden when 0 members selected.
   - Shown when 1 member selected in include mode (if permitted).
   - Hidden when 1 member selected in exclude mode.
   - Hidden when >= 2 members selected in either mode.
3. **Vite Build & Vitest Suite**:
   - All 58 test files pass with 0 regressions.
