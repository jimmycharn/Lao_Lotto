<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.

---

## Domain Rules & Conventions (กฎสำคัญของระบบหวย)

### 1. "งวดวันที่" (Round Date) ต้องเป็น "วันที่ปิดรับแทง / วันที่ออกรางวัล" เสมอ (ห้ามใช้วันที่เปิดรับแทงเด็ดขาด)
- **กฎเหล็ก (Critical Domain Rule)**: ในวงการหวย "งวดวันที่" (Round Date) หมายถึงวันที่ปิดรับแทงและออกรางวัล (`close_time` / `close_date`) **ไม่ใช่** วันที่เปิดรับแทง (`open_time` / `open_date`)
- **ตัวอย่าง**: ถ้างวดเปิดรับแทงวันที่ 2026-04-15 และปิดรับแทงวันที่ 2026-04-16 งวดนั้นคือ **"งวดวันที่ 2026-04-16"** (ไม่ใช่งวดวันที่ 15)
- **การสร้าง/แก้ไขงวด (`Dealer.jsx`)**: ฟิลด์ `round_date` ที่บันทึกในฐานข้อมูล `lottery_rounds` ต้องใช้ `roundForm.close_date` เสมอ (ห้ามใช้ `open_date`)
- **การแสดงผลและการอ้างอิงงวด**: ในการดึงวันที่งวดมาแสดงผล (`CrossRoundOffsetModal`, `MemberSettlementInline`, `UpstreamSettlementInline`, การลบประวัติ ฯลฯ) ต้องจัดลำดับความสำคัญโดยใช้ `close_time` / `close_date` ก่อน `round_date` เสมอ เพื่อป้องกันปัญหากรณีข้อมูลงวดเก่ายังเก็บ `open_date` ไว้
- **การแปลงวันเวลา**: การดึง `close_time` ออกมาเป็นวันที่ `YYYY-MM-DD` ต้องคำนึงถึงไทม์โซนประเทศไทย (`Asia/Bangkok` / UTC+7) เสมอ ผ่านฟังก์ชัน `getRoundCloseDate`

### 2. ข้อจำกัดการดึงข้อมูล 1,000 แถวของ Supabase / PostgREST (ห้ามใช้ .limit เกิน 1,000 โดยไม่มี Pagination)
- **กฎเหล็กด้านสถาปัตยกรรมข้อมูล (Data Fetching & Pagination Rule)**:
  - Supabase PostgREST กำหนดเพดานคืนข้อมูลสูงสุดไว้ที่ **1,000 แถวต่อครั้ง (Hard Cap: `max-rows = 1000`)** การระบุโค้ดฝั่ง Client เช่น `.limit(5000)` **ไม่มีผลใดๆ** ระบบจะคืนค่าได้ไม่เกิน 1,000 แถวเสมอ
  - **ตารางที่มีข้อมูลสะสมต่อเนื่อง**: เช่น `submissions`, `user_round_history`, `member_round_payments`, `upstream_round_payments`, `round_history` **ต้องใช้ `fetchAllRows` จาก `src/lib/supabase.js` เสมอ** เพื่อดึงข้อมูลแบบวนรอบ (Pagination ผ่าน `.range(from, to)`) จนได้ข้อมูลครบทุกหน้า
  - **ต้องระบุ `.order(...)` ควบคู่เสมอ**: ทุกครั้งที่คิวรี่ข้อมูลประวัติศาสตร์หรือใช้ `fetchAllRows` **ต้องระบุ `.order('created_at', { ascending: false })` (หรือคอลัมน์ลำดับที่ชัดเจน) เสมอ** ห้ามคิวรี่โดยไม่ใส่ `.order()` เด็ดขาด เพราะหากไม่ระบุ Postgres จะส่งแถวที่เก่าสุดขึ้นมาก่อน และเมื่อครบ 1,000 แถว ข้อมูลงวดล่าสุด (เช่น เดือนปัจจุบัน) จะถูกตัดทิ้งและหายไปจากหน้าจอทั้งหมด
  - **อัตราการสะสมของ `user_round_history`**: ในตาราง `user_round_history` มีจำนวน 1 แถวต่อ 1 สมาชิกต่อ 1 งวด หากมีสมาชิก 30 คน คิวรี่เพียง 33 งวด (ประมาณ 1 เดือน) ก็จะทะลุเพดาน 1,000 แถวทันที จึงห้ามลืมใช้ `fetchAllRows` เด็ดขาด

