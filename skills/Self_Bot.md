# Skill: สร้าง LINE Self-Bot ด้วย LINEJS

> **ไฟล์คู่มือนี้ (Skill File) เขียนขึ้นเพื่อให้ AI Agent และผู้พัฒนาได้เรียนรู้ขั้นตอนการสร้างและดูแล LINE Self-Bot รันผ่านบัญชีผู้ใช้จริงด้วย Library `@evex/linejs` โดยไม่ต้องสร้าง LINE Official Account แต่อย่างใด เหมาะสำหรับการนำไปสร้าง Self-Bot ใน project ใหม่ทันที**

---

## 📌 บทนำ: LINE Self-Bot คืออะไร?

LINE Self-Bot คือการใช้บัญชี LINE ของผู้ใช้จริง (เบอร์โทรศัพท์/อีเมล) เป็นบอทอัตโนมัติ โดยผ่าน Library `@evex/linejs` ซึ่งจำลองตัวเป็น LINE Client ของผู้ใช้จริง เข้าสู่ระบบด้วย QR Code หรือ PIN Code แล้วรับ/ส่งข้อความในกลุ่มแชทแบบอัตโนมัติ

**ข้อดี:**
- ไม่ต้องสร้าง LINE Official Account หรือเสียค่าใช้จ่าย
- ไม่มีข้อจำกัด Push Quota เหมือน OA Bot
- ส่ง Flex Message ผ่าน LIFF ได้
- ใช้งาน E2EE DM (ข้อความเข้ารหัส) ได้

**ข้อจำกัด:**
- รันบนเครื่อง Local หรือ VPS ต้องเปิดทิ้งไว้ตลอดเวลา
- ห้ามใช้บัญชีหลัก เพราะอาจถูกแบนจาก LINE ได้ แนะนำให้สร้างบัญชีใหม่เฉพาะ
- Session Token มีอายุ อาจต้องล็อกอินใหม่เป็นครั้งคราว

---

## 1. โครงสร้างโปรเจกต์

```
self-bot/
├── package.json
├── .env
├── bot.js              # ไฟล์หลักสำหรับรัน Self-Bot
├── db.js               # ไฟล์เชื่อมต่อ Supabase (ถ้าต้องใช้ฐานข้อมูล)
├── storage.json        # เก็บ Session Token (สร้างอัตโนมัติหลังล็อกอินครั้งแรก)
└── README.md
```

---

## 2. การติดตั้ง Dependencies

### 📦 package.json
```json
{
  "name": "line-self-bot",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node bot.js",
    "dev": "node bot.js"
  },
  "dependencies": {
    "@evex/linejs": "npm:@jsr/evex__linejs@^3.0.0",
    "dotenv": "^16.4.0",
    "node-fetch": "^2.7.0"
  }
}
```

### 🔧 การติดตั้ง
```bash
npm install
```

### 📋 .env (ตัวแปรสภาพแวดล้อม)
```env
# LIFF สำหรับส่ง Flex Message (ถ้าต้องใช้)
LIFF_ID=1234567890-abcde123

# Supabase (ถ้าต้องใช้ฐานข้อมูล)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 3. โค้ดหลัก: การเข้าสู่ระบบและรับฟังข้อความ (`bot.js`)

```javascript
const { Client } = require("@evex/linejs");
const fs = require("fs");
require("dotenv").config();

const STORAGE_FILE = "./storage.json";

// ─── Storage: เก็บ Session Token เพื่อรันต่อเนื่อง ────────────────────────────
const storage = {
    set: (key, value) => {
        let data = {};
        if (fs.existsSync(STORAGE_FILE)) {
            try { data = JSON.parse(fs.readFileSync(STORAGE_FILE)); } catch (e) {}
        }
        data[key] = value;
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
    },
    get: (key) => {
        if (!fs.existsSync(STORAGE_FILE)) return undefined;
        try {
            const data = JSON.parse(fs.readFileSync(STORAGE_FILE));
            return data[key];
        } catch (e) {
            return undefined;
        }
    }
};

// ─── เริ่มต้น Self-Bot ────────────────────────────────────────────────────────
async function startBot() {
    console.log("🤖 กำลังเริ่มต้น Self-Bot...");

    const client = new Client({ storage });

    // ตรวจสอบว่ามี Session Token เดิมหรือไม่
    const hasToken = fs.existsSync(STORAGE_FILE) && fs.readFileSync(STORAGE_FILE).includes("authToken");

    if (hasToken) {
        console.log("🔑 พบ Auth Token เดิม กำลังเข้าสู่ระบบ...");
        await client.login();
    } else {
        console.log("📱 ไม่พบ Session เดิม กรุณาเข้าสู่ระบบ:");
        client.on("pincode", (pincode) => {
            console.log(`========================================`);
            console.log(`🔑 กรุณากรอกรหัส Pincode บนโทรศัพท์: ${pincode}`);
            console.log(`========================================`);
        });
        client.on("qr", (qr) => {
            console.log(`========================================`);
            console.log(`📸 สแกน QR Code นี้เพื่อล็อกอิน: ${qr.url}`);
            console.log(`========================================`);
        });
        await client.login();
    }

    console.log(`🚀 เข้าสู่ระบบสำเร็จ! บอท MID: ${client.selfMid}`);

    // ─── รับฟังข้อความในกลุ่ม ────────────────────────────────────────────────
    client.on("update", async (op) => {
        try {
            // RECEIVE_MESSAGE (Type 26)
            if (op.type === "RECEIVE_MESSAGE" || Number(op.type) === 26) {
                const message = op.message;
                if (!message) return;

                const senderMid = message.from || op.sender?.mid;
                const text = message.text;
                const chatMid = message.to || op.param?.[0];

                if (senderMid && senderMid !== client.selfMid) {
                    console.log(`[Message] From: ${senderMid} | Text: ${text}`);

                    // ─── ตัวอย่าง: ตอบข้อความง่าย ๆ ────────────────────────────
                    if (text && text.toLowerCase() === "hello") {
                        await client.base.talk.sendMessage({
                            to: chatMid,
                            text: "สวัสดีครับ! 🤖",
                            contentType: "NONE",
                            e2ee: false
                        });
                    }
                }
            }

            // ─── ตัวอย่าง: ตรวจจับคนถูกเตะออกจากกลุ่ม (Anti-Kick) ────────────────
            if (Number(op.type) === 13 || op.type === "NOTIFIED_LEAVE_GROUP") {
                console.log(`⚠️ มีคนถูกเตะออกจากกลุ่ม`);
                // เพิ่มโค้ดป้องกัน/เชิญคืนได้ที่นี่
            }
        } catch (err) {
            console.error("Error processing update:", err);
        }
    });

    // ─── เปิดรับข้อความ 2 ช่องทาง ──────────────────────────────────────────────
    // Channel 1: Real-time Push
    client.listen({ talk: true, square: false });

    // Channel 2: Polling (ป้องกันข้อความหลุด)
    const polling = client.base.createPolling();
    (async () => {
        while (true) {
            try {
                await polling.poll();
            } catch (pollErr) {
                console.error("Polling retry:", pollErr.message);
            }
            await new Promise(r => setTimeout(r, 200));
        }
    })();

    console.log("✅ Self-Bot พร้อมทำงานแล้ว!");
}

startBot().catch(console.error);
```

---

## 4. การส่งข้อความ (Text / DM)

### ส่งข้อความธรรมดาในกลุ่ม
```javascript
await client.base.talk.sendMessage({
    to: groupMid,       // ID กลุ่ม (เช่น c0e40c2f...)
    text: "สวัสดีทุกคน 👋",
    contentType: "NONE",
    e2ee: false
});
```

### ส่ง DM ส่วนตัวหาผู้ใช้ (พร้อม E2EE Fallback)
```javascript
async function sendDM(client, targetUserMid, messageText) {
    try {
        // พยายามส่งแบบ E2EE ก่อน
        await client.base.talk.sendMessage({
            to: targetUserMid,
            text: messageText,
            contentType: "NONE",
            e2ee: true
        });
        console.log("✅ ส่ง DM สำเร็จ (E2EE)");
    } catch (e2eeErr) {
        console.log("⚠️ E2EE ล้มเหลว ลองส่ง Plain Text...");
        try {
            await client.base.talk.sendMessage({
                to: targetUserMid,
                text: messageText,
                contentType: "NONE",
                e2ee: false
            });
            console.log("✅ ส่ง DM สำเร็จ (Plain Text)");
        } catch (plainErr) {
            console.error("❌ ส่ง DM ล้มเหลวทั้งสองโหมด:", plainErr.message);
        }
    }
}
```

---

## 5. การส่ง Flex Message ผ่าน LIFF

Self-Bot เป็นบัญชีผู้ใช้ธรรมดา ไม่สามารถส่ง Flex Message ยิงเข้า API ตรง ๆ ได้ ต้องใช้ **LIFF App** เป็นตัวกลาง

### ⚙️ ขั้นตอนเตรียม LIFF
1. ไปที่ **LINE Developers Console** → สร้าง LINE Login Channel
2. สร้าง **LIFF App** 1 ตัว
3. ตั้งค่า Scopes: `profile` และ `chat_message.write`
4. บันทึก `LIFF_ID` ใส่ใน `.env`

### 💻 ฟังก์ชันส่ง Flex Message ผ่าน LIFF
```javascript
const fetch = require("node-fetch");

async function sendFlexMessageViaLiff(client, targetChatMid, flexPayload) {
    const liffId = process.env.LIFF_ID;
    if (!liffId) {
        console.error("❌ ไม่พบ LIFF_ID ใน .env");
        return false;
    }

    try {
        // 1. แลก LiffToken สำหรับกลุ่มปลายทาง
        const liffTokenResult = await client.base.talk.issueLiffView({
            request: {
                liffId: liffId,
                context: {
                    chat: {
                        chatMid: targetChatMid
                    }
                }
            }
        });

        const liffToken = liffTokenResult?.accessToken;
        if (!liffToken) {
            throw new Error("Failed to get LiffToken");
        }

        // 2. ส่ง Flex Message ผ่าน LIFF API
        const response = await fetch("https://api.line.me/message/v3/share", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${liffToken}`
            },
            body: JSON.stringify({
                messages: [flexPayload]
            })
        });

        if (response.ok) {
            console.log("✅ ส่ง Flex Message สำเร็จ!");
            return true;
        } else {
            const err = await response.json();
            console.error("❌ LIFF API ปฏิเสธ:", JSON.stringify(err));
            return false;
        }
    } catch (err) {
        console.error("❌ ส่ง Flex Message ล้มเหลว:", err.message);
        return false;
    }
}
```

### ตัวอย่างการเรียกใช้
```javascript
const flexCard = {
    type: "flex",
    altText: "การแจ้งเตือน",
    contents: {
        type: "bubble",
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: "สวัสดีครับ 🤖",
                    weight: "bold",
                    size: "xl"
                }
            ]
        }
    }
};

await sendFlexMessageViaLiff(client, groupMid, flexCard);
```

---

## 6. การเชื่อมต่อ Supabase (ถ้าต้องใช้ฐานข้อมูล)

### 📦 เพิ่ม dependency
```bash
npm install @supabase/supabase-js
```

### 📄 db.js
```javascript
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
```

### ตัวอย่าง: บันทึกข้อความลงฐานข้อมูล
```javascript
const supabase = require("./db");

// ใน event listener
async function saveMessage(senderMid, text, chatMid) {
    const { error } = await supabase
        .from("messages")
        .insert({
            sender_mid: senderMid,
            chat_mid: chatMid,
            text: text,
            created_at: new Date().toISOString()
        });
    if (error) console.error("Save error:", error.message);
}
```

---

## 7. การรันบน VPS (PM2)

### ติดตั้ง PM2
```bash
npm install -g pm2
```

### รัน Self-Bot ด้วย PM2
```bash
pm2 start bot.js --name self-bot
pm2 save
pm2 startup  # ตั้งให้รันอัตโนมัติเมื่อเครื่องรีบูต
```

### ดู Log
```bash
pm2 logs self-bot
```

### รีสตาร์ท
```bash
pm2 restart self-bot
```

---

## 8. กฎเหล็กและข้อควรระวัง (Critical Rules)

### ⚠️ 1. ห้ามใช้บัญชี LINE หลัก
LINE อาจแบนบัญชีที่ใช้เป็น Self-Bot ได้ แนะนำให้สร้างบัญชีใหม่เฉพาะสำหรับรันบอท

### ⚠️ 2. Session Token มีอายุ
หากบอทหยุดทำงานหรือพบ Error การล็อกอิน ให้ลบไฟล์ `storage.json` แล้วล็อกอินใหม่

### ⚠️ 3. Flex Message Schema เข้มงวด
LINE ตรวจ JSON Schema ของ Flex Message อย่างเข้มงวด ห้ามใส่ฟิลด์ที่ไม่มีในคู่มือ API เช่น `marginAll`, `marginHorizontal`, `border: 'none'`

**กฎสำคัญ:**
- `type: 'box'` ที่ว่างเปล่า **ต้องมี** `contents: []` เสมอ
- ค่า Padding/Margin ต้องเป็น `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` เท่านั้น ห้ามใช้ `10px`
- ทดสอบ Flex Message ก่อนส่งจริงเสมอ

### ⚠️ 4. ความแตกต่างของ Group ID
- **Webhook OA Bot**: ID ขึ้นต้นด้วย `C` ใหญ่ (เช่น `C5121166...`)
- **Self-Bot LINEJS**: ID ขึ้นต้นด้วย `c` เล็ก (เช่น `c0e40c2f...`)

หากต้องซิงค์ระหว่างสองระบบ ให้เก็บทั้งสอง ID ในฐานข้อมูลแล้วแมปผ่าน `group_name` หรือฟิลด์อ้างอิง

### ⚠️ 5. E2EE DM Fallback
ผู้ใช้ปลายทางอาจเปิด E2EE ไว้ ต้องมี try-catch fallback ส่งเป็น Plain Text เสมอ (ดูตัวอย่างในหัวข้อ 4)

---

## 9. Event Types ที่ใช้บ่อย

| Type | ชื่อ | คำอธิบาย |
|------|------|----------|
| 26 | RECEIVE_MESSAGE | รับข้อความใหม่ |
| 13 | NOTIFIED_LEAVE_GROUP | มีคนออกจากกลุ่ม/ถูกเตะ |
| 11 | NOTIFIED_INVITE_INTO_GROUP | มีคนถูกเชิญเข้ากลุ่ม |
| 19 | NOTIFIED_UPDATE_GROUP | ข้อมูลกลุ่มเปลี่ยนแปลง (ชื่อ, รูป) |
| 25 | SEND_MESSAGE | ข้อความที่บอทส่งเอง |

```javascript
client.on("update", async (op) => {
    switch (Number(op.type)) {
        case 26: // RECEIVE_MESSAGE
            // รับข้อความ
            break;
        case 13: // NOTIFIED_LEAVE_GROUP
            // มีคนถูกเตะ
            break;
        case 11: // NOTIFIED_INVITE_INTO_GROUP
            // มีคนถูกเชิญ
            break;
    }
});
```

---

## 10. สรุป Checklist การสร้าง Self-Bot ใน Project ใหม่

- [ ] สร้างโฟลเดอร์โปรเจกต์และ `package.json`
- [ ] ติดตั้ง `@evex/linejs` และ `dotenv`
- [ ] สร้างบัญชี LINE ใหม่เฉพาะสำหรับบอท
- [ ] สร้าง `.env` และใส่ `LIFF_ID` (ถ้าต้องส่ง Flex Message)
- [ ] คัดลอกโค้ดจากหัวข้อ 3 ไปเป็น `bot.js`
- [ ] รัน `npm start` แล้วสแกน QR Code หรือกรอก PIN Code
- [ ] ตรวจสอบว่าบอทเข้าสู่ระบบสำเร็จและ `storage.json` ถูกสร้าง
- [ ] เพิ่ม Logic การจัดการคำสั่งตามต้องการ
- [ ] ติดตั้ง PM2 สำหรับรันบน VPS (ถ้าต้องการรัน 24/7)
- [ ] ทดสอบส่งข้อความและ Flex Message

---

*เขียนขึ้นเพื่อให้ผู้พัฒนาและ AI Agent ได้นำไปสร้าง LINE Self-Bot ใน project ใหม่ได้ทันที โดยไม่ต้องอ้างอิงระบบอื่น*
