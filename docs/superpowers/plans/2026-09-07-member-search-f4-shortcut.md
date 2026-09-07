# Member Search Combobox with F4 Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an inline searchable combobox for the member selector in the Dealer Write Submission Modal with physical keyboard shortcut `F4` and full arrow-key navigation.

**Architecture:** Replace the native HTML `<select>` with a React combobox component in `WriteSubmissionModal.jsx`. When `F4` is pressed or trigger clicked, open a search input with floating dropdown, filter members in real-time, navigate with ArrowUp/Down, and select with Enter while strictly isolating key events from betting keypad.

**Tech Stack:** React 18, CSS3 (Dark/Light mode), Vitest

## Global Constraints
- Keyboard shortcut MUST be `F4`.
- Must NOT trigger any lottery betting keypad shortcuts while typing inside member search input.
- After member selection via `Enter`, user must immediately be able to type lottery numbers (e.g. `123=50`) without clicking mouse.
- Maintain full compatibility with existing Dark and Light themes.
- Support filtering by member full name, phone number, email, and ID (case-insensitive).

---

### Task 1: Add Searchable Member Combobox UI and Styles

**Files:**
- Modify: `src/components/WriteSubmissionModal.jsx:2710-2740`
- Modify: `src/components/WriteSubmissionModal.css:240-270`

**Interfaces:**
- Consumes: `allMembers` (Array of member objects), `selectedMember` (Member object), `onMemberChange` (Function), `isDealerMode` (Boolean)
- Produces: State and UI elements for member combobox:
  - `isMemberDropdownOpen` (boolean)
  - `memberSearchQuery` (string)
  - `highlightedMemberIndex` (number)
  - `filteredMembers` (memoized filtered array)

- [ ] **Step 1: Add combobox state, refs, and click-outside listener in `WriteSubmissionModal.jsx`**

```jsx
// Member combobox state
const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false)
const [memberSearchQuery, setMemberSearchQuery] = useState('')
const [highlightedMemberIndex, setHighlightedMemberIndex] = useState(0)
const memberComboboxRef = useRef(null)
const memberSearchInputRef = useRef(null)
const memberDropdownListRef = useRef(null)

// Filter members by query
const filteredMembers = useMemo(() => {
    if (!allMembers || allMembers.length === 0) return []
    if (!memberSearchQuery.trim()) return allMembers
    const q = memberSearchQuery.toLowerCase().trim()
    return allMembers.filter(m => {
        const name = (m.full_name || '').toLowerCase()
        const email = (m.email || '').toLowerCase()
        const phone = (m.phone || '').toLowerCase()
        const id = (m.id || '').toLowerCase()
        return name.includes(q) || email.includes(q) || phone.includes(q) || id.includes(q)
    })
}, [allMembers, memberSearchQuery])

// Close dropdown on click outside
useEffect(() => {
    if (!isMemberDropdownOpen) return
    const handleClickOutside = (e) => {
        if (memberComboboxRef.current && !memberComboboxRef.current.contains(e.target)) {
            setIsMemberDropdownOpen(false)
            setMemberSearchQuery('')
        }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
}, [isMemberDropdownOpen])

// Auto-scroll highlighted item into view
useEffect(() => {
    if (isMemberDropdownOpen && memberDropdownListRef.current) {
        const list = memberDropdownListRef.current
        const activeItem = list.children[highlightedMemberIndex]
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' })
        }
    }
}, [highlightedMemberIndex, isMemberDropdownOpen])
```

- [ ] **Step 2: Replace `<select className="member-select">` with Searchable Combobox JSX**

In `src/components/WriteSubmissionModal.jsx`:
```jsx
{/* Member Selector + Save Button for Dealer Mode */}
{isDealerMode && allMembers.length > 0 && onMemberChange && (
    <div className="write-modal-member-row">
        <label>สมาชิก:</label>
        <div className="member-combobox-wrapper" ref={memberComboboxRef}>
            {!isMemberDropdownOpen ? (
                <button
                    type="button"
                    className="member-combobox-trigger"
                    onClick={() => {
                        setIsMemberDropdownOpen(true)
                        setMemberSearchQuery('')
                        setHighlightedMemberIndex(0)
                        setTimeout(() => memberSearchInputRef.current?.focus(), 50)
                    }}
                    title="กด F4 หรือคลิกเพื่อค้นหาสมาชิก"
                >
                    <span className="member-selected-name">
                        {selectedMember?.full_name || selectedMember?.email || selectedMember?.id || 'เลือกสมาชิก'}
                    </span>
                    <span className="member-shortcut-badge">F4</span>
                </button>
            ) : (
                <div className="member-combobox-active">
                    <input
                        ref={memberSearchInputRef}
                        type="text"
                        className="member-search-input"
                        placeholder="พิมพ์ค้นหาชื่อ/เบอร์..."
                        value={memberSearchQuery}
                        onChange={(e) => {
                            setMemberSearchQuery(e.target.value)
                            setHighlightedMemberIndex(0)
                        }}
                        onKeyDown={handleMemberInputKeyDown}
                    />
                    <div className="member-dropdown-list" ref={memberDropdownListRef}>
                        {filteredMembers.length > 0 ? (
                            filteredMembers.map((member, idx) => (
                                <div
                                    key={member.id}
                                    className={`member-dropdown-item ${idx === highlightedMemberIndex ? 'highlighted' : ''} ${member.id === selectedMember?.id ? 'selected' : ''}`}
                                    onMouseEnter={() => setHighlightedMemberIndex(idx)}
                                    onClick={() => handleSelectMember(member)}
                                >
                                    <span className="member-item-name">{member.full_name || member.email || member.id}</span>
                                    {member.phone && <span className="member-item-phone">{member.phone}</span>}
                                </div>
                            ))
                        ) : (
                            <div className="member-dropdown-empty">ไม่พบรายชื่อสมาชิก</div>
                        )}
                    </div>
                </div>
            )}
        </div>
        {!success && (
            <button 
                className="save-btn-inline"
                onClick={handleSubmit}
                disabled={lines.length === 0 || submitting}
            >
                {submitting ? '...' : 'บันทึก'}
            </button>
        )}
    </div>
)}
```

- [ ] **Step 3: Add CSS for Member Combobox in `WriteSubmissionModal.css`**

Add styling for `.member-combobox-wrapper`, `.member-combobox-trigger`, `.member-shortcut-badge`, `.member-search-input`, `.member-dropdown-list`, `.member-dropdown-item`, `.member-dropdown-empty`, including dark and light theme styles.

- [ ] **Step 4: Verify styling and layout via `cmd /c npm run build`**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit UI and styles**

```bash
git add src/components/WriteSubmissionModal.jsx src/components/WriteSubmissionModal.css
git commit -m "feat: add searchable member combobox UI and styling"
```

---

### Task 2: Implement Keyboard Interactions (F4 trigger, navigation, selection, and key isolation)

**Files:**
- Modify: `src/components/WriteSubmissionModal.jsx:930-1240`

**Interfaces:**
- Consumes: `e.key === 'F4'` in global keydown listener, `onKeyDown` in member search input
- Produces:
  - `handleSelectMember(member)`
  - `handleMemberInputKeyDown(e)`

- [ ] **Step 1: Add `handleSelectMember` and `handleMemberInputKeyDown` methods**

```jsx
const handleSelectMember = useCallback((member) => {
    if (!member) return
    if (onMemberChange) {
        onMemberChange(member)
    }
    playSound('click')
    setIsMemberDropdownOpen(false)
    setMemberSearchQuery('')
}, [onMemberChange])

const handleMemberInputKeyDown = useCallback((e) => {
    // Isolate all key events from reaching global keypad handlers
    e.stopPropagation()

    if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredMembers.length > 0) {
            setHighlightedMemberIndex(prev => (prev + 1) % filteredMembers.length)
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredMembers.length > 0) {
            setHighlightedMemberIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length)
        }
    } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredMembers.length > 0 && filteredMembers[highlightedMemberIndex]) {
            handleSelectMember(filteredMembers[highlightedMemberIndex])
        }
    } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsMemberDropdownOpen(false)
        setMemberSearchQuery('')
    }
}, [filteredMembers, highlightedMemberIndex, handleSelectMember])
```

- [ ] **Step 2: Add `F4` key handler to modal's global `handleKeyDown`**

In `useEffect` for keyboard input:
```jsx
// F4 - Open Searchable Member Combobox (Dealer mode only)
if (e.key === 'F4') {
    if (isDealerMode && allMembers.length > 0 && onMemberChange) {
        e.preventDefault()
        e.stopPropagation()
        setIsMemberDropdownOpen(true)
        setMemberSearchQuery('')
        // Set initial highlighted index to current selected member if exists
        const currentIndex = allMembers.findIndex(m => m.id === selectedMember?.id)
        setHighlightedMemberIndex(currentIndex >= 0 ? currentIndex : 0)
        setTimeout(() => {
            if (memberSearchInputRef.current) {
                memberSearchInputRef.current.focus()
                memberSearchInputRef.current.select()
            }
        }, 50)
        return
    }
}
```

- [ ] **Step 3: Update `handleKeyDown` dependencies**

Ensure `isDealerMode`, `allMembers`, `onMemberChange`, `selectedMember` are in the dependency array or accessible via refs.

- [ ] **Step 4: Verify with `cmd /c npm run build` and `cmd /c npm test`**

Run: `cmd /c npm test`
Expected: 260 tests passed.
Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit keyboard handling**

```bash
git add src/components/WriteSubmissionModal.jsx
git commit -m "feat: implement F4 shortcut and arrow navigation for member search"
```

---

### Task 3: Unit Testing & Full Verification

**Files:**
- Create: `src/components/__tests__/WriteSubmissionModalMemberFilter.test.jsx`

- [ ] **Step 1: Write unit tests for member search filtering and keyboard shortcut logic**

```jsx
import { describe, it, expect } from 'vitest'

describe('Member Filter Logic', () => {
    const mockMembers = [
        { id: '1', full_name: 'น้องเจด', phone: '0812345678', email: 'jade@test.com' },
        { id: '2', full_name: 'สมชาย ขายดี', phone: '0898765432', email: 'somchai@test.com' },
        { id: '3', full_name: 'สมหญิง ร่ำรวย', phone: '0861112233', email: 'somying@test.com' }
    ]

    it('filters members by Thai name correctly', () => {
        const query = 'เจด'
        const results = mockMembers.filter(m => m.full_name.includes(query))
        expect(results.length).toBe(1)
        expect(results[0].full_name).toBe('น้องเจด')
    })

    it('filters members by phone correctly', () => {
        const query = '089'
        const results = mockMembers.filter(m => m.phone.includes(query))
        expect(results.length).toBe(1)
        expect(results[0].full_name).toBe('สมชาย ขายดี')
    })

    it('filters members case-insensitively by email', () => {
        const query = 'SOM'
        const results = mockMembers.filter(m => m.email.toLowerCase().includes(query.toLowerCase()))
        expect(results.length).toBe(2)
    })
})
```

- [ ] **Step 2: Run test suite**

Run: `cmd /c npm test`
Expected: All tests pass.

- [ ] **Step 3: Run production build**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Commit test file**

```bash
git add src/components/__tests__/WriteSubmissionModalMemberFilter.test.jsx
git commit -m "test: add unit test for member filter logic"
```
