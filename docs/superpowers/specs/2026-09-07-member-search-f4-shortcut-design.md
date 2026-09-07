# Design Specification: Searchable Member Combobox with F4 Shortcut

- **Date**: 2026-09-07
- **Feature**: Searchable Member Selection with F4 Shortcut in Dealer Write Submission Modal
- **Status**: Approved

## 1. Problem Statement & Goals
In the Dealer Write Submission Modal (`WriteSubmissionModal.jsx`), dealers frequently enter lottery slips for multiple members in rapid succession.
Currently, switching the active member requires using a mouse to click a standard HTML `<select>` element. Moving the hand away from the keyboard to the mouse slows down rapid data entry.

### Goals:
1. Provide a physical keyboard shortcut (`F4`) to instantly open and focus the member search filter.
2. Replace the static `<select>` with a searchable inline combobox that filters members in real-time as the user types.
3. Allow full keyboard navigation:
   - `ArrowDown` / `ArrowUp` to navigate member list.
   - `Enter` to confirm and select the member.
   - `Escape` to close/cancel the member search.
4. After selecting with `Enter`, immediately restore the state so that the user can continue typing lottery numbers/amounts without touching the mouse.
5. Ensure keystrokes typed inside the search box (numbers, spaces, operators) do not trigger lottery keypad shortcuts.

## 2. Shortcut Selection Analysis
Existing desktop shortcuts in `WriteSubmissionModal.jsx`:
- `0-9`: Lottery numbers and amounts
- `+` / `NumpadAdd`: Opens Paste Numbers Modal
- `-` / `Subtract`: Toggles บน / ล่าง
- `=`: Equal separator
- `*`: Asterisk separator / คูณชุด
- `Backspace` / `Delete`: Deletion & clearing
- `Escape`: Clear / close modals
- `Space`: Toggle lock amount
- `F10` / `Ctrl+S`: Save/Submit bill
- `Ctrl+Enter`: Submit draft with default type button
- `Ctrl+1-9`: Select type button & set as default
- Arrow keys / Tab: Navigate type buttons

**Chosen Shortcut**: **`F4`**
- Standard Windows / ERP key for opening dropdown lists and lookups.
- Single keystroke with the left hand, fast and comfortable during rapid entry.
- No collision with any existing shortcut in the modal or web browser standard functions.

## 3. Detailed Component & UX Design

### 3.1 Inline Combobox Behavior
- **Default State**:
  - Displays the currently selected member name with a small shortcut badge `[F4]` and a dropdown/search icon.
  - Clicking this element or pressing `F4` opens the combobox search input.
- **Active / Search State**:
  - The row displays an `<input type="text" className="member-search-input" ... />` that is automatically focused with its text selected.
  - As the user types query text, the member list is filtered in real-time:
    - Matches against `full_name`, `email`, `phone`, or `id`.
    - Case-insensitive, supports Thai and English search.
  - A floating dropdown list (`.member-dropdown-list`) appears directly below the input:
    - Maximum height ~220px with smooth scrollbar.
    - Highlighted index is tracked (`highlightedIndex`).
    - The active item automatically scrolls into view when navigating with `ArrowDown` / `ArrowUp`.
  - Empty state: Displays "ไม่พบรายชื่อสมาชิก" if no members match query.
- **Selection & Exit**:
  - Pressing `Enter` selects the highlighted member, invokes `onMemberChange(selectedMember)`, plays `playSound('click')`, closes the search dropdown, and blurs the input.
  - Pressing `Escape` cancels any search, restores the previous member, and closes the dropdown.
  - Clicking outside closes the dropdown.

### 3.2 Event Isolation
- When the search input is focused:
  - `e.stopPropagation()` in its `onKeyDown` to prevent global modal key handlers from interpreting digits, +, -, *, =, etc. as lottery bet input.
  - Only navigation keys (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`, `Tab`) are handled specifically for member selection.

### 3.3 Theming & Responsive Design
- Integrated into `.write-modal-member-row`.
- Supports both Dark and Light themes:
  - Dark: background `rgba(255, 255, 255, 0.1)`, dropdown background `#1a1a2e` / `rgba(26, 26, 46, 0.98)`, border `rgba(255, 255, 255, 0.2)`.
  - Light: background `#ffffff`, dropdown background `#ffffff`, border `#cbd5e1`, text `#1e293b`.
  - Active/hover item highlight color: `rgba(102, 126, 234, 0.25)` or theme primary tint.

## 4. Verification & Testing Plan
1. **Shortcut Activation**: Pressing `F4` while modal is open immediately focuses member search input.
2. **Filtering**: Typing member name or phone number filters list accurately.
3. **Keyboard Navigation**: Pressing `ArrowDown` and `ArrowUp` cycles highlighted item smoothly.
4. **Selection**: Pressing `Enter` selects highlighted member, updates display, and closes dropdown.
5. **No Key Leaks**: Typing digits or symbols inside search input does not add lottery numbers or open paste modal.
6. **Continuation**: Immediately after pressing `Enter`, typing `123=50` inputs lottery numbers correctly.
7. **Cancel**: Pressing `Escape` closes the filter without unwanted side effects.
8. **Build & Lint**: `npm run build` succeeds with zero errors.
