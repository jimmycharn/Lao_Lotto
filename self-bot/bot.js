const { loginWithAuthToken, loginWithQR } = require("@evex/linejs");
const fs = require("fs");
const fetch = require("node-fetch");
require("dotenv").config();
const supabase = require("./db");

let STORAGE_FILE = "./storage.json";
if (!fs.existsSync(STORAGE_FILE) && fs.existsSync("./storage_a.json")) {
    try {
        fs.copyFileSync("./storage_a.json", STORAGE_FILE);
        console.log("📋 คัดลอกข้อมูลล็อกอินจาก storage_a.json เป็น storage.json สำเร็จ");
    } catch (e) {}
}

let storageData = {};
if (fs.existsSync(STORAGE_FILE)) {
    try { storageData = JSON.parse(fs.readFileSync(STORAGE_FILE)); } catch (e) {}
}

const storage = {
    set: async (key, value) => {
        storageData[key] = value;
        try {
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(storageData, null, 2));
        } catch (e) {}
    },
    get: async (key) => {
        return storageData[key];
    }
};

// ─── Helper: Send Flex Message via LIFF ──────────────────────────────────────
async function sendFlexMessageViaLiff(client, targetChatMid, flexPayload) {
    const liffId = process.env.LIFF_ID;
    if (!liffId) {
        console.warn("⚠️ LIFF_ID not set in .env. Falling back to plain text.");
        return false;
    }

    try {
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
            console.log(`✅ [Self-Bot] Flex Message sent via LIFF to ${targetChatMid}`);
            return true;
        } else {
            const err = await response.json();
            console.error("❌ [Self-Bot] LIFF API error:", JSON.stringify(err));
            return false;
        }
    } catch (err) {
        console.error("❌ [Self-Bot] Flex Message via LIFF failed:", err.message);
        return false;
    }
}

// ─── Helper: Extract Text from Flex Payload ──────────────────────────────────
function extractTextFromFlex(payload) {
    if (typeof payload === 'string') return payload;
    if (payload?.altText) return payload.altText;
    if (payload?.text) return payload.text;
    return "📢 [การแจ้งเตือนจากระบบ]";
}

// ─── Queue Processor: Poll & Process self_bot_push_queue ──────────────────────
async function processPushQueue(client) {
    try {
        const { data: queueItems, error } = await supabase
            .from("self_bot_push_queue")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(10);

        if (error || !queueItems || queueItems.length === 0) return;

        for (const item of queueItems) {
            console.log(`🚀 [Self-Bot] Processing queue item ${item.id} for group ${item.target_line_group_id}`);
            
            await supabase
                .from("self_bot_push_queue")
                .update({ status: "processing" })
                .eq("id", item.id);

            let success = false;
            let errorMsg = null;

            try {
                const chatMid = item.target_line_group_id;
                const payload = item.message_payload;

                if (item.message_type === 'flex') {
                    success = await sendFlexMessageViaLiff(client, chatMid, payload);
                    if (!success) {
                        const text = extractTextFromFlex(payload);
                        await client.sendCompactMessage(chatMid, text);
                        success = true;
                    }
                } else {
                    const text = typeof payload === 'string' ? payload : (payload.text || JSON.stringify(payload));
                    await client.sendCompactMessage(chatMid, text);
                    success = true;
                }
            } catch (sendErr) {
                console.error(`❌ [Self-Bot] Failed to send message for queue item ${item.id}:`, sendErr.message);
                errorMsg = sendErr.message;
            }

            if (success) {
                await supabase
                    .from("self_bot_push_queue")
                    .update({ status: "completed", processed_at: new Date().toISOString() })
                    .eq("id", item.id);
            } else {
                await supabase
                    .from("self_bot_push_queue")
                    .update({ status: "failed", error_message: errorMsg, processed_at: new Date().toISOString() })
                    .eq("id", item.id);
            }
        }
    } catch (queueErr) {
        console.error("❌ Error processing self_bot_push_queue:", queueErr.message || queueErr);
    }
}

// ─── Main Self-Bot Initialization ────────────────────────────────────────────
async function startBot() {
    console.log("🤖 กำลังเริ่มต้น LINE Self-Bot...");

    let client;
    const existingAuthToken = storageData.authToken;

    if (existingAuthToken) {
        console.log("🔑 พบ Auth Token เดิม กำลังเข้าสู่ระบบ...");
        try {
            client = await loginWithAuthToken(existingAuthToken, { device: 'DESKTOPWIN', storage });
        } catch (authErr) {
            console.warn("⚠️ Auth Token เดิมหมดอายุ หรือใช้งานไม่ได้ กำลังเริ่มสแกน QR Code ใหม่...");
            client = null;
        }
    }

    if (!client) {
        console.log("📱 กำลังเตรียม QR Code สำหรับเข้าสู่ระบบ...");
        client = await loginWithQR({
            onReceiveQRUrl: (qrUrl) => {
                console.log(`========================================`);
                console.log(`📸 สแกน QR Code นี้เพื่อล็อกอิน: ${qrUrl}`);
                console.log(`========================================`);
            },
            onPincodeRequest: (pincode) => {
                console.log(`========================================`);
                console.log(`🔑 กรุณากรอกรหัส Pincode บนโทรศัพท์: ${pincode}`);
                console.log(`========================================`);
            }
        }, { device: 'DESKTOPWIN', storage });
    }

    const myProfile = await client.getMyProfile();
    console.log(`🚀 เข้าสู่ระบบสำเร็จ! Self-Bot ชื่อ: ${myProfile.displayName}`);

    // Listen to talk events
    client.on("message", async (msg) => {
        try {
            if (msg && msg.text && msg.text.toLowerCase() === "hello selfbot") {
                await client.sendCompactMessage(msg.to, "สวัสดีครับ! บอท Self-Bot พร้อมทำหน้าที่แจ้งเตือนแทนแล้วครับ 🤖");
            }
        } catch (err) {
            console.error("Error handling message:", err.message);
        }
    });

    client.listen({ talk: true, square: false });

    // Start Polling for Self-Bot Push Queue every 3 seconds
    setInterval(() => {
        processPushQueue(client);
    }, 3000);

    console.log("✅ Self-Bot พร้อมทำงานและคอยประมวลผลข้อความ Push Fallback แล้ว!");
}

startBot().catch(console.error);
