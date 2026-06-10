# Line Bot Integration Plan

## 1. Overview

### Objective
เชื่อมต่อ **Line Bot (Messaging API)** เข้ากับระบบหวยออนไลน์ เพื่อให้ **Dealer** และ **User** ในกลุ่ม Line สามารถเรียกดูข้อมูลของตนเองและข้อมูลในสังกัดได้ โดยใช้บัญชี Supabase Auth เดิม

### Scope
- **กลุ่ม Line อย่างเดียว** (Group Chat) — ไม่รองรับ DM (1:1)
- รองรับ **User ที่เป็นสมาชิกหลาย Dealer** (multi-tenancy ในกลุ่มเดียว)
- ต้องมี **การเลือก Dealer** ก่อนใช้งาน (`w0001`)
- ตรวจสอบสิทธิ์จาก `user_dealer_memberships.status = 'active'` เท่านั้น

---

## 2. Architecture

```
┌─────────────────┐      HTTPS/Webhook      ┌──────────────────────┐
│   Line Group    │ ◄─────────────────────► │  Supabase Edge Func  │
│  (Dealer/User)  │    (Messaging API)      │   (line-bot-handler)  │
└─────────────────┘                           └──────────┬───────────┘
         ▲                                               │
         │                                               │ SQL/RLS
         │                                               ▼
         │                                    ┌──────────────────────┐
         │                                    │      Supabase        │
         │                                    │  (Postgres + Auth)   │
         │                                    └──────────┬───────────┘
         │                                               │
         │         ┌──────────────┐                      │
         └─────────┤  LIFF App    │◄─────────────────────┘
                   │ (Link Auth)  │      (OAuth / Session)
                   └──────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Line Bot** | Line Messaging API | รับ/ส่งข้อความในกลุ่ม |
| **Edge Function** | Supabase Edge Functions (Deno/TS) | Webhook handler, ตรวจสอบสิทธิ์, query DB |
| **LIFF App** | HTML+JS ฝังใน Line | หน้าลงทะเบียน/Login เพื่อผูก Line ID |
| **Database** | Supabase Postgres | เก็บ mapping, sessions, logs |

---

## 3. Prerequisites

### 3.1 Line Developer Console
1. สร้าง **Provider** ใหม่ (หรือใช้ที่มีอยู่)
2. สร้าง **Messaging API Channel** (type: LINE Official Account)
3. เปิดใช้งาน **Webhook** และใส่ URL ของ Supabase Edge Function
4. สร้าง **LIFF App** (type: External, size: Full) — ใช้สำหรับหน้าลงทะเบียน
5. บันทึกค่าต่อไปนี้ใน Supabase Secrets:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `LIFF_ID`

### 3.2 Supabase Configuration
- เปิดใช้งาน **Edge Functions**
- ตั้งค่า Secrets สำหรับ Line credentials
- ตรวจสอบว่า RLS policies อนุญาตให้ Edge Function (service role) อ่านข้อมูลได้

---

## 4. Database Schema Changes

### 4.1 New Table: `line_bot_mappings`
เก็บความสัมพันธ์ระหว่าง **Line User ID** กับ **Profile ID**

```sql
CREATE TABLE IF NOT EXISTS line_bot_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT NOT NULL UNIQUE,        -- Line UID (ไม่ใช่ display name)
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_line_bot_mappings_line_user ON line_bot_mappings(line_user_id);
CREATE INDEX idx_line_bot_mappings_profile ON line_bot_mappings(profile_id);
```

### 4.2 New Table: `line_group_bindings`
เก็บความสัมพันธ์ระหว่าง **Line Group ID** กับ **Dealer ID**

```sql
CREATE TABLE IF NOT EXISTS line_group_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_group_id TEXT NOT NULL UNIQUE,       -- Line Group ID (roomId หรือ groupId)
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bound_by UUID REFERENCES profiles(id),      -- ใครเป็นคนผูกกลุ่มนี้
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_line_group_bindings_group ON line_group_bindings(line_group_id);
CREATE INDEX idx_line_group_bindings_dealer ON line_group_bindings(dealer_id);
```

### 4.3 New Table: `line_bot_sessions`
เก็บ **Session/Context** ของ User ในแต่ละกลุ่ม (เช่น กำลังเลือก Dealer อยู่)

```sql
CREATE TABLE IF NOT EXISTS line_bot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT NOT NULL,
  line_group_id TEXT NOT NULL,
  current_dealer_id UUID REFERENCES profiles(id), -- Dealer ที่ user เลือกไว้
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(line_user_id, line_group_id)
);

CREATE INDEX idx_line_bot_sessions_user_group ON line_bot_sessions(line_user_id, line_group_id);
```

### 4.4 RLS Policies
```sql
-- line_bot_mappings: อ่านได้เฉพาะ service role (Edge Function)
ALTER TABLE line_bot_mappings ENABLE ROW LEVEL SECURITY;

-- line_group_bindings: อ่านได้เฉพาะ service role
ALTER TABLE line_group_bindings ENABLE ROW LEVEL SECURITY;

-- line_bot_sessions: อ่าน/เขียนได้เฉพาะ service role
ALTER TABLE line_bot_sessions ENABLE ROW LEVEL SECURITY;
```

---

## 5. Authentication & Registration Flow

### 5.1 ปัญหา
Line Bot ไม่สามารถรับ username/password ผ่านข้อความในกลุ่มได้อย่างปลอดภัย (ข้อมูลรั่วไหล)

### 5.2 วิธีแก้: LIFF + OAuth Flow

```
[User] พิมพ์ "ลงทะเบียน" ในกลุ่ม
  │
  ▼
[Bot] ตอบกลับ: "คลิกลิงก์นี้เพื่อผูกบัญชี"
      ส่ง LIFF URL: https://liff.line.me/xxxxxx?groupId=xxx
  │
  ▼
[User] คลิกลิงก์ → เปิดหน้าเว็บใน Line App
  │
  ▼
[LIFF App] ใช้ liff.getProfile() ได้ Line User ID
           แสดงหน้า Login (Supabase Auth)
           User กรอก email/password ของแอปเดิม
  │
  ▼
[LIFF App] เรียก Supabase Edge Function `line-link-account`
           Payload: { lineUserId, supabaseUserId, groupId }
  │
  ▼
[Edge Func] สร้าง/อัปเดต `line_bot_mappings`
            ตรวจสอบ `user_dealer_memberships` ว่า user สังกัด dealer ของกลุ่มนี้จริง
            ตอบกลับ: "ผูกบัญชีสำเร็จ"
```

### 5.3 LIFF App ที่ต้องสร้าง
- **File**: `public/liff/link-account.html` หรือแยกเป็น subdomain
- **Libraries**: LIFF SDK v2, Supabase JS client
- **Flow**:
  1. เปิดหน้า → init LIFF → ดึง `lineUserId`
  2. แสดงฟอร์ม Login (Supabase `signInWithPassword`)
  3. หลัง Login สำเร็จ → เรียก Edge Function `/line-link-account`
  4. แสดงผลลัพธ์ (สำเร็จ/ล้มเหลว) ใน Webview

---

## 6. Group Binding Flow (ผูกกลุ่มกับ Dealer)

### 6.1 เงื่อนไข
- กลุ่ม Line ต้องมี Bot เป็น member อยู่แล้ว
- มี **อย่างน้อย 2 คน** ในกลุ่ม (requirement ของ Line)
- มี **Dealer 1 คน** ในกลุ่มนั้นที่ต้องการผูก

### 6.2 Flow

```
[Dealer] พิมพ์ "ผูกกลุ่ม" ในกลุ่ม
  │
  ▼
[Bot] ตรวจสอบว่า Dealer นี้ลงทะเบียนแล้วหรือยัง (มีใน line_bot_mappings)
      ├─ ยังไม่ลงทะเบียน → ตอบ: "กรุณาลงทะเบียนก่อนด้วยคำสั่ง 'ลงทะเบียน'"
      └─ ลงทะเบียนแล้ว → ตรวจสอบว่า user เป็น Dealer role จริงหรือไม่
  │
  ▼
[Bot] สร้าง/อัปเดต `line_group_bindings`
      (line_group_id = groupId, dealer_id = profile_id)
      ตอบ: "ผูกกลุ่มนี้กับ Dealer [ชื่อ] เรียบร้อย"
```

### 6.3 กลุ่มที่ยังไม่ได้ผูก
- หากมี user พิมพ์คำสั่งใดๆ ในกลุ่มที่ยังไม่ได้ผูก → Bot ตอบ: "กลุ่มนี้ยังไม่ได้ผูกกับ Dealer ใดๆ กรุณาให้ Dealer พิมพ์ 'ผูกกลุ่ม'"

---

## 7. Command Structure

### 7.1 Global Commands (ใช้ได้ทุกคน)
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `ลงทะเบียน` | ส่งลิงก์ LIFF ให้ผูก Line ID กับบัญชี |
| `ผูกกลุ่ม` | (Dealer only) ผูกกลุ่ม Line นี้กับ Dealer |
| `w[รหัส]` | เลือก Dealer ที่จะทำงานด้วย เช่น `w0001` |
| `dealer` | แสดง Dealer ที่เลือกอยู่ |
| `ช่วยเหลือ` | แสดงรายการคำสั่งทั้งหมด |

### 7.2 User Commands (ต้องเลือก Dealer ก่อน)
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `เครดิต` | ดูยอดเครดิตคงเหลือ |
| `โพย` | ดูรายการโพยล่าสุด (5 รายการ) |
| `โพย [งวด]` | ดูโพยของงวดที่ระบุ |
| `ผลหวย` | ดูผลหวยงวดล่าสุด |
| `ผลหวย [งวด]` | ดูผลหวยของงวดที่ระบุ |

### 7.3 Dealer Commands (ต้องเป็น Dealer + เลือกตัวเอง)
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `สรุป` | สรุปยอดรายวัน/งวดปัจจุบัน |
| `สมาชิก` | แสดงจำนวนสมาชิกในกลุ่ม |
| `โพยทั้งหมด` | แสดงโพยทั้งหมดในงวดล่าสุด |
| `เครดิตกลุ่ม` | ดูเครดิตรวมของสมาชิก |

---

## 8. Data Access Logic

### 8.1 Core Validation Pipeline
ทุกคำสั่ง (ยกเว้น `ลงทะเบียน` และ `ผูกกลุ่ม`) ต้องผ่านขั้นตอนนี้:

```
1. ดึง line_user_id จาก event.source.userId
2. หา profile_id จาก line_bot_mappings
   ├─ ไม่พบ → ตอบ: "กรุณาลงทะเบียนก่อน"
3. ดึง line_group_id จาก event.source.groupId
4. หา dealer_id จาก line_group_bindings
   ├─ ไม่พบ → ตอบ: "กลุ่มนี้ยังไม่ได้ผูกกับ Dealer"
5. ตรวจสอบ user_dealer_memberships
   WHERE user_id = profile_id AND dealer_id = dealer_id AND status = 'active'
   ├─ ไม่ผ่าน → ตอบ: "คุณไม่มีสิทธิ์เข้าถึง Dealer นี้"
6. ตรวจสอบ line_bot_sessions.current_dealer_id
   ├─ ยังไม่ได้เลือก → ตอบ: "กรุณาเลือก Dealer ด้วยคำสั่ง w[รหัส]"
   └─ ผ่าน → ประมวลผลคำสั่ง
```

### 8.2 Multi-Dealer Context Switching
- หาก User เป็นสมาชิกของหลาย Dealer → ต้องพิมพ์ `w0001` ก่อน
- `w[รหัส]` จะอัปเดต `line_bot_sessions.current_dealer_id`
- หาก User เป็นสมาชิกของ Dealer เดียวในกลุ่มนี้ → อาจ auto-set ได้เลย (optional)

### 8.3 Query Examples

#### ดูเครดิต (User)
```sql
SELECT dc.balance 
FROM dealer_credits dc
WHERE dc.dealer_id = [current_dealer_id];
```

#### ดูโพยล่าสุด (User)
```sql
SELECT lr.lottery_name, lr.round_date, s.bet_type, s.numbers, s.amount
FROM submissions s
JOIN lottery_rounds lr ON s.round_id = lr.id
WHERE s.user_id = [profile_id]
  AND lr.dealer_id = [current_dealer_id]
ORDER BY s.created_at DESC
LIMIT 5;
```

#### ดูผลหวย (งวดล่าสุด)
```sql
SELECT lottery_name, round_date, winning_numbers
FROM lottery_rounds
WHERE dealer_id = [current_dealer_id]
  AND is_result_announced = TRUE
ORDER BY close_time DESC
LIMIT 1;
```

#### สรุปยอด (Dealer)
```sql
-- ยอดรวมโพยในงวดปัจจุบัน
SELECT 
  lr.lottery_name,
  COUNT(s.id) as total_bets,
  SUM(s.amount) as total_amount,
  SUM(CASE WHEN s.is_winner THEN s.prize_amount ELSE 0 END) as total_payout
FROM lottery_rounds lr
LEFT JOIN submissions s ON lr.id = s.round_id
WHERE lr.dealer_id = [current_dealer_id]
  AND lr.status = 'open'
GROUP BY lr.id;
```

---

## 9. Response Formats (Line Messages)

### 9.1 Text Message (พื้นฐาน)
ใช้สำหรับข้อมูลง่าย เช่น เครดิต, ผลหวย

### 9.2 Flex Message (แนะนำ)
ใช้สำหรับข้อมูลซับซ้อน เช่น รายการโพย, สรุปยอด
- สวยงาม อ่านง่าย บนมือถือ
- รองรับ Bubble, Box, Text, Separator
- สร้าง JSON structure แล้วส่งผ่าน Messaging API

### 9.3 Quick Reply (แนะนำ)
เพิ่มปุ่มลัดใต้ข้อความ เช่น:
- หลังจากเลือก Dealer สำเร็จ → แสดงปุ่ม `ดูเครดิต`, `ดูโพย`
- ลดการพิมพ์ผิด/จำคำสั่งไม่ได้

---

## 10. Security Considerations

### 10.1 Webhook Validation
- ตรวจสอบ **X-Line-Signature** header ด้วย Channel Secret (HMAC-SHA256)
- ปฏิเสธทุก request ที่ไม่มี signature หรือ signature ไม่ตรง

### 10.2 ไม่เก็บ Password
- ไม่มีการส่ง password ผ่านข้อความ Line
- ใช้ LIFF + Supabase Auth สำหรับการ login ครั้งเดียว

### 10.3 ไม่เปิดเผยข้อมูลคนอื่น
- User ดูได้เฉพาะข้อมูลตนเอง
- Dealer ดูได้เฉพาะข้อมูลในสังกัดตนเอง
- ใช้ RLS + manual check ใน Edge Function ควบคู่กัน

### 10.4 Rate Limiting
- จำกัดจำนวน request ต่อ user ต่อนาที (เช่น 20 req/min)
- ป้องกัน spam และ brute force

### 10.5 Group Privacy
- Bot ตอบกลับเฉพาะข้อความที่ **mention @bot** หรือ **พิมพ์คำสั่ง** เท่านั้น
- ไม่ตอบกลับทุกข้อความในกลุ่ม (noise)

---

## 11. Implementation Roadmap

### Phase 1: Foundation (1-2 สัปดาห์)
- [ ] สร้าง Line Official Account + Messaging API
- [ ] สร้าง LIFF App (ขั้นต่ำ)
- [ ] สร้าง Supabase Edge Functions skeleton
- [ ] สร้าง Database tables ใหม่ (`line_bot_mappings`, `line_group_bindings`, `line_bot_sessions`)
- [ ] ตั้งค่า Secrets และ Webhook URL

### Phase 2: Authentication (1 สัปดาห์)
- [ ] พัฒนา LIFF App: login + link account flow
- [ ] พัฒนา Edge Function: `/line-link-account`
- [ ] ทดสอบลงทะเบียน end-to-end
- [ ] สร้างคำสั่ง `ลงทะเบียน` และ `ผูกกลุ่ม`

### Phase 3: Core Commands (1-2 สัปดาห์)
- [ ] สร้าง validation pipeline (check mapping, group binding, membership)
- [ ] คำสั่ง `w[รหัส]` (switch dealer)
- [ ] คำสั่ง `เครดิต`, `โพย`, `ผลหวย` (User level)
- [ ] ทดสอบในกลุ่มจริง

### Phase 4: Dealer Features (1 สัปดาห์)
- [ ] คำสั่ง `สรุป`, `สมาชิก`, `โพยทั้งหมด` (Dealer level)
- [ ] Flex Message templates
- [ ] Quick Reply buttons

### Phase 5: Polish & Monitoring (1 สัปดาห์)
- [ ] Error handling & user-friendly messages
- [ ] Logging (`line_bot_logs` table)
- [ ] Rate limiting
- [ ] Documentation สำหรับ Dealer/User

---

## 12. Files to Create / Modify

### New Files
| File | Description |
|------|-------------|
| `supabase/functions/line-bot/index.ts` | Main webhook handler |
| `supabase/functions/line-link-account/index.ts` | LIFF callback handler |
| `public/liff/link-account.html` | LIFF registration page |
| `supabase/migrations/xxx_line_bot_tables.sql` | DB schema migration |
| `src/services/lineBotService.js` | Client-side helper (optional) |

### Modified Files
| File | Change |
|------|--------|
| `supabase/config.toml` | Add Edge Functions config |
| `.env` / Secrets | Add Line credentials |

---

## 13. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Line Webhook timeout (3 วินาที) | Bot ไม่ตอบ | ใช้ async pattern: รับ event → ตอบ "กำลังประมวลผล" → ส่งผลลัพธ์ทีหลัง |
| User ลืมเลือก Dealer | สับสน | Auto-select หากมีสังกัดเดียว / แจ้งเตือนชัดเจน |
| ข้อมูลในกลุ่มรั่วไหล | สูง | Strict RLS + membership check ทุกคำสั่ง |
| Line API rate limit | ปานกลาง | Cache ผลหวย/สรุปยอด, จำกัด query ซ้ำ |

---

## 14. Summary

### สิ่งที่ต้องเตรียมตอนนี้
1. **Line OA**: สมัคร Line Official Account และสร้าง Messaging API channel
2. **LIFF App**: สร้าง LIFF ID สำหรับหน้าลงทะเบียน
3. **Supabase**: เตรียม Edge Functions environment และ Secrets

### ขั้นตอนถัดไป
1. สร้าง Database migration สำหรับ 3 ตารางใหม่
2. สร้าง LIFF HTML page (link-account)
3. สร้าง Edge Function `/line-bot` (webhook handler)
4. สร้าง Edge Function `/line-link-account`
5. ทดสอบลงทะเบียน → ผูกกลุ่ม → ส่งคำสั่งพื้นฐาน

---

*Plan created based on existing codebase structure: Supabase Auth, user_dealer_memberships, lottery_rounds, submissions, dealer_credits*
