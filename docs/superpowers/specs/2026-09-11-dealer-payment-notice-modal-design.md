# Design Document: ระบบแจ้งชำระเงินผ่าน LINE และหน้าต่างส่งใบแจ้งชำระ (Dealer Payment Notice Modal & LINE Dispatch)

**Date:** 2026-09-11  
**Status:** Approved  
**Author:** Pair Programming Assistant & User  

---

## 1. บทนำและปัญหา (Overview & Problem Statement)

ในระบบจัดการงวดหวยและบัญชี (`Dealer.jsx` / `MemberSettlementInline.jsx`):
1. **ปุ่มซ้ำซ้อนในหน้าประวัติ:** แถบเตือนตรวจพบยอดคงค้างงวดก่อนหน้า (Smart Banner ด้านบน) มีปุ่ม `⚡ หักล้างยอดข้ามงวด` ซึ่งซ้ำซ้อนกับปุ่ม `⚡ หักล้างข้ามงวด` ที่อยู่ในแถบเครื่องมือจัดการเงินด้านล่างอยู่แล้ว
2. **ความต้องการส่งใบแจ้งยอดหนี้/เงินรางวัลให้สมาชิก:** เจ้ามือต้องการปุ่ม **"แจ้งชำระเงิน"** แทนปุ่มเดิม เพื่อเปิดหน้าต่างออกใบแจ้งหนี้/สรุปยอดส่งตรงไปยังบัญชี LINE ของสมาชิกรายนั้นๆ
3. **ความหลากหลายของรูปแบบการเคลียร์ยอด:** สมาชิกแต่ละรายมีรูปแบบการตกลงจ่ายเงินต่างกัน ได้แก่:
   - จ่ายเฉพาะยอดค้างงวดปัจจุบัน
   - นำเงินรางวัลงวดปัจจุบันมาหักลบกับหนี้งวดเก่าที่เลือก
   - รวมยอดหนี้งวดปัจจุบันและหนี้งวดเก่าทั้งหมดเข้าด้วยกัน
4. **ความถูกต้องของบัญชีโอนเงิน:** ต้องแสดงบัญชีโอนเงินที่ถูกต้องตามทิศทางการเงิน เช่น หากสมาชิกต้องโอน ต้องดึงบัญชีเฉพาะที่เจ้ามือกำหนดไว้ให้สมาชิกรายนั้น หรือหากเจ้ามือต้องโอนรางวัล ต้องดึงบัญชีของสมาชิกมาแสดง

---

## 2. เป้าหมายและขอบเขต (Goals & Scope)

1. **ปรับปรุงแถบแจ้งเตือน Smart Banner (`MemberSettlementInline.jsx`):**
   - เปลี่ยนปุ่มในกรอบจาก `หักล้างยอดข้ามงวด` เป็น **`แจ้งชำระเงิน`**
   - **เงื่อนไขการแสดงผล:** แสดงแถบนี้เฉพาะเมื่อ:
     1. สมาชิกมียอดค้างชำระในงวดปัจจุบัน (`currentBalance !== 0`)
     2. สมาชิกมียอดค้างชำระจากงวดก่อนหน้า (`pastUnpaidRounds.length > 0`)
     *(หากไม่ครบทั้ง 2 เงื่อนไข แถบด้านบนจะไม่แสดง)*
2. **สร้างหน้าต่าง Modal เฉพาะ `PaymentNoticeModal.jsx`:**
   - ออกแบบตามภาพที่ผู้ใช้กำหนด ขนาดกระชับ สวยงามแบบ Dark Modern Theme
   - รองรับ 3 โหมดการแจ้งชำระ:
     - **`หนี้งวดนี้`**: แจ้งยอดโอนตามยอดค้างงวดปัจจุบัน
     - **`หักลบรางวัลกับหนี้เก่า`**: นำรางวัลงวดปัจจุบันหักลบกับหนี้งวดเก่าที่เลือก
     - **`หักลบทั้งหมด`**: รวมยอดหนี้ปัจจุบัน + ยอดหนี้เก่าที่เลือก
3. **ระบบดึงข้อมูลบัญชีโอนเงินอัตโนมัติ (Bank Account Resolution):**
   - **กรณีเจ้ามือต้องโอนให้สมาชิก:** ดึงบัญชีของสมาชิกจาก `user_bank_accounts` (หรือ `profiles`)
   - **กรณีสมาชิกต้องโอนให้เจ้ามือ:** ดึงบัญชีที่เจ้ามือกำหนดให้สมาชิกจาก `user_dealer_memberships.assigned_bank_account_id` หากไม่ได้กำหนด ให้ใช้บัญชีหลัก (default) ของเจ้ามือจาก `dealer_bank_accounts`
4. **ส่งข้อความผ่าน LINE Bot:**
   - ส่งข้อความ Push สรุปยอดและรายละเอียดบัญชีไปยัง LINE UID ของสมาชิกผ่าน Edge Function `line-bot`
   - หากสมาชิกยังไม่ได้ผูก LINE UID ให้แจ้งเตือนพร้อมปุ่ม **"คัดลอกข้อความ"** เพื่อให้เจ้ามือก๊อปปี้ไปส่งเองได้
5. **ไม่ตัดยอดบัญชีในระบบ:** ตามข้อตกลง (ตัวเลือก A) การส่งใบแจ้งชำระเป็นการแจ้งยอดให้สมาชิกโอนเงินก่อน ยังไม่สร้างประวัติการชำระเงินในฐานข้อมูล จนกว่าสมาชิกจะโอนเงินและส่งสลิปมาให้เจ้ามือลงบันทึกรับเงินตามปกติ

---

## 3. สถาปัตยกรรมและรายละเอียดหน้าจอ (UI & UX Design)

### 3.1 แถบแจ้งเตือนใน `MemberSettlementInline.jsx`
- **เงื่อนไข:**
  ```javascript
  const hasCurrentOutstanding = currentBalance !== 0;
  const hasPastDebt = pastUnpaidRounds.length > 0;
  const showPaymentNoticeBanner = hasCurrentOutstanding && hasPastDebt;
  ```
- **ปุ่ม:** แสดงปุ่ม `แจ้งชำระเงิน` สีเขียว/มินต์สว่างเด่นชัด
- เมื่อกด จะเซ็ต `showPaymentNoticeModal = true`

### 3.2 หน้าต่าง `PaymentNoticeModal.jsx`
โครงสร้างหน้าต่าง (Modal) ประกอบด้วย 6 ส่วนหลัก:

#### ส่วนที่ 1: Header
- หัวข้อ: 📋 **แจ้งชำระเงิน**
- ปุ่มปิด (x) มุมขวาบน

#### ส่วนที่ 2: ข้อมูลสมาชิกและรางวัล
- แสดงชื่อสมาชิก (เช่น `พี่ชัช`)
- แสดงยอดรางวัลงวดนี้ที่นำมาหักล้าง (เช่น `฿0` หรือ `฿3,000`)

#### ส่วนที่ 3: แถบเลือกรูปแบบใบแจ้งชำระ (3 โหมด)
Checkbox / Radio Buttons สไตล์ Modern Tabs:
1. `[ ] หนี้งวดนี้`
2. `[ ] หักลบรางวัลกับหนี้เก่า`
3. `[ ] หักลบทั้งหมด`

#### ส่วนที่ 4: รายการงวดเก่า (Past Rounds Checklist)
- แสดงเมื่อเลือกโหมด **"หักลบรางวัลกับหนี้เก่า"** หรือ **"หักลบทั้งหมด"**
- มี Checkbox รวม: `[v] เลือกงวดเก่าที่ต้องการหักล้าง (X/Y)` พร้อมปุ่ม `ยกเลิกทั้งหมด / เลือกทั้งหมด`
- แต่ละแถวแสดง:
  - วันที่งวด (ใช้ `close_time` / `close_date` ตามกฎวงการหวย)
  - ประเภทหวย (หวยไทย, หวยลาว ฯลฯ)
  - ยอดค้างชำระ (เช่น `ค้าง ฿9,157` สีแดง)

#### ส่วนที่ 5: สรุปยอดการคำนวณ (Calculation Summary Box)
- **โหมดหนี้งวดนี้:**
  - ยอดค้างงวดปัจจุบัน: `฿5,768`
  - ยอดที่ต้องชำระ: `฿5,768`
- **โหมดหักลบรางวัลกับหนี้เก่า:**
  - รวมหนี้เก่าที่เลือก: `฿9,157`
  - หักลบเงินรางวัลงวดนี้: `-฿0`
  - สรุป: `🟢 สมาชิกต้องโอนชำระ: ฿9,157`
- **โหมดหักลบทั้งหมด:**
  - ยอดค้างงวดปัจจุบัน: `฿5,768`
  - รวมหนี้เก่าที่เลือก: `฿9,157`
  - สรุป: `🟢 สมาชิกต้องโอนชำระ: ฿14,925`

#### ส่วนที่ 6: ข้อมูลการชำระเงินและบัญชีโอนเงิน
- **จำนวนเงินที่แจ้งชำระ (บาท):** ช่อง input ตัวเลข (default ตามยอดสรุปที่คำนวณได้ แต่เจ้ามือแก้ไขได้)
- **วันที่แจ้ง/กำหนดชำระ:** ช่อง input วันที่ (default เป็นวันปัจจุบัน)
- **ช่องบัญชีโอนเงิน:**
  - แสดงชื่อธนาคาร, เลขบัญชี, ชื่อบัญชี
  - สลับอัตโนมัติตามทิศทางการเงิน (ถ้าเจ้ามือโอน -> แสดงบัญชีสมาชิก, ถ้าสมาชิกโอน -> แสดงบัญชีเจ้ามือ/บัญชีที่กำหนด)
  - มีปุ่มสลับบัญชี (Dropdown) หากเจ้ามือมีหลายบัญชี หรือพิมพ์แก้ไขข้อความบัญชีได้

#### ส่วนที่ 7: ปุ่มสั่งการท้าย Modal
- ปุ่ม `ยกเลิก`: ปิดหน้าต่าง
- ปุ่ม `ส่งใบแจ้งชำระ` (สีเหลืองทองโดดเด่น):
  - ตรวจสอบ `line_user_id`
  - ส่งข้อความ Push ผ่าน LINE Bot
  - มีสถานะ Loading ขณะส่ง และแจ้ง Toast เมื่อส่งสำเร็จ

---

## 4. การดึงข้อมูลบัญชีธนาคาร (Bank Account Resolution Logic)

ฟังก์ชัน `resolvePaymentNoticeBankAccount` จะทำงานดังนี้:

```javascript
export async function resolvePaymentNoticeBankAccount({
    direction, // 'member_to_dealer' | 'dealer_to_member'
    dealerId,
    memberUserId,
    supabase
}) {
    if (direction === 'dealer_to_member') {
        // เจ้ามือต้องโอนให้สมาชิก -> ดึงบัญชีสมาชิก
        // 1. user_bank_accounts
        const { data: memberBanks } = await supabase
            .from('user_bank_accounts')
            .select('*')
            .eq('user_id', memberUserId)
            .order('is_default', { ascending: false });

        if (memberBanks && memberBanks.length > 0) {
            const b = memberBanks[0];
            return {
                bank_name: b.bank_name,
                bank_account: b.bank_account,
                account_name: b.account_name,
                source: 'member_bank_accounts'
            };
        }

        // 2. Fallback to member profiles
        const { data: profile } = await supabase
            .from('profiles')
            .select('bank_name, bank_account, bank_account_number, bank_account_name')
            .eq('id', memberUserId)
            .single();

        if (profile?.bank_account || profile?.bank_account_number) {
            return {
                bank_name: profile.bank_name || 'ไม่ระบุธนาคาร',
                bank_account: profile.bank_account || profile.bank_account_number,
                account_name: profile.bank_account_name || '',
                source: 'member_profile'
            };
        }

        return null;
    } else {
        // สมาชิกต้องโอนให้เจ้ามือ -> ดึงบัญชีเจ้ามือที่กำหนดให้สมาชิกรายนี้ หรือบัญชีหลักเจ้ามือ
        // 1. ตรวจสอบ assigned_bank_account_id จาก user_dealer_memberships
        const { data: membership } = await supabase
            .from('user_dealer_memberships')
            .select('assigned_bank_account_id')
            .eq('dealer_id', dealerId)
            .eq('user_id', memberUserId)
            .maybeSingle();

        if (membership?.assigned_bank_account_id) {
            const { data: assignedBank } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('id', membership.assigned_bank_account_id)
                .single();

            if (assignedBank) {
                return {
                    bank_name: assignedBank.bank_name,
                    bank_account: assignedBank.bank_account,
                    account_name: assignedBank.account_name,
                    source: 'dealer_assigned'
                };
            }
        }

        // 2. Fallback to dealer default bank account
        const { data: defaultBank } = await supabase
            .from('dealer_bank_accounts')
            .select('*')
            .eq('dealer_id', dealerId)
            .eq('is_default', true)
            .maybeSingle();

        if (defaultBank) {
            return {
                bank_name: defaultBank.bank_name,
                bank_account: defaultBank.bank_account,
                account_name: defaultBank.account_name,
                source: 'dealer_default'
            };
        }

        // 3. Any dealer bank account
        const { data: anyBank } = await supabase
            .from('dealer_bank_accounts')
            .select('*')
            .eq('dealer_id', dealerId)
            .limit(1)
            .maybeSingle();

        if (anyBank) {
            return {
                bank_name: anyBank.bank_name,
                bank_account: anyBank.bank_account,
                account_name: anyBank.account_name,
                source: 'dealer_any'
            };
        }

        // 4. Fallback to dealer profile
        const { data: dealerProfile } = await supabase
            .from('profiles')
            .select('bank_name, bank_account, bank_account_number, bank_account_name')
            .eq('id', dealerId)
            .single();

        if (dealerProfile?.bank_account || dealerProfile?.bank_account_number) {
            return {
                bank_name: dealerProfile.bank_name || 'ไม่ระบุธนาคาร',
                bank_account: dealerProfile.bank_account || dealerProfile.bank_account_number,
                account_name: dealerProfile.bank_account_name || '',
                source: 'dealer_profile'
            };
        }

        return null;
    }
}
```

---

## 5. การส่งข้อความผ่าน LINE Bot (LINE Bot Push Notification)

### 5.1 Endpoint ใน Supabase Edge Function (`line-bot`)
เพิ่ม action `send_payment_notice` ใน `supabase/functions/line-bot/index.ts`:

```typescript
if (apiPayload && apiPayload.action === 'send_payment_notice') {
    const { line_user_id, message_text } = apiPayload;
    if (!line_user_id || !message_text) {
        return new Response(JSON.stringify({ success: false, error: 'Missing line_user_id or message_text' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    await sendLinePush(line_user_id, message_text);
    return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    });
}
```

### 5.2 โครงสร้างข้อความ LINE (Template Format)
```text
📋 ใบแจ้งชำระเงิน
👤 สมาชิก: [ชื่อสมาชิก]
🎲 งวดวันที่: [วัน/เดือน/ปี] ([ชื่อหวย])
📌 รูปแบบ: [หนี้งวดนี้ / หักลบรางวัลกับหนี้เก่า / หักลบทั้งหมด]

[รายละเอียดรายการตามโหมด]:
- ยอดค้างงวดปัจจุบัน: ฿[ยอด]
- รางวัลงวดนี้: ฿[ยอด]
- รวมหนี้เก่าที่เลือก: ฿[ยอด]
----------------------------
💰 ยอดสุทธิที่ต้องโอน: ฿[ยอดสุทธิ]
([🟢 สมาชิกโอนชำระให้เจ้ามือ / 🔴 เจ้ามือโอนคืนสมาชิก])

💳 บัญชีโอนเงิน:
ธนาคาร: [ชื่อธนาคาร]
เลขบัญชี: [เลขบัญชี]
ชื่อบัญชี: [ชื่อบัญชี]
```

---

## 6. แผนการทดสอบและการตรวจสอบ (Verification Plan)

1. **Unit Tests (Vitest):**
   - ทดสอบการคำนวณยอดของทั้ง 3 โหมดใน utility helper
   - ทดสอบฟังก์ชัน resolution บัญชีธนาคาร (ทั้งกรณีเจ้ามือโอนให้สมาชิก และสมาชิกโอนให้เจ้ามือ)
   - ทดสอบฟังก์ชันจัดรูปแบบข้อความใบแจ้งชำระเงิน
2. **UI & State Verification:**
   - ทดสอบว่าแถบ Smart Banner แสดงเฉพาะเมื่อ `pastUnpaidRounds.length > 0 && currentBalance !== 0`
   - ตรวจสอบว่าปุ่มล่าง `⚡ หักล้างข้ามงวด` ยังคงทำงานได้ตามปกติ
   - คลิกปุ่ม `แจ้งชำระเงิน` แล้วเปิด `PaymentNoticeModal` ถูกต้อง
   - สลับระหว่าง 3 โหมดแล้วยอดคำนวณและรายการงวดเก่าเปลี่ยนแบบเรียลไทม์
   - บัญชีโอนเงินแสดงผลตรงตามเงื่อนไข
3. **LINE Dispatch Verification:**
   - ทดสอบส่งข้อความไปยัง LINE UID
   - ทดสอบกรณีสมาชิกที่ไม่มี LINE UID แสดงข้อความแจ้งเตือนและปุ่ม Copy ได้ถูกต้อง
   - รัน `npm run test` และ `npm run build` ตรวจสอบความถูกต้องทั้งหมดก่อนส่งมอบ
