// Winning number parsing for the `/สรุป [เลขรางวัล]` announcement command.
//
// The object returned here is written straight into
// `lottery_rounds.winning_numbers` and then read by the `calculate_round_winners`
// RPC (migration 172), so the shape must stay identical to the one the web app
// builds in `src/components/dealer/ResultsModal.jsx`.

/** Thai draws at most 4 three-digit ล่าง prizes (2 ตัวหน้า + 2 ตัวหลัง). */
export const THAI_MAX_3_BOTTOM = 4;

//   123456/25                   -> first prize + 2 ตัวล่าง only
const THAI_TWO_PART = /^(\d{6})\/(\d{2})$/;
//   123456/124,456,254,784/25   -> adds the 3 ตัวล่าง prizes in the middle group
const THAI_THREE_PART = /^(\d{6})\/(\d{3}(?:,\d{3})*)\/(\d{2})$/;

function buildThaiResult(top6: string, bottom2: string, threeBottom: string[]) {
  return {
    '6_top': top6,
    '3_top': top6.slice(-3),
    '2_top': top6.slice(-2),
    '2_bottom': bottom2,
    '3_bottom': threeBottom
  };
}

/**
 * Thai accepts two shapes:
 *   `123456/25`                  — first prize + 2 ตัวล่าง
 *   `123456/124,456,254,784/25`  — same, plus 1-4 three-digit ล่าง prizes
 *
 * The middle group carries the 3 ตัวหน้า and 3 ตัวหลัง prizes. The rest of the
 * system keeps them together in a single `3_bottom` array — the same way the
 * central-results importer concatenates `three_digit_front` and
 * `three_digit_back` — so `calculate_round_winners` can match a 3_bottom bet
 * with `v_num = ANY(v_3_bottom)`.
 */
function parseThaiWinningNumbers(clean: string): any | null {
  const twoPart = clean.match(THAI_TWO_PART);
  if (twoPart) {
    return buildThaiResult(twoPart[1], twoPart[2], []);
  }

  const threePart = clean.match(THAI_THREE_PART);
  if (threePart) {
    const threeBottom = threePart[2].split(',');
    // Reject an over-long list instead of silently dropping prizes, so the admin
    // sees the format help and can retype it.
    if (threeBottom.length > THAI_MAX_3_BOTTOM) return null;
    return buildThaiResult(threePart[1], threePart[3], threeBottom);
  }

  return null;
}

export function parseWinningNumbers(param: string, lotteryType: string): any | null {
  const clean = param.replace(/\s+/g, ''); // Remove spaces
  const typeLower = lotteryType.toLowerCase();

  if (typeLower === 'lao' || typeLower === 'hanoi') {
    if (/^\d{4}$/.test(clean)) {
      return {
        '4_set': clean,
        '3_top': clean.slice(-3),
        '2_top': clean.slice(-2),
        '2_bottom': clean.slice(0, 2)
      };
    }
  } else if (typeLower === 'thai') {
    return parseThaiWinningNumbers(clean);
  } else if (typeLower === 'stock') {
    const match = clean.match(/^(\d{2})\/(\d{2})$/);
    if (match) {
      return {
        '2_top': match[1],
        '2_bottom': match[2]
      };
    }
  }

  return null;
}

/** Format help shown when the admin types an unparsable winning number. */
export function getWinningNumberFormatHelp(lotteryType: string): string {
  const typeLower = lotteryType.toLowerCase();
  if (typeLower === 'lao' || typeLower === 'hanoi') {
    return `สำหรับหวย${typeLower === 'lao' ? 'ลาว' : 'ฮานอย'} ระบุเลขรางวัล 4 ตัว\nเช่น /สรุป 1234`;
  }
  if (typeLower === 'thai') {
    return `สำหรับหวยไทย ระบุได้ 2 แบบ\n` +
      `• [รางวัลที่ 1]/[2 ตัวล่าง]\n` +
      `  เช่น /สรุป 123456/25\n` +
      `• [รางวัลที่ 1]/[3 ตัวล่าง คั่นด้วย ,]/[2 ตัวล่าง]\n` +
      `  เช่น /สรุป 123456/124,456,254,784/25\n` +
      `  (3 ตัวล่าง ใส่ได้สูงสุด ${THAI_MAX_3_BOTTOM} ชุด)`;
  }
  if (typeLower === 'stock') {
    return `สำหรับหวยหุ้น ระบุ [2 ตัวบน]/[2 ตัวล่าง]\nเช่น /สรุป 25/49`;
  }
  return `หวยประเภท ${lotteryType.toUpperCase()} ยังไม่รองรับการประกาศผลผ่านคำสั่ง /สรุป`;
}
