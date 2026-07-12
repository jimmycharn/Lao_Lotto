### Task 3: Web Dashboard UI - Templates & Auto-Scheduling
**Files:**
- Modify: `src/pages/Dealer.jsx` (Add schedules, offsets, auto-layoff settings, and AI auto-import to Create Round/Template modal)

**Interfaces:**
- Consumes: Updated templates schema columns
- Produces: Full automation settings inside templates form

- [ ] **Step 1: Update Templates Modal Form**
  Include inputs for:
  - Enabled auto-creation (checkbox/switch)
  - Mode Selection (weekly days / monthly dates dropdown/checkbox list)
  - Offsets (input number)
  - Auto-layoff flag & method selection
  - Auto-import result flag
  Hook these elements to `handleSaveTemplate` upsert requests.

- [ ] **Step 2: Run verification**
  Run: `powershell -ExecutionPolicy Bypass -Command "npm run build"`
  Expected: Build finishes with no issues.

- [ ] **Step 3: Commit changes**

---
