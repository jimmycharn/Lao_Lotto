# LINE Bot + Supabase Edge Functions + Frontend Integration Skill

This skill provides a complete, reusable architecture and blueprint for integrating a **LINE Bot** (using Messaging API) with **Supabase Edge Functions** (Deno/TS), a **PostgreSQL Database** (RLS policies, triggers, indexes), and a **React Frontend Dashboard**.

This pattern is highly robust and avoids complex third-party tools or heavy login flows (like LIFF) for user group binding by using a **dashboard-generated alphanumeric binding code (`BG-XXXXXX`)** that is entered directly into the LINE group.

---

## 1. Architecture Overview

```
┌──────────────────┐               Webhook HTTPS                ┌─────────────────────────┐
│                  │ ─────────────────────────────────────────> │   Supabase Edge Func    │
│  LINE Group / DM │                                            │      (Deno Router)      │
│                  │ <───────────────────────────────────────── │                         │
└──────────────────┘            Reply API (Messaging)           └────────────┬────────────┘
         ▲                                                                   │
         │                                                                   │ Service Role (Bypass RLS)
         │                                                                   ▼
         │                                                      ┌─────────────────────────┐
         │              Supabase Auth / client API              │    Supabase Database    │
         └───────────────────────────────────────────────────── │     (PostgreSQL RLS)    │
                                                                └────────────▲────────────┘
                                                                             │
                                                                             │ Direct SQL / Client
                                                                ┌────────────┴────────────┐
                                                                │   React Web Frontend    │
                                                                │   (Dealer Dashboard)    │
                                                                └─────────────────────────┘
```

### Components
1. **LINE Webhook**: LINE events (messages, joins) send HTTP POST requests to the Supabase Edge Function.
2. **Supabase Edge Function (`line-bot`)**: Handles signature verification, routes commands, manages database transactions, and replies via the LINE API.
3. **Database Schema**: Tracks LINE groups, managers/admins, permissions, and group members.
4. **React Frontend**: Allows the group owner (dealer) to generate binding codes, manage manager list/permissions, and configure group-specific options.

---

## 2. Database Schema (Postgres Migration)

Run this SQL migration to initialize the database tables, indices, Row Level Security (RLS) policies, and automatic `updated_at` triggers.

```sql
-- ==============================================================
-- 1. Extend profiles to support LINE user identification
-- ==============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS line_user_id TEXT UNIQUE;

-- ==============================================================
-- 2. Create line_groups table
-- ==============================================================
CREATE TABLE IF NOT EXISTS line_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id TEXT UNIQUE NOT NULL, -- Starts with C... (Group) or R... (Room) or U... (User)
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lottery_type TEXT DEFAULT 'lao', -- Group-specific default config
    group_name TEXT, -- Synced display name of the LINE group
    binding_code TEXT UNIQUE, -- e.g., 'BG-ABCXYZ' (set to NULL or kept after binding)
    member_permissions JSONB DEFAULT '{"bet": true, "summary": true, "total": true, "cancel": true, "bill": true, "link": true, "help": true}'::jsonb NOT NULL,
    allow_staff_bet BOOLEAN DEFAULT TRUE NOT NULL,
    staff_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Representative account for group bets
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_groups_line_group_id ON line_groups(line_group_id);
CREATE INDEX IF NOT EXISTS idx_line_groups_dealer_id ON line_groups(dealer_id);
CREATE INDEX IF NOT EXISTS idx_line_groups_binding_code ON line_groups(binding_code);

-- ==============================================================
-- 3. Create line_managers table (Staff with custom permissions)
-- ==============================================================
CREATE TABLE IF NOT EXISTS line_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL, -- Starts with U...
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'manager', -- 'admin' or 'manager'
    permissions JSONB DEFAULT '{}'::jsonb NOT NULL, -- e.g., {"can_view_stats": true, "can_transfer": true}
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(dealer_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_line_managers_dealer_id ON line_managers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_line_managers_line_user_id ON line_managers(line_user_id);

-- ==============================================================
-- 4. Create line_group_members table (Captured group members)
-- ==============================================================
CREATE TABLE IF NOT EXISTS line_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id TEXT NOT NULL REFERENCES line_groups(line_group_id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Maps to main account if linked
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(line_group_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_line_group_members_group_id ON line_group_members(line_group_id);
CREATE INDEX IF NOT EXISTS idx_line_group_members_user_id ON line_group_members(user_id);

-- ==============================================================
-- 5. Row Level Security (RLS) Policies
-- ==============================================================
ALTER TABLE line_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_group_members ENABLE ROW LEVEL SECURITY;

-- Dealers & Superadmins manage their own groups
CREATE POLICY "Dealers and Superadmins can manage line groups" ON line_groups
    FOR ALL USING (
        auth.uid() = dealer_id
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Dealers & Superadmins manage their managers
CREATE POLICY "Dealers and Superadmins can manage line managers" ON line_managers
    FOR ALL USING (
        auth.uid() = dealer_id
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Dealers & Superadmins manage captured group members
CREATE POLICY "Dealers and Superadmins can manage group members" ON line_group_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM line_groups lg
            WHERE lg.line_group_id = line_group_members.line_group_id
              AND (lg.dealer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'))
        )
    );

-- ==============================================================
-- 6. Reusable update_at Timestamp Trigger
-- ==============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_line_groups_updated_at BEFORE UPDATE ON line_groups FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_update_line_managers_updated_at BEFORE UPDATE ON line_managers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_update_line_group_members_updated_at BEFORE UPDATE ON line_group_members FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## 3. Supabase Edge Function Webhook Boilerplate

This Deno Edge function handles incoming LINE Bot webhook events, verifies the HMAC-SHA256 signature, processes text commands, and invokes business logic.

Deploys using:
`npx supabase functions deploy line-bot --no-verify-jwt`

### `supabase/functions/line-bot/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0"
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LINE_CHANNEL_SECRET = (Deno.env.get('LINE_CHANNEL_SECRET') || '').trim();
const LINE_CHANNEL_ACCESS_TOKEN = (Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize Supabase with Service Role to bypass RLS for internal bot transactions
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper: Verify HMAC Signature from LINE
async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(channelSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bodyData = encoder.encode(body);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, bodyData);
  const calculatedSignature = encodeBase64(new Uint8Array(signatureBuffer));
  return calculatedSignature === signature;
}

// Helper: Send reply back to LINE (supports Text or Flex Messages or Array of Messages)
async function sendLineReply(replyToken: string, messagesPayload: string | object | Array<any>): Promise<any> {
  let messages: Array<any> = [];
  if (typeof messagesPayload === 'string') {
    messages = [{ type: 'text', text: messagesPayload }];
  } else if (Array.isArray(messagesPayload)) {
    messages = messagesPayload;
  } else {
    messages = [messagesPayload];
  }

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[LINE REPLY ERROR] Status: ${response.status}`, errorBody);
    throw new Error(`LINE API replied with status ${response.status}`);
  }
  return response.json();
}

// Helper: Fetch real LINE Group Name (Requires Bot to be in the group)
async function fetchGroupName(groupId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      return data.groupName || null;
    }
  } catch (e) {
    console.error('Failed to fetch group name:', e);
  }
  return null;
}

// Main Webhook Handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const bodyText = await req.text();

    // 1. Check if Frontend JSON API calls are triggering actions
    let isApiCall = false;
    let apiPayload: any = null;
    try {
      apiPayload = JSON.parse(bodyText);
      if (apiPayload && apiPayload.action) {
        isApiCall = true;
      }
    } catch (_) {}

    if (isApiCall) {
      return await handleFrontendApiCall(req, apiPayload);
    }

    // 2. Otherwise process LINE Webhook
    const signature = req.headers.get('x-line-signature') || '';
    if (LINE_CHANNEL_SECRET) {
      const isValid = await verifySignature(bodyText, signature, LINE_CHANNEL_SECRET);
      if (!isValid) {
        console.warn("Invalid LINE signature detected");
        return new Response('Invalid signature', { status: 401 });
      }
    }

    const payload = JSON.parse(bodyText);
    const events = payload.events || [];

    for (const event of events) {
      const replyToken = event.replyToken;
      if (!replyToken && event.type !== 'memberLeft' && event.type !== 'leave') continue;

      const userId = event.source?.userId || '';
      const groupId = event.source?.groupId || event.source?.roomId || userId;
      const isGroup = groupId.startsWith('C') || groupId.startsWith('R');

      // --- Track Group Members dynamically ---
      if (userId && isGroup) {
        // Run in background: upsert display name in database
        captureGroupMember(groupId, userId).catch(e => console.error("captureGroupMember error:", e));
      }

      // --- Handle Group Join Event ---
      if (event.type === 'join') {
        const welcome = `สวัสดีครับ! ยินดีต้อนรับสู่ระบบ LINE Bot 🤖\n\nกรุณาพิมพ์:\n/bind [รหัสผูกกลุ่ม]\n\nเพื่อเชื่อมต่อกลุ่มแชทนี้เข้ากับระบบของคุณครับ`;
        await sendLineReply(replyToken, welcome);
        continue;
      }

      // --- Handle Text Messages ---
      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text.trim();
        await routeCommand(replyToken, text, groupId, userId, isGroup);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[WEBHOOK ERROR]', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Dynamic Member capture helper
async function captureGroupMember(groupId: string, userId: string) {
  // Fetch name from LINE Profile API
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
      headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      const displayName = data.displayName || 'Unidentified Member';
      
      // Upsert into DB
      await supabase
        .from('line_group_members')
        .upsert({
          line_group_id: groupId,
          line_user_id: userId,
          display_name: displayName,
          updated_at: new Date().toISOString()
        }, { onConflict: 'line_group_id,line_user_id' });
    }
  } catch (err) {
    console.error(`Failed to capture LINE member profile: ${err}`);
  }
}

// API endpoint triggered by dashboard frontend
async function handleFrontendApiCall(req: Request, payload: any): Promise<Response> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized: missing authorization token' }), { status: 401, headers: corsHeaders });
  }

  // Validate Supabase User Token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), { status: 401, headers: corsHeaders });
  }

  if (payload.action === 'refresh_group_names') {
    // Fetch user groups and sync real names from LINE API
    const { data: groups } = await supabase.from('line_groups').select('id, line_group_id').eq('dealer_id', user.id);
    const updated = [];
    for (const g of (groups || [])) {
      if (g.line_group_id.startsWith('C') || g.line_group_id.startsWith('R')) {
        const name = await fetchGroupName(g.line_group_id);
        if (name) {
          await supabase.from('line_groups').update({ group_name: name }).eq('id', g.id);
          updated.push({ id: g.id, group_name: name });
        }
      }
    }
    return new Response(JSON.stringify({ success: true, updated }), { status: 200, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Action not supported' }), { status: 400, headers: corsHeaders });
}

// Centralized LINE Command Routing Pipeline
async function routeCommand(replyToken: string, text: string, groupId: string, userId: string, isGroup: boolean) {
  // 1. Handle /bind command (Group Binding Flow)
  if (text.startsWith('/bind ')) {
    const code = text.replace('/bind ', '').trim().toUpperCase();
    await handleGroupBinding(replyToken, code, groupId);
    return;
  }

  // 2. Fetch Group Binding
  const { data: group } = await supabase
    .from('line_groups')
    .select('*')
    .eq('line_group_id', groupId)
    .eq('is_active', true)
    .maybeSingle();

  if (!group) {
    // Unbound groups cannot access system commands
    if (text.startsWith('/') && isGroup) {
      await sendLineReply(replyToken, `⚠️ กลุ่มนี้ยังไม่ได้ทำการเชื่อมต่อกับบัญชีเจ้ามือ\nกรุณาพิมพ์ /bind [รหัสผูกกลุ่ม] เพื่อเชื่อมต่อครับ`);
    }
    return;
  }

  // 3. User Authorization Checks
  const { data: manager } = await supabase
    .from('line_managers')
    .select('*')
    .eq('dealer_id', group.dealer_id)
    .eq('line_user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  // If user is a manager/admin, route to secure dashboard controls
  const isManager = !!manager;
  const isAdmin = manager?.role === 'admin';

  // --- Example Router Dispatch ---
  if (text === '/คำสั่ง') {
    await sendHelpMessage(replyToken, isManager, isAdmin, group.member_permissions);
  } else if (text === '/ยอดสรุป') {
    if (!isManager && !group.member_permissions?.summary) {
      await sendLineReply(replyToken, '⚠️ สมาชิกทั่วไปไม่มีสิทธิ์ดูยอดสรุปในกลุ่มนี้ครับ');
      return;
    }
    await processSummary(replyToken, group);
  } else if (text.startsWith('/ยกเลิก ')) {
    if (!isManager && !group.member_permissions?.cancel) {
      await sendLineReply(replyToken, '⚠️ สมาชิกทั่วไปไม่มีสิทธิ์ยกเลิกรายการผ่าน LINE ครับ');
      return;
    }
    const targetBillId = text.replace('/ยกเลิก ', '').trim();
    await processCancelBill(replyToken, group, targetBillId, userId, isManager);
  }
}

// Group Binding Handler
async function handleGroupBinding(replyToken: string, code: string, groupId: string) {
  // Query pending group with this code
  const { data: pendingGroup, error } = await supabase
    .from('line_groups')
    .select('*')
    .eq('binding_code', code)
    .maybeSingle();

  if (error || !pendingGroup) {
    await sendLineReply(replyToken, `❌ ไม่พบรหัสผูกกลุ่ม "${code}" หรือรหัสถูกใช้งานไปแล้ว\nกรุณาตรวจสอบและสร้างรหัสใหม่จากระบบหลังบ้านครับ`);
    return;
  }

  // Fetch real group name
  const realName = await fetchGroupName(groupId) || `กลุ่มผูกรหัส ${code}`;

  // Update record to map real group ID and activate it
  const { error: updateErr } = await supabase
    .from('line_groups')
    .update({
      line_group_id: groupId,
      group_name: realName,
      binding_code: null, // Clear binding code so it can't be re-used
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', pendingGroup.id);

  if (updateErr) {
    console.error('Failed to link group:', updateErr);
    await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในระบบฐานข้อมูล ไม่สามารถผูกกลุ่มได้`);
    return;
  }

  await sendLineReply(replyToken, `✨ เชื่อมต่อสำเร็จ! ✨\n\nกลุ่ม: "${realName}"\nบัญชีระบบเชื่อมต่อสำเร็จแล้ว เจ้าหน้าที่และสมาชิกสามารถสั่งงานระบบผ่านห้องแชทนี้ได้ทันที\nพิมพ์ /คำสั่ง เพื่อดูคำสั่งทั้งหมดครับ`);
}

// Example: Send Help Flex Carousel
async function sendHelpMessage(replyToken: string, isManager: boolean, isAdmin: boolean, memberPerms: any) {
  // Return list of commands formatted nicely as LINE Flex Messages
  const helpText = `--- คำสั่ง LINE Bot ---\n\n` +
    `/คำสั่ง : แสดงคู่มือการใช้งาน\n` +
    `/ยอดสรุป : แสดงสรุปยอดคงเหลือของงวดนี้\n` +
    (isManager ? `/ยกเลิก [เลขที่บิล] : ยกเลิกบิลใบที่ระบุ\n` : '');

  await sendLineReply(replyToken, helpText);
}

async function processSummary(replyToken: string, group: any) {
  // Business logic placeholder
  await sendLineReply(replyToken, `📊 รายการสรุปยอดส่งงวดนี้ถูกส่งเรียบร้อยแล้วค่ะ`);
}

async function processCancelBill(replyToken: string, group: any, billId: string, userId: string, isManager: boolean) {
  // Business logic placeholder
  await sendLineReply(replyToken, `✅ ทำการยกเลิกบิลเลขที่ ${billId} เรียบร้อยแล้วค่ะ`);
}
```

---

## 4. Frontend Component (React Settings Tab)

Below is the design of a premium, responsive configuration tab inside the Admin Dashboard. It includes binding code generation, pending code revoking, manager CRUD, and toggling specific member commands.

### `src/components/dealer/DealerLineBotTab.jsx`

```jsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase' // path to your configured client
import { useToast } from '../../contexts/ToastContext' // context for flash alerts
import { FiPlus, FiTrash2, FiCheck, FiRefreshCw, FiCopy, FiSettings } from 'react-icons/fi'

export default function DealerLineBotTab({ user, profile }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [lineGroups, setLineGroups] = useState([])
    const [activeCode, setActiveCode] = useState(null)
    const [generatingCode, setGeneratingCode] = useState(false)
    const [managers, setManagers] = useState([])
    const [newManagerLineId, setNewManagerLineId] = useState('')
    const [newManagerNickname, setNewManagerNickname] = useState('')
    const [newManagerRole, setNewManagerRole] = useState('manager')
    const [selectedConfigGroupId, setSelectedConfigGroupId] = useState(null)

    useEffect(() => {
        if (user?.id) {
            loadInitialData()
        }
    }, [user?.id])

    const loadInitialData = async () => {
        setLoading(true)
        try {
            // 1. Sync group names from LINE API by triggering Edge Function
            await supabase.functions.invoke('line-bot', {
                body: { action: 'refresh_group_names' }
            })
        } catch (e) {
            console.warn('Sync names failed (offline/sandbox):', e)
        }
        await Promise.all([fetchLineGroups(), fetchManagers()])
        setLoading(false)
    }

    const fetchLineGroups = async () => {
        const { data, error } = await supabase
            .from('line_groups')
            .select('*')
            .eq('dealer_id', user.id)
            .order('created_at', { ascending: false })
        
        if (error) {
            toast.error('ไม่สามารถดึงข้อมูลกลุ่ม LINE ได้')
            return
        }
        setLineGroups(data || [])
        
        // Pick active group for config tab
        const active = (data || []).filter(g => !g.line_group_id.startsWith('pending') && g.line_group_id)
        if (active.length > 0) {
            setSelectedConfigGroupId(prev => prev || active[0].id)
        }

        // Check if there is an active pending binding code
        const pending = data?.find(g => g.line_group_id.startsWith('pending'))
        if (pending) {
            setActiveCode(pending.binding_code)
        } else {
            setActiveCode(null)
        }
    }

    const fetchManagers = async () => {
        const { data, error } = await supabase
            .from('line_managers')
            .select('*')
            .eq('dealer_id', user.id)
            .order('created_at', { ascending: false })
        if (error) {
            toast.error('ไม่สามารถดึงข้อมูลแอดมินกลุ่มได้')
            return
        }
        setManagers(data || [])
    }

    // Generate binding code (e.g. BG-XXXXXX)
    const handleGenerateCode = async () => {
        if (activeCode) {
            toast.warning('คุณมีรหัสผูกกลุ่มที่ยังไม่ได้ใช้งานอยู่แล้ว')
            return
        }
        setGeneratingCode(true)
        try {
            const code = 'BG-' + Math.random().toString(36).substring(2, 8).toUpperCase()
            const { error } = await supabase
                .from('line_groups')
                .insert({
                    line_group_id: 'pending-' + code,
                    dealer_id: user.id,
                    binding_code: code,
                    is_active: false
                })
            if (error) throw error
            setActiveCode(code)
            toast.success('สร้างรหัสผูกกลุ่มสำเร็จ!')
            fetchLineGroups()
        } catch (err) {
            toast.error('เกิดข้อผิดพลาดในการสร้างรหัสผูกกลุ่ม')
        } finally {
            setGeneratingCode(false)
        }
    }

    // Unbind a group or delete a pending binding code
    const handleDeleteGroup = async (groupId, bindingCode) => {
        const title = bindingCode ? 'ยกเลิกรหัสผูกกลุ่ม' : 'ยกเลิกเชื่อมโยงกลุ่ม LINE'
        const message = bindingCode 
            ? 'ต้องการลบรหัสผูกกลุ่มนี้หรือไม่? รหัสนี้จะถูกยกเลิกและใช้งานไม่ได้อีก'
            : 'ต้องการลบกลุ่มนี้ออกจากการเชื่อมโยงระบบหวยหรือไม่?'

        if (!window.confirm(`${title}\n\n${message}`)) return

        try {
            const { error } = await supabase.from('line_groups').delete().eq('id', groupId)
            if (error) throw error
            toast.success('ลบข้อมูลเรียบร้อยแล้ว')
            if (bindingCode && activeCode === bindingCode) {
                setActiveCode(null)
            }
            fetchLineGroups()
        } catch (err) {
            toast.error('เกิดข้อผิดพลาดในการลบข้อมูล')
        }
    }

    const handleUpdateLotteryType = async (groupId, type) => {
        // Optimistic UI state update
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, lottery_type: type } : g))
        const { error } = await supabase
            .from('line_groups')
            .update({ lottery_type: type, updated_at: new Date().toISOString() })
            .eq('id', groupId)
        if (error) {
            toast.error('ล้มเหลวในการตั้งค่าประเภทหวย')
            fetchLineGroups()
        } else {
            toast.success('บันทึกประเภทหวยเรียบร้อย')
        }
    }

    // Toggle member permissions
    const handleToggleMemberPermission = async (groupId, permissionKey, val) => {
        const group = lineGroups.find(g => g.id === groupId)
        if (!group) return
        const newPerms = { ...group.member_permissions, [permissionKey]: val }

        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_permissions: newPerms } : g))

        const { error } = await supabase
            .from('line_groups')
            .update({ member_permissions: newPerms, updated_at: new Date().toISOString() })
            .eq('id', groupId)
        if (error) {
            toast.error('ไม่สามารถอัปเดตสิทธิ์สมาชิกได้')
            fetchLineGroups()
        } else {
            toast.success('อัปเดตสิทธิ์การสั่งการในห้องแชทเรียบร้อย')
        }
    }

    // Add manager
    const handleAddManager = async (e) => {
        e.preventDefault()
        if (!newManagerLineId.trim() || !newManagerNickname.trim()) {
            toast.error('กรุณากรอกข้อมูลให้ครบถ้วน')
            return
        }
        try {
            const defaultPerms = newManagerRole === 'admin' 
                ? { can_view_stats: true, can_transfer: true }
                : { can_view_stats: false, can_transfer: false }

            const { error } = await supabase
                .from('line_managers')
                .insert({
                    dealer_id: user.id,
                    line_user_id: newManagerLineId.trim(),
                    nickname: newManagerNickname.trim(),
                    role: newManagerRole,
                    permissions: defaultPerms,
                    is_active: true
                })
            if (error) throw error
            toast.success('เพิ่มผู้จัดการเรียบร้อยแล้ว')
            setNewManagerLineId('')
            setNewManagerNickname('')
            setNewManagerRole('manager')
            fetchManagers()
        } catch (err) {
            toast.error('ล้มเหลวในการเพิ่มแอดมิน (อาจมี LINE User ID ซ้ำ)')
        }
    }

    // Delete manager
    const handleDeleteManager = async (id) => {
        if (!window.confirm('คุณต้องการลบผู้จัดการนี้ออกหรือไม่?')) return
        const { error } = await supabase.from('line_managers').delete().eq('id', id)
        if (error) {
            toast.error('เกิดข้อผิดพลาดในการลบผู้จัดการ')
        } else {
            toast.success('ลบผู้จัดการเรียบร้อยแล้ว')
            fetchManagers()
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">กำลังโหลดการตั้งค่า LINE Bot...</div>
    }

    const pendingCodeObj = lineGroups.find(g => g.line_group_id.startsWith('pending'))
    const activeGroups = lineGroups.filter(g => !g.line_group_id.startsWith('pending'))
    const configGroup = lineGroups.find(g => g.id === selectedConfigGroupId)

    return (
        <div className="space-y-8 p-6 bg-gray-900 text-white rounded-2xl border border-gray-800">
            {/* Section 1: Binding Codes */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    🔗 การเชื่อมต่อห้องแชทกลุ่ม LINE
                </h3>
                
                {pendingCodeObj ? (
                    <div className="p-4 bg-yellow-950 border border-yellow-700 text-yellow-300 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <span className="font-semibold text-lg block">รหัสผูกกลุ่มพร้อมใช้งาน:</span>
                            <code className="text-2xl font-mono tracking-widest text-white bg-black px-3 py-1 rounded">{pendingCodeObj.binding_code}</code>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(`/bind ${pendingCodeObj.binding_code}`)
                                    toast.success('คัดลอกคำสั่งเรียบร้อยแล้ว!')
                                }}
                                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold rounded-lg flex items-center gap-2"
                            >
                                <FiCopy /> คัดลอกคำสั่ง
                            </button>
                            <button 
                                onClick={() => handleDeleteGroup(pendingCodeObj.id, pendingCodeObj.binding_code)}
                                className="px-4 py-2 bg-red-900 hover:bg-red-800 text-white rounded-lg flex items-center gap-2"
                            >
                                <FiTrash2 /> ยกเลิกรหัส
                            </button>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleGenerateCode}
                        disabled={generatingCode}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-lg flex items-center gap-2"
                    >
                        <FiPlus /> สร้างรหัสผูกกลุ่มใหม่
                    </button>
                )}

                {/* List of Bound Groups */}
                <div className="mt-6 space-y-3">
                    <h4 className="text-gray-400 font-semibold">ห้องแชทที่เชื่อมโยงแล้ว ({activeGroups.length})</h4>
                    {activeGroups.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">ไม่มีกลุ่ม LINE ที่เชื่อมต่ออยู่ขณะนี้</p>
                    ) : (
                        <div className="grid gap-3">
                            {activeGroups.map(g => (
                                <div key={g.id} className="p-4 bg-gray-900 rounded-lg border border-gray-700 flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <p className="font-bold text-lg text-white">{g.group_name || 'กลุ่มไม่มีชื่อ'}</p>
                                        <p className="text-xs font-mono text-gray-500">{g.line_group_id}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <span className="text-xs text-gray-400 block mb-1">หวยตั้งต้น</span>
                                            <select 
                                                value={g.lottery_type}
                                                onChange={(e) => handleUpdateLotteryType(g.id, e.target.value)}
                                                className="bg-gray-800 border border-gray-700 text-sm rounded px-2 py-1"
                                            >
                                                <option value="lao">หวยลาว</option>
                                                <option value="thai">หวยไทย</option>
                                                <option value="hanoi">หวยฮานอย</option>
                                            </select>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteGroup(g.id, null)}
                                            className="p-2 bg-red-950/50 hover:bg-red-900 border border-red-800 text-red-400 rounded-lg"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Section 2: Group Settings & Permissions */}
            {configGroup && (
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        🛡️ สิทธิ์คำสั่งห้องแชท: <span className="text-indigo-400">{configGroup.group_name}</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.keys(configGroup.member_permissions).map(key => (
                            <label key={key} className="flex items-center gap-2 p-3 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={configGroup.member_permissions[key]}
                                    onChange={(e) => handleToggleMemberPermission(configGroup.id, key, e.target.checked)}
                                    className="rounded border-gray-700 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-semibold capitalize">คำสั่ง {key}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Section 3: Manager / Admin List */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    👥 รายชื่อแอดมิน LINE Bot
                </h3>

                <form onSubmit={handleAddManager} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 bg-gray-950 p-4 rounded-lg border border-gray-900">
                    <input 
                        type="text"
                        placeholder="LINE User ID (เช่น U863...)"
                        value={newManagerLineId}
                        onChange={(e) => setNewManagerLineId(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm"
                        required
                    />
                    <input 
                        type="text"
                        placeholder="ชื่อเล่น / ชื่อเรียกแอดมิน"
                        value={newManagerNickname}
                        onChange={(e) => setNewManagerNickname(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm"
                        required
                    />
                    <select
                        value={newManagerRole}
                        onChange={(e) => setNewManagerRole(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm"
                    >
                        <option value="manager">Manager (ผู้จัดการ)</option>
                        <option value="admin">Admin (ผู้ดูเเลสูงสุด)</option>
                    </select>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 font-semibold text-sm flex items-center justify-center gap-2">
                        <FiPlus /> เพิ่มผู้จัดการ
                    </button>
                </form>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-400">
                            <tr>
                                <th className="p-3">LINE User ID</th>
                                <th className="p-3">ชื่อเรียก</th>
                                <th className="p-3">ตำแหน่ง (Role)</th>
                                <th className="p-3 text-right">ดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {managers.map(m => (
                                <tr key={m.id} className="hover:bg-gray-750">
                                    <td className="p-3 font-mono text-gray-300">{m.line_user_id}</td>
                                    <td className="p-3 font-semibold">{m.nickname}</td>
                                    <td className="p-3 text-indigo-400 capitalize">{m.role}</td>
                                    <td className="p-3 text-right">
                                        <button 
                                            onClick={() => handleDeleteManager(m.id)}
                                            className="p-1.5 text-red-400 hover:text-red-300 bg-red-950/20 rounded border border-red-900/50"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {managers.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="p-4 text-center text-gray-500 italic">ยังไม่มีผู้จัดการในระบบ</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
```

---

## 5. Deployment Checklist & Best Practices

### 5.1 LINE Developers Setup
1. **Webhook URL**: Set the URL in the LINE Console to your Supabase Edge Function URL:
   `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/line-bot`
2. **Enable Webhook**: Ensure the **"Use Webhook"** setting is enabled.
3. **Disable LINE Auto Response**: Ensure **"Auto-reply messages"** and **"Greeting messages"** are disabled in the LINE Official Account Manager (settings under Response settings) so the bot only replies to structured commands.

### 5.2 Set Supabase Secrets
In your local command terminal, set the following secrets to authorize the Edge Function to invoke LINE API:
```bash
npx supabase secrets set LINE_CHANNEL_SECRET=your_channel_secret_here
npx supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
```

### 5.3 Deploying the Edge Function
Use the standard Supabase CLI to deploy without JWT requirement (since LINE events do not carry Supabase JWT tokens):
```bash
npx supabase functions deploy line-bot --no-verify-jwt
```

### 5.4 Common Pitfalls & Solutions
- **LINE Reply Timeout (3-second limit)**: LINE's Messaging API requires you to acknowledge the reply token within 3 seconds. For heavy database calculations (like calculating group reports/bills), immediately send an acknowledgment text (e.g. `กำลังประมวลผล...`) and then use the **Push Message API** (`https://api.line.me/v2/bot/message/push`) in the background to send the actual result once calculated.
- **Handling Multi-tenant Groups**: A single LINE group should only be bound to a single dealer. This is guaranteed by the `UNIQUE(line_group_id)` constraint on the `line_groups` table.
- **Binding code cleanup**: When a group is bound using `/bind BG-XXXXXX`, make sure to set the `binding_code` column back to `NULL` to prevent it from being re-used or scraped.
