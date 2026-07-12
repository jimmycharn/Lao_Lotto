# Design Spec: ระบบออโตเมชั่นหวยอัตโนมัติครบวงจร (Lottery Automation System Design)

เอกสารการออกแบบฉบับนี้มีวัตถุประสงค์เพื่อกำหนดโครงสร้างสถาปัตยกรรม ฐานข้อมูล และการทำงานของระบบทำงานอัตโนมัติสำหรับเจ้ามือหวย (Dealer Automation) ซึ่งครอบคลุมระบบงานเปิด/ปิดงวดอัตโนมัติ การส่งรายงานและคัดแยกข้อความรายกลุ่มแชท LINE การคำนวณและตีเลขออกอัตโนมัติ ตลอดจนการดึงผลรางวัลด้วย AI และแจ้งผู้ได้รับรางวัลประจำงวด

---

## 1. เป้าหมายของระบบ (System Goals)
1. **ลดภาระงานของเจ้ามือ:** สร้างงวดหวย แจ้งเตือนลูกค้า ตีเลขออก และค้นหาประกาศผลรางวัลโดยที่เจ้ามือไม่ต้องกดดำเนินการเอง
2. **คัดแยกการแจ้งเตือนตามห้องกลุ่มแชท (Granular LINE Messaging Rules):** เลือกได้อิสระว่าแชทห้องใดรับข้อมูลแบบไหน (ข้อมูลแจ้งเตือนทั่วไป, เลขตีออกของเจ้ามือ, ยอดสรุปปิดงวด, หรือผลรางวัล)
3. **ระบบค้นหาและจำเว็บรางวัลของ AI (Centralized AI Crawler with Source Memory):** ค้นหาผลหวยผ่าน OpenRouter โดยจดจำลิงก์เว็บไซต์ที่เคยสำเร็จในอดีตมาเสิร์ชก่อนเพื่อความถูกต้องและประหยัด API Token
4. **คำสั่ง LINE อำนวยความสะดวก:** สั่งคำนวณและส่งแจ้งรายงานสรุปผู้โชคดีรางวัลลงแยกแต่ละกลุ่มลูกค้าผ่านคำสั่งแชท `/แจ้งผล [งวดวันที่]`

---

## 2. โครงสร้างฐานข้อมูลที่เพิ่มเติม (Database Schema Updates)

### 2.1 ตาราง `dealer_lottery_templates` (อัปเดตเพิ่มเติม)
เพิ่มฟิลด์เกี่ยวกับการรันตารางเวลาและการทำงานอัตโนมัติ:
```sql
ALTER TABLE public.dealer_lottery_templates
    ADD COLUMN IF NOT EXISTS is_auto_round_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'weekly', -- 'weekly', 'monthly'
    ADD COLUMN IF NOT EXISTS schedule_days JSONB DEFAULT '[]'::jsonb, -- รายสัปดาห์: [1,2,3,4,5] | รายเดือน: [1, 15, "last"]
    ADD COLUMN IF NOT EXISTS close_day_offset INTEGER NOT NULL DEFAULT 0, -- 0 = ปิดวันเดียวกัน, 1 = ปิดวันถัดไป
    ADD COLUMN IF NOT EXISTS auto_layoff_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_layoff_method TEXT NOT NULL DEFAULT 'limits', -- 'limits', 'formula', 'ai'
    ADD COLUMN IF NOT EXISTS auto_layoff_keep_amount NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_import_result_enabled BOOLEAN NOT NULL DEFAULT false;
```

### 2.2 ตาราง `line_groups` (อัปเดตเพิ่มเติม)
เพิ่มฟิลด์ประเภทการกระจายแจ้งข่าวสารแยกรายห้องกลุ่ม:
```sql
ALTER TABLE public.line_groups
    ADD COLUMN IF NOT EXISTS notify_round_created BOOLEAN NOT NULL DEFAULT false, -- แจ้งเตือนเมื่อเปิดงวดใหม่
    ADD COLUMN IF NOT EXISTS notify_admin_alerts BOOLEAN NOT NULL DEFAULT false, -- รับแจ้งข้อมูลแอดมิน/ข้อผิดพลาดระบบ
    ADD COLUMN IF NOT EXISTS notify_layoff_bets BOOLEAN NOT NULL DEFAULT false, -- รับข้อความเลขตีออก (เลขส่วนเกินที่ส่งต่อ)
    ADD COLUMN IF NOT EXISTS notify_round_summary BOOLEAN NOT NULL DEFAULT false, -- รับสรุปโพยปิดงวด (เลขรวม, เหลือ, ตีออก, คนส่ง)
    ADD COLUMN IF NOT EXISTS notify_lottery_results BOOLEAN NOT NULL DEFAULT false; -- รับผลรางวัลหวยและรายงานผู้ชนะ
```

### 2.3 ตารางผลรางวัลรวมศูนย์ของระบบ `central_lottery_results` (สร้างใหม่)
```sql
CREATE TABLE IF NOT EXISTS public.central_lottery_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lottery_type TEXT NOT NULL,
    round_date DATE NOT NULL,
    win_number_3_top TEXT,
    win_number_2_bottom TEXT,
    win_number_3_tod TEXT,
    win_number_all JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lottery_type, round_date)
);

-- RLS Policies
ALTER TABLE public.central_lottery_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can select central results" ON public.central_lottery_results FOR SELECT USING (true);
CREATE POLICY "Service role can manage central results" ON public.central_lottery_results FOR ALL USING (true) WITH CHECK (true);
```

### 2.4 ตารางจำแหล่งที่มาข้อมูลของ AI `central_lottery_sources` (สร้างใหม่)
```sql
CREATE TABLE IF NOT EXISTS public.central_lottery_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lottery_type TEXT NOT NULL,
    source_url TEXT NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lottery_type, source_url)
);

-- RLS Policies
ALTER TABLE public.central_lottery_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can select sources" ON public.central_lottery_sources FOR SELECT USING (true);
CREATE POLICY "Service role can manage sources" ON public.central_lottery_sources FOR ALL USING (true) WITH CHECK (true);
```

### 2.5 ตารางจ็อบและสถิติค้นหารางวัล `central_ai_search_jobs` (สร้างใหม่)
```sql
CREATE TABLE IF NOT EXISTS public.central_ai_search_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lottery_type TEXT NOT NULL,
    round_date DATE NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lottery_type, round_date)
);

-- RLS Policies
ALTER TABLE public.central_ai_search_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can select search jobs" ON public.central_ai_search_jobs FOR SELECT USING (true);
CREATE POLICY "Service role can manage search jobs" ON public.central_ai_search_jobs FOR ALL USING (true) WITH CHECK (true);
```

---

## 3. สถาปัตยกรรมส่วนควบคุมและตรรกะระบบ (System Workers & Logical Flow)

### 3.1 งานเปิดงวดอัตโนมัติ (Worker: Auto Creator)
* **การสั่งงาน:** pg_cron รันงาน `process_scheduled_round_creation()` ทุกวันเวลา 00:05 น. (หรือทุกชั่วโมง)
* **ตรรกะการรัน:**
  1. ดึงเทมเพลตที่เปิดใช้งาน `is_auto_round_enabled = true`
  2. สำหรับแต่ละเทมเพลต คำนวณหา "งวดที่จะต้องเปิด" ที่กำลังจะถึง (เช่น วันนี้ หรือวันพรุ่งนี้ตามปฏิทินเงื่อนไข)
     * หากระบุ `"last"` ใน `schedule_days` ของโหมดรายเดือน: ใช้โค้ดเช็คปีและเดือนเพื่อหาวันสุดท้ายของเดือนนั้น ๆ
  3. ตรวจสอบว่ามีรายการ `lottery_rounds` ที่ `dealer_id`, `lottery_type`, และ `round_date` ตรงกันแล้วหรือยัง
  4. หากยังไม่มี:
     * สร้างงวดหวยใหม่
     * นำเข้าวงเงินและเวลาปิดรับสำหรับ `type_limits`
     * เรียกใช้งานบอต LINE ยิงประกาศ Flex Message เข้าห้องแชทที่มีการเปิดใช้งาน `notify_round_created = true`

### 3.2 งานปิดรับแทง สรุปยอด และตีเลขออกอัตโนมัติ (Worker: Auto Close & Layoff)
* **การสั่งงาน:** ต่อยอดระบบ `process_due_round_closures` ของ `pg_cron` ที่รันทุก 1 นาที
* **ตรรกะการรัน:**
  1. เมื่อตรวจพบงวดที่มีเวลา `close_time <= now()` และสถานะเป็น `open`
  2. อัปเดตสถานะงวดเป็น `closed`
  3. **แจ้งเตือนสรุปโพยเมื่อปิดงวด (ถ้าเปิด `notify_round_summary`):**
     * คำนวณ ยอดรวมบิล, ยอดคงเหลือ, รายชื่อคนส่งโพย
     * ส่งสรุปข้อมูลไปยังกลุ่มไลน์แชทที่เลือกเปิด `notify_round_summary = true`
  4. **ตรรกะคำนวณและส่งเลขตีออกอัตโนมัติ (ถ้าเปิด `auto_layoff_enabled`):**
     * ดึงโพยทั้งหมดมารวมยอดและคำนวณเลขส่วนเกินผ่าน [layoffCalculator.ts](file:///f:/Web%20App/Lao_Lotto/supabase/functions/line-bot/layoffCalculator.ts) ตามเงื่อนไขของเจ้ามือ (Limits / Formula / AI)
     * เก็บประวัติการตีเลขออกลงฐานข้อมูล
     * จัดทำ Flex Message แสดงเลขตีออกส่งไปยังห้องกลุ่มที่เปิด `notify_layoff_bets = true` เพื่อให้เจ้ามือคนอื่นมารับโพยต่อได้

### 3.3 ตัววิเคราะห์ค้นหาผลรางวัลและจำลิงก์ (Worker: Centralized AI Crawler)
* **การสั่งงาน:** pg_cron รันคำสั่ง `process_centralized_result_crawler()` ทุก 10 นาที
* **ตรรกะการรัน:**
  1. ดึงรายการในตาราง `central_ai_search_jobs` ที่ค้างอยู่ (`pending` หรือ `running`) และงวดพ้นปิดรับไปแล้ว 15 นาทีขึ้นไป
  2. ส่งคำสั่งไปยัง OpenRouter API โดยเปิดใช้งานโหมด Web Search/Grounding:
     * ให้ดึงประวัติ URL ยอดฮิตจาก `central_lottery_sources` ประจำหวยประเภทนั้นเพื่อแนบไปกับ Prompt
     * สั่งให้ค้นหาผลรางวัล และดึงผลพร้อมลิงก์เว็บที่เจอล่าสุดกลับมาเป็น JSON
  3. **ถ้าสำเร็จ:**
     * บันทึกผลรางวัลลงในตาราง `central_lottery_results`
     * อัปเดต/บันทึกลิงก์ URL เข้าตาราง `central_lottery_sources` (เพิ่ม `success_count` ขึ้น 1)
     * ดำเนินการออโต้พอร์ตผล: ดึงงวดหวยของดีลเลอร์ทุกคนในวันนั้นที่เลือก `auto_import_result_enabled = true` มาอัปเดตผลรางวัลกลางเข้าไป จากนั้นทำการคำนวณหาผู้ชนะโพยและจ่ายเครดิต
     * ประกาศรายงานผู้โชคดีและยอดจ่ายลงห้องแชทของเจ้ามือที่เปิด `notify_lottery_results = true`
  4. **ถ้าล้มเหลว:**
     * เพิ่มรอบ `retry_count` ขึ้น 1 ครั้ง
     * หากถึง `max_retries` แล้วยังไม่เจอกลางผลรางวัล เปลี่ยนสถานะจ็อบเป็น `failed` และยิงข้อความเตือนเข้ากลุ่มแอดมินระบบหลัก (Superadmin) ที่เปิดปุ่ม `notify_admin_alerts = true`

### 3.4 คำสั่งไลน์ `/แจ้งผล [งวดวันที่]`
* **ตรรกะการทำงาน:**
  1. รับข้อความไลน์วิเคราะห์ด้วย Date-Time Parser หาผลลัพธ์วด ค.ศ.
  2. ตรวจสอบว่าห้องกลุ่มแชทที่พิมพ์ส่งมานั้นผูกกับเจ้ามือ (Dealer) และประเภทหวยใด
  3. ตรวจสอบว่าเจ้ามือรายนั้นมีงวดหวยของวันนั้นปิดและคำนวณผลรางวัลแล้วหรือไม่
  4. ดึงเฉพาะยอดการถูกรางวัลของ **"สมาชิกที่อยู่ในห้องกลุ่มแชทนั้น"**
  5. เรียบเรียงเป็น Flex Message ประกาศผลผู้โชคดีประจำงวดของกลุ่มและโพสต์เข้าห้องแชททันที

---

## 4. แผนงานปรับปรุงหน้าจอผู้ใช้ (Web Dashboard UI Changes)

1. **ส่วนการจัดการ LINE Groups (แอดมินกลุ่มไลน์):**
   * เพิ่มส่วนแสดงสวิตช์เปิด-ปิดความรับผิดชอบของกลุ่มหวยแต่ละห้อง (สร้างงวดใหม่, สรุปโพย, เลขตีออก, ผลรางวัล, แจ้งเตือนระบบ)
2. **ส่วนการจัดการ Template และสร้างงวด:**
   * เพิ่มส่วนการเลือกความถี่ในการสร้างงวดอัตโนมัติ (เลือกรายวัน สัปดาห์ หรือวันระบุในเดือน)
   * เพิ่มปุ่มตั้งค่าและวิธีการตีเลขออกอัตโนมัติ และสวิตช์เปิดดึงผลรางวัลกลางอัตโนมัติ (Auto Import)
