async function testWebhook() {
  const url = 'https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot';
  const payload = {
    events: [
      {
        type: "message",
        replyToken: "mockReplyToken",
        source: {
          userId: "mockUserId",
          groupId: "C5af627e79490fb1f97baf583f9d1e57b",
          type: "group"
        },
        message: {
          id: "mockMessageId",
          type: "text",
          text: "/คนส่ง"
        }
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': 'mockSignature'
      },
      body: JSON.stringify(payload)
    });

    console.log("Status Code:", response.status);
    const body = await response.text();
    console.log("Response Body:", body);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testWebhook();
