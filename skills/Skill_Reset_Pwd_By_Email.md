---
name: reset-pwd-by-email
description: รีเซ็ตรหัสผ่านบัญชีผู้ใช้ด้วยอีเมล รองรับทั้งโหมดส่งลิงก์รีเซ็ตให้ผู้ใช้กดเอง (self-service) และโหมดแอดมินบังคับตั้งรหัสผ่านใหม่ทันที (force reset) เขียนแบบไม่ผูกกับโปรเจกต์ใดโปรเจกต์หนึ่ง สามารถคัดลอกไปใช้ซ้ำกับโปรเจกต์อื่นได้
argument-hint: "<email> [new-password] [--send-link|--force]"
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - edit
permissions:
  ask:
    - exec
triggers:
  - user
---

# Reset Password by Email

สกิลนี้สอนวิธีรีเซ็ตรหัสผ่านของบัญชีผู้ใช้ โดยใช้ **อีเมล** เป็นตัวระบุบัญชี เขียนขึ้นให้ใช้ซ้ำได้กับหลายโปรเจกต์ (ไม่ยึดติดกับ backend ใดโดยเฉพาะ) แต่มีตัวอย่างโค้ดพร้อมใช้สำหรับ Supabase Auth ซึ่งเป็นระบบที่พบบ่อยที่สุด

## ขั้นตอนที่ 0: ตรวจสอบว่าโปรเจกต์ใช้ระบบ auth อะไร

ก่อนลงมือ ให้สำรวจโปรเจกต์เป้าหมายก่อนเสมอ (ห้ามสมมติว่าเหมือนโปรเจกต์เดิม):

1. ดู dependency file (`package.json`, `requirements.txt`, `composer.json`, `Gemfile`, ...) และ `.env*` เพื่อหาว่าใช้ระบบใด:
   - **Supabase Auth** → มี `@supabase/supabase-js`, env มี `SUPABASE_URL` / `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, อาจมี `SUPABASE_SERVICE_ROLE_KEY`
   - **Firebase Auth** → มี `firebase` / `firebase-admin`
   - **Auth0 / Clerk / NextAuth / Better Auth** → มี SDK เฉพาะของผู้ให้บริการนั้น
   - **ระบบ custom (self-hosted)** → มีตาราง `users` ในฐานข้อมูลเอง และเก็บรหัสผ่านแบบ hash (bcrypt/argon2) เช่น Express+Passport, Django, Laravel, Rails
2. ถ้าไม่แน่ใจ ให้ grep คำว่า `resetPassword`, `forgot`, `bcrypt`, `auth.users`, `sendPasswordResetEmail` เป็นต้น เพื่อดูว่ามี flow เดิมอยู่แล้วหรือไม่ (ถ้ามีให้ใช้ของเดิมก่อนเสมอ อย่าสร้างซ้ำ)

## สองโหมดของการรีเซ็ต

### โหมด A — ส่งลิงก์รีเซ็ตให้ผู้ใช้กดเอง (ค่าเริ่มต้นที่แนะนำ ปลอดภัยที่สุด)

ใช้เมื่อเจ้าของบัญชียังเข้าอีเมลของตัวเองได้ ไม่ต้องมีใครรู้/ตั้งรหัสผ่านแทนผู้ใช้

| Backend | วิธีเรียก |
|---|---|
| Supabase | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| Firebase | `sendPasswordResetEmail(auth, email)` |
| Custom DB | สร้าง random token + expiry เก็บลง DB แล้วส่งอีเมลลิงก์ไปที่ `/reset-password?token=...` จากนั้นตรวจ token ตอนตั้งรหัสใหม่ |

### โหมด B — แอดมินบังคับตั้งรหัสผ่านใหม่ทันที

ใช้เฉพาะเมื่อผู้ใช้เข้าอีเมลไม่ได้ หรือแอดมินต้องรีเซ็ตให้จากระบบหลังบ้านโดยตรง ต้องมีสิทธิ์ระดับแอดมิน/service role เท่านั้น และต้องอ่านหัวข้อ "ข้อควรระวัง" ก่อนทำ

**Supabase (ใช้ Service Role Key เท่านั้น ห้ามใช้ anon key):**

```js
// scripts/reset-password-by-email.mjs
// Usage: node scripts/reset-password-by-email.mjs user@example.com "NewStrongPassword123!"
import { createClient } from '@supabase/supabase-js'

const [, , email, newPassword] = process.argv
if (!email || !newPassword) {
  console.error('Usage: node reset-password-by-email.mjs <email> <newPassword>')
  process.exit(1)
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // ห้ามใช้ anon key และห้ามฝังลงโค้ด client
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// 1. หา user จากอีเมล (Admin API บางเวอร์ชันไม่มี filter by email ตรงๆ จึงต้อง list แล้ว filter)
const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
if (listError) throw listError

const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`No user found with email: ${email}`)
  process.exit(1)
}

// 2. ตั้งรหัสผ่านใหม่
const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
  password: newPassword,
})
if (updateError) throw updateError

console.log(`Password reset successfully for ${email}`)
```

- ตั้งค่า env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (คัดลอกจาก Supabase Dashboard > Project Settings > API > `service_role`) โดยเก็บใน `.env` ฝั่ง server/สคริปต์เท่านั้น ห้าม commit และห้ามตั้งชื่อ prefix ด้วย `VITE_` / `NEXT_PUBLIC_` เพราะจะถูกฝังไปในโค้ดฝั่ง client ทันที
- รันคำสั่งนี้จากเครื่อง/เซิร์ฟเวอร์ที่เชื่อถือได้เท่านั้น ห้ามรันจาก browser/ฝั่ง client

**Firebase Admin SDK:**

```js
import { getAuth } from 'firebase-admin/auth'
const user = await getAuth().getUserByEmail(email)
await getAuth().updateUser(user.uid, { password: newPassword })
```

**Custom DB (เช่น Postgres/MySQL + bcrypt):**

```js
import bcrypt from 'bcrypt'
const hashed = await bcrypt.hash(newPassword, 10)
await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashed, email])
```

## ขั้นตอนที่ agent ควรทำเมื่อถูกเรียกใช้สกิลนี้

1. รับ/ถามอีเมลเป้าหมาย และโหมดที่ต้องการ (ส่งลิงก์ หรือ บังคับตั้งรหัสใหม่)
2. ตรวจสอบ auth backend ของโปรเจกต์ตาม "ขั้นตอนที่ 0" — อย่าสมมติว่าเป็น Supabase เสมอไป
3. **โหมด A**: หา flow ที่มีอยู่แล้วในโปรเจกต์ก่อน (เช่นหน้า Forgot Password) แล้วใช้ของเดิม ไม่ต้องสร้างใหม่
4. **โหมด B**: 
   - ถ้าผู้ใช้ไม่ได้ระบุรหัสผ่านใหม่ ให้ generate รหัสผ่านสุ่มที่แข็งแรง (เช่น 16 ตัวอักษร ผสมตัวเลข/สัญลักษณ์)
   - ตรวจสอบว่ามี admin credential (เช่น `SUPABASE_SERVICE_ROLE_KEY`) พร้อมใช้งานใน `.env` แล้วหรือยัง ถ้ายังไม่มีให้แจ้งผู้ใช้ไปหยิบมาเองจาก dashboard ของระบบนั้น — **ห้ามขอให้ผู้ใช้วางคีย์ลงในแชทโดยตรง**
   - เขียน/ปรับ script ตามตัวอย่างด้านบนให้ตรงกับ backend จริงของโปรเจกต์ แล้วรันผ่าน `exec`
5. ยืนยันผลลัพธ์จาก log ของสคริปต์ (สำเร็จ/ล้มเหลว) แต่**ห้ามพิมพ์รหัสผ่านใหม่ลงในไฟล์ที่จะ commit หรือ log ถาวร** ให้แจ้งรหัสผ่านใหม่แก่ผู้ใช้ผ่านข้อความสนทนาเท่านั้น
6. ลบไฟล์สคริปต์ชั่วคราวที่มี credential ฝังอยู่ (ถ้าสร้างขึ้นมาเฉพาะกิจ) หลังใช้งานเสร็จ ถ้าไม่ต้องการเก็บไว้ถาวรในโปรเจกต์

## ข้อควรระวัง (สำคัญ)

- **ห้าม** hardcode service role key / admin credential ลงในโค้ดหรือ commit ลง git
- **ห้าม** ใช้ anon/public key รีเซ็ตรหัสผ่านของบัญชีอื่น ทำได้เฉพาะผ่าน service role/admin API เท่านั้น
- ยืนยันสิทธิ์ผู้ขอเสมอว่าเป็นเจ้าของบัญชี หรือแอดมินที่ได้รับอนุญาตจริง ก่อนรีเซ็ตให้
- โหมด B ควรใช้เป็นทางเลือกสุดท้าย เพราะข้ามการยืนยันตัวตนของเจ้าของบัญชีไปเลย
- รหัสผ่านใหม่ควรเป็นไปตามนโยบายความยาว/ความซับซ้อนของระบบนั้นๆ
- แนะนำให้ผู้ใช้เปลี่ยนรหัสผ่านอีกครั้งทันทีหลัง login ครั้งแรก หากถูกรีเซ็ตแบบบังคับ (โหมด B)

## ตัวอย่างในโปรเจกต์ Green Coupon (อ้างอิง)

- โหมด A มีอยู่แล้วที่ <ref_file file="F:\Web App\Green Coupon\src\pages\ForgotPassword.jsx" /> (ส่งลิงก์รีเซ็ต) และ <ref_file file="F:\Web App\Green Coupon\src\pages\UpdatePassword.jsx" /> (ตั้งรหัสผ่านใหม่หลังกดลิงก์)
- โหมด B ยังไม่มีในระบบนี้ — หากต้องการให้แอดมินรีเซ็ตรหัสผ่านของ shop/staff/student โดยตรงจากอีเมล ให้ใช้ script Supabase Admin ด้านบน และเพิ่ม `SUPABASE_SERVICE_ROLE_KEY` ใน `.env` (ฝั่ง server/สคริปต์เท่านั้น ห้ามใช้ prefix `VITE_`)

## การติดตั้งให้เรียกใช้ผ่านคำสั่ง /reset-pwd-by-email ใน Devin CLI (ทางเลือกเสริม)

ไฟล์นี้เขียนในรูปแบบ SKILL.md จึงพร้อมใช้เป็น Devin CLI Skill ได้ทันที เพียงคัดลอกไปวางที่:

```
<โปรเจกต์อื่น>/.devin/skills/reset-pwd-by-email/SKILL.md
```

(เปลี่ยนชื่อไฟล์เป็น `SKILL.md` และวางไว้ในโฟลเดอร์ย่อยชื่อ `reset-pwd-by-email`) จากนั้นจะเรียกใช้ด้วยคำสั่ง `/reset-pwd-by-email` ได้ในทุกเซสชันของโปรเจกต์นั้น
