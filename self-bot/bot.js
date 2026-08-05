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

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetLineGroupId);
    const altId = targetLineGroupId.startsWith('C')
        ? 'c' + targetLineGroupId.substring(1)
        : (targetLineGroupId.startsWith('c') ? 'C' + targetLineGroupId.substring(1) : null);

    // 1. Check DB for cached self_bot_chat_mid (fastest path, survives restarts, supports UUID or MID)
    try {
        let dbQuery = supabase
            .from("line_groups")
            .select("self_bot_chat_mid")
            .not("self_bot_chat_mid", "is", null);

        if (isUuid) {
            dbQuery = dbQuery.eq("id", targetLineGroupId);
        } else {
            dbQuery = dbQuery.or(`line_group_id.eq.${targetLineGroupId}${altId ? `,line_group_id.eq.${altId}` : ''}`);
        }

        const { data: cachedRow } = await dbQuery.limit(1).maybeSingle();

        if (cachedRow?.self_bot_chat_mid) {
            return cachedRow.self_bot_chat_mid;
        }
    } catch (dbErr) {
        console.error("❌ Error checking self_bot_chat_mid cache:", dbErr.message || dbErr);
    }

    const joinedChats = await getJoinedChatsCached(client);

    // Helper: save resolved MID to DB for future lookups
    async function saveMidToDb(resolvedMid) {
        try {
            let updateQuery = supabase.from("line_groups").update({ self_bot_chat_mid: resolvedMid });
            if (isUuid) {
                await updateQuery.eq("id", targetLineGroupId);
            } else {
                await updateQuery.or(`line_group_id.eq.${targetLineGroupId}${altId ? `,line_group_id.eq.${altId}` : ''}`);
            }
            console.log(`💾 [Self-Bot] Saved self_bot_chat_mid=${resolvedMid} for ${targetLineGroupId}`);
        } catch (saveErr) {
            console.error("❌ Error saving self_bot_chat_mid:", saveErr.message || saveErr);
        }
    }

    // 2. Direct match on chat.mid (case-insensitive + C↔c conversion)
    const directMatch = joinedChats.find(c =>
        c.mid === targetLineGroupId ||
        c.mid.toLowerCase() === targetLineGroupId.toLowerCase() ||
        (targetLineGroupId.startsWith('C') && c.mid === 'c' + targetLineGroupId.substring(1)) ||
        (targetLineGroupId.startsWith('c') && c.mid === 'C' + targetLineGroupId.substring(1))
    );
    if (directMatch) {
        await saveMidToDb(directMatch.mid);
        return directMatch.mid;
    }

    // 3. Name-based match via line_groups.group_name
    try {
        let dbGroupQuery = supabase.from("line_groups").select("group_name");
        if (isUuid) {
            dbGroupQuery = dbGroupQuery.eq("id", targetLineGroupId);
        } else {
            dbGroupQuery = dbGroupQuery.or(`line_group_id.eq.${targetLineGroupId}${altId ? `,line_group_id.eq.${altId}` : ''}`);
        }
        const { data: dbGroup } = await dbGroupQuery.maybeSingle();

        if (dbGroup?.group_name) {
            const targetName = dbGroup.group_name.trim().toLowerCase();
            const nameMatch = joinedChats.find(c => c.name && c.name.trim().toLowerCase() === targetName);
            if (nameMatch) {
                console.log(`🎯 [Self-Bot] Resolved ${targetLineGroupId} => ${nameMatch.mid} via Group Name: "${dbGroup.group_name}"`);
                await saveMidToDb(nameMatch.mid);
                return nameMatch.mid;
            }
        }
    } catch (dbErr) {
        console.error("❌ Error resolving group name in DB:", dbErr.message || dbErr);
    }

    // 4. Force-refresh joinedChats and retry
    try {
        cachedJoinedChats = await client.fetchJoinedChats();
        lastChatFetchTime = Date.now();
        const refreshedMatch = cachedJoinedChats.find(c =>
            c.mid === targetLineGroupId ||
            c.mid.toLowerCase() === targetLineGroupId.toLowerCase() ||
            (targetLineGroupId.startsWith('C') && c.mid === 'c' + targetLineGroupId.substring(1))
        );
        if (refreshedMatch) {
            await saveMidToDb(refreshedMatch.mid);
            return refreshedMatch.mid;
        }
    } catch (refreshErr) {
        console.error("❌ Error refreshing joined chats:", refreshErr.message || refreshErr);
    }

    console.warn(`⚠️ [Self-Bot] Self-Bot is NOT a member of group ${targetLineGroupId}`);
    return null;
}

// ─── Startup Sync: Pre-populate self_bot_chat_mid for all line_groups ────────
async function syncGroupMidsOnStartup(client) {
    try {
        const joinedChats = await getJoinedChatsCached(client);
        if (!joinedChats || joinedChats.length === 0) return;

        console.log(`🔄 [Self-Bot Sync] Syncing group MIDs. Self-bot is in ${joinedChats.length} chats.`);

        // Fetch all line_groups that have group_name but no self_bot_chat_mid
        const { data: groups } = await supabase
            .from("line_groups")
            .select("line_group_id, group_name, self_bot_chat_mid")
            .is("self_bot_chat_mid", null)
            .not("group_name", "is", null)
            .eq("is_active", true);

        if (!groups || groups.length === 0) {
            console.log(`✅ [Self-Bot Sync] All groups already have self_bot_chat_mid cached.`);
            return;
        }

        let syncCount = 0;
        for (const group of groups) {
            const targetName = group.group_name.trim().toLowerCase();
            const match = joinedChats.find(c => c.name && c.name.trim().toLowerCase() === targetName);
            if (match) {
                await supabase
                    .from("line_groups")
                    .update({ self_bot_chat_mid: match.mid })
                    .eq("line_group_id", group.line_group_id);
                console.log(`💾 [Self-Bot Sync] ${group.line_group_id} => ${match.mid} (${group.group_name})`);
                syncCount++;
            }
        }
        console.log(`✅ [Self-Bot Sync] Synced ${syncCount}/${groups.length} groups.`);
    } catch (err) {
        console.error("❌ [Self-Bot Sync] Error during startup sync:", err.message || err);
    }
}

// ─── Helper: Send Flex Message via LIFF ──────────────────────────────────────
async function sendFlexMessageViaLiff(client, targetChatMid, flexPayload) {
    const liffId = process.env.LIFF_ID;
    if (!liffId) {
        console.warn("⚠️ LIFF_ID not set in .env. Falling back to plain text.");
        return false;
    }

    try {
        let liffToken = null;

        const midsToTry = [targetChatMid];
        if (targetChatMid.startsWith('c')) {
            midsToTry.push('C' + targetChatMid.substring(1));
        } else if (targetChatMid.startsWith('C')) {
            midsToTry.push('c' + targetChatMid.substring(1));
        }

        let lastLiffErr = null;
        for (const midCandidate of midsToTry) {
            try {
                if (client.liff && typeof client.liff.issueView === "function") {
                    const res = await client.liff.issueView({ chatMid: midCandidate, liffId });
                    liffToken = res?.accessToken || res?.token;
                } else if (client.liff && typeof client.liff.getToken === "function") {
                    const tokenRes = await client.liff.getToken({ chatMid: midCandidate, liffId });
                    liffToken = typeof tokenRes === "string" ? tokenRes : (tokenRes?.accessToken || tokenRes?.token);
                }
                if (liffToken) break;
            } catch (liffErr) {
                lastLiffErr = liffErr;
            }
        }

        if (!liffToken && lastLiffErr) {
            const errStr = JSON.stringify(lastLiffErr?.message || lastLiffErr || '');
            if (errStr.includes("CONSENT_REQUIRED") || errStr.includes("user consent required")) {
                console.error("⚠️ [Self-Bot LIFF] ต้องกดกดยินยอมสิทธิ์ (User Consent Required) บนมือถือ Self-Bot!");
                console.error(`👉 เปิดลิงก์นี้บนมือถือ Self-Bot ใน LINE เพื่อกด "ยินยอม": https://liff.line.me/${liffId}`);
            } else {
                console.error("❌ [Self-Bot LIFF] Issue view error:", errStr);
            }
            return false;
        }

        if (!liffToken) {
            throw new Error("Could not acquire LIFF token");
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

    // Explicitly persist authToken to storage.json so login is remembered
    const activeToken = client.authToken || client.base?.authToken;
    if (activeToken) {
        await storage.set("authToken", activeToken);
        console.log("💾 บันทึก Auth Token ลง storage.json เรียบร้อยแล้ว");
    }

    // Pre-fetch joined chats and sync group MIDs
    await getJoinedChatsCached(client);
    await syncGroupMidsOnStartup(client);

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
    const reasonStr = String(reason?.message || reason || '');
    if (reasonStr.includes("V3_TOKEN_CLIENT_LOGGED_OUT") || reasonStr.includes("NOT_AUTHORIZED_DEVICE")) {
        console.error("❌ [Self-Bot] Auth Token หมดอายุหรือถูกออกจากระบบ (V3_TOKEN_CLIENT_LOGGED_OUT)");
        console.error("⚠️ กำลังลบข้อมูล storage.json และรีสตาร์ทเพื่อสแกน QR Code ใหม่...");
        try {
            if (fs.existsSync(STORAGE_FILE)) {
                fs.unlinkSync(STORAGE_FILE);
                console.log("🗑️ ลบ storage.json เรียบร้อยแล้ว");
            }
        } catch (e) {}
        process.exit(1);
    }
    console.error("⚠️ [Self-Bot] Unhandled Rejection (non-fatal):", reasonStr);
});

process.on("uncaughtException", (err) => {
    const errStr = String(err?.message || err || '');
    if (errStr.includes("V3_TOKEN_CLIENT_LOGGED_OUT") || errStr.includes("NOT_AUTHORIZED_DEVICE")) {
        console.error("❌ [Self-Bot] Auth Token หมดอายุหรือถูกออกจากระบบ (V3_TOKEN_CLIENT_LOGGED_OUT)");
        console.error("⚠️ กำลังลบข้อมูล storage.json และรีสตาร์ทเพื่อสแกน QR Code ใหม่...");
        try {
            if (fs.existsSync(STORAGE_FILE)) {
                fs.unlinkSync(STORAGE_FILE);
                console.log("🗑️ ลบ storage.json เรียบร้อยแล้ว");
            }
        } catch (e) {}
        process.exit(1);
    }
    console.error("⚠️ [Self-Bot] Uncaught Exception (non-fatal):", errStr);
});

startBot().catch(err => console.error("❌ Fatal Error starting Self-Bot:", err.message || err));
