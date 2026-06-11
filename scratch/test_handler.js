// Mock data matching database output in screenshot
const activeUserIds = ["user_jimmy", "user_jack"];

const profilesMap = {
  "user_jimmy": { name: "พี่จิมมี่", isLinked: true },
  "user_jack": { name: "พี่แจ็ค", isLinked: true }
};

const userTotals = {
  "user_jimmy": 26046,
  "user_jack": 922
};

const userComms = {
  "user_jimmy": 3913.9,
  "user_jack": 138.3
};

const groupLink = {
  lottery_type: "lao"
};

const activeRound = {
  round_date: "2026-06-09"
};

try {
  let summaryText = `👥 สมาชิกที่ส่งเลขแล้ว (${groupLink.lottery_type.toUpperCase()})\nงวดวันที่: ${activeRound.round_date}\n`;
  summaryText += `--------------------------\n`;
  summaryText += `ชื่อ | ยอดส่ง | ค่าคอม | คงเหลือส่ง\n`;

  const bubbleBodyContents = [
    {
      "type": "box",
      "layout": "horizontal",
      "contents": [
        {
          "type": "text",
          "text": "ชื่อ",
          "size": "xs",
          "color": "#888888",
          "weight": "bold",
          "flex": 4
        },
        {
          "type": "text",
          "text": "ยอดส่ง (ค่าคอม)",
          "size": "xs",
          "color": "#888888",
          "weight": "bold",
          "align": "end",
          "flex": 4
        },
        {
          "type": "text",
          "text": "สุทธิส่ง",
          "size": "xs",
          "color": "#888888",
          "weight": "bold",
          "align": "end",
          "flex": 3
        }
      ]
    },
    {
      "type": "separator",
      "margin": "xs",
      "color": "#e5e5e5"
    }
  ];

  let index = 1;
  let overallTotal = 0;
  let overallComm = 0;
  activeUserIds.forEach((uid) => {
    const userProf = profilesMap[uid] || { name: 'Unknown User', isLinked: false };
    const name = userProf.name;
    const total = userTotals[uid];
    const comm = userComms[uid];
    const net = total - comm;

    const roundedTotal = Math.round(total);
    const roundedComm = Math.round(comm);
    const roundedNet = Math.round(net);

    summaryText += `${index}. คุณ ${name} | ฿${roundedTotal.toLocaleString('th-TH')} | ฿${roundedComm.toLocaleString('th-TH')} | ฿${roundedNet.toLocaleString('th-TH')}\n`;

    bubbleBodyContents.push({
      "type": "box",
      "layout": "horizontal",
      "margin": "md",
      "align": "center",
      "contents": [
        {
          "type": "text",
          "text": `${index}. คุณ ${name}`,
          "size": "sm",
          "color": "#333333",
          "weight": "bold",
          "flex": 4,
          "wrap": true
        },
        {
          "type": "box",
          "layout": "vertical",
          "flex": 4,
          "contents": [
            {
              "type": "text",
              "text": `฿${roundedTotal.toLocaleString('th-TH')}`,
              "size": "sm",
              "align": "end",
              "weight": "bold",
              "color": "#333333"
            },
            {
              "type": "text",
              "text": `(฿${roundedComm.toLocaleString('th-TH')})`,
              "size": "xs",
              "align": "end",
              "color": "#888888"
            }
          ]
        },
        {
          "type": "text",
          "text": `฿${roundedNet.toLocaleString('th-TH')}`,
          "size": "sm",
          "color": "#00A86B",
          "weight": "bold",
          "align": "end",
          "flex": 3
        }
      ]
    });

    overallTotal += roundedTotal;
    overallComm += roundedComm;
    index++;
  });

  const overallNet = overallTotal - overallComm;
  summaryText += `--------------------------\n`;
  summaryText += `รวมส่งเลขทั้งหมด: ${activeUserIds.length} คน\n`;
  summaryText += `💰 ยอดรวม: ฿${overallTotal.toLocaleString('th-TH')}\n`;
  summaryText += `💸 ค่าคอม: ฿${overallComm.toLocaleString('th-TH')}\n`;
  summaryText += `💵 เหลือ: ฿${overallNet.toLocaleString('th-TH')}`;

  const flexMessage = {
    "type": "flex",
    "altText": summaryText,
    "contents": {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#4A2E80",
        "paddingAll": "lg",
        "contents": [
          {
            "type": "text",
            "text": `👥 สมาชิกที่ส่งเลขแล้ว (${groupLink.lottery_type.toUpperCase()})`,
            "weight": "bold",
            "size": "md",
            "color": "#ffffff"
          },
          {
            "type": "text",
            "text": `งวดวันที่: ${activeRound.round_date}`,
            "size": "xs",
            "color": "#e1d9f0",
            "margin": "xs"
          }
        ]
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "md",
        "contents": bubbleBodyContents
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#f8f9fa",
        "paddingAll": "md",
        "cornerRadius": "md",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              {
                "type": "text",
                "text": "รวมส่งเลข:",
                "size": "sm",
                "color": "#555555"
              },
              {
                "type": "text",
                "text": `${activeUserIds.length} คน`,
                "size": "sm",
                "weight": "bold",
                "align": "end",
                "color": "#333333"
              }
            ]
          },
          {
            "type": "box",
            "layout": "horizontal",
            "margin": "xs",
            "contents": [
              {
                "type": "text",
                "text": "💰 ยอดรวม:",
                "size": "sm",
                "color": "#555555"
              },
              {
                "type": "text",
                "text": `฿${overallTotal.toLocaleString('th-TH')}`,
                "size": "sm",
                "weight": "bold",
                "align": "end",
                "color": "#333333"
              }
            ]
          },
          {
            "type": "box",
            "layout": "horizontal",
            "margin": "xs",
            "contents": [
              {
                "type": "text",
                "text": "💸 ค่าคอมรวม:",
                "size": "sm",
                "color": "#555555"
              },
              {
                "type": "text",
                "text": `฿${overallComm.toLocaleString('th-TH')}`,
                "size": "sm",
                "weight": "bold",
                "align": "end",
                "color": "#666666"
              }
            ]
          },
          {
            "type": "separator",
            "margin": "sm",
            "color": "#dddddd"
          },
          {
            "type": "box",
            "layout": "horizontal",
            "margin": "sm",
            "contents": [
              {
                "type": "text",
                "text": "💵 ยอดสุทธิคงเหลือ:",
                "size": "sm",
                "weight": "bold",
                "color": "#111111"
              },
              {
                "type": "text",
                "text": `฿${overallNet.toLocaleString('th-TH')}`,
                "size": "sm",
                "weight": "bold",
                "align": "end",
                "color": "#4A2E80"
              }
            ]
          }
        ]
      }
    }
  };

  console.log("Success! No JS runtime exceptions thrown.");
  console.log("altText length:", summaryText.length);
  console.log("flexMessage JSON size:", JSON.stringify(flexMessage).length);
} catch (e) {
  console.error("CRASHED:", e);
}
