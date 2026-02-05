# 📋 Big Lotto - เอกสารรายละเอียดแอปพลิเคชัน

## สารบัญ
1. [ประเภทหวยและเลขที่รองรับ](#1-ประเภทหวยและเลขที่รองรับ)
2. [Dashboard และความสัมพันธ์](#2-dashboard-และความสัมพันธ์)
3. [การออกแบบระบบและ Database](#3-การออกแบบระบบและ-database)
4. [เทคโนโลยีที่ใช้พัฒนา](#4-เทคโนโลยีที่ใช้พัฒนา)
5. [UI/UX และ Responsive Design](#5-uiux-และ-responsive-design)
6. [ความปลอดภัยของแอป](#6-ความปลอดภัยของแอป)
7. [การเชื่อมต่อ API ภายนอก](#7-การเชื่อมต่อ-api-ภายนอก)
8. [ข้อเสนอแนะเพิ่มเติม](#8-ข้อเสนอแนะเพิ่มเติม)

---

## 1. ประเภทหวยและเลขที่รองรับ

### 1.1 ประเภทหวยที่รองรับ

| รหัส | ชื่อ | คำอธิบาย |
|------|------|----------|
| `thai` | หวยไทย | หวยรัฐบาลไทย |
| `lao` | หวยลาว | หวยลาว รองรับ 4 ตัวชุด |
| `hanoi` | หวยฮานอย | หวยเวียดนาม รองรับ 4 ตัวชุด |
| `stock` | หวยหุ้น | หวยหุ้นไทย/ต่างประเทศ |
| `other` | อื่นๆ | หวยประเภทอื่นๆ |

### 1.2 ประเภทเลขแต่ละหวย

#### หวยไทย (Thai)
| รหัส | ชื่อ | จำนวนหลัก | ค่าเริ่มต้น (Limit) |
|------|------|-----------|---------------------|
| `run_top` | ลอยบน | 1 | 5,000 |
| `run_bottom` | ลอยล่าง | 1 | 5,000 |
| `pak_top_front` | ปักบนหน้า | 1 | 5,000 |
| `pak_top_center` | ปักบนกลาง | 1 | 5,000 |
| `pak_top_back` | ปักบนหลัง | 1 | 5,000 |
| `pak_bottom_front` | ปักล่างหน้า | 1 | 5,000 |
| `pak_bottom_back` | ปักล่างหลัง | 1 | 5,000 |
| `2_top` | 2 ตัวบน | 2 | 1,000 |
| `2_front` | 2 ตัวหน้า | 2 | 1,000 |
| `2_split` | 2 ตัวถ่าง | 2 | 1,000 |
| `2_run` | 2 ตัวลอย | 2 | 1,000 |
| `2_bottom` | 2 ตัวล่าง | 2 | 1,000 |
| `3_top` | 3 ตัวบน | 3 | 500 |
| `3_tod` | 3 ตัวโต๊ด | 3 | 500 |
| `3_bottom` | 3 ตัวล่าง | 3 | 500 |
| `4_run` | 4 ตัวลอย | 4 | 200 |
| `5_run` | 5 ตัวลอย | 5 | 100 |

#### หวยลาว/ฮานอย (Lao/Hanoi) - รองรับ 4 ตัวชุด
| รหัส | ชื่อ | คำอธิบาย |
|------|------|----------|
| `4_set` | 4 ตัวชุด | ชุดพิเศษ ราคา 120 บาท/ชุด |
| `3_set` | 3 ตัวตรงชุด | เลข 3 หลักหลังของเลข 4 ตัวชุด |

**รางวัล 4 ตัวชุด:**
| รหัส | ชื่อรางวัล | เงินรางวัล |
|------|------------|------------|
| `4_straight_set` | 4 ตัวตรงชุด | 100,000 |
| `4_tod_set` | 4 ตัวโต๊ดชุด | 4,000 |
| `3_straight_set` | 3 ตัวตรงชุด | 30,000 |
| `3_tod_set` | 3 ตัวโต๊ดชุด | 3,000 |
| `2_front_set` | 2 ตัวหน้าชุด | 1,000 |
| `2_back_set` | 2 ตัวหลังชุด | 1,000 |

| `run_top` | ลอยบน | 1 | 5,000 |
| `run_bottom` | ลอยล่าง | 1 | 5,000 |
| `pak_top_front` | ปักบนหน้า | 1 | 5,000 |
| `pak_top_center` | ปักบนกลาง | 1 | 5,000 |
| `pak_top_back` | ปักบนหลัง | 1 | 5,000 |
| `pak_bottom_front` | ปักล่างหน้า | 1 | 5,000 |
| `pak_bottom_back` | ปักล่างหลัง | 1 | 5,000 |
| `2_top` | 2 ตัวบน | 2 | 1,000 |
| `2_front` | 2 ตัวหน้า | 2 | 1,000 |
| `2_split` | 2 ตัวถ่าง | 2 | 1,000 |
| `2_run` | 2 ตัวลอย | 2 | 1,000 |
| `2_bottom` | 2 ตัวล่าง | 2 | 1,000 |
| `3_straight` | 3 ตัวตรง | 3 | 500 |
| `3_tod` | 3 ตัวโต๊ด | 3 | 500 |
| `4_run` | 4 ตัวลอย | 4 | 200 |
| `5_run` | 5 ตัวลอย | 5 | 100 |


#### หวยหุ้น (Stock)
| รหัส | ชื่อ | จำนวนหลัก |
|------|------|-----------|
| `2_top` | 2 ตัวบน | 2 |
| `2_bottom` | 2 ตัวล่าง | 2 |

### 1.3 ความเกี่ยวข้องในหน้า Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│                    SuperAdmin Dashboard                     │
│  - ผู้ดูแลระบบสูงสุด                                             │
│  - จัดการเชิญ Dealer ด้วย qrcode/link หรือเพิ่มเอง                │
│  - จัดการแพ็คเกจ สร้างแพ็คเกจ แก้ไขแพ็คเกจ ลบแพ็คเกจ ตั้งแพ็คเกจหลัก  │
│  - เชื่อมต่อแพ็คเกจ กับหวยแต่ละประเภทของแต่ละ dealer 
│  - ตั้ง default แพ็คเกจสำหรับแต่ละประเภทหวยของ dealer ที่เพิ่มใหม่
│  - จัดการเครดิต เพิ่ม/ลด เครดิต dealer                            │
│  - ดูรายงานทั้งระบบ                                             │
│  - ค้นหา/กรองข้อมูลได้                                          │
│  - ปรับธีมสำหรับ dashbord SuperAdmin ได้ มืด/สว่าง                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Dealer Dashboard                                  │
│  - เติมเครดิตจากสลิปธนาคารเชื่อมต่อ API กับ SlipOK                        │
│  - สร้างงวดหวยตามประเภทที่ต้องการ ไทย/ลาว/ฮานอย/หุ้น                        │
│  - กำหนด วันเวลาเปิด/วันเวลาปิด กำหนด Limit รวม หรือ Limit รายเลข           │
│  - เชิญ สมาชิก/เจ้ามือเพื่อรับเลข ด้วย qrcode/link อนุมัติรับ/บล็อค/ลบ            │
│  - เป็นสมาชิกของ dealer อื่นเพื่อส่งเลขต่อได้หลาย dealer                       │
│  - สร้าง สมาชิก/เจ้ามือที่ส่งเลขต่อ ป้อนข้อมูลแทนสมาชิก ถ้าสมาชิกอนุญาต            │
│  - กำหนด ค่าคอมฯ/อัตราจ่าย แตกต่างตามประเภทหวย ไทย/ลาว/ฮานอย/หุ้น          │
│  - ดูยอดรวม/ยอดรับเข้าจากเจ้ามืออื่น/ยอดเกินจาก Limit/ยอดตีออก แยกตามประเภทเลข │
│  - ดูยอดแบบทั้งหมด/รวมเลขที่เหมือนกัน แยกใบโพย/รวม รายคน/ทั้งหมด             │
│  - ดูยอดแบบแบบเขียนย่อ/แบบเขียนเต็ม ตามเวลาป้อน ตามลำดับการป้อนก่อนหลัง       │
│  - ประกาศผลรางวัลตามประเภท                                             │
│  - ดูสรุปรายงานกำไร/ขาดทุน ภาพรวม/สมาชิกรายคน                             │
│  - ค้นหา/กรองข้อมูลได้                                                    │  
│  - ปรับธีมสำหรับ dashbord Dealer ได้ มืด/สว่าง                              │  
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      User Dashboard                         │  
│  - เปลี่ยนตัวเองเป็น dealer ได้                                   │
│  - เป็นสมาชิกของ dealer ได้หลาย dealer                        │
│  - เลือกงวดหวยและประเภทเลขที่ต้องการแทง (ป้อนเลขส่ง dealer)       │
│  - ดูอัตราจ่ายของแต่ละประเภท ที่ dealer กำหนดให้                  │
│  - ดูผลรางวัลภาพรวม แยกตามใบโพย/ประเภทเลขที่ป้อน                │
│  - ค้นหา/กรองข้อมูลได้                                          │
│  - ปรับธีมสำหรับ dashbord User ได้ มืด/สว่าง                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Dashboard และความสัมพันธ์

### 2.1 ภาพรวมระบบ Role

```
┌──────────────────────────────────────────────────────────────────┐
│                         SUPERADMIN                                │
│  - ผู้ดูแลระบบสูงสุด                                              │
│  - จัดการ Dealer ทั้งหมด                                          │
│  - จัดการแพ็คเกจและเครดิต                                         │
│  - ดูรายงานทั้งระบบ                                               │
└──────────────────────────────────────────────────────────────────┘
                              │ จัดการ/อนุมัติ
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                           DEALER                                  │
│  - เจ้ามือหวย                                                     │
│  - สร้างและจัดการงวดหวย                                           │
│  - จัดการสมาชิก                                                   │
│  - ส่งต่อยอดให้เจ้ามือปลายทาง                                     │
└──────────────────────────────────────────────────────────────────┘
                              │ รับสมาชิก
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                            USER                                   │
│  - ผู้ใช้ทั่วไป/คนส่งโพย                                          │
│  - แทงหวยกับ Dealer                                               │
│  - ดูผลรางวัล                                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 SuperAdmin Dashboard (`/superadmin`)

**ไฟล์หลัก:** `src/pages/SuperAdmin.jsx`

#### แท็บและฟังก์ชัน:

| แท็บ | ฟังก์ชันหลัก |
|------|-------------|
| **Dashboard** | สถิติภาพรวม: จำนวน Dealer, User, รายได้, Subscription |
| **Dealers** | จัดการ Dealer: ดูรายชื่อ, เปิด/ปิดการใช้งาน, ดูรายละเอียด |
| **Packages** | จัดการแพ็คเกจ: สร้าง/แก้ไข, กำหนดราคา, Billing Model |
| **Invoices** | ใบแจ้งหนี้: ดูประวัติ, สถานะการชำระ |
| **Payments** | การชำระเงิน: ตรวจสอบสลิป, อนุมัติ/ปฏิเสธ, ดูรายการหักเครดิต |
| **Settings** | ตั้งค่าระบบ: บัญชีธนาคาร, โหมดอนุมัติสลิป |

#### ความสัมพันธ์กับส่วนอื่น:
- **→ Dealer:** อนุมัติ/ระงับ Dealer, เติมเครดิต, กำหนดแพ็คเกจ
- **→ Database:** จัดการ `profiles`, `dealer_subscriptions`, `subscription_packages`, `credit_transactions`

### 2.3 Dealer Dashboard (`/dealer`)

**ไฟล์หลัก:** `src/pages/Dealer.jsx`

#### แท็บและฟังก์ชัน:

| แท็บ | ฟังก์ชันหลัก |
|------|-------------|
| **งวดหวย (Rounds)** | สร้างงวด, กำหนด Limit, ดูยอด, ปิดรับ, ประกาศผล |
| **สมาชิก (Members)** | จัดการสมาชิก: อนุมัติ, บล็อก, กำหนดค่าคอม |
| **เจ้ามือปลายทาง (Upstream)** | เชื่อมต่อเจ้ามือปลายทาง, ส่งต่อยอด |
| **โปรไฟล์ (Profile)** | ข้อมูลส่วนตัว, QR Code เชิญสมาชิก |

#### ฟีเจอร์เด่น:

1. **ระบบงวดหวย (Lottery Rounds)**
   - สร้างงวดหวยหลายประเภท
   - กำหนดเวลาเปิด-ปิดรับ
   - ตั้งค่า Limit แต่ละประเภทเลข
   - อั้นเลขเฉพาะ (Number Limits)
   - ดูสรุปยอดแบบ Real-time

2. **ระบบสมาชิก (Members)**
   - รับสมาชิกผ่าน QR Code/Link
   - อนุมัติ/ปฏิเสธคำขอ
   - กำหนดค่าคอมมิชชั่นรายบุคคล
   - บล็อก/ปลดบล็อกสมาชิก

3. **ระบบส่งต่อยอด (Bet Transfers)**
   - เชื่อมต่อกับเจ้ามือปลายทาง
   - ส่งต่อยอดที่เกิน Limit
   - ติดตามสถานะการส่ง

4. **ระบบเครดิต**
   - ดูยอดเครดิตคงเหลือ
   - ดู Pending Deduction
   - เติมเครดิตผ่านสลิป

#### ความสัมพันธ์:
- **← SuperAdmin:** รับการจัดการแพ็คเกจ/เครดิต
- **→ User:** รับยอดแทงจากสมาชิก
- **→ Upstream Dealer:** ส่งต่อยอดที่เกิน Limit
- **← Downstream Dealer:** รับยอดจากเจ้ามือลูก

### 2.4 User Dashboard (`/dashboard`)

**ไฟล์หลัก:** `src/pages/UserDashboard.jsx`

#### แท็บและฟังก์ชัน:

| แท็บ | ฟังก์ชันหลัก |
|------|-------------|
| **งวดหวย (Rounds)** | ดูงวดที่เปิดรับ, แทงหวย |
| **ผลรางวัล (Results)** | ดูผลรางวัล, ยอดถูกรางวัล |
| **ค่าคอม (Commission)** | ดูค่าคอมมิชชั่นที่ได้รับ |

#### ฟีเจอร์เด่น:

1. **ระบบแทงหวย**
   - เลือกประเภทเลข
   - กรอกเลขและจำนวนเงิน
   - ระบบ Draft ก่อนส่ง
   - รองรับการวางข้อความ (Paste)
   - เสียงเตือนเมื่อเพิ่มรายการ

2. **ระบบดูผลรางวัล**
   - ดูผลรางวัลแต่ละงวด
   - กรองดูเฉพาะที่ถูกรางวัล
   - สรุปยอดรวม

3. **Multi-Dealer Support**
   - เชื่อมต่อกับหลาย Dealer
   - เลือก Dealer ที่ต้องการแทง

### 2.5 หน้าอื่นๆ

| หน้า | Path | คำอธิบาย |
|------|------|----------|
| Home | `/` | หน้าแรก, Redirect ตาม Role |
| Login | `/login` | เข้าสู่ระบบ |
| Register | `/register` | สมัครสมาชิก |
| Profile | `/profile` | แก้ไขข้อมูลส่วนตัว |
| Invite | `/invite` | รับคำเชิญจาก Dealer |
| Dealer Connect | `/dealer-connect` | เชื่อมต่อกับ Dealer |

---

## 3. การออกแบบระบบและ Database

### 3.1 โครงสร้าง Database (Supabase/PostgreSQL)

#### ตารางหลัก:

```sql
-- 1. PROFILES (ข้อมูลผู้ใช้)
profiles
├── id (UUID, PK)
├── email
├── full_name
├── phone
├── role ('superadmin', 'dealer', 'user')
├── dealer_id (FK → profiles) -- Legacy
├── is_active
├── bank_name, bank_account, bank_account_name
└── created_at, updated_at

-- 2. LOTTERY_ROUNDS (งวดหวย)
lottery_rounds
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── lottery_type ('thai', 'lao', 'hanoi', 'stock', 'yeekee')
├── lottery_name
├── round_date
├── open_time, close_time
├── winning_numbers (JSONB)
├── status ('open', 'closed', 'announced')
├── currency_symbol, currency_name
└── created_at, updated_at

-- 3. SUBMISSIONS (รายการแทง)
submissions
├── id (UUID, PK)
├── round_id (FK → lottery_rounds)
├── user_id (FK → profiles)
├── bet_type
├── numbers
├── amount
├── is_deleted
├── is_winner
├── prize_amount
├── commission_rate, commission_amount
├── batch_id, bill_note
├── source ('direct', 'transfer')
└── created_at

-- 4. USER_DEALER_MEMBERSHIPS (ความสัมพันธ์ User-Dealer)
user_dealer_memberships
├── id (UUID, PK)
├── user_id (FK → profiles)
├── dealer_id (FK → profiles)
├── status ('pending', 'active', 'blocked', 'rejected')
└── created_at, approved_at, blocked_at

-- 5. DEALER_UPSTREAM_CONNECTIONS (เจ้ามือปลายทาง)
dealer_upstream_connections
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── upstream_dealer_id (FK → profiles)
├── upstream_name
├── upstream_contact
├── is_linked
├── status
└── created_at

-- 6. BET_TRANSFERS (ยอดตีออก)
bet_transfers
├── id (UUID, PK)
├── round_id (FK → lottery_rounds)
├── bet_type
├── numbers
├── amount
├── target_dealer_name
├── transfer_batch_id
├── status
└── created_at
```

#### ตารางระบบเครดิต:

```sql
-- 7. SUBSCRIPTION_PACKAGES (แพ็คเกจ)
subscription_packages
├── id (UUID, PK)
├── name
├── billing_model ('package', 'percentage')
├── monthly_price, yearly_price
├── percentage_rate
├── min_amount_before_charge
├── min_deduction, max_deduction
├── max_users
├── is_active, is_featured
└── created_at

-- 8. DEALER_SUBSCRIPTIONS (การสมัครแพ็คเกจ)
dealer_subscriptions
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── package_id (FK → subscription_packages)
├── billing_model
├── status ('active', 'trial', 'expired')
├── expires_at
└── created_at

-- 9. DEALER_CREDITS (เครดิต Dealer)
dealer_credits
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── balance
├── pending_deduction
├── warning_threshold
├── is_blocked
└── created_at, updated_at

-- 10. CREDIT_TRANSACTIONS (ประวัติเครดิต)
credit_transactions
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── transaction_type ('topup', 'deduction', 'refund')
├── amount
├── balance_after
├── reference_type, reference_id
├── description
└── created_at
```

#### ตารางระบบธนาคาร:

```sql
-- 11. ADMIN_BANK_ACCOUNTS (บัญชี Admin)
admin_bank_accounts
├── id (UUID, PK)
├── bank_code, bank_name
├── account_number, account_name
├── is_active, is_default
└── created_at

-- 12. CREDIT_TOPUP_REQUESTS (คำขอเติมเครดิต)
credit_topup_requests
├── id (UUID, PK)
├── dealer_id (FK → profiles)
├── bank_account_id (FK → admin_bank_accounts)
├── amount
├── slip_image_url
├── slip_data (JSONB)
├── trans_ref
├── status ('pending', 'approved', 'rejected')
└── created_at, verified_at
```

### 3.2 Database Functions

| Function | คำอธิบาย |
|----------|----------|
| `check_number_limit()` | ตรวจสอบว่าเลขเกิน Limit หรือไม่ |
| `calculate_round_winners()` | คำนวณผู้ถูกรางวัล |
| `add_dealer_credit()` | เพิ่มเครดิต Dealer |
| `deduct_dealer_credit()` | หักเครดิต Dealer |
| `finalize_round_credit()` | หักเครดิตเมื่อปิดงวด |
| `process_credit_topup()` | ประมวลผลการเติมเครดิต |
| `approve_topup_request()` | อนุมัติคำขอเติมเครดิต |

### 3.3 Row Level Security (RLS)

ระบบใช้ RLS เพื่อควบคุมการเข้าถึงข้อมูล:

```sql
-- ตัวอย่าง: User ดูได้เฉพาะ Submission ของตัวเอง
CREATE POLICY "Users can view own submissions" ON submissions
  FOR SELECT USING (auth.uid() = user_id);

-- ตัวอย่าง: Dealer ดูได้เฉพาะ Round ของตัวเอง
CREATE POLICY "Dealers can manage own rounds" ON lottery_rounds
  FOR ALL USING (auth.uid() = dealer_id);
```

---

## 4. เทคโนโลยีที่ใช้พัฒนา

### 4.1 Frontend

| เทคโนโลยี | เวอร์ชัน | การใช้งาน |
|-----------|---------|----------|
| **React** | 19.2.0 | UI Framework หลัก |
| **React Router DOM** | 7.11.0 | การจัดการ Routing |
| **Vite** | 7.2.4 | Build Tool & Dev Server |
| **React Icons (Feather)** | 5.5.0 | ไอคอน |
| **React Hot Toast** | 2.6.0 | แจ้งเตือน |
| **React QR Code** | 2.0.18 | สร้าง QR Code |
| **jsPDF** | 4.0.0 | สร้าง PDF |

### 4.2 Backend & Database

| เทคโนโลยี | การใช้งาน |
|-----------|----------|
| **Supabase** | Backend-as-a-Service |
| **PostgreSQL** | Database |
| **Supabase Auth** | Authentication |
| **Supabase Storage** | เก็บไฟล์ (สลิป) |
| **Supabase Realtime** | Real-time subscriptions |

### 4.3 Styling

| เทคโนโลยี | การใช้งาน |
|-----------|----------|
| **CSS3** | Styling หลัก |
| **CSS Variables** | Design System |
| **Google Fonts (Prompt)** | ฟอนต์ภาษาไทย |
| **Custom CSS** | Component-specific styles |
| **Tailwind CSS** | Utility-first CSS framework |

### 4.4 Development Tools

| เครื่องมือ | การใช้งาน |
|-----------|----------|
| **ESLint** | Code Linting |
| **Vite Plugin React** | React Fast Refresh |
| **Git** | Version Control |
| **Github** | Repository |
| **Vercel** | Deployment |

### 4.5 โครงสร้างโฟลเดอร์

```
src/
├── assets/          # รูปภาพ, ไฟล์ static
├── components/      # React Components
│   ├── dealer/      # Components สำหรับ Dealer
│   ├── Navbar.jsx
│   ├── LotteryCard.jsx
│   └── WriteSubmissionModal.jsx
├── constants/       # ค่าคงที่
│   └── lotteryTypes.js
├── contexts/        # React Contexts
│   ├── AuthContext.jsx
│   └── ToastContext.jsx
├── lib/             # Library configurations
│   └── supabase.js
├── pages/           # หน้าต่างๆ
│   ├── SuperAdmin.jsx
│   ├── Dealer.jsx
│   ├── UserDashboard.jsx
│   └── ...
├── utils/           # Utility functions
│   └── creditCheck.js
├── App.jsx          # Main App component
├── main.jsx         # Entry point
└── index.css        # Global styles
```

---

## 5. UI/UX และ Responsive Design

### 5.1 Design System

#### Color Palette (Golden Lotto Theme)
```css
/* Primary - สีทอง */
--color-primary: #d4af37;
--color-primary-light: #f4d03f;
--color-primary-dark: #b8960c;

/* Secondary - สีน้ำเงินเข้ม */
--color-secondary: #1a1a2e;
--color-secondary-light: #16213e;

/* Accent - สีแดง */
--color-accent: #e94560;

/* Background */
--bg-dark: #0f0f1a;
--bg-card: #1a1a2e;

/* Status Colors */
--color-success: #00d26a;
--color-warning: #ffc107;
--color-error: #e94560;
--color-info: #0dcaf0;
```

#### Typography
- **Font Family:** Prompt (Google Fonts) - รองรับภาษาไทย(หลัก)/ภาษาอังกฤษ
- **Font Weights:** 300, 400, 500, 600, 700

### 5.2 Responsive Breakpoints

```css
/* Mobile First Approach */
/* Default: Mobile (< 768px) */

/* Tablet */
@media (min-width: 768px) { ... }

/* Desktop */
@media (min-width: 1024px) { ... }

/* Large Desktop */
@media (min-width: 1280px) { ... }
```

### 5.3 ความง่ายในการใช้งาน (UX)

#### สำหรับ User
- **Quick Input:** สร้างคีย์บอร์ดเองกรอกเลขและจำนวนเงินได้รวดเร็ว
- **Draft System:** เก็บรายการไว้ก่อนส่ง
- **Paste Support:** วางข้อความจากที่อื่นได้
- **Sound Feedback:** เสียงเตือนเมื่อเพิ่มรายการ
- **Auto-focus:** Focus ไปยัง input ถัดไปอัตโนมัติ

#### สำหรับ Dealer
- **Accordion UI:** ดูงวดหวยแบบ Expand/Collapse
- **Real-time Summary:** ดูยอดรวมแบบ Real-time
- **Quick Actions:** ปุ่มลัดสำหรับการทำงานบ่อย
- **QR Code:** สร้าง QR Code เชิญสมาชิก
- **PDF Export:** ส่งออกรายงานเป็น PDF

#### สำหรับ SuperAdmin
- **Dashboard Overview:** ดูสถิติภาพรวมได้ทันที
- **Search & Filter:** ค้นหาและกรองข้อมูลได้
- **Batch Actions:** ทำหลายรายการพร้อมกัน

### 5.4 Responsive Design แต่ละหน้า

| หน้า | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| **Home** | Stack layout | 2 columns | 3 columns |
| **Login/Register** | Full width form | Centered card | Centered card |
| **User Dashboard** | Tab navigation | Side tabs | Side tabs + summary |
| **Dealer Dashboard** | Accordion | Accordion + sidebar | Full layout |
| **SuperAdmin** | Tab navigation | Side navigation | Full dashboard |

---

## 6. ความปลอดภัยของแอป

### 6.1 Authentication (Supabase Auth)

- **Email/Password Authentication**
- **Session Management:** JWT tokens
- **Auto Token Refresh**
- **Secure Password Storage:** bcrypt hashing

### 6.2 Authorization (Role-Based Access Control)

```javascript
// Role Hierarchy
const ROLES = {
  SUPERADMIN: 'superadmin',  // Level 3 - สูงสุด
  DEALER: 'dealer',          // Level 2
  USER: 'user'               // Level 1
}

// Protected Routes
<ProtectedRoute requireAuth requireAdmin>
  <SuperAdmin />
</ProtectedRoute>
```

### 6.3 Row Level Security (RLS)

ทุกตารางใช้ RLS เพื่อป้องกันการเข้าถึงข้อมูลที่ไม่ได้รับอนุญาต:

```sql
-- ตัวอย่าง: Dealer ดูได้เฉพาะเครดิตของตัวเอง
CREATE POLICY "Dealers can view own credits" ON dealer_credits 
  FOR SELECT USING (
    dealer_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
```

### 6.4 Data Validation

- **Frontend:** Form validation ก่อนส่ง
- **Backend:** Database constraints (CHECK, NOT NULL)
- **Type Safety:** TypeScript types (dev dependencies)

### 6.5 Secure API Keys

```javascript
// Environment Variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
```

### 6.6 การป้องกันสลิปซ้ำ

```sql
-- ตาราง used_slips เก็บ transRef ที่ใช้แล้ว
CREATE TABLE used_slips (
    trans_ref TEXT NOT NULL UNIQUE,
    ...
);

-- Function ตรวจสอบ
CREATE FUNCTION check_slip_used(p_trans_ref TEXT) RETURNS BOOLEAN;
```

---

## 7. การเชื่อมต่อ API ภายนอก

### 7.1 SlipOK API (ตรวจสอบสลิปโอนเงิน)

**วัตถุประสงค์:** ตรวจสอบความถูกต้องของสลิปโอนเงินอัตโนมัติ

**การทำงาน:**
1. Dealer อัปโหลดสลิป
2. ระบบส่งรูปไปยัง SlipOK API
3. API ส่งข้อมูลกลับ: จำนวนเงิน, วันที่, เลขอ้างอิง
4. ระบบตรวจสอบและเติมเครดิต

**ข้อมูลที่ได้รับจาก API:**
```json
{
  "transRef": "รหัสอ้างอิงธุรกรรม",
  "transDate": "วันที่โอน",
  "transTime": "เวลาโอน",
  "amount": "จำนวนเงิน",
  "senderName": "ชื่อผู้โอน",
  "senderAccount": "เลขบัญชีผู้โอน",
  "receiverName": "ชื่อผู้รับ",
  "receiverAccount": "เลขบัญชีผู้รับ"
}
```

**โหมดการทำงาน:**
- **Auto Mode:** ตรวจสอบและอนุมัติอัตโนมัติ
- **Manual Mode:** Admin ตรวจสอบและอนุมัติด้วยตนเอง

### 7.2 Supabase Storage

**การใช้งาน:** เก็บไฟล์สลิปโอนเงิน

```javascript
// Upload slip
const { data, error } = await supabase.storage
  .from('slips')
  .upload(`${userId}/${filename}`, file)

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('slips')
  .getPublicUrl(path)
```

### 7.3 Supabase Realtime (อนาคต)

**ศักยภาพ:** สามารถใช้ Realtime subscriptions สำหรับ:
- แจ้งเตือนเมื่อมีการแทงใหม่
- อัปเดตยอดรวมแบบ Real-time
- แจ้งเตือนเมื่อประกาศผล

---

## 8. ข้อเสนอแนะเพิ่มเติม

### 8.1 ฟีเจอร์ที่ควรเพิ่ม

#### ระดับความสำคัญสูง

1. **ระบบแจ้งเตือน (Notifications)**
   - Push notifications เมื่อประกาศผล
   - แจ้งเตือนเมื่อเครดิตใกล้หมด
   - แจ้งเตือนเมื่อมีสมาชิกใหม่

2. **รายงานและสถิติ**
   - รายงานยอดขายรายวัน/เดือน
   - กราฟแสดงแนวโน้ม
   - Export เป็น Excel/PDF

3. **ระบบ Backup**
   - Backup ข้อมูลอัตโนมัติ
   - Point-in-time recovery

4. **Mobile App**
   - React Native หรือ Flutter
   - Push notifications
   - Offline support

#### ระดับความสำคัญปานกลาง

5. **ระบบ Chat**
   - Chat ระหว่าง Dealer กับ User
   - Group chat สำหรับประกาศ

6. **ระบบ Referral**
   - รหัสแนะนำเพื่อน
   - Commission จากการแนะนำ

7. **Multi-language Support**
   - รองรับภาษาลาว
   - รองรับภาษาอังกฤษ

8. **Dark/Light Mode**
   - Toggle theme
   - System preference detection

### 8.2 การปรับปรุง Performance

1. **Code Splitting**
   - Lazy loading ทุกหน้า ✅ (ทำแล้ว)
   - Dynamic imports สำหรับ components ขนาดใหญ่

2. **Caching**
   - Profile caching ✅ (ทำแล้ว)
   - API response caching
   - Service Worker

3. **Database Optimization**
   - Indexes ✅ (ทำแล้ว)
   - Query optimization
   - Connection pooling

4. **Image Optimization**
   - Compress images
   - Lazy loading images
   - WebP format

### 8.3 การปรับปรุง Security

1. **Two-Factor Authentication (2FA)**
   - SMS OTP
   - Authenticator app

2. **Rate Limiting**
   - ป้องกัน brute force
   - API rate limits

3. **Audit Logging**
   - บันทึกการเข้าถึงข้อมูลสำคัญ
   - บันทึกการเปลี่ยนแปลง

4. **IP Whitelisting**
   - สำหรับ SuperAdmin
   - สำหรับ API access

### 8.4 การปรับปรุง UX

1. **Onboarding Tutorial**
   - แนะนำการใช้งานครั้งแรก
   - Tooltips

2. **Keyboard Shortcuts**
   - ลัดการทำงานบ่อย
   - Accessibility

3. **Offline Support**
   - PWA capabilities
   - Offline data sync

4. **Better Error Handling**
   - User-friendly error messages
   - Retry mechanisms

### 8.5 การ Monitor และ Analytics

1. **Error Tracking**
   - Sentry integration
   - Error reporting

2. **Analytics**
   - User behavior tracking
   - Conversion tracking

3. **Performance Monitoring**
   - Page load times
   - API response times

---

## สรุป

**Lao Lotto** เป็นแอปพลิเคชันจัดการหวยที่ครบวงจร ประกอบด้วย:

- **3 ระดับผู้ใช้:** SuperAdmin, Dealer, User
- **6 ประเภทหวย:** ไทย, ลาว, ฮานอย, หุ้น, ยี่กี, อื่นๆ
- **ระบบเครดิต:** เติม/หัก/ติดตามอัตโนมัติ
- **ระบบส่งต่อยอด:** เชื่อมต่อเจ้ามือหลายระดับ
- **ความปลอดภัย:** RLS, Authentication, Authorization

พัฒนาด้วย **React + Supabase** ออกแบบให้ใช้งานง่าย รองรับ Responsive Design และมีศักยภาพในการขยายฟีเจอร์ในอนาคต

---

*เอกสารนี้สร้างเมื่อ: กุมภาพันธ์ 2026*
*เวอร์ชัน: 1.0*
