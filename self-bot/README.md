# LINE Self-Bot Service (Push Fallback Notification)

บริการ LINE Self-Bot รันด้วย `@evex/linejs` สำหรับทำหน้าที่สลับส่งข้อความแจ้งเตือน (Push Message) แทน LINE Official Account อัตโนมัติเมื่อโควต้า Push Message ของ OA หมด

---

## 🛠️ การติดตั้งและการใช้งาน

### 1. ติดตั้ง Dependencies
```bash
cd self-bot
npm install
```

### 2. ตั้งค่าไฟล์ `.env`
คัดลอกไฟล์ `.env.example` เป็น `.env` แล้วใส่ข้อมูล Supabase และ LIFF ID:
```bash
cp .env.example .env
```

### 3. รัน Self-Bot ครั้งแรก (เพื่อล็อกอินสแกน QR Code / PIN Code)
```bash
npm start
```
เมื่อล็อกอินสำเร็จ ระบบจะสร้างไฟล์ `storage.json` เพื่อเก็บ Session Token สำหรับรันครั้งถัดไปอัตโนมัติ

---

## 🚀 การรันในระดับ Production ด้วย PM2

```bash
npm install -g pm2
pm2 start bot.js --name self-bot
pm2 save
pm2 startup
```

### คำสั่งจัดการ PM2
- **ดู Log:** `pm2 logs self-bot`
- **รีสตาร์ท:** `pm2 restart self-bot`
- **หยุดการทำงาน:** `pm2 stop self-bot`
