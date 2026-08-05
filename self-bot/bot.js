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

// ─── Group MID Resolver ──────────────────────────────────────────────────────
let cachedJoinedChats = null;
let lastChatFetchTime = 0;

async function getJoinedChatsCached(client) {
    const now = Date.now();
    if (cachedJoinedChats && (now - lastChatFetchTime < 60000)) {
        return cachedJoinedChats;
    }
    try {
        cachedJoinedChats = await client.fetchJoinedChats();
        lastChatFetchTime = now;
        return cachedJoinedChats;
    } catch (e) {
        console.error("❌ Error fetching joined chats for Self-Bot:", e.message || e);
        return cachedJoinedChats || [];
    }
}

async function resolveSelfBotGroupMid(client, targetLineGroupId) {
    if (!targetLineGroupId) return null;

    const joinedChats = await getJoinedChatsCached(client);

    // 1. Direct match on chat.mid
    const directMatch = joinedChats.find(c => 
        c.mid === targetLineGroupId || 
        c.mid.toLowerCase() === targetLineGroupId.toLowerCase() ||
        (targetLineGroupId.startsWith('C') && c.mid === 'c' + targetLineGroupId.substring(1))
    );
    if (directMatch) return directMatch.mid;

    // 2. Look up group_name in line_groups DB
    try {
        const { data: dbGroup } = await supabase
            .from("line_groups")
            .select("group_name")
            .eq("line_group_id", targetLineGroupId)
            .maybeSingle();

        if (dbGroup?.group_name) {
            const targetName = dbGroup.group_name.trim().toLowerCase();
            const nameMatch = joinedChats.find(c => c.name && c.name.trim().toLowerCase() === targetName);
            if (nameMatch) {
                console.log(`🎯 [Self-Bot] Resolved OA Group ID (${targetLineGroupId}) => Self-Bot MID (${nameMatch.mid}) via Group Name: "${dbGroup.group_name}"`);
                return nameMatch.mid;
            }

            // Force refresh chats once if no match found (in case bot was newly added to group)
            cachedJoinedChats = await client.fetchJoinedChats();
            lastChatFetchTime = Date.now();
            const reMatch = cachedJoinedChats.find(c => c.name && c.name.trim().toLowerCase() === targetName);
            if (reMatch) {
                console.log(`🎯 [Self-Bot] Resolved OA Group ID (${targetLineGroupId}) => Self-Bot MID (${reMatch.mid}) via refreshed Group Name: "${dbGroup.group_name}"`);
                return reMatch.mid;
            }
        }
    } catch (dbErr) {
        console.error("❌ Error resolving group name in DB:", dbErr.message || dbErr);
    }

    // Fallback: check if 'c' + targetLineGroupId.substring(1) is in joinedChats
    if (targetLineGroupId.startsWith('C')) {
        const altMid = 'c' + targetLineGroupId.substring(1);
        const altMatch = joinedChats.find(c => c.mid === altMid);
        if (altMatch) return altMatch.mid;
    }

    console.warn(`⚠️ [Self-Bot] Self-Bot is NOT a member of group ${targetLineGroupId}`);
    return null;
}

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
let isProcessingQueue = false;
const activeProcessingIds = new Set();

async function processPushQueue(client) {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
        const { data: queueItems, error } = await supabase
            .from("self_bot_push_queue")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(10);

        if (error || !queueItems || queueItems.length === 0) return;

        await Promise.allSettled(queueItems.map(async (item) => {
            if (activeProcessingIds.has(item.id)) return;
            activeProcessingIds.add(item.id);

            console.log(`🚀 [Self-Bot] Processing queue item ${item.id} for group ${item.target_line_group_id}`);

            await supabase
                .from("self_bot_push_queue")
                .update({ status: "processing" })
                .eq("id", item.id);

            let success = false;
            let errorMsg = null;

            try {
                const targetMid = await resolveSelfBotGroupMid(client, item.target_line_group_id);
                if (!targetMid) {
                    console.warn(`⚠️ [Self-Bot] Skipping queue item ${item.id}: Self-Bot is not in group ${item.target_line_group_id}`);
                    await supabase
                        .from("self_bot_push_queue")
                        .update({ status: "skipped_not_in_group", error_message: "Self-Bot is not in this group", processed_at: new Date().toISOString() })
                        .eq("id", item.id);
                    activeProcessingIds.delete(item.id);
                    return;
                }
                const payload = item.message_payload;
                const text = typeof payload === 'string' ? payload : (payload.text || extractTextFromFlex(payload));

                if (item.message_type === 'flex') {
                    success = await sendFlexMessageViaLiff(client, targetMid, payload);
                    if (!success) {
                        await client.sendCompactMessage(targetMid, text);
                        success = true;
                    }
                } else {
                    await client.sendCompactMessage(targetMid, text);
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
            activeProcessingIds.delete(item.id);
        }));
    } catch (queueErr) {
        console.error("❌ Error processing self_bot_push_queue:", queueErr.message || queueErr);
    } finally {
        isProcessingQueue = false;
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
            await client.getMyProfile();
        } catch (authErr) {
            console.warn("⚠️ Auth Token เดิมหมดอายุ หรือใช้งานไม่ได้ กำลังเริ่มสแกน QR Code ใหม่:", authErr.message || authErr);
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

    // Pre-fetch joined chats
    await getJoinedChatsCached(client);

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

    client.on("error", (err) => {
        console.error("⚠️ [Self-Bot] LineJS Error:", err?.message || err);
    });

    client.on("end", (profile) => {
        console.warn("⚠️ [Self-Bot] Client connection ended:", profile?.displayName || "Unknown");
    });

    try {
        client.listen({ talk: true, square: false });
    } catch (listenErr) {
        console.error("⚠️ [Self-Bot] Error starting talk listener:", listenErr.message || listenErr);
    }

    // Start Polling for Self-Bot Push Queue every 1 second for instant notification
    setInterval(() => {
        processPushQueue(client);
    }, 1000);

    console.log("✅ Self-Bot พร้อมทำงานและคอยประมวลผลข้อความ Push Fallback แล้ว!");
}

process.on("unhandledRejection", (reason) => {
    console.error("⚠️ [Self-Bot] Unhandled Rejection (non-fatal):", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
    console.error("⚠️ [Self-Bot] Uncaught Exception (non-fatal):", err?.message || err);
});

startBot().catch(err => console.error("❌ Fatal Error starting Self-Bot:", err.message || err));
