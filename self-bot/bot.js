const { Client } = require("@evex/linejs");
const fs = require("fs");
const fetch = require("node-fetch");
require("dotenv").config();
const supabase = require("./db");

const STORAGE_FILE = "./storage.json";

// ─── Storage: Session Token Storage ──────────────────────────────────────────
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

// ─── Helper: Send Flex Message via LIFF ──────────────────────────────────────
async function sendFlexMessageViaLiff(client, targetChatMid, flexPayload) {
    const liffId = process.env.LIFF_ID;
    if (!liffId) {
        console.warn("⚠️ LIFF_ID not set. Falling back to plain text.");
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
            
            // Mark processing
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
                    // Try LIFF first for Flex Message
                    success = await sendFlexMessageViaLiff(client, chatMid, payload);
                    if (!success) {
                        // Fallback to text message
                        const text = extractTextFromFlex(payload);
                        await client.base.talk.sendMessage({
                            to: chatMid,
                            text: text,
                            contentType: "NONE",
                            e2ee: false
                        });
                        success = true;
                    }
                } else {
                    // Send text message
                    const text = typeof payload === 'string' ? payload : (payload.text || JSON.stringify(payload));
                    await client.base.talk.sendMessage({
                        to: chatMid,
                        text: text,
                        contentType: "NONE",
                        e2ee: false
                    });
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
        console.error("❌ Error processing self_bot_push_queue:", queueErr);
    }
}

// ─── Main Self-Bot Initialization ────────────────────────────────────────────
async function startBot() {
    console.log("🤖 กำลังเริ่มต้น LINE Self-Bot...");

    const client = new Client({ storage });
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

    console.log(`🚀 เข้าสู่ระบบสำเร็จ! Self-Bot MID: ${client.selfMid}`);

    // Receive events
    client.on("update", async (op) => {
        try {
            if (op.type === "RECEIVE_MESSAGE" || Number(op.type) === 26) {
                const message = op.message;
                if (!message) return;

                const senderMid = message.from || op.sender?.mid;
                const text = message.text;
                const chatMid = message.to || op.param?.[0];

                if (senderMid && senderMid !== client.selfMid) {
                    if (text && text.toLowerCase() === "hello selfbot") {
                        await client.base.talk.sendMessage({
                            to: chatMid,
                            text: "สวัสดีครับ! บอท Self-Bot พร้อมทำหน้าที่แจ้งเตือนแทนแล้วครับ 🤖",
                            contentType: "NONE",
                            e2ee: false
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Error processing update:", err);
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
