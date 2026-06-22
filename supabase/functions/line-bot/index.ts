import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0"
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { parseMultiLinePaste, ParsedBet, getPermutations, getUnique3DigitPermsFrom4, getUnique3DigitPermsFrom5, extractBuyerNote } from "./pasteParser.ts"
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1"
import fontkit from "npm:@pdf-lib/fontkit@0.0.4"


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LINE_CHANNEL_SECRET = (Deno.env.get('LINE_CHANNEL_SECRET') || '').trim().replace(/^["']|["']$/g, '')
const LINE_CHANNEL_ACCESS_TOKEN = (Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '').trim().replace(/^["']|["']$/g, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Initialize Supabase client with Service Role Key to bypass RLS for bot actions
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

let cachedFontBytes: Uint8Array | null = null;
async function getNotoSansThaiFontBytes(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  const fontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf";
  const res = await fetch(fontUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch Sarabun font from Google Fonts. Status: ${res.statusText}`);
  }
  const arr = await res.arrayBuffer();
  cachedFontBytes = new Uint8Array(arr);
  return cachedFontBytes;
}

interface PDFItem {
  numbers: string;
  amountText: string;
}

interface PDFCategory {
  label: string;
  items: PDFItem[];
}

async function generateReportPDF(
  title: string,
  dateStr: string,
  categories: PDFCategory[],
  grandTotalText: string
): Promise<Uint8Array> {
  const fontBytes = await getNotoSansThaiFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);

  let page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  
  let currentY = height - 50; // Top margin
  
  // Header
  // Top accent bar (dark navy)
  page.drawRectangle({
    x: 40,
    y: currentY - 8,
    width: 515,
    height: 8,
    color: rgb(0.12, 0.23, 0.35),
  });
  currentY -= 20;

  // Title
  page.drawText(title, {
    x: 40,
    y: currentY - 18,
    size: 18,
    font,
    color: rgb(0.12, 0.23, 0.35),
  });
  currentY -= 25;

  // Date
  if (dateStr) {
    page.drawText(dateStr, {
      x: 40,
      y: currentY - 12,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    currentY -= 18;
  }

  // Grand Total
  page.drawText(grandTotalText, {
    x: 40,
    y: currentY - 14,
    size: 13,
    font,
    color: rgb(0.12, 0.23, 0.35),
  });
  currentY -= 22;

  // Divider
  page.drawLine({
    start: { x: 40, y: currentY },
    end: { x: 555, y: currentY },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  currentY -= 15;

  // Render categories
  for (const cat of categories) {
    if (cat.items.length === 0) continue;

    // Check if we need a new page for category header
    if (currentY - 40 < 50) {
      page = pdfDoc.addPage([595.28, 841.89]);
      currentY = height - 50;
    }

    // Category Header Box
    page.drawRectangle({
      x: 40,
      y: currentY - 22,
      width: 515,
      height: 22,
      color: rgb(0.92, 0.94, 0.96),
    });
    // Category Label
    page.drawText(cat.label, {
      x: 48,
      y: currentY - 16,
      size: 11,
      font,
      color: rgb(0.12, 0.23, 0.35),
    });
    currentY -= 30;

    // Grid Layout for items (4 columns)
    const colWidth = 128;
    const rowHeight = 18;
    
    // Group items into rows of 4
    for (let i = 0; i < cat.items.length; i += 4) {
      // Check space for row
      if (currentY - rowHeight < 50) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = height - 50;
      }

      // Draw up to 4 items in this row
      for (let c = 0; c < 4; c++) {
        const itemIdx = i + c;
        if (itemIdx >= cat.items.length) break;
        const item = cat.items[itemIdx];
        const xPos = 40 + c * colWidth;
        page.drawText(`${item.numbers}=${item.amountText}`, {
          x: xPos,
          y: currentY - 12,
          size: 10,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      currentY -= rowHeight;
    }
    
    currentY -= 10; // Extra spacing after category
  }

  // Draw Page Numbers at the end
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawText(`หน้า ${i + 1} จาก ${pages.length}`, {
      x: 270,
      y: 25,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return await pdfDoc.save();
}

async function uploadPDFToStorage(pdfBytes: Uint8Array, fileName: string): Promise<string> {
  // Ensure bucket exists
  try {
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('reports');
    if (bucketError || !bucket) {
      await supabase.storage.createBucket('reports', { public: false });
    }
  } catch (e) {
    console.warn("Error checking/creating reports bucket, proceeding with upload:", e);
  }

  // Upload to Supabase storage 'reports' bucket
  const { data, error } = await supabase.storage
    .from('reports')
    .upload(fileName, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Create signed URL valid for 24 hours (86,400 seconds)
  const { data: signData, error: signError } = await supabase.storage
    .from('reports')
    .createSignedUrl(fileName, 86400);

  if (signError) {
    throw new Error(`Failed to create signed URL: ${signError.message}`);
  }

  return signData.signedUrl;
}


// Helper: Format YYYY-MM-DD to DD-MM-YYYY (Buddhist Era)
function formatToThaiBudDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const y = parseInt(match[1]);
    const m = match[2];
    const d = match[3];
    const thYear = y + 543;
    return `${d}-${m}-${thYear}`;
  }
  return dateStr;
}

// Helper: Parse lottery type in Thai or English
function parseLotteryType(input: string): string | null {
  const clean = input.trim().toLowerCase();
  if (clean === 'ไทย' || clean === 'หวยไทย' || clean === 'thai' || clean === 'th') return 'thai';
  if (clean === 'ลาว' || clean === 'หวยลาว' || clean === 'lao' || clean === 'la') return 'lao';
  if (clean === 'ฮานอย' || clean === 'หวยฮานอย' || clean === 'hanoi' || clean === 'vn') return 'hanoi';
  if (clean === 'หุ้น' || clean === 'หวยหุ้น' || clean === 'stock') return 'stock';
  return null;
}

// Helper: Get ISO string with Bangkok timezone offset (+07:00) for a given date and time string
function getBangkokISOString(date: Date, timeStr: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${year}-${month}-${day}T${timeStr}:00+07:00`;
}

// Helper: Get Bangkok date string (YYYY-MM-DD)
function getBangkokDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// Helper: Get round display date in Buddhist Era (using close_time/end date if available, otherwise round_date)
function getRoundDisplayDate(round: any, useSlash = false): string {
  if (!round) return '';
  const separator = useSlash ? '/' : '-';
  const targetTime = round.close_time || round.round_date;
  if (!targetTime) return '';
  
  if (targetTime.includes('T') || (targetTime.includes('-') && targetTime.includes(':'))) {
    try {
      const dateObj = new Date(targetTime);
      const day = dateObj.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'Asia/Bangkok' });
      const month = dateObj.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Bangkok' });
      const year = dateObj.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' });
      const thYear = parseInt(year) + 543;
      return `${day}${separator}${month}${separator}${thYear}`;
    } catch (e) {
      console.error('getRoundDisplayDate parsing error:', e);
    }
  }
  
  const match = targetTime.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const y = parseInt(match[1]);
    const m = match[2];
    const d = match[3];
    const thYear = y + 543;
    return `${d}${separator}${m}${separator}${thYear}`;
  }
  return targetTime;
}

// Helper: Format winning numbers for display
function formatWinningNumbersForDisplay(winningNumbers: any, lotteryType: string): string {
  if (!winningNumbers) return 'ยังไม่มีผลรางวัล';
  const typeLower = lotteryType.toLowerCase();
  if (typeLower === 'lao' || typeLower === 'hanoi') {
    return winningNumbers['4_set'] || '-';
  } else if (typeLower === 'thai') {
    const top6 = winningNumbers['6_top'] || '-';
    const bot2 = winningNumbers['2_bottom'] || '-';
    return `${top6} / ${bot2}`;
  } else if (typeLower === 'stock') {
    const top2 = winningNumbers['2_top'] || '-';
    const bot2 = winningNumbers['2_bottom'] || '-';
    return `${top2} / ${bot2}`;
  }
  return typeof winningNumbers === 'string' ? winningNumbers : JSON.stringify(winningNumbers);
}

// Helper: Parse report date and type params (e.g. ล/9/5/2026, ล/9/5/26, ล/9/5/69, ล/9/5/2569)
function parseReportParams(param: string): { lotteryType: string; dateStr: string } | null {
  const clean = param.replace(/\s+/g, '').toLowerCase();
  const match = clean.match(/^(ล|ท|ฮ|ห|lao|thai|hanoi|stock|l|t|h|s)\/(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  
  const typeChar = match[1];
  const day = parseInt(match[2], 10);
  const month = parseInt(match[3], 10);
  let year = parseInt(match[4], 10);
  
  let lotteryType = '';
  if (typeChar === 'ล' || typeChar === 'lao' || typeChar === 'l') {
    lotteryType = 'lao';
  } else if (typeChar === 'ท' || typeChar === 'thai' || typeChar === 't') {
    lotteryType = 'thai';
  } else if (typeChar === 'ฮ' || typeChar === 'hanoi' || typeChar === 'h') {
    lotteryType = 'hanoi';
  } else if (typeChar === 'ห' || typeChar === 'stock' || typeChar === 's') {
    lotteryType = 'stock';
  } else {
    return null;
  }
  
  if (year >= 2500) {
    year = year - 543;
  } else if (year >= 50 && year < 100) {
    year = (2500 + year) - 543;
  } else if (year < 50) {
    year = 2000 + year;
  }
  
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  const yStr = year.toString();
  const mStr = month.toString().padStart(2, '0');
  const dStr = day.toString().padStart(2, '0');
  
  return { lotteryType, dateStr: `${yStr}-${mStr}-${dStr}` };
}

// Helper: Parse a round-date param (e.g. 10-6-26, 10-6-2026, 10-6-69, 10-6-2569).
// Accepts '-' or '/' separators. Returns Gregorian 'YYYY-MM-DD' or null.
// Distinct from winning numbers (which never use a D-M-Y 3-part format).
function parseRoundDateParam(param: string): string | null {
  const clean = param.replace(/\s+/g, '');
  const match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // Year normalization (same convention as parseReportParams)
  if (year >= 2500) {
    year = year - 543;                 // 4-digit Buddhist (2569 -> 2026)
  } else if (year >= 50 && year < 100) {
    year = (2500 + year) - 543;        // 2-digit Buddhist (69 -> 2569 -> 2026)
  } else if (year < 50) {
    year = 2000 + year;                // 2-digit Gregorian (26 -> 2026)
  }
  // 4-digit Gregorian (e.g. 2026) passes through unchanged

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const yStr = year.toString();
  const mStr = month.toString().padStart(2, '0');
  const dStr = day.toString().padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

// Helper: Parse a month-year param (e.g. 6-69, 6-2569, 6-26, 6-2026, 6/69, 6/2026).
// Returns { month: number, year: number } or null.
function parseMonthYearParam(param: string): { month: number; year: number } | null {
  const clean = param.replace(/\s+/g, '');
  const match = clean.match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);

  if (month < 1 || month > 12) return null;

  // Year normalization
  if (year >= 2500) {
    year = year - 543;                 // 4-digit Buddhist (2569 -> 2026)
  } else if (year >= 50 && year < 100) {
    year = (2500 + year) - 543;        // 2-digit Buddhist (69 -> 2569 -> 2026)
  } else if (year < 50) {
    year = 2000 + year;                // 2-digit Gregorian (26 -> 2026)
  }
  // 4-digit Gregorian (e.g. 2026) passes through unchanged

  return { month, year };
}

// --- LOTTERY CONSTANTS & WINNERS CHECKER FOR TRANSFER WIN CALCULATIONS ---
const DEFAULT_COMMISSIONS: Record<string, number> = {
  'run_top': 10, 'run_bottom': 10,
  'pak_top': 15, 'pak_bottom': 15,
  'front_top_1': 15, 'middle_top_1': 15, 'back_top_1': 15,
  'front_bottom_1': 15, 'back_bottom_1': 15,
  '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
  '3_top': 30, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
  '4_tod': 15, '4_set': 15, '4_float': 15, '5_float': 15, '6_top': 15
};

const DEFAULT_PAYOUTS: Record<string, number> = {
  'run_top': 3, 'run_bottom': 4,
  'pak_top': 8, 'pak_bottom': 6,
  'front_top_1': 8, 'middle_top_1': 8, 'back_top_1': 8,
  'front_bottom_1': 6, 'back_bottom_1': 6,
  '2_top': 65, '2_front': 65, '2_center': 65, '2_run': 10, '2_bottom': 65,
  '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
  '4_float': 20, '4_tod': 100, '5_float': 10, '6_top': 1000000
};

const DEFAULT_4_SET_SETTINGS = {
  commission: 25,
  prizes: {
    '4_straight_set': 100000,
    '4_tod_set': 4000,
    '3_straight_set': 30000,
    '3_tod_set': 3000,
    '2_front_set': 1000,
    '2_back_set': 1000
  }
};

const getBetSettingsKey = (betType: string, lKey: string): string => {
  const POSITION_MAP: Record<string, string> = {
    'front_top_1': 'pak_top', 'middle_top_1': 'pak_top', 'back_top_1': 'pak_top',
    'front_bottom_1': 'pak_bottom', 'back_bottom_1': 'pak_bottom'
  };
  const mapped = POSITION_MAP[betType] || betType;
  if (lKey === 'lao' || lKey === 'hanoi') {
    const LAO_MAP: Record<string, string> = { '3_top': '3_straight', '3_tod': '3_tod_single' };
    return LAO_MAP[mapped] || mapped;
  }
  return mapped;
};

function calculate4SetPrizesDeno(betNumber: string, winningNumber: string, prizeSettings: any) {
  if (!betNumber || !winningNumber || betNumber.length !== 4 || winningNumber.length !== 4) {
    return { prizes: [], totalPrize: 0 };
  }
  const settings = prizeSettings || DEFAULT_4_SET_SETTINGS.prizes;
  const allMatchedPrizes = [];
  
  if (betNumber === winningNumber) {
    allMatchedPrizes.push({
      type: '4_straight_set',
      amount: settings['4_straight_set'] || 100000
    });
  }
  
  const betSorted = betNumber.split('').sort().join('');
  const winSorted = winningNumber.split('').sort().join('');
  if (betSorted === winSorted && betNumber !== winningNumber) {
    allMatchedPrizes.push({
      type: '4_tod_set',
      amount: settings['4_tod_set'] || 4000
    });
  }
  
  const betLast3 = betNumber.slice(1);
  const winLast3 = winningNumber.slice(1);
  if (betLast3 === winLast3) {
    allMatchedPrizes.push({
      type: '3_straight_set',
      amount: settings['3_straight_set'] || 30000
    });
  }
  
  const betLast3Sorted = betLast3.split('').sort().join('');
  const winLast3Sorted = winLast3.split('').sort().join('');
  if (betLast3Sorted === winLast3Sorted && betLast3 !== winLast3) {
    allMatchedPrizes.push({
      type: '3_tod_set',
      amount: settings['3_tod_set'] || 3000
    });
  }
  
  const betFirst2 = betNumber.slice(0, 2);
  const winFirst2 = winningNumber.slice(0, 2);
  if (betFirst2 === winFirst2) {
    allMatchedPrizes.push({
      type: '2_front_set',
      amount: settings['2_front_set'] || 1000
    });
  }
  
  const betLast2 = betNumber.slice(2);
  const winLast2 = winningNumber.slice(2);
  if (betLast2 === winLast2) {
    allMatchedPrizes.push({
      type: '2_back_set',
      amount: settings['2_back_set'] || 1000
    });
  }
  
  if (allMatchedPrizes.length === 0) {
    return { prizes: [], totalPrize: 0 };
  }
  
  allMatchedPrizes.sort((a, b) => b.amount - a.amount);
  return {
    prizes: [allMatchedPrizes[0]],
    totalPrize: allMatchedPrizes[0].amount
  };
}

function checkTransferWin(
  betType: string,
  numbers: string,
  winningNumbers: any,
  lotteryType: string,
  amount: number,
  setPrice: number,
  prizeSettings: any
): { wins: boolean, payout: number } {
  const bt = betType;
  const num = numbers;
  
  const wn = winningNumbers;
  if (!wn) return { wins: false, payout: 0 };
  
  // Derive winning numbers
  const w4set = wn['4_set'] || '';
  const w3top = wn['3_top'] || (lotteryType !== 'thai' && w4set.length >= 3 ? w4set.slice(1) : '') || '';
  const w2top = wn['2_top'] || (lotteryType !== 'thai' && w4set.length >= 2 ? w4set.slice(2) : '') || '';
  const w2bottom = wn['2_bottom'] || (lotteryType === 'lao' && w4set.length >= 2 ? w4set.slice(0, 2) : '') || '';
  const w3topSorted = w3top.split('').sort().join('');
  
  const floatCheck = (src: string, target: string) => {
    let temp = target;
    for (const ch of src) {
      const idx = temp.indexOf(ch);
      if (idx === -1) return false;
      temp = temp.slice(0, idx) + temp.slice(idx + 1);
    }
    return true;
  };
  
  let payoutRate = DEFAULT_PAYOUTS[bt] || 1;
  if (lotteryType === 'lao' || lotteryType === 'hanoi') {
    if (['2_top', '2_front', '2_center', '2_spread', '2_bottom'].includes(bt)) {
      payoutRate = 70;
    }
  }
  let isWinner = false;
  let prize = 0;
  
  if (bt === 'run_top' && w3top && num.length === 1) {
    isWinner = w3top.includes(num);
  } else if (bt === 'run_bottom' && w2bottom && num.length === 1) {
    isWinner = w2bottom.includes(num);
  } else if (bt === 'front_top_1' && w3top && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[0];
  } else if (bt === 'middle_top_1' && w3top && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[1];
  } else if (bt === 'back_top_1' && w3top && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[2];
  } else if (bt === 'front_bottom_1' && w2bottom && w2bottom.length === 2 && num.length === 1) {
    isWinner = num === w2bottom[0];
  } else if (bt === 'back_bottom_1' && w2bottom && w2bottom.length === 2 && num.length === 1) {
    isWinner = num === w2bottom[1];
  } else if (bt === 'pak_top' && w3top && w3top.length === 3 && num.length === 1) {
    isWinner = w3top.includes(num);
  } else if (bt === 'pak_bottom' && w2bottom && w2bottom.length === 2 && num.length === 1) {
    isWinner = w2bottom.includes(num);
  } else if (bt === '2_bottom' && w2bottom && num.length === 2) {
    isWinner = num === w2bottom;
  } else if (bt === '2_top' && w2top && num.length === 2) {
    isWinner = num === w2top;
  } else if (bt === '2_front' && w3top && w3top.length === 3 && num.length === 2) {
    isWinner = num === w3top.slice(0, 2);
  } else if ((bt === '2_center' || bt === '2_spread') && w3top && w3top.length === 3 && num.length === 2) {
    isWinner = num === (w3top[0] + w3top[2]);
  } else if (bt === '2_run' && w3top && num.length === 2) {
    isWinner = w3top.includes(num[0]) && w3top.includes(num[1]);
  } else if ((bt === '3_top' || bt === '3_straight') && w3top && num.length === 3) {
    isWinner = num === w3top;
  } else if ((bt === '3_tod' || bt === '3_tod_single') && w3top && num.length === 3) {
    isWinner = num.split('').sort().join('') === w3topSorted && num !== w3top;
  } else if (bt === '4_float' && w3top && w3top.length === 3 && num.length === 4) {
    isWinner = floatCheck(w3top, num);
  } else if (bt === '5_float' && w3top && w3top.length === 3 && num.length === 5) {
    isWinner = floatCheck(w3top, num);
  } else if (bt === '4_set' && w4set && num.length === 4) {
    const { totalPrize } = calculate4SetPrizesDeno(num, w4set, prizeSettings);
    if (totalPrize > 0) {
      isWinner = true;
      prize = totalPrize;
    }
  }
  
  if (isWinner) {
    if (bt === '4_set') {
      const numSets = Math.max(1, Math.floor(amount / setPrice));
      return { wins: true, payout: prize * numSets };
    } else {
      return { wins: true, payout: amount * payoutRate };
    }
  }
  return { wins: false, payout: 0 };
}

// Helper: Verify LINE Signature
async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  
  // Diagnostic log
  console.log(`Verifying signature. Secret length: ${channelSecret.length}. Mask: ${channelSecret.substring(0, 4)}...${channelSecret.substring(Math.max(0, channelSecret.length - 4))}`);
  
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
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    bodyData
  );
  
  const calculatedSignature = encodeBase64(new Uint8Array(signatureBuffer));
  const isValid = calculatedSignature === signature;
  
  if (!isValid) {
    console.warn(`Signature mismatch. LINE sent: "${signature.substring(0, 8)}...", Computed: "${calculatedSignature.substring(0, 8)}..."`);
  }
  return isValid;
}

// Helper: Send Reply Message to LINE
async function sendLineReply(
  replyToken: string,
  textOrPayload: string | Record<string, any> | Array<string | Record<string, any>>
): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN not configured");
    return;
  }

  let messages: Array<any> = [];
  if (Array.isArray(textOrPayload)) {
    messages = textOrPayload.map(item => {
      if (typeof item === "string") {
        return { type: "text", text: item };
      }
      return item;
    });
  } else {
    const message = typeof textOrPayload === "string"
      ? {
          type: "text",
          text: textOrPayload
        }
      : textOrPayload;
    messages = [message];
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error(`Failed to send LINE reply: ${response.status} - ${errText}`);

    // If it was a Flex message and failed, try falling back to sending the altText as plain text!
    if (typeof textOrPayload !== "string" && textOrPayload.type === "flex" && textOrPayload.altText) {
      console.warn("Flex message failed. Falling back to plain text altText.");
      const fallbackResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken,
          messages: [
            {
              type: "text",
              text: `⚠️ [บอท: การ์ดข้อความเกิดข้อผิดพลาด - แสดงผลแบบข้อความธรรมดา]:\n\n${textOrPayload.altText}\n\n(รายละเอียดข้อผิดพลาด: ${errText})`
            }
          ]
        })
      });
      if (!fallbackResponse.ok) {
        const fallbackErr = await fallbackResponse.text();
        console.error(`Fallback failed: ${fallbackResponse.status} - ${fallbackErr}`);
      }
    }
  }
}

// Helper: Send LINE Push Message (proactive, no reply token needed)
async function sendLinePush(to: string, textOrPayload: string | Record<string, any>): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN not configured");
    return;
  }
  const message = typeof textOrPayload === "string"
    ? { type: "text", text: textOrPayload }
    : textOrPayload;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [message]
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error(`Failed to send LINE push: ${response.status} - ${errText}`);
  }
}

// Helper: Fetch Group Name from LINE API
async function fetchGroupName(groupId: string): Promise<string | null> {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !groupId) return null;
  if (!groupId.startsWith('C')) {
    // Only group chats (starting with C) support the summary endpoint
    return null;
  }
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      return data.groupName || null;
    } else {
      const errText = await response.text();
      console.warn(`Failed to fetch group summary for ${groupId}: ${response.status} - ${errText}`);
    }
  } catch (error) {
    console.error(`Error fetching group summary for ${groupId}:`, error);
  }
  return null;
}

// Helper: Fetch User Profile from LINE API
async function fetchLineUserProfile(groupId: string, userId: string, sourceType: string): Promise<{ displayName: string } | null> {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !userId) return null;
  
  let url = `https://api.line.me/v2/bot/profile/${userId}`;
  if (sourceType === 'group' && groupId) {
    url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
  } else if (sourceType === 'room' && groupId) {
    url = `https://api.line.me/v2/bot/room/${groupId}/member/${userId}`;
  }
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      return {
        displayName: data.displayName || 'Unknown LINE User'
      };
    } else {
      const errText = await response.text();
      console.warn(`Failed to fetch user profile for ${userId} in ${groupId}: ${response.status} - ${errText}`);
      
      // Fallback to general profile
      if (sourceType === 'group' || sourceType === 'room') {
        const fallbackResponse = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
          }
        });
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          return {
            displayName: data.displayName || 'Unknown LINE User'
          };
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching user profile for ${userId}:`, error);
  }
  return null;
}

// Helper: Upsert LINE Group Member details
async function upsertGroupMember(groupId: string, userId: string, sourceType: string, preFetchedDisplayName?: string, preFetchedUserId?: string | null) {
  if (!groupId || !userId) return;
  if (!groupId.startsWith('C') && !groupId.startsWith('R')) return; // Only for groups/rooms

  try {
    // 1. Check if group exists in line_groups
    const { data: group } = await supabase
      .from('line_groups')
      .select('id')
      .eq('line_group_id', groupId)
      .eq('is_active', true)
      .maybeSingle();

    if (!group) return;

    // 2. Check if member already exists in line_group_members
    const { data: existingMember } = await supabase
      .from('line_group_members')
      .select('id, display_name, user_id')
      .eq('line_group_id', groupId)
      .eq('line_user_id', userId)
      .maybeSingle();

    // 3. Find if there is a profile linked to this line_user_id (if not pre-fetched)
    let linkedUserId = preFetchedUserId;
    if (linkedUserId === undefined) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('line_user_id', userId)
        .maybeSingle();
      linkedUserId = profile ? profile.id : null;
    }

    if (existingMember) {
      // If linked user_id changed, update it
      if (existingMember.user_id !== linkedUserId) {
        await supabase
          .from('line_group_members')
          .update({
            user_id: linkedUserId,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingMember.id);
      }
      return;
    }

    // 4. Resolve display name
    let displayName = preFetchedDisplayName;
    if (!displayName) {
      const lineProfile = await fetchLineUserProfile(groupId, userId, sourceType);
      displayName = lineProfile?.displayName || 'คุณสมาชิกใหม่';
    }

    // 5. Insert new member
    await supabase
      .from('line_group_members')
      .insert({
        line_group_id: groupId,
        line_user_id: userId,
        display_name: displayName,
        user_id: linkedUserId
      });

  } catch (error) {
    console.error(`Error in upsertGroupMember for user ${userId} in group ${groupId}:`, error);
  }
}

interface ExcessItem {
  bet_type: string;
  numbers: string;
  amount: number;
}

// Helper: Calculate excess volume for a round
async function calculateRoundExcess(roundId: string): Promise<ExcessItem[]> {
  // Fetch active round to get set_prices and lottery_type
  const { data: roundData } = await supabase
    .from('lottery_rounds')
    .select('set_prices, lottery_type')
    .eq('id', roundId)
    .maybeSingle();

  const setPrices = roundData?.set_prices || {};
  const setPrice = Number(setPrices['4_top'] || 120);
  const lotteryType = roundData?.lottery_type || '';
  const isSetBasedLottery = ['lao', 'hanoi'].includes(lotteryType);

  let submissions = [];
  let subErr = null;
  try {
    submissions = await fetchAllSubmissions(roundId);
  } catch (err) {
    subErr = err;
  }

  if (subErr || !submissions) return [];

  const { data: typeLimits, error: tlErr } = await supabase
    .from('type_limits')
    .select('bet_type, max_per_number')
    .eq('round_id', roundId);

  const typeLimitsMap: Record<string, number> = {};
  (typeLimits || []).forEach((tl: any) => {
    typeLimitsMap[tl.bet_type] = Number(tl.max_per_number);
  });

  const { data: numberLimits, error: nlErr } = await supabase
    .from('number_limits')
    .select('bet_type, numbers, max_amount')
    .eq('round_id', roundId);

  const numberLimitsMap: Record<string, number> = {};
  (numberLimits || []).forEach((nl: any) => {
    const key = `${nl.bet_type}|${nl.numbers}`;
    numberLimitsMap[key] = Number(nl.max_amount);
  });

  const { data: transfers, error: trErr } = await supabase
    .from('bet_transfers')
    .select('bet_type, numbers, amount, status')
    .eq('round_id', roundId);

  const transfersList = (transfers || []).filter((t: any) => t.status !== 'returned');

  const excessItems: ExcessItem[] = [];

  // Group submissions
  const grouped: Record<string, {
    bet_type: string;
    numbers: string;
    totalAmt: number;
    setCount: number;
    submissions: any[];
  }> = {};

  submissions.forEach((sub: any) => {
    const key = `${sub.bet_type}|${sub.numbers}`;
    if (!grouped[key]) {
      grouped[key] = {
        bet_type: sub.bet_type,
        numbers: sub.numbers,
        totalAmt: 0,
        setCount: 0,
        submissions: []
      };
    }
    grouped[key].totalAmt += Number(sub.amount || 0);
    grouped[key].submissions.push(sub);
    if (isSetBasedLottery && (sub.bet_type === '4_set' || sub.bet_type === '4_top')) {
      grouped[key].setCount += Math.ceil(Number(sub.amount || 0) / setPrice);
    }
  });

  // Calculate set-based excess if Lao/Hanoi lottery
  if (isSetBasedLottery) {
    const limit3Set = typeLimitsMap['3_set'] !== undefined ? typeLimitsMap['3_set'] : 999999999;
    const limit4Set = typeLimitsMap['4_set'] !== undefined ? typeLimitsMap['4_set'] : (typeLimitsMap['4_top'] !== undefined ? typeLimitsMap['4_top'] : 999999999);

    // Group 4-digit submissions by their last 3 digits
    const groupedByLast3: Record<string, {
      last3Digits: string;
      exactMatches: Record<string, {
        numbers: string;
        setCount: number;
        submissions: any[];
      }>;
      totalSets: number;
      submissions: any[];
    }> = {};

    Object.values(grouped).forEach(group => {
      if ((group.bet_type === '4_set' || group.bet_type === '4_top') && group.numbers?.length === 4) {
        const last3 = group.numbers.slice(-3);
        if (!groupedByLast3[last3]) {
          groupedByLast3[last3] = {
            last3Digits: last3,
            exactMatches: {},
            totalSets: 0,
            submissions: []
          };
        }

        if (!groupedByLast3[last3].exactMatches[group.numbers]) {
          groupedByLast3[last3].exactMatches[group.numbers] = {
            numbers: group.numbers,
            setCount: 0,
            submissions: []
          };
        }
        groupedByLast3[last3].exactMatches[group.numbers].setCount += group.setCount;
        groupedByLast3[last3].exactMatches[group.numbers].submissions.push(...group.submissions);
        groupedByLast3[last3].totalSets += group.setCount;
        groupedByLast3[last3].submissions.push(...group.submissions);
      }
    });

    const exactExcessSetsMap: Record<string, number> = {};

    // Process each last-3-digit group
    Object.values(groupedByLast3).forEach(group3 => {
      const exactMatchGroups = Object.values(group3.exactMatches);

      // Sort by earliest submission (FIFO)
      exactMatchGroups.sort((a, b) => {
        const aTime = Math.min(...a.submissions.map(s => new Date(s.created_at).getTime()));
        const bTime = Math.min(...b.submissions.map(s => new Date(s.created_at).getTime()));
        return aTime - bTime;
      });

      // 1. Process 4_set exact limit excess first
      exactMatchGroups.forEach(exactGroup => {
        exactGroup.submissions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const exactTransferred = transfersList
          .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top') && t.numbers === exactGroup.numbers)
          .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0);

        const effectiveLimit = limit4Set + exactTransferred;

        if (exactGroup.setCount > effectiveLimit) {
          const excess4 = exactGroup.setCount - effectiveLimit;
          exactExcessSetsMap[exactGroup.numbers] = excess4;
        }
      });

      // 2. Process 3_digit_match limit excess (FIFO across same last 3 digits)
      const uniqueNumbers = Object.keys(group3.exactMatches);
      const sortedNumbers = uniqueNumbers.sort((a, b) => {
        const aTime = Math.min(...group3.exactMatches[a].submissions.map(s => new Date(s.created_at).getTime()));
        const bTime = Math.min(...group3.exactMatches[b].submissions.map(s => new Date(s.created_at).getTime()));
        return aTime - bTime;
      });

      const totalTransferred3Set = transfersList
        .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers?.slice(-3) === group3.last3Digits)
        .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0);

      let remaining3SetLimit = limit3Set + totalTransferred3Set;

      sortedNumbers.forEach((num) => {
        const exactGroup = group3.exactMatches[num];
        const setsToKeep = Math.min(exactGroup.setCount, remaining3SetLimit);
        remaining3SetLimit -= setsToKeep;

        const excessSets3 = exactGroup.setCount - setsToKeep;
        if (excessSets3 > 0) {
          const prevExcess = exactExcessSetsMap[num] || 0;
          exactExcessSetsMap[num] = Math.max(prevExcess, excessSets3);
        }
      });

      // Push final excess items for this group
      sortedNumbers.forEach((num) => {
        const excessSets = exactExcessSetsMap[num] || 0;
        if (excessSets > 0) {
          excessItems.push({
            bet_type: '4_set',
            numbers: num,
            amount: excessSets * setPrice
          });
        }
      });
    });
  }

  // Process other bet types normally
  for (const group of Object.values(grouped)) {
    if (isSetBasedLottery && (group.bet_type === '4_set' || group.bet_type === '4_top')) {
      continue;
    }

    const limitLookupBetType = group.bet_type;
    const key = `${group.bet_type}|${group.numbers}`;
    
    const numLimit = numberLimitsMap[key];
    const typeLimit = typeLimitsMap[limitLookupBetType];
    const limit = numLimit !== undefined ? numLimit : (typeLimit !== undefined ? typeLimit : 999999999);

    const alreadyTransferred = transfersList
      .filter(t => t.bet_type === limitLookupBetType && t.numbers === group.numbers)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const currentExcess = group.totalAmt - limit - alreadyTransferred;

    if (currentExcess > 0) {
      excessItems.push({
        bet_type: group.bet_type,
        numbers: group.numbers,
        amount: currentExcess
      });
    }
  }

  return excessItems;
}

// Helper: Lay off excess bets to upstream dealer
async function performLayoff(
  dealerId: string,
  roundId: string,
  lotteryType: string,
  items: ExcessItem[]
): Promise<{ success: boolean; message: string; text?: string }> {
  if (items.length === 0) {
    return { success: true, message: 'ไม่มีรายการให้ตีออก' };
  }

  // Try to get the default upstream dealer first, fallback to first active one
  let connection: any = null;
  const { data: defaultConn, error: defaultErr } = await supabase
    .from('dealer_upstream_connections')
    .select('*')
    .eq('dealer_id', dealerId)
    .eq('status', 'active')
    .eq('is_blocked', false)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  if (!defaultErr && defaultConn) {
    connection = defaultConn;
  } else {
    // Fallback: pick first active non-blocked connection
    const { data: fallbackConn, error: fallbackErr } = await supabase
      .from('dealer_upstream_connections')
      .select('*')
      .eq('dealer_id', dealerId)
      .eq('status', 'active')
      .eq('is_blocked', false)
      .limit(1)
      .maybeSingle();
    connection = fallbackConn;
  }

  if (!connection) {
    return { success: false, message: 'กรุณาตั้งค่าเจ้ามือปลายทาง (Upstream Connection) บนหน้าเว็บก่อน\nไปที่ แดชบอร์ดเจ้ามือ → แท็บ "เจ้ามือตีออก" → กดปุ่ม "ตั้งเป็นเจ้ามือหลัก"' };
  }

  const upstreamDealerId = connection.upstream_dealer_id;
  const targetDealerName = connection.upstream_name || 'Upstream Dealer';
  
  let targetRoundId: string | null = null;
  if (connection.is_linked && upstreamDealerId) {
    const { data: upRound } = await supabase
      .from('lottery_rounds')
      .select('id')
      .eq('dealer_id', upstreamDealerId)
      .eq('lottery_type', lotteryType)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (upRound) {
      targetRoundId = upRound.id;
    }
  }

  const batchId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const transferInserts: any[] = [];

  // Group items by category for copy-pasting
  const topBets: string[] = [];
  const bottomBets: string[] = [];
  const todBets: string[] = [];
  const runTopBets: string[] = [];
  const runBottomBets: string[] = [];
  const setBets: string[] = [];
  const otherBets: string[] = [];

  for (const item of items) {
    let targetSubmissionId: string | null = null;

    if (targetRoundId && upstreamDealerId) {
      const { data: upSub, error: upSubErr } = await supabase
        .from('submissions')
        .insert({
          round_id: targetRoundId,
          user_id: dealerId,
          bet_type: item.bet_type,
          numbers: item.numbers,
          amount: item.amount,
          source: 'transfer',
          submitted_by: dealerId,
          submitted_by_type: 'dealer',
          created_at: timestamp,
          updated_at: timestamp
        })
        .select('id')
        .single();

      if (!upSubErr && upSub) {
        targetSubmissionId = upSub.id;
      }
    }

    transferInserts.push({
      round_id: roundId,
      bet_type: item.bet_type,
      numbers: item.numbers,
      amount: item.amount,
      target_dealer_name: targetDealerName,
      transfer_batch_id: batchId,
      upstream_dealer_id: upstreamDealerId || null,
      is_linked: !!targetRoundId,
      target_round_id: targetRoundId,
      target_submission_id: targetSubmissionId,
      created_at: timestamp,
      updated_at: timestamp
    });

    if (item.bet_type === '3_top' || item.bet_type === '2_top') {
      topBets.push(`${item.numbers}=${item.amount}`);
    } else if (item.bet_type === '2_bottom') {
      bottomBets.push(`${item.numbers}=${item.amount}`);
    } else if (item.bet_type === '3_tod') {
      todBets.push(`${item.numbers}=${item.amount}`);
    } else if (item.bet_type === 'run_top') {
      runTopBets.push(`${item.numbers}=${item.amount}`);
    } else if (item.bet_type === 'run_bottom') {
      runBottomBets.push(`${item.numbers}=${item.amount}`);
    } else if (item.bet_type === '4_set') {
      setBets.push(item.numbers);
    } else {
      const betLabel = item.bet_type === '3_top' ? 'บน' : item.bet_type === '2_top' ? 'บน' : item.bet_type === '2_bottom' ? 'ล่าง' : item.bet_type;
      otherBets.push(`${item.numbers}=${item.amount} (${betLabel})`);
    }
  }

  const { error: insertErr } = await supabase
    .from('bet_transfers')
    .insert(transferInserts);

  if (insertErr) {
    console.error("Failed to insert bet transfers:", insertErr);
    return { success: false, message: 'เกิดข้อผิดพลาดทางเทคนิคในการบันทึกการตีออก' };
  }

  if (targetRoundId && upstreamDealerId) {
    updatePendingDeduction(upstreamDealerId).catch(err => {
      console.error("Failed updating upstream pending deduction:", err);
    });
  }

  let copyableBlock = '';
  if (topBets.length > 0) {
    copyableBlock += `บน\n${topBets.join('\n')}\n`;
  }
  if (todBets.length > 0) {
    copyableBlock += `โต๊ด\n${todBets.join('\n')}\n`;
  }
  if (bottomBets.length > 0) {
    copyableBlock += `ล่าง\n${bottomBets.join('\n')}\n`;
  }
  if (runTopBets.length > 0) {
    copyableBlock += `วิ่งบน\n${runTopBets.join('\n')}\n`;
  }
  if (runBottomBets.length > 0) {
    copyableBlock += `วิ่งล่าง\n${runBottomBets.join('\n')}\n`;
  }
  if (setBets.length > 0) {
    copyableBlock += `ชุด\n${setBets.join('\n')}\n`;
  }
  if (otherBets.length > 0) {
    copyableBlock += `${otherBets.join('\n')}\n`;
  }
  copyableBlock = copyableBlock.trim();

  const grandTotal = items.reduce((sum, item) => sum + item.amount, 0);
  let detailText = `📦 ยอดส่งออกไปที่: ${targetDealerName}\n`;
  detailText += `--------------------------\n`;
  detailText += `${copyableBlock}\n`;
  detailText += `--------------------------\n`;
  detailText += `💰 ยอดรวมตีออก: ฿${grandTotal.toLocaleString('th-TH')}`;

  return { success: true, message: 'ตีออกสำเร็จ', text: detailText };
}

// Helper: Return (เอาคืน) a previously transferred batch back from the upstream dealer
async function performReturnBatch(
  batchTransfers: any[]
): Promise<{ success: boolean; message: string }> {
  if (!batchTransfers || batchTransfers.length === 0) {
    return { success: false, message: 'ไม่พบรายการตีออกที่ต้องการเอาคืน' };
  }

  const now = new Date().toISOString();
  const transferIds = batchTransfers.map((t) => t.id);
  const upstreamSubIds = batchTransfers
    .map((t) => t.target_submission_id)
    .filter(Boolean);
  const upstreamDealerIds = [
    ...new Set(batchTransfers.map((t) => t.upstream_dealer_id).filter(Boolean))
  ];

  // 1. Soft-delete the submissions that were created in the upstream dealer's round
  if (upstreamSubIds.length > 0) {
    const { error: subErr } = await supabase
      .from('submissions')
      .update({ is_deleted: true, updated_at: now })
      .in('id', upstreamSubIds);

    if (subErr) {
      console.error('Failed to soft-delete upstream submissions on return:', subErr);
    }
  }

  // 2. Delete the bet_transfers rows entirely (matches the web app's
  //    handleRevertTransfers / handleReclaimReturnedTransfers behaviour for the
  //    SENDER reclaiming their own layoff). Using delete (not status='returned')
  //    avoids the web UI treating it as "returned by upstream" and restores the
  //    excess cleanly.
  const { error: delErr } = await supabase
    .from('bet_transfers')
    .delete()
    .in('id', transferIds);

  if (delErr) {
    console.error('Failed to delete bet transfers on return:', delErr);
    return { success: false, message: 'เกิดข้อผิดพลาดทางเทคนิคในการเอาคืนยอดตีออก' };
  }

  // 3. Refresh the upstream dealer's pending credit deduction in the background
  for (const uid of upstreamDealerIds) {
    updatePendingDeduction(uid).catch((err) => {
      console.error('Failed updating upstream pending deduction on return:', err);
    });
  }

  return { success: true, message: 'เอาคืนสำเร็จ' };
}

// Helper: Check Dealer Credit for Bet (Deno port of creditCheck.js)
async function checkDealerCreditForBet(dealerId: string, newBetAmount: number): Promise<{ allowed: boolean; message: string }> {
  try {
    const { data: subscriptions, error: subError } = await supabase
      .from('dealer_subscriptions')
      .select(`
        *,
        subscription_packages (
          id,
          billing_model,
          percentage_rate,
          min_amount_before_charge
        )
      `)
      .eq('dealer_id', dealerId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1);

    const subscription = subscriptions?.[0] || null;
    if (subError || !subscription) {
      return { allowed: true, message: 'No active subscription' };
    }

    const pkg = subscription.subscription_packages;
    const billingModel = subscription.billing_model || pkg?.billing_model;

    if (billingModel !== 'percentage' && billingModel !== 'profit_percentage') {
      return { allowed: true, message: 'Not percentage billing' };
    }

    const percentageRate = pkg?.percentage_rate || 0;

    const { data: creditData } = await supabase
      .from('dealer_credits')
      .select('balance, pending_deduction')
      .eq('dealer_id', dealerId)
      .single();

    const currentBalance = creditData?.balance || 0;
    const currentPendingDeduction = creditData?.pending_deduction || 0;

    const newPendingFee = newBetAmount * (percentageRate / 100);
    const availableCredit = currentBalance - currentPendingDeduction;
    const hasEnoughCredit = availableCredit >= newPendingFee;

    return {
      allowed: hasEnoughCredit,
      message: hasEnoughCredit
        ? 'เครดิตเพียงพอ'
        : `เครดิตไม่เพียงพอ ต้องการ ฿${newPendingFee.toFixed(2)} แต่มีเครดิตคงเหลือ ฿${availableCredit.toFixed(2)}`
    };
  } catch (error: any) {
    console.error('Error checking dealer credit:', error);
    return { allowed: true, message: 'Error checking credit: ' + error.message };
  }
}

// Helper: Update Pending Deduction in Database (Deno port of creditCheck.js)
async function updatePendingDeduction(dealerId: string): Promise<void> {
  try {
    const { data: subscriptions } = await supabase
      .from('dealer_subscriptions')
      .select(`
        id,
        billing_model,
        subscription_packages (
          id,
          billing_model,
          percentage_rate,
          min_amount_before_charge,
          min_deduction,
          max_deduction
        )
      `)
      .eq('dealer_id', dealerId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1);

    const subscription = subscriptions?.[0] || null;
    const pkg = subscription?.subscription_packages;
    const billingModel = subscription?.billing_model || pkg?.billing_model;

    if (!subscription || (billingModel !== 'percentage' && billingModel !== 'profit_percentage')) {
      return;
    }

    const percentageRate = pkg?.percentage_rate || 0;
    const minAmount = pkg?.min_amount_before_charge || 0;
    const minDeduction = pkg?.min_deduction || 0;
    const maxDeduction = pkg?.max_deduction || 100000;

    const { data: rounds } = await supabase
      .from('lottery_rounds')
      .select('id, lottery_type, lottery_name')
      .eq('dealer_id', dealerId)
      .eq('status', 'open');

    if (!rounds || rounds.length === 0) {
      await supabase.from('dealer_credits').update({ pending_deduction: 0, updated_at: new Date().toISOString() }).eq('dealer_id', dealerId);
      await supabase.from('round_pending_credits').delete().eq('dealer_id', dealerId);
      return;
    }

    const { data: memberships } = await supabase
      .from('user_dealer_memberships')
      .select('user_id')
      .eq('dealer_id', dealerId)
      .eq('status', 'active');

    const memberUserIds = (memberships || []).map(m => m.user_id);
    const memberIds = new Set(memberUserIds);

    let dealerCreatedUnchangedIds = new Set<string>();
    if (memberUserIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, password_changed')
        .in('id', memberUserIds);
      
      dealerCreatedUnchangedIds = new Set(
        (memberProfiles || [])
          .filter(p => !p.password_changed)
          .map(p => p.id)
      );
    }

    const { data: downstreamConnections } = await supabase
      .from('dealer_upstream_connections')
      .select('dealer_id, status, is_blocked')
      .eq('upstream_dealer_id', dealerId);
    
    const activeDownstream = (downstreamConnections || []).filter(d => 
      (d.status === 'active' || !d.status) && !d.is_blocked
    );
    const downstreamDealerIds = new Set(activeDownstream.map(d => d.dealer_id));

    let totalPending = 0;

    for (const round of rounds) {
      let allSubs = [];
      try {
        allSubs = await fetchAllSubmissions(round.id);
      } catch (err) {
        console.error("Failed to fetch all submissions in updatePendingDeduction:", err);
      }

      const { data: outgoingTransfers } = await supabase
        .from('bet_transfers')
        .select('amount, status, is_linked')
        .eq('round_id', round.id);
      
      const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned');
      const linkedTransfers = activeTransfers.filter(t => t.is_linked);
      const transferredOutAmount = linkedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

      let dealerOwnVolume = 0;
      let dealerInputForOwnUsers = 0;
      let selfInputVolume = 0;
      let downstreamVolume = 0;

      for (const sub of (allSubs || [])) {
        const amount = parseFloat(sub.amount || '0');
        if (sub.source === 'transfer') {
          downstreamVolume += amount;
        } else if (sub.user_id === dealerId) {
          dealerOwnVolume += amount;
        } else if (downstreamDealerIds.has(sub.user_id)) {
          downstreamVolume += amount;
        } else if (memberIds.has(sub.user_id)) {
          if (dealerCreatedUnchangedIds.has(sub.user_id)) {
            dealerInputForOwnUsers += amount;
          } else if (sub.submitted_by_type === 'user') {
            selfInputVolume += amount;
          } else {
            selfInputVolume += amount;
          }
        } else {
          if (sub.submitted_by_type === 'user') {
            selfInputVolume += amount;
          } else {
            dealerInputForOwnUsers += amount;
          }
        }
      }

      let remainingTransfer = transferredOutAmount;
      let netDealerInputForOwnUsers = dealerInputForOwnUsers;
      let netDealerOwnVolume = dealerOwnVolume;
      let netSelfInputVolume = selfInputVolume;
      let netDownstreamVolume = downstreamVolume;

      if (remainingTransfer > 0) {
        const d = Math.min(remainingTransfer, netDealerInputForOwnUsers);
        netDealerInputForOwnUsers -= d;
        remainingTransfer -= d;
      }
      if (remainingTransfer > 0) {
        const d = Math.min(remainingTransfer, netDealerOwnVolume);
        netDealerOwnVolume -= d;
        remainingTransfer -= d;
      }
      if (remainingTransfer > 0) {
        const d = Math.min(remainingTransfer, netSelfInputVolume);
        netSelfInputVolume -= d;
        remainingTransfer -= d;
      }
      if (remainingTransfer > 0) {
        const d = Math.min(remainingTransfer, netDownstreamVolume);
        netDownstreamVolume -= d;
        remainingTransfer -= d;
      }

      const totalVolume = netDealerOwnVolume + netDealerInputForOwnUsers + netSelfInputVolume + netDownstreamVolume;
      let totalChargeableVolume = 0;
      if (totalVolume > minAmount) {
        totalChargeableVolume = totalVolume - minAmount;
      }

      let roundPending = totalChargeableVolume * (percentageRate / 100);
      if (roundPending > 0 && roundPending < minDeduction) {
        roundPending = minDeduction;
      }
      if (roundPending > maxDeduction) {
        roundPending = maxDeduction;
      }

      totalPending += roundPending;

      const upsertData = {
        round_id: round.id,
        dealer_id: dealerId,
        dealer_input_volume: netDealerOwnVolume + netDealerInputForOwnUsers,
        member_input_volume: netSelfInputVolume,
        upstream_volume: netDownstreamVolume,
        total_chargeable_volume: totalChargeableVolume,
        percentage_rate: percentageRate,
        pending_fee: roundPending,
        is_finalized: false,
        updated_at: new Date().toISOString()
      };

      await supabase.from('round_pending_credits').upsert(upsertData, { onConflict: 'round_id,dealer_id' });
    }

    await supabase.from('dealer_credits').update({ pending_deduction: totalPending, updated_at: new Date().toISOString() }).eq('dealer_id', dealerId);

  } catch (error) {
    console.error('Error updating pending deduction:', error);
  }
}

// Helper: Get Commission settings for user
function getCommissionInfo(lotterySettings: any, betType: string, lotteryType: string) {
  const lotteryKey = lotteryType === 'lao' ? 'lao' : lotteryType === 'hanoi' ? 'hanoi' : 'thai';
  let settingsKey = betType;
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    const LAO_BET_TYPE_MAP: Record<string, string> = {
      '3_top': '3_straight',
      '3_tod': '3_tod_single',
      '4_top': '4_set'
    };
    settingsKey = LAO_BET_TYPE_MAP[betType] || betType;
  }

  const betSettings = lotterySettings?.[lotteryKey]?.[settingsKey];
  if (betSettings?.commission !== undefined) {
    const isFixed = betSettings.isFixed || betSettings.isSet || betType === '4_set' || betType === '4_top';
    return { rate: betSettings.commission, isFixed };
  }

  // Default fallback values
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    if (betType === '4_top' || betType === '4_set') {
      return { rate: 25, isFixed: true };
    }
    const LAO_DEFAULTS: Record<string, number> = {
      'run_top': 10, 'run_bottom': 10,
      'pak_top': 20, 'pak_bottom': 20,
      '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
      '3_top': 20, '3_tod': 20, '3_bottom': 20,
      '4_float': 20, '5_float': 20
    };
    return { rate: LAO_DEFAULTS[betType] !== undefined ? LAO_DEFAULTS[betType] : 20, isFixed: false };
  }

  const DEFAULT_COMMISSIONS: Record<string, number> = {
    '2_top': 15, '2_bottom': 15, '2_front': 15, '2_spread': 15,
    '3_top': 30, '3_tod': 15, '3_bottom': 15,
    'run_top': 10, 'run_bottom': 10
  };
  return { rate: DEFAULT_COMMISSIONS[betType] || 15, isFixed: false };
}

function findMatchingLimit(numberLimits: any[], betType: string, numbers: string) {
  const directMatch = numberLimits.find(
    (nl: any) => nl.bet_type === betType && nl.numbers === numbers
  );
  if (directMatch) return directMatch;

  const reversedMatch = numberLimits.find(
    (nl: any) => nl.bet_type === betType &&
      nl.include_reversed &&
      Array.isArray(nl.reversed_numbers) &&
      nl.reversed_numbers.includes(numbers)
  );
  return reversedMatch || null;
}

function getThaiBetTypeLabel(betType: string, lotteryType: string): string {
  const typeLower = lotteryType.toLowerCase();
  if (typeLower === 'thai') {
    const labels: Record<string, string> = {
      'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
      'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
      '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
      '3_top': '3 ตัวบน', '3_tod': '3 ตัวโต๊ด', '3_bottom': '3 ตัวล่าง',
      '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
    };
    return labels[betType] || betType;
  } else if (typeLower === 'lao' || typeLower === 'hanoi') {
    const labels: Record<string, string> = {
      '4_set': '4 ตัวชุด',
      'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
      'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
      '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
      '3_top': '3 ตัวตรง', '3_straight': '3 ตัวตรง', '3_tod': '3 ตัวโต๊ด', '3_tod_single': '3 ตัวโต๊ด',
      '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
    };
    return labels[betType] || betType;
  } else {
    const labels: Record<string, string> = {
      '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง'
    };
    return labels[betType] || betType;
  }
}

function parseWinningNumbers(param: string, lotteryType: string): any | null {
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
    const match = clean.match(/^(\d{6})\/(\d{2})$/);
    if (match) {
      const top6 = match[1];
      const bot2 = match[2];
      return {
        '6_top': top6,
        '3_top': top6.slice(-3),
        '2_top': top6.slice(-2),
        '2_bottom': bot2,
        '3_bottom': []
      };
    }
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

async function fetchAllSubmissions(roundId: string, filterUserId?: string | null): Promise<any[]> {
  let allSubs: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from('submissions')
      .select('id, amount, user_id, source, submitted_by_type, commission_amount, prize_amount, is_winner, bet_type, numbers, created_at, bill_id, bill_note, entry_id')
      .eq('round_id', roundId)
      .eq('is_deleted', false)
      .range(from, to);

    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching submissions page:", error);
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    allSubs.push(...data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }
  return allSubs;
}

async function fetchAllDealerMembers(dealerId: string): Promise<any[]> {
  let allMembers: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('user_dealer_memberships')
      .select('user_id')
      .eq('dealer_id', dealerId)
      .eq('status', 'active')
      .range(from, to);
    if (error) {
      console.error("Error fetching dealer members page:", error);
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    allMembers.push(...data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }
  return allMembers;
}

async function calculateRoundCreditFeeDeno(dealerId: string, roundId: string): Promise<{ fee: number; details: any }> {
  const { data: subscriptions } = await supabase
    .from('dealer_subscriptions')
    .select(`
      *,
      subscription_packages (
        id,
        billing_model,
        percentage_rate,
        min_amount_before_charge,
        min_deduction,
        max_deduction
      )
    `)
    .eq('dealer_id', dealerId)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1);

  const subscription = subscriptions?.[0] || null;
  const pkg = subscription?.subscription_packages;
  const billingModel = subscription?.billing_model || pkg?.billing_model;

  if (!subscription || (billingModel !== 'percentage' && billingModel !== 'profit_percentage')) {
    return { fee: 0, details: { reason: 'Not percentage billing', billingModel } };
  }

  const percentageRate = pkg?.percentage_rate || 0;
  const minAmount = pkg?.min_amount_before_charge || 0;
  const minDeduction = pkg?.min_deduction || 0;
  const maxDeduction = pkg?.max_deduction || 100000;

  const memberships = await fetchAllDealerMembers(dealerId);
  const memberUserIds = memberships.map(m => m.user_id);
  const memberIds = new Set(memberUserIds);

  let dealerCreatedUnchangedIds = new Set<string>();
  if (memberUserIds.length > 0) {
    const chunks = [];
    const chunkSize = 500;
    for (let i = 0; i < memberUserIds.length; i += chunkSize) {
      chunks.push(memberUserIds.slice(i, i + chunkSize));
    }
    for (const chunk of chunks) {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, password_changed')
        .in('id', chunk);
      
      if (memberProfiles) {
        for (const p of memberProfiles) {
          if (!p.password_changed) {
            dealerCreatedUnchangedIds.add(p.id);
          }
        }
      }
    }
  }

  const { data: downstreamConnections } = await supabase
    .from('dealer_upstream_connections')
    .select('dealer_id, status, is_blocked')
    .eq('upstream_dealer_id', dealerId);
  
  const activeDownstream = (downstreamConnections || []).filter(d => 
    (d.status === 'active' || !d.status) && !d.is_blocked
  );
  const downstreamDealerIds = new Set(activeDownstream.map(d => d.dealer_id));

  const allSubs = await fetchAllSubmissions(roundId);

  const { data: outgoingTransfers } = await supabase
    .from('bet_transfers')
    .select('amount, status, is_linked')
    .eq('round_id', roundId);
  
  const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned');
  const linkedTransfers = activeTransfers.filter(t => t.is_linked);
  const transferredOutAmount = linkedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

  let dealerOwnVolume = 0;
  let dealerInputForOwnUsers = 0;
  let selfInputVolume = 0;
  let downstreamVolume = 0;

  for (const sub of allSubs) {
    const amount = parseFloat(sub.amount || '0');
    if (sub.source === 'transfer') {
      downstreamVolume += amount;
    } else if (sub.user_id === dealerId) {
      dealerOwnVolume += amount;
    } else if (downstreamDealerIds.has(sub.user_id)) {
      downstreamVolume += amount;
    } else if (memberIds.has(sub.user_id)) {
      if (dealerCreatedUnchangedIds.has(sub.user_id)) {
        dealerInputForOwnUsers += amount;
      } else {
        selfInputVolume += amount;
      }
    } else {
      if (sub.submitted_by_type === 'user') {
        selfInputVolume += amount;
      } else {
        dealerInputForOwnUsers += amount;
      }
    }
  }

  let remainingTransfer = transferredOutAmount;
  let netDealerInputForOwnUsers = dealerInputForOwnUsers;
  let netDealerOwnVolume = dealerOwnVolume;
  let netSelfInputVolume = selfInputVolume;
  let netDownstreamVolume = downstreamVolume;

  if (remainingTransfer > 0) {
    const d = Math.min(remainingTransfer, netDealerInputForOwnUsers);
    netDealerInputForOwnUsers -= d;
    remainingTransfer -= d;
  }
  if (remainingTransfer > 0) {
    const d = Math.min(remainingTransfer, netDealerOwnVolume);
    netDealerOwnVolume -= d;
    remainingTransfer -= d;
  }
  if (remainingTransfer > 0) {
    const d = Math.min(remainingTransfer, netSelfInputVolume);
    netSelfInputVolume -= d;
    remainingTransfer -= d;
  }
  if (remainingTransfer > 0) {
    const d = Math.min(remainingTransfer, netDownstreamVolume);
    netDownstreamVolume -= d;
    remainingTransfer -= d;
  }

  const totalVolume = netDealerOwnVolume + netDealerInputForOwnUsers + netSelfInputVolume + netDownstreamVolume;
  let totalChargeableVolume = 0;
  if (totalVolume > minAmount) {
    totalChargeableVolume = totalVolume - minAmount;
  }

  let fee = totalChargeableVolume * (percentageRate / 100);
  if (fee > 0 && fee < minDeduction) fee = minDeduction;
  if (fee > maxDeduction) fee = maxDeduction;

  return {
    fee,
    details: {
      billingModel,
      dealerOwnVolume: netDealerOwnVolume,
      dealerInputForOwnUsers: netDealerInputForOwnUsers,
      selfInputVolume: netSelfInputVolume,
      downstreamVolume: netDownstreamVolume,
      transferredOutAmount,
      totalChargeableVolume,
      percentageRate,
      minAmount,
      minDeduction,
      maxDeduction
    }
  };
}

async function deductAdditionalCreditForRoundDeno(dealerId: string, roundId: string, previouslyCharged: number): Promise<{ success: boolean; amountDeducted: number; message: string }> {
  try {
    const { fee: currentFee } = await calculateRoundCreditFeeDeno(dealerId, roundId);
    const additionalAmount = Math.max(0, currentFee - previouslyCharged);

    if (additionalAmount <= 0) {
      return {
        success: true,
        amountDeducted: 0,
        message: 'ไม่มียอดเครดิตที่ต้องตัดเพิ่ม'
      };
    }

    const { data: creditData } = await supabase
      .from('dealer_credits')
      .select('balance')
      .eq('dealer_id', dealerId)
      .single();

    const currentBalance = creditData?.balance || 0;
    const actualDeduction = Math.min(additionalAmount, currentBalance);

    if (actualDeduction > 0) {
      const { error: updateError } = await supabase
        .from('dealer_credits')
        .update({
          balance: currentBalance - actualDeduction,
          updated_at: new Date().toISOString()
        })
        .eq('dealer_id', dealerId);

      if (updateError) throw updateError;

      await supabase
        .from('credit_transactions')
        .insert({
          dealer_id: dealerId,
          transaction_type: 'deduction',
          amount: -actualDeduction,
          balance_after: currentBalance - actualDeduction,
          reference_type: 'round',
          reference_id: roundId,
          description: `ค่าธรรมเนียมเพิ่มเติมจากการแก้ไขงวด (LINE Bot)`,
          metadata: { type: 'additional_deduction', currentFee, previouslyCharged }
        });
    }

    await supabase
      .from('lottery_rounds')
      .update({
        charged_credit_amount: currentFee
      })
      .eq('id', roundId);

    return {
      success: true,
      amountDeducted: actualDeduction,
      message: actualDeduction > 0 
        ? `ตัดเครดิตเพิ่ม ฿${actualDeduction.toLocaleString('th-TH', {minimumFractionDigits: 2})}` 
        : 'ไม่มียอดเครดิตที่ต้องตัดเพิ่ม'
    };
  } catch (error: any) {
    console.error('Error in deductAdditionalCreditForRoundDeno:', error);
    return {
      success: false,
      amountDeducted: 0,
      message: 'เกิดข้อผิดพลาดในการตัดเครดิต: ' + error.message
    };
  }
}

async function deductProfitBasedCreditDeno(dealerId: string, roundId: string, previousPendingAmount: number): Promise<{ success: boolean; amountDeducted: number; profitAmount: number; message: string }> {
  try {
    const { data: subscriptions } = await supabase
      .from('dealer_subscriptions')
      .select(`
        *,
        subscription_packages (
          id,
          billing_model,
          percentage_rate,
          profit_percentage_rate,
          min_amount_before_charge,
          min_deduction,
          max_deduction
        )
      `)
      .eq('dealer_id', dealerId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1);

    const subscription = subscriptions?.[0] || null;
    const pkg = subscription?.subscription_packages;
    const billingModel = subscription?.billing_model || pkg?.billing_model;

    if (!subscription || billingModel !== 'profit_percentage') {
      return {
        success: true,
        amountDeducted: 0,
        profitAmount: 0,
        message: 'Not profit_percentage billing'
      };
    }

    const profitPercentageRate = pkg?.profit_percentage_rate || 0;
    const minDeduction = pkg?.min_deduction || 0;
    const maxDeduction = pkg?.max_deduction || 100000;

    const { data: roundData } = await supabase
      .from('lottery_rounds')
      .select('lottery_type, set_prices, winning_numbers')
      .eq('id', roundId)
      .single();

    if (!roundData) {
      return { success: false, amountDeducted: 0, profitAmount: 0, message: 'Round not found' };
    }

    const allSubs = await fetchAllSubmissions(roundId);

    let incomingTotalBet = 0;
    let incomingTotalCommission = 0;
    let incomingTotalPayout = 0;
    for (const sub of allSubs) {
      incomingTotalBet += parseFloat(sub.amount || '0');
      incomingTotalCommission += parseFloat(sub.commission_amount || '0');
      if (sub.is_winner) {
        incomingTotalPayout += parseFloat(sub.prize_amount || '0');
      }
    }
    const dealerProfit = incomingTotalBet - incomingTotalPayout - incomingTotalCommission;

    const { data: outgoingTransfers } = await supabase
      .from('bet_transfers')
      .select('amount, status, target_submission_id, is_linked, bet_type, numbers')
      .eq('round_id', roundId);
    
    const activeOutgoing = (outgoingTransfers || []).filter((t: any) => t.status !== 'returned');
    const outgoingBetAmount = activeOutgoing.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);

    let outgoingTotalWin = 0;
    let outgoingTotalCommission = 0;

    const linkedOutgoing = activeOutgoing.filter((t: any) => t.target_submission_id);
    if (linkedOutgoing.length > 0) {
      const targetSubIds = linkedOutgoing.map((t: any) => t.target_submission_id);
      const { data: targetSubs } = await supabase
        .from('submissions')
        .select('id, amount, prize_amount, is_winner, bet_type')
        .in('id', targetSubIds)
        .eq('is_deleted', false);

      const targetSubsMap = (targetSubs || []).reduce((map: any, s: any) => {
        map[s.id] = s;
        return map;
      }, {});

      for (const t of linkedOutgoing) {
        const ts = targetSubsMap[t.target_submission_id];
        if (ts) {
          if (ts.is_winner) {
            if (ts.bet_type === '4_set') {
              const setPrice = roundData?.set_prices?.['4_top'] || 120;
              const numSets = Math.max(1, Math.floor(parseFloat(ts.amount || '0') / setPrice));
              outgoingTotalWin += parseFloat(ts.prize_amount || '0') * numSets;
            } else {
              outgoingTotalWin += parseFloat(ts.prize_amount || '0');
            }
          }
          let commRate = DEFAULT_COMMISSIONS[ts.bet_type] || 15;
          if (roundData.lottery_type === 'lao' || roundData.lottery_type === 'hanoi') {
            const LAO_DEFAULTS: Record<string, number> = {
              'run_top': 10, 'run_bottom': 10,
              'pak_top': 20, 'pak_bottom': 20,
              '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
              '3_top': 20, '3_tod': 20, '3_bottom': 20,
              '4_float': 20, '5_float': 20
            };
            commRate = LAO_DEFAULTS[ts.bet_type] !== undefined ? LAO_DEFAULTS[ts.bet_type] : 20;
          }
          outgoingTotalCommission += parseFloat(ts.amount || '0') * (commRate / 100);
        }
      }
    }

    const externalOutgoing = activeOutgoing.filter((t: any) => !t.target_submission_id);
    for (const t of externalOutgoing) {
      let commRate = DEFAULT_COMMISSIONS[t.bet_type] || 15;
      if (roundData.lottery_type === 'lao' || roundData.lottery_type === 'hanoi') {
        const LAO_DEFAULTS: Record<string, number> = {
          'run_top': 10, 'run_bottom': 10,
          'pak_top': 20, 'pak_bottom': 20,
          '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
          '3_top': 20, '3_tod': 20, '3_bottom': 20,
          '4_float': 20, '5_float': 20
        };
        commRate = LAO_DEFAULTS[t.bet_type] !== undefined ? LAO_DEFAULTS[t.bet_type] : 20;
      }
      outgoingTotalCommission += parseFloat(t.amount || '0') * (commRate / 100);

      const setPrice = roundData?.set_prices?.['4_top'] || 120;
      const res = checkTransferWin(
        t.bet_type,
        t.numbers || '',
        roundData.winning_numbers,
        roundData.lottery_type,
        parseFloat(t.amount || '0'),
        setPrice,
        DEFAULT_4_SET_SETTINGS.prizes
      );
      if (res.wins) {
        outgoingTotalWin += res.payout;
      }
    }

    const outgoingProfit = outgoingTotalWin + outgoingTotalCommission - outgoingBetAmount;
    const totalProfit = dealerProfit + outgoingProfit;

    const { data: existingDeductions } = await supabase
      .from('credit_transactions')
      .select('id, amount')
      .eq('dealer_id', dealerId)
      .eq('reference_id', roundId)
      .eq('reference_type', 'round')
      .eq('transaction_type', 'deduction')
      .not('metadata->>type', 'eq', 'profit_percentage_deduction');

    const previouslyDeducted = (existingDeductions || []).reduce(
      (sum, t) => sum + Math.abs(parseFloat(t.amount || '0')), 0
    );
    const refundAmount = Math.max(previousPendingAmount, previouslyDeducted);

    const { data: creditData } = await supabase
      .from('dealer_credits')
      .select('balance, pending_deduction, outstanding_debt')
      .eq('dealer_id', dealerId)
      .single();

    const currentBalance = creditData?.balance || 0;
    const currentPending = creditData?.pending_deduction || 0;
    const currentDebt = creditData?.outstanding_debt || 0;

    let newBalance = currentBalance + refundAmount;
    let newPending = Math.max(0, currentPending - refundAmount);

    let profitFee = 0;
    if (totalProfit > 0) {
      profitFee = totalProfit * (profitPercentageRate / 100);
      if (profitFee > 0 && profitFee < minDeduction) profitFee = minDeduction;
      if (profitFee > maxDeduction) profitFee = maxDeduction;
    }

    let newOutstandingDebt = currentDebt;
    if (profitFee > 0) {
      newBalance = newBalance - profitFee;
      if (newBalance < 0) {
        newOutstandingDebt = currentDebt + Math.abs(newBalance);
      }
    }

    await supabase
      .from('dealer_credits')
      .update({
        balance: newBalance,
        pending_deduction: newPending,
        outstanding_debt: newOutstandingDebt,
        updated_at: new Date().toISOString()
      })
      .eq('dealer_id', dealerId);

    if (refundAmount > 0) {
      await supabase
        .from('credit_transactions')
        .insert({
          dealer_id: dealerId,
          transaction_type: 'refund',
          amount: refundAmount,
          balance_after: newBalance + profitFee,
          reference_type: 'round',
          reference_id: roundId,
          description: `คืนเครดิตค่าธรรมเนียมทันที (ก่อนคำนวณกำไร) (LINE Bot)`,
          metadata: { type: 'profit_percentage_refund', refundAmount, previousPendingAmount }
        });
    }

    if (profitFee > 0) {
      await supabase
        .from('credit_transactions')
        .insert({
          dealer_id: dealerId,
          transaction_type: 'deduction',
          amount: -profitFee,
          balance_after: newBalance,
          reference_type: 'round',
          reference_id: roundId,
          description: `ค่าบริการจากกำไร (${profitPercentageRate}%) (LINE Bot)`,
          metadata: {
            type: 'profit_percentage_deduction',
            profit: totalProfit,
            profitPercentageRate,
            profitFee
          }
        });
    }

    await supabase
      .from('lottery_rounds')
      .update({ charged_credit_amount: profitFee })
      .eq('id', roundId);

    await supabase
      .from('round_pending_credits')
      .delete()
      .eq('round_id', roundId)
      .eq('dealer_id', dealerId);

    return {
      success: true,
      amountDeducted: profitFee,
      profitAmount: totalProfit,
      message: totalProfit > 0
        ? `ตัดเครดิตจากกำไร ฿${profitFee.toLocaleString('th-TH', {minimumFractionDigits: 2})} (กำไร ฿${totalProfit.toLocaleString('th-TH', {minimumFractionDigits: 2})} × ${profitPercentageRate}%)`
        : 'ไม่มีกำไร ไม่ตัดเครดิต'
    };
  } catch (error: any) {
    console.error('Error in deductProfitBasedCreditDeno:', error);
    return {
      success: false,
      amountDeducted: 0,
      profitAmount: 0,
      message: 'เกิดข้อผิดพลาดในการตัดเครดิต: ' + error.message
    };
  }
}

// Helper: Build the red "ปิดรับแทงแล้ว" Flex message for a round
function buildCloseFlexMessage(round: any): Record<string, any> {
  const lotteryType = (round?.lottery_type || '').toString()
  const dateText = getRoundDisplayDate(round, false)
  const titleLine = `${round?.lottery_name || lotteryType.toUpperCase()} - งวดวันที่ ${dateText}`
  return {
    "type": "flex",
    "altText": `🔴 ปิดรับแทง ${lotteryType.toUpperCase()} งวดวันที่ ${dateText}`,
    "contents": {
      "type": "bubble",
      "size": "mega",
      "body": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#dc2626",
        "paddingAll": "xxl",
        "justifyContent": "center",
        "alignItems": "center",
        "contents": [
          {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#ffffff",
            "cornerRadius": "100px",
            "width": "140px",
            "height": "140px",
            "justifyContent": "center",
            "alignItems": "center",
            "contents": [
              { "type": "text", "text": "ปิด", "weight": "bold", "size": "3xl", "color": "#dc2626", "align": "center" }
            ]
          },
          { "type": "text", "text": "ปิดรับแทงแล้ว", "weight": "bold", "size": "xl", "color": "#ffffff", "align": "center", "margin": "xl" },
          { "type": "text", "text": titleLine, "size": "sm", "color": "#fecaca", "align": "center", "margin": "md", "wrap": true }
        ]
      }
    }
  }
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const bodyText = await req.text()

    let isProcessingQueue = false
    let currentQueueId = ""
    let payloadToProcess: any = null

    // Check if it is a JSON API call from our frontend
    let isApiCall = false
    let apiPayload: any = null
    try {
      apiPayload = JSON.parse(bodyText)
      if (apiPayload && apiPayload.action === 'refresh_group_names') {
        isApiCall = true
      }
    } catch (e) {
      // not JSON or not the action we want
    }

    // ─── BACKGROUND QUEUE PROCESSOR: process_queue ───
    if (apiPayload && apiPayload.action === 'process_queue') {
      const { data: secretRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'line_bot_cron_secret')
        .maybeSingle()

      const expectedSecret = secretRow?.value || ''
      if (!expectedSecret || apiPayload.secret !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const queueId = apiPayload.queue_id
      if (!queueId) {
        return new Response(JSON.stringify({ error: 'Missing queue_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      try {
        const { data: queueItem, error: fetchErr } = await supabase
          .from('line_webhook_queue')
          .select('*')
          .eq('id', queueId)
          .single()

        if (fetchErr || !queueItem) {
          throw new Error(`Queue item ${queueId} not found: ${fetchErr?.message || 'unknown error'}`)
        }

        if (queueItem.status !== 'pending') {
          return new Response(JSON.stringify({ success: true, message: `Queue item already processed` }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        await supabase
          .from('line_webhook_queue')
          .update({ status: 'processing', processed_at: new Date().toISOString() })
          .eq('id', queueId)

        payloadToProcess = queueItem.payload
        isProcessingQueue = true
        currentQueueId = queueId
      } catch (err: any) {
        console.error('Error starting queue processing:', err)
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // ─── CRON CALLBACK: auto-close round + notify groups ───
    // Triggered by the pg_cron worker (process_due_round_closures) via pg_net.
    // Authorized by a shared secret stored in app_settings (no JWT needed).
    if (apiPayload && apiPayload.action === 'auto_close_notify') {
      const { data: secretRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'line_bot_cron_secret')
        .maybeSingle()

      const expectedSecret = secretRow?.value || ''
      if (!expectedSecret || apiPayload.secret !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const roundId = apiPayload.round_id
      if (!roundId) {
        return new Response(JSON.stringify({ error: 'Missing round_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: round } = await supabase
        .from('lottery_rounds')
        .select('id, dealer_id, lottery_type, lottery_name, round_date, close_time, notify_close_to_groups')
        .eq('id', roundId)
        .maybeSingle()

      if (!round) {
        return new Response(JSON.stringify({ error: 'Round not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check if notifications are enabled for this round in the UI settings
      if (round.notify_close_to_groups === false) {
        return new Response(JSON.stringify({ success: true, round_id: roundId, message: 'Notifications disabled by setting' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: groups } = await supabase
        .from('line_groups')
        .select('line_group_id')
        .eq('dealer_id', round.dealer_id)
        .eq('lottery_type', round.lottery_type)
        .eq('is_active', true)

      let groupsToNotify: any[] = [];
      
      if (groups && groups.length > 0) {
        // Fetch all active submissions for this round to see which users bet
        let submissions = [];
        try {
          submissions = await fetchAllSubmissions(roundId);
        } catch (err) {
          console.error("Failed to fetch all submissions in sendResultAnnouncementNotification:", err);
        }

        const activeUserIds = [...new Set((submissions || []).map((s: any) => s.user_id).filter(Boolean))];
        const groupIds = groups.map((g: any) => g.line_group_id).filter(Boolean);

        if (activeUserIds.length > 0 && groupIds.length > 0) {
          // Query line_group_members to find which of the dealer's groups contain these active users
          const { data: activeMembers } = await supabase
            .from('line_group_members')
            .select('line_group_id')
            .in('line_group_id', groupIds)
            .in('user_id', activeUserIds);

          const activeGroupIds = new Set((activeMembers || []).map((m: any) => m.line_group_id));
          groupsToNotify = groups.filter((g: any) => activeGroupIds.has(g.line_group_id));
        }
      }

      const closeFlexMessage = buildCloseFlexMessage(round)
      let sent = 0
      for (const g of groupsToNotify) {
        try {
          await sendLinePush(g.line_group_id, closeFlexMessage)
          sent++
        } catch (e) {
          console.error(`auto_close_notify: failed pushing to group ${g.line_group_id}:`, e)
        }
      }

      return new Response(JSON.stringify({ success: true, round_id: roundId, groups_notified: sent }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (isApiCall) {
      const authHeader = req.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized: missing authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify the user token using Supabase auth
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const dealerId = user.id
      // Fetch active groups for this dealer
      const { data: groups, error: groupsErr } = await supabase
        .from('line_groups')
        .select('id, line_group_id')
        .eq('dealer_id', dealerId)
        .eq('is_active', true)

      if (groupsErr) {
        return new Response(JSON.stringify({ error: groupsErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const updatedGroups = []
      for (const g of (groups || [])) {
        if (g.line_group_id.startsWith('C')) {
          const name = await fetchGroupName(g.line_group_id)
          if (name) {
            await supabase
              .from('line_groups')
              .update({ group_name: name })
              .eq('id', g.id)
            updatedGroups.push({ id: g.id, group_name: name })
          }
        }
      }

      return new Response(JSON.stringify({ success: true, updated: updatedGroups }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Otherwise it is the LINE webhook
    const signature = req.headers.get('x-line-signature') || ''

    let payload: any;
    let events: any[] = [];

    if (isProcessingQueue) {
      payload = payloadToProcess;
      events = payload?.events || [];
    } else {
      // Verify LINE Webhook signature
      if (LINE_CHANNEL_SECRET) {
        const isValid = await verifySignature(bodyText, signature, LINE_CHANNEL_SECRET)

        if (!isValid) {
          console.warn("Invalid signature detected");
          return new Response('Invalid signature', { status: 401 })
        }
      } else {
        console.warn("LINE_CHANNEL_SECRET not set, signature verification skipped.");
      }

      // --- ENQUEUE WEBHOOOK IN BACKGROUND QUEUE ---
      const { data: qItem, error: qErr } = await supabase
        .from('line_webhook_queue')
        .insert({
          payload: JSON.parse(bodyText),
          status: 'pending'
        })
        .select('id')
        .maybeSingle();

      if (qErr) {
        console.error("Failed to enqueue webhook payload, falling back to synchronous execution:", qErr);
        // Fallback: continue processing synchronously
        payload = JSON.parse(bodyText);
        events = payload.events || [];
      } else {
        // Enqueue succeeded. Return HTTP 200 OK immediately to LINE!
        return new Response(JSON.stringify({ success: true, queued: true, id: qItem?.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }
    }

    for (const event of events) {
      const replyToken = event.replyToken
      // memberLeft and leave events do not have a replyToken
      if (!replyToken && event.type !== 'memberLeft' && event.type !== 'leave') {
        continue
      }

      try {
        const userId = event.source?.userId || ''
        const groupId = event.source?.groupId || event.source?.roomId || userId
        const sourceType = event.source?.type || 'user'

        console.log(`[LINE BOT EVENT] type: ${event.type}, userId: ${userId}, groupId: ${groupId}, text: ${event.message?.text || ''}`);

      // Automatically upsert group member details in the background if event comes from a group or room
      if (userId && (groupId.startsWith('C') || groupId.startsWith('R'))) {
        upsertGroupMember(groupId, userId, sourceType).catch(err => {
          console.error("Failed to upsert group member in background:", err);
        });
      }

      // Handle Group/Room Join
      if (event.type === 'join') {
        const welcomeText = `สวัสดีค่ะ! ยินดีต้อนรับสู่ระบบ LINE Bot รับโพยหวย Big Lotto 🤖\n\nกรุณาพิมพ์:\n/bind [รหัสผูกกลุ่ม]\n\nเพื่อเชื่อมโยงกลุ่มแชทนี้เข้ากับระบบเจ้ามือหลักของท่านค่ะ`;
        await sendLineReply(replyToken, welcomeText);
        continue;
      }

      // Handle Member Joined Group/Room
      if (event.type === 'memberJoined') {
        const joinedMembers = event.joined?.members || [];
        if (joinedMembers.length === 0) continue;

        // Fetch group link information to check dealer
        const { data: groupLink } = await supabase
          .from('line_groups')
          .select('dealer_id, group_name')
          .eq('line_group_id', groupId)
          .eq('is_active', true)
          .maybeSingle();

        if (!groupLink) {
          // If this group is not bound to a dealer, ignore
          continue;
        }

        const dealerId = groupLink.dealer_id;
        const welcomeMsgs: string[] = [];

        for (const member of joinedMembers) {
          const mUserId = member.userId;
          if (!mUserId) continue;

          // 1. Fetch LINE display name
          const userProfile = await fetchLineUserProfile(groupId, mUserId, event.source?.type || 'group');
          const displayName = userProfile?.displayName || 'คุณสมาชิกใหม่';

          // 2. Check if profile exists
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('line_user_id', mUserId)
            .maybeSingle();

          let targetProfileId: string | null = null;

          if (existingProfile) {
            targetProfileId = existingProfile.id;
            // Check/insert membership
            const { data: existingMembership } = await supabase
              .from('user_dealer_memberships')
              .select('id')
              .eq('user_id', existingProfile.id)
              .eq('dealer_id', dealerId)
              .maybeSingle();

            if (!existingMembership) {
              await supabase
                .from('user_dealer_memberships')
                .insert({
                  user_id: existingProfile.id,
                  dealer_id: dealerId,
                  status: 'active'
                });
            }
            welcomeMsgs.push(`ยินดีต้อนรับคุณ ${existingProfile.full_name} กลับสู่กลุ่มค่ะ! 🎉\n(LINE User ID: ${mUserId})`);
          } else {
            // Create dummy auth user
            const dummyEmail = `line_${mUserId}@lotto-line-bot.local`;
            const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
              email: dummyEmail,
              password: Math.random().toString(36).substring(2, 12),
              email_confirm: true,
              user_metadata: { full_name: displayName }
            });

            if (authErr) {
              console.error(`Error auto-creating auth user for LINE member ${mUserId}:`, authErr);
              welcomeMsgs.push(`ยินดีต้อนรับสมาชิกใหม่เข้าสู่กลุ่มค่ะ! 🎉\n(LINE User ID: ${mUserId})\n\n* กรุณาแจ้งให้เจ้ามือแอดชื่อในระบบด้วยนะคะ`);
            } else {
              const newUserId = authUser.user.id;
              targetProfileId = newUserId;
              // Update profile
              await supabase
                .from('profiles')
                .update({ line_user_id: mUserId, full_name: displayName })
                .eq('id', newUserId);

              // Insert membership
              await supabase
                .from('user_dealer_memberships')
                .insert({
                  user_id: newUserId,
                  dealer_id: dealerId,
                  status: 'active'
                });

              welcomeMsgs.push(`ยินดีต้อนรับคุณ ${displayName} สมาชิกใหม่เข้าสู่กลุ่มค่ะ! 🎉\n(LINE User ID: ${mUserId})\n\nบอทได้ทำการบันทึกข้อมูลเรียบร้อยแล้วค่ะ สมาชิกสามารถพิมพ์ส่งโพยได้ทันที 🤖`);
            }
          }

          // 3. Upsert into line_group_members in the background
          upsertGroupMember(groupId, mUserId, event.source?.type || 'group', displayName, targetProfileId).catch(err => {
            console.error(`Error background upserting joined member ${mUserId} in group ${groupId}:`, err);
          });
        }

        if (welcomeMsgs.length > 0) {
          await sendLineReply(replyToken, welcomeMsgs.join('\n\n------------------\n\n'));
        }
        continue;
      }

      // Handle Member Left Group/Room
      if (event.type === 'memberLeft') {
        const leftMembers = event.left?.members || [];
        if (leftMembers.length === 0) continue;

        for (const member of leftMembers) {
          const mUserId = member.userId;
          if (!mUserId) continue;

          // Delete from line_group_members
          const { error: deleteErr } = await supabase
            .from('line_group_members')
            .delete()
            .eq('line_group_id', groupId)
            .eq('line_user_id', mUserId);

          if (deleteErr) {
            console.error(`Error deleting left member ${mUserId} from group ${groupId}:`, deleteErr);
          } else {
            console.log(`Successfully deleted left member ${mUserId} from group ${groupId}`);
          }
        }
        continue;
      }

      // Handle Bot Leaving Group/Room (kicked or manually left)
        if (event.type === 'leave') {
        console.log(`Bot left group/room: ${groupId}`);
        // 1. Deactivate the group link in line_groups
        await supabase
          .from('line_groups')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('line_group_id', groupId);

        // 2. Remove all members of this group from line_group_members
        await supabase
          .from('line_group_members')
          .delete()
          .eq('line_group_id', groupId);

        continue;
      }

        // Handle Text Message
        if (event.type === 'message' && event.message?.type === 'text') {
          const text = event.message.text.trim();

          // Fetch group link details if in a group or room
          let groupLink = null;
          if (groupId && (groupId.startsWith('C') || groupId.startsWith('R'))) {
            const { data: gl } = await supabase
              .from('line_groups')
              .select('*')
              .eq('line_group_id', groupId)
              .eq('is_active', true)
              .maybeSingle();
            groupLink = gl;
          }

          // ─── MANAGER COMMANDS ROUTER ───
          const isManagerCommand = 
            text.startsWith('/stats') || text.startsWith('/สมาชิก') || text.startsWith('/ยอดสมาชิก') ||
            text.startsWith('/total') || text.startsWith('/ยอดรวม') ||
            text.startsWith('/เลขรวม') || text.startsWith('/เลขเหลือ') ||
            text.startsWith('/เลขตี') || text.startsWith('/เลขตีออก') ||
            text.startsWith('/excess') || text.startsWith('/ยอดเกิน') ||
            text.startsWith('/transfer') || text.startsWith('/ตีออก') ||
            text.startsWith('/เอาคืน') || text.startsWith('/return') ||
            text.startsWith('/คนส่ง') || text.startsWith('/ใครส่ง') || text.startsWith('/ส่งเลข') ||
            text.startsWith('/summary') || text.startsWith('/สรุป') ||
            text.startsWith('/help') || text.startsWith('/คำสั่ง') ||
            text.startsWith('/แจ้งผล') ||
            text.startsWith('/กำไร') ||
            text.startsWith('/สร้าง') ||
            text === '/เปิด' || text === '/ปิด' || text === '/เริ่มขาย' ||
            text.toLowerCase() === 'y' || text === 'ยืนยัน';

          if (isManagerCommand) {
            if (!groupLink) {
              // Not a registered group, ignore it
              continue;
            }

            const dealerId = groupLink.dealer_id;

            // 2. Check manager permissions
            const { data: manager } = await supabase
              .from('line_managers')
              .select('*')
              .eq('dealer_id', dealerId)
              .eq('line_user_id', userId)
              .eq('is_active', true)
              .maybeSingle();

            // Verify sender profile to check role
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, is_active, role')
              .eq('line_user_id', userId)
              .eq('is_active', true)
              .maybeSingle();

            const isStaff = profile?.role === 'dealer' || profile?.role === 'superadmin' || profile?.role === 'admin';
            const isAdminOrDealer = isStaff || (manager && manager.role === 'admin');

            const isTotalCommand = text.startsWith('/total') || text.startsWith('/ยอดรวม');
            const isSummaryCommand = text.startsWith('/summary') || text.startsWith('/สรุป');
            const isHelpCommand = text.startsWith('/help') || text.startsWith('/คำสั่ง');
            const isReportCommand = text.startsWith('/แจ้งผล');
            const isOpenCloseCommand = text === '/เปิด' || text === '/ปิด' || text === '/เริ่มขาย' || text.startsWith('/สร้าง');
            let showOwnOnly = false;
            let targetUserId: string | null = null;
            let memberProfileName = '';

            if (!manager && !isStaff) {
              if (isTotalCommand || isSummaryCommand || isHelpCommand || isOpenCloseCommand || isReportCommand) {
                // Check member permissions toggles
                const memberPerms = groupLink.member_permissions || {};

                if (isTotalCommand && memberPerms.total === false) {
                  await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานรายงานยอดรวมสำหรับสมาชิกในกลุ่มนี้`);
                  continue;
                }

                if (isSummaryCommand && memberPerms.summary === false) {
                  await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานสรุปยอดและรางวัลสำหรับสมาชิกในกลุ่มนี้`);
                  continue;
                }

                if (isHelpCommand && memberPerms.help === false) {
                  await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานคู่มือคำสั่งในกลุ่มนี้`);
                  continue;
                }

                if (!profile) {
                  // If they typed a slash command but are not linked, notify them so they can copy their LINE User ID
                  await sendLineReply(replyToken, [
                    `❌ คุณยังไม่ได้เชื่อมบัญชี LINE ของคุณกับระบบ Big Lotto\nกรุณานำ LINE User ID ด้านล่างไปใส่ในเมนูโปรไฟล์บนเว็บเพื่อเชื่อมต่อ \nหรือแจ้ง admin เพื่อช่วยเหลือในการเชื่อมต่อ`,
                    userId
                  ]);
                  continue;
                }

                // Check active membership with the group's dealer
                const { data: membership } = await supabase
                  .from('user_dealer_memberships')
                  .select('id')
                  .eq('user_id', profile.id)
                  .eq('dealer_id', dealerId)
                  .eq('status', 'active')
                  .maybeSingle();

                if (!membership) {
                  await sendLineReply(replyToken, `❌ ขออภัยค่ะ คุณ ${profile.full_name} ไม่มีสิทธิ์ใช้งานกลุ่มนี้ หรือสิทธิ์ของท่านถูกระงับชั่วคราว`);
                  continue;
                }

                if (isOpenCloseCommand || isReportCommand) {
                  let replyMsg = `❌ สมาชิกไม่มีสิทธิ์ใช้งานคำสั่งนี้`;
                  if (text.startsWith('/สร้าง')) {
                    replyMsg = `❌ สมาชิกไม่มีสิทธิ์สร้างงวดหวยได้`;
                  } else if (text === '/เปิด' || text === '/ปิด' || text === '/เริ่มขาย') {
                    replyMsg = `❌ สมาชิกไม่มีสิทธิ์ปิดรับหรือเปิดรับได้`;
                  }
                  await sendLineReply(replyToken, replyMsg);
                  continue;
                }

                showOwnOnly = true;
                targetUserId = profile.id;
                memberProfileName = profile.full_name || 'Member';
              } else {
                // Not a manager/staff and not a total/summary command, ignore silently
                continue;
              }
            } else if (manager && !isAdminOrDealer && (isOpenCloseCommand || isReportCommand)) {
              // The sender is a manager but NOT an admin, and they are executing an admin command
              await sendLineReply(replyToken, `❌ เฉพาะแอดมินหรือเจ้ามือหลักเท่านั้นที่มีสิทธิ์ใช้งานคำสั่งนี้`);
              continue;
            }

            const permissions = isAdminOrDealer
              ? { can_view_stats: true, can_view_total: true, can_view_excess: true, can_transfer: true }
              : (manager?.permissions || {});

            // ─── COMMAND: /สมาชิก หรือ /stats ───
            if (text.startsWith('/stats') || text.startsWith('/สมาชิก') || text.startsWith('/ยอดสมาชิก')) {
              if (!permissions.can_view_stats) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานข้อมูลสมาชิก`);
                continue;
              }
              
              let searchName = '';
              if (text.startsWith('/stats')) {
                searchName = text.substring('/stats'.length).trim().toLowerCase();
              } else if (text.startsWith('/สมาชิก')) {
                searchName = text.substring('/สมาชิก'.length).trim().toLowerCase();
              } else if (text.startsWith('/ยอดสมาชิก')) {
                searchName = text.substring('/ยอดสมาชิก'.length).trim().toLowerCase();
              }

              const { data: memberships, error: memErr } = await supabase
                .from('user_dealer_memberships')
                .select(`
                  user_id,
                  profiles:user_id (
                    full_name,
                    balance,
                    line_user_id
                  )
                `)
                .eq('dealer_id', dealerId)
                .eq('status', 'active');

              if (memErr || !memberships || memberships.length === 0) {
                await sendLineReply(replyToken, `📊 ไม่พบสมาชิกที่เชื่อมต่อกับระบบดีลเลอร์ของคุณในขณะนี้`);
                continue;
              }

              let filteredMembers = memberships;
              if (searchName) {
                filteredMembers = memberships.filter((m: any) => 
                  m.profiles?.full_name?.toLowerCase().includes(searchName)
                );
                if (filteredMembers.length === 0) {
                  await sendLineReply(replyToken, `📊 ไม่พบสมาชิกที่มีชื่อสอดคล้องกับ "${searchName}"`);
                  continue;
                }
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              const sumMap: Record<string, number> = {};
              const commMap: Record<string, number> = {};
              if (activeRound) {
                let submissions = [];
                try {
                  submissions = await fetchAllSubmissions(activeRound.id);
                } catch (err) {
                  console.error('Error in stats fetchAllSubmissions:', err);
                }

                (submissions || []).forEach((s: any) => {
                  sumMap[s.user_id] = (sumMap[s.user_id] || 0) + Number(s.amount);
                  commMap[s.user_id] = (commMap[s.user_id] || 0) + Number(s.commission_amount || 0);
                });
              }

              let summaryText = `📊 รายงานยอดสมาชิก (${groupLink.lottery_type.toUpperCase()})\n`;
              const roundDateStr = getRoundDisplayDate(activeRound, true);
              if (roundDateStr) {
                summaryText += `      งวดวันที่ ${roundDateStr}\n`;
              }
              summaryText += `--------------------------\n`;
              summaryText += `ยอด       คอม      เหลือ\n`;
              summaryText += `--------------------------\n`;
              
              // Sort members by total bet amount descending
              filteredMembers.sort((a: any, b: any) => {
                const totalA = sumMap[a.user_id] || 0;
                const totalB = sumMap[b.user_id] || 0;
                return totalB - totalA;
              });

              filteredMembers.forEach((m: any) => {
                const profile = m.profiles || {};
                const name = profile.full_name || 'Unknown User';
                const betTotal = sumMap[m.user_id] || 0;
                const commTotal = commMap[m.user_id] || 0;
                const netTotal = betTotal - commTotal;
                summaryText += `คุณ ${name}\n`;
                summaryText += `฿${betTotal.toLocaleString('th-TH')}     ฿${commTotal.toLocaleString('th-TH')}      ฿${netTotal.toLocaleString('th-TH')}\n`;
                summaryText += `--------------------------\n`;
              });
              
              summaryText = summaryText.trimEnd();

              await sendLineReply(replyToken, summaryText);
              continue;
            }

            // ─── COMMAND: /คนส่ง หรือ /ใครส่ง หรือ /ส่งเลข ───
            if (text.startsWith('/คนส่ง') || text.startsWith('/ใครส่ง') || text.startsWith('/ส่งเลข')) {
              if (!permissions.can_view_stats) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานข้อมูลสมาชิก`);
                continue;
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              // Get all submissions for this round
              let submissions = [];
              let subErr = null;
              try {
                submissions = await fetchAllSubmissions(activeRound.id);
              } catch (err) {
                subErr = err;
              }

              if (subErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลผู้ส่งเลข`);
                continue;
              }

              const userTotals: Record<string, number> = {};
              const userComms: Record<string, number> = {};
              (submissions || []).forEach((s: any) => {
                userTotals[s.user_id] = (userTotals[s.user_id] || 0) + Number(s.amount);
                userComms[s.user_id] = (userComms[s.user_id] || 0) + Number(s.commission_amount || 0);
              });

              // Filter out users who have sent 0 or null amount and sort descending by total amount
              const activeUserIds = Object.keys(userTotals)
                .filter(uid => userTotals[uid] > 0)
                .sort((a, b) => userTotals[b] - userTotals[a]);

              if (activeUserIds.length === 0) {
                await sendLineReply(replyToken, `👥 ยังไม่มีสมาชิกส่งเลขเข้ามาในงวดนี้ค่ะ`);
                continue;
              }

              // Fetch profiles for active users
              const { data: profiles, error: profErr } = await supabase
                .from('profiles')
                .select('id, full_name, line_user_id')
                .in('id', activeUserIds);

              if (profErr || !profiles) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงชื่อสมาชิก`);
                continue;
              }

              const profilesMap: Record<string, { name: string; isLinked: boolean }> = {};
              profiles.forEach((p: any) => {
                profilesMap[p.id] = {
                  name: p.full_name || 'Unknown User',
                  isLinked: !!p.line_user_id
                };
              });

              let summaryText = `👥 สมาชิกที่ส่งเลขแล้ว (${groupLink.lottery_type.toUpperCase()})\nงวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;
              summaryText += `--------------------------\n`;
              summaryText += `ชื่อ | ยอดส่ง | ค่าคอม | คงเหลือส่ง\n`;

              const bubbleBodyContents: any[] = [
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
                        "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}`,
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
                    "contents": [
                      {
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
                    ]
                  }
                }
              };

              await sendLineReply(replyToken, flexMessage);
              continue;
            }

            // ─── COMMAND: /สร้าง (Create Round) ───
            if (text.startsWith('/สร้าง')) {
              if (showOwnOnly) {
                await sendLineReply(replyToken, `❌ สมาชิกไม่มีสิทธิ์สร้างงวดหวยได้`);
                continue;
              }

              const parts = text.split(/\s+/);
              if (parts.length < 2) {
                await sendLineReply(replyToken, `❌ กรุณาระบุประเภทหวย เช่น /สร้าง ไทย หรือ /สร้าง ลาว`);
                continue;
              }

              const typeInput = parts[1];
              const targetType = parseLotteryType(typeInput);
              if (!targetType) {
                await sendLineReply(replyToken, `❌ ไม่พบประเภทหวย "${typeInput}" (ประเภทที่รองรับ: ไทย, ลาว, ฮานอย, หุ้น)`);
                continue;
              }

              // Check if there is an open round that hasn't been announced yet
              const { data: existingRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', targetType)
                .eq('is_result_announced', false)
                .maybeSingle();

              if (existingRound) {
                await sendLineReply(
                  replyToken, 
                  `❌ ไม่สามารถสร้างงวดใหม่ได้ เนื่องจากมีงวด ${targetType.toUpperCase()} ที่ยังไม่ได้ประกาศผลค้างอยู่ในระบบ (งวดวันที่ ${formatToThaiBudDate(existingRound.round_date)})`
                );
                continue;
              }

              // Constants for default settings
              const DEFAULT_LIMITS_BY_TYPE: Record<string, Record<string, number>> = {
                thai: {
                  run_top: 5000,
                  run_bottom: 5000,
                  pak_top: 3000,
                  pak_bottom: 3000,
                  '2_top': 1000,
                  '2_front': 1000,
                  '2_center': 1000,
                  '2_run': 1000,
                  '2_bottom': 1000,
                  '3_top': 500,
                  '3_tod': 1000,
                  '3_bottom': 1000,
                  '4_float': 1000,
                  '5_float': 1000,
                },
                lao: {
                  '4_set': 1,
                  '3_set': 1,
                  run_top: 5000,
                  run_bottom: 5000,
                  pak_top: 3000,
                  pak_bottom: 3000,
                  '2_top': 1000,
                  '2_front': 1000,
                  '2_bottom': 1000,
                  '2_center': 1000,
                  '2_run': 1000,
                  '3_top': 120,
                  '3_tod': 1000,
                  '4_float': 1000,
                  '5_float': 1000,
                },
                hanoi: {
                  '4_set': 1,
                  '3_set': 2,
                  run_top: 5000,
                  run_bottom: 5000,
                  pak_top: 5000,
                  pak_bottom: 5000,
                  '2_top': 1000,
                  '2_front': 1000,
                  '2_bottom': 1000,
                  '2_center': 1000,
                  '2_run': 1000,
                  '3_top': 500,
                  '3_tod': 500,
                  '4_float': 200,
                  '5_float': 100,
                },
                stock: {
                  '2_top': 1000,
                  '2_bottom': 1000,
                }
              };

              const DEFAULT_SET_PRICES_BY_TYPE: Record<string, Record<string, number>> = {
                lao: {
                  '4_set': 120,
                  '3_set': 120,
                },
                hanoi: {
                  '4_set': 120,
                  '3_set': 120,
                }
              };

              const today = new Date();
              const openTimeStr = targetType === 'thai' || targetType === 'lao' ? '06:00' : '08:00';
              let closeTimeStr = '20:00';
              if (targetType === 'thai') closeTimeStr = '14:05';
              else if (targetType === 'lao') closeTimeStr = '20:15';

              const roundDate = getBangkokDateString(today);
              const openTime = getBangkokISOString(today, openTimeStr);
              const closeTime = getBangkokISOString(today, closeTimeStr);

              const deleteBeforeMinutes = targetType === 'thai' || targetType === 'lao' ? 30 : 1;
              const deleteAfterSubmitMinutes = targetType === 'thai' || targetType === 'lao' ? 120 : 0;
              const notifyCloseToGroups = targetType === 'lao';

              const lotteryNames: Record<string, string> = {
                thai: 'หวยไทย',
                lao: 'หวยลาว',
                hanoi: 'หวยฮานอย',
                stock: 'หวยหุ้น'
              };
              const lotteryName = lotteryNames[targetType] || targetType;
              const defaultSetPrices = DEFAULT_SET_PRICES_BY_TYPE[targetType] || {};

              // Insert round
              const { data: round, error: roundError } = await supabase
                .from('lottery_rounds')
                .insert({
                  dealer_id: dealerId,
                  lottery_type: targetType,
                  lottery_name: lotteryName,
                  round_date: roundDate,
                  open_time: openTime,
                  close_time: closeTime,
                  delete_before_minutes: deleteBeforeMinutes,
                  delete_after_submit_minutes: deleteAfterSubmitMinutes,
                  currency_symbol: '฿',
                  currency_name: 'บาท',
                  notify_close_to_groups: notifyCloseToGroups,
                  is_active: true,
                  status: 'open',
                  set_prices: defaultSetPrices
                })
                .select()
                .single();

              if (roundError) {
                await sendLineReply(replyToken, `❌ ไม่สามารถสร้างงวดได้: ${roundError.message}`);
                continue;
              }

              // Create type limits
              const defaultLimits = DEFAULT_LIMITS_BY_TYPE[targetType] || {};
              const typeLimitsData = Object.entries(defaultLimits).map(([betType, maxAmount]) => ({
                round_id: round.id,
                bet_type: betType,
                max_per_number: maxAmount,
                payout_rate: 0
              }));

              const { error: limitsError } = await supabase
                .from('type_limits')
                .insert(typeLimitsData);

              if (limitsError) {
                await sendLineReply(replyToken, `⚠️ สร้างงวดสำเร็จ แต่เกิดข้อผิดพลาดในการสร้างวงเงินอั้น: ${limitsError.message}`);
                continue;
              }

              const formattedThaiDate = formatToThaiBudDate(roundDate);
              await sendLineReply(
                replyToken, 
                `✅ สร้างงวดหวย ${lotteryName} เรียบร้อยแล้ว!\n📅 งวดวันที่: ${formattedThaiDate}\n⏰ ปิดรับแทง: ${closeTimeStr}\n✍️ สามารถพิมพ์คำสั่ง /เริ่มขาย เพื่อประกาศเปิดรับแทงไปยังทุกกลุ่มได้ค่ะ`
              );
              continue;
            }

            // ─── COMMAND: /ปิด (Close Round) ───
            if (text === '/ปิด') {
              if (showOwnOnly) {
                await sendLineReply(replyToken, `❌ สมาชิกไม่มีสิทธิ์ปิดรับหรือเปิดรับได้`);
                continue;
              }

              const { data: openRound } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!openRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดหวย ${groupLink.lottery_type.toUpperCase()} ที่เปิดรับอยู่ในขณะนี้`);
                continue;
              }

              const { error: closeErr } = await supabase
                .from('lottery_rounds')
                .update({ status: 'closed', updated_at: new Date().toISOString() })
                .eq('id', openRound.id);

              if (closeErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${closeErr.message}`);
                continue;
              }

              // Build Flex Message for closing announcement
              const closeFlexMessage = {
                "type": "flex",
                "altText": `🔴 ปิดรับแทง ${groupLink.lottery_type.toUpperCase()} งวดวันที่ ${getRoundDisplayDate(openRound, false)}`,
                "contents": {
                  "type": "bubble",
                  "size": "mega",
                  "body": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#dc2626",
                    "paddingAll": "xxl",
                    "justifyContent": "center",
                    "alignItems": "center",
                    "contents": [
                      {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": "#ffffff",
                        "cornerRadius": "100px",
                        "width": "140px",
                        "height": "140px",
                        "justifyContent": "center",
                        "alignItems": "center",
                        "contents": [
                          {
                            "type": "text",
                            "text": "ปิด",
                            "weight": "bold",
                            "size": "3xl",
                            "color": "#dc2626",
                            "align": "center"
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "text": "ปิดรับแทงแล้ว",
                        "weight": "bold",
                        "size": "xl",
                        "color": "#ffffff",
                        "align": "center",
                        "margin": "xl"
                      },
                      {
                        "type": "text",
                        "text": `${openRound.lottery_name || groupLink.lottery_type.toUpperCase()} - งวดวันที่ ${getRoundDisplayDate(openRound, false)}`,
                        "size": "sm",
                        "color": "#fecaca",
                        "align": "center",
                        "margin": "md",
                        "wrap": true
                      }
                    ]
                  }
                }
              };

              // Send to ALL groups linked to this dealer with same lottery type
              const { data: allGroups } = await supabase
                .from('line_groups')
                .select('line_group_id')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .eq('is_active', true);

              if (allGroups && allGroups.length > 0) {
                for (const g of allGroups) {
                  if (g.line_group_id === groupId) {
                    // For the current group, use reply (more reliable)
                    continue;
                  }
                  try {
                    await sendLinePush(g.line_group_id, closeFlexMessage);
                  } catch (e) {
                    console.error(`Failed to push close message to group ${g.line_group_id}:`, e);
                  }
                }
              }

              // Reply to the current group
              await sendLineReply(replyToken, closeFlexMessage);
              continue;
            }

            // ─── COMMAND: /เปิด (Re-open Round) ───
            if (text === '/เปิด') {
              if (showOwnOnly) {
                await sendLineReply(replyToken, `❌ สมาชิกไม่มีสิทธิ์ปิดรับหรือเปิดรับได้`);
                continue;
              }

              const { data: closedRound } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .eq('status', 'closed')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!closedRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดหวย ${groupLink.lottery_type.toUpperCase()} ที่ปิดรับอยู่ในขณะนี้`);
                continue;
              }

              if (closedRound.is_result_announced) {
                await sendLineReply(replyToken, `❌ ไม่สามารถเปิดรับแทงได้ เพราะงวดนี้ประกาศผลรางวัลไปแล้ว`);
                continue;
              }

              const { error: openErr } = await supabase
                .from('lottery_rounds')
                .update({ status: 'open', updated_at: new Date().toISOString() })
                .eq('id', closedRound.id);

              if (openErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${openErr.message}`);
                continue;
              }

              await sendLineReply(replyToken, `✅ เปิดรับแทง ${closedRound.lottery_name || groupLink.lottery_type.toUpperCase()} งวดวันที่ ${getRoundDisplayDate(closedRound, false)} เรียบร้อยแล้ว`);
              continue;
            }

            // ─── COMMAND: /เริ่มขาย (Start Selling / Announce Round) ───
            if (text === '/เริ่มขาย') {
              if (showOwnOnly) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้`);
                continue;
              }

              const { data: openRound } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!openRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดหวย ${groupLink.lottery_type.toUpperCase()} ที่กำลังเปิดรับแทงอยู่ในขณะนี้`);
                continue;
              }

              let closeTimeStr = '';
              if (openRound.close_time) {
                try {
                  const dateObj = new Date(openRound.close_time);
                  const displayDate = getRoundDisplayDate(openRound, false);
                  const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) + ' น.';
                  closeTimeStr = `${displayDate} เวลา ${timeStr}`;
                } catch (e) {
                  closeTimeStr = 'เวลาปิดรับที่งวดหวยกำหนด';
                }
              } else {
                closeTimeStr = 'เวลาปิดรับที่งวดหวยกำหนด';
              }

              let announceMsg = `📢 เปิดรับแทง: ${openRound.lottery_name || groupLink.lottery_type.toUpperCase()}\n`;
              announceMsg += `📅 งวดวันที่: ${getRoundDisplayDate(openRound, false)}\n`;
              announceMsg += `--------------------------\n`;
              announceMsg += `⚠️ ตัวปิดติดมาจ่ายครึ่ง ตัวไหนมามากเกินไป คืนได้ตลอดเวลา\n`;
              announceMsg += `✍️ ได้เสียกันตามที่บอทรับมา ตรวจสอบและยกเลิกได้ตามเวลา\n`;
              announceMsg += `⏰ เปิดรับแทงตั้งแต่บัดนี้ จนถึง ${closeTimeStr}\n`;
              announceMsg += `--------------------------\n`;
              announceMsg += `🎉 ขอให้ทุกท่านโชคดีมีชัยกับการเสี่ยงดวงครั้งนี้กันทุกคน`;

              // Send to ALL groups linked to this dealer with same lottery type
              const { data: allGroups } = await supabase
                .from('line_groups')
                .select('line_group_id')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .eq('is_active', true);

              if (allGroups && allGroups.length > 0) {
                for (const g of allGroups) {
                  if (g.line_group_id === groupId) {
                    // For the current group, we reply directly
                    continue;
                  }
                  try {
                    await sendLinePush(g.line_group_id, announceMsg);
                  } catch (e) {
                    console.error(`Failed to push announce message to group ${g.line_group_id}:`, e);
                  }
                }
              }

              // Reply to the current group
              await sendLineReply(replyToken, announceMsg);
              continue;
            }

            // ─── COMMAND: /แจ้งผล ───
            if (text.startsWith('/แจ้งผล')) {
              if (showOwnOnly) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้`);
                continue;
              }

              const param = text.substring('/แจ้งผล'.length).trim();
              let activeRound: any = null;

              if (param !== "") {
                const dateStr = parseRoundDateParam(param);
                if (!dateStr) {
                  await sendLineReply(replyToken, `❌ รูปแบบระบุงวดหวยไม่ถูกต้อง\nกรุณาระบุในรูปแบบ /แจ้งผล [วัน]-[เดือน]-[ปี]\nตัวอย่างเช่น:\n- /แจ้งผล 10-05-2026\n- /แจ้งผล 10-05-26\n- /แจ้งผล 10-05-69\n- /แจ้งผล 10-05-2569`);
                  continue;
                }

                const { data: targetRound } = await supabase
                  .from('lottery_rounds')
                  .select('*')
                  .eq('dealer_id', dealerId)
                  .eq('lottery_type', groupLink.lottery_type)
                  .eq('round_date', dateStr)
                  .maybeSingle();

                if (!targetRound || !targetRound.is_result_announced || (targetRound.status !== 'announced' && targetRound.status !== 'closed')) {
                  await sendLineReply(replyToken, `❌ ไม่มีงวดหวยที่ท่านต้องการให้แจ้งผล`);
                  continue;
                }

                activeRound = targetRound;
              } else {
                const { data: latestRound } = await supabase
                  .from('lottery_rounds')
                  .select('*')
                  .eq('dealer_id', dealerId)
                  .eq('lottery_type', groupLink.lottery_type)
                  .in('status', ['open', 'closed', 'announced'])
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (!latestRound) {
                  await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงหรือกำลังตรวจผลสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                  continue;
                }

                if (!latestRound.is_result_announced || (latestRound.status !== 'announced' && latestRound.status !== 'closed')) {
                  await sendLineReply(replyToken, `❌ ไม่สามารถแจ้งผลได้ เนื่องจากงวดนี้ยังไม่ได้ประกาศผลรางวัล`);
                  continue;
                }

                activeRound = latestRound;
              }

              // Fetch all active groups linked to this dealer with the same lottery type
              const { data: allGroups, error: groupsErr } = await supabase
                .from('line_groups')
                .select('line_group_id')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', activeRound.lottery_type)
                .eq('is_active', true);

              if (groupsErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่มไลน์: ${groupsErr.message}`);
                continue;
              }

              if (!allGroups || allGroups.length === 0) {
                await sendLineReply(replyToken, `👥 ไม่พบกลุ่มไลน์ที่ผูกกับประเภทหวยนี้`);
                continue;
              }

              // Pre-fetch all managers for this dealer
              const { data: managerData } = await supabase
                .from('line_managers')
                .select('*')
                .eq('dealer_id', dealerId)
                .eq('is_active', true);
              console.log('[แจ้งผล] line_managers schema sample=', JSON.stringify((managerData || []).slice(0,1)));
              const managerLineUserIds = new Set((managerData || []).map((m: any) => m.line_user_id));

              let currentGroupProcessed = false;
              const groupList = (allGroups || []).map((g: any) => g.line_group_id?.slice(-6)).join(', ');
              console.log(`[แจ้งผล] allGroups=${allGroups.length} groups=[${groupList}] managerLineIds=${[...managerLineUserIds].join(',')}`);

              // Loop through each group to calculate and broadcast results
              for (const g of allGroups) {
                const targetGroupId = g.line_group_id;

                // 1. Fetch member user IDs for this specific group
                const { data: groupMembers, error: memErr } = await supabase
                  .from('line_group_members')
                  .select('user_id, line_user_id, display_name')
                  .eq('line_group_id', targetGroupId);

                if (memErr) {
                  console.error(`[แจ้งผล] SKIP group=${targetGroupId} reason=memError msg=${memErr.message}`);
                  if (targetGroupId === groupId) {
                    await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิกในกลุ่ม: ${memErr.message}`);
                    currentGroupProcessed = true;
                  }
                  continue;
                }

                // Filter out managers from line_managers table
                const nonManagerMembers = (groupMembers || [])
                  .filter((m: any) => !managerLineUserIds.has(m.line_user_id));
                const memberUserIds = nonManagerMembers
                  .map((m: any) => m.user_id)
                  .filter(Boolean);
                const managerNames = (groupMembers || [])
                  .filter((m: any) => managerLineUserIds.has(m.line_user_id))
                  .map((m: any) => m.display_name || m.line_user_id);
                console.log(`[แจ้งผล] group=${targetGroupId} total=${groupMembers?.length || 0} managers=[${managerNames.join(',')}] members=${memberUserIds.length}`);
                if (memberUserIds.length === 0) {
                  console.log(`[แจ้งผล] SKIP group=${targetGroupId} reason=noMembersAfterFilter`);
                  if (targetGroupId === groupId) {
                    await sendLineReply(replyToken, `👥 ไม่มีรายการส่งเลขในกลุ่มนี้สำหรับงวดนี้ค่ะ`);
                    currentGroupProcessed = true;
                  }
                  continue;
                }

                // 2. Fetch submissions for these group members in this round
                let submissions = [];
                let subErr = null;
                try {
                  const allSubs = await fetchAllSubmissions(activeRound.id);
                  const memberSet = new Set(memberUserIds);
                  submissions = allSubs.filter(s => memberSet.has(s.user_id));
                } catch (err) {
                  subErr = err;
                }

                if (subErr) {
                  console.error(`[แจ้งผล] SKIP group=${targetGroupId} reason=subError msg=${subErr.message}`);
                  if (targetGroupId === groupId) {
                    await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลยอดรับ: ${subErr.message}`);
                    currentGroupProcessed = true;
                  }
                  continue;
                }

                console.log(`[แจ้งผล] group=${targetGroupId} members=${memberUserIds.length} submissions=${submissions?.length || 0}`);

                if (!submissions || submissions.length === 0) {
                  console.log(`[แจ้งผล] SKIP group=${targetGroupId} reason=noSubmissions`);
                  if (targetGroupId === groupId) {
                    await sendLineReply(replyToken, `👥 ไม่มีรายการส่งเลขในกลุ่มนี้สำหรับงวดนี้ค่ะ`);
                    currentGroupProcessed = true;
                  }
                  continue;
                }

                // 3. Group by user (calculate win same as admin view)
                const userSummaries: Record<string, {
                  userId: string;
                  totalBet: number;
                  totalCommission: number;
                  totalWin: number;
                  winCount: number;
                }> = {};

                const setPrice = activeRound?.set_prices?.['4_top'] || 120;
                const isAnnounced = !!activeRound.winning_numbers;

                submissions.forEach((sub: any) => {
                  const userId = sub.user_id;
                  if (!userId) return;

                  const amt = Number(sub.amount || 0);
                  const comm = Number(sub.commission_amount || 0);

                  // Calculate win same as admin view
                  let win = 0;
                  if (isAnnounced && sub.is_winner) {
                    if (sub.bet_type === '4_set') {
                      const numSets = Math.max(1, Math.floor(amt / setPrice));
                      win = (sub.prize_amount != null ? Number(sub.prize_amount) : 0) * numSets;
                    } else {
                      win = sub.prize_amount != null ? Number(sub.prize_amount) : 0;
                    }
                    // Fallback when DB prize_amount is missing or zero
                    if (win === 0) {
                      const winResult = checkTransferWin(
                        sub.bet_type,
                        sub.numbers,
                        activeRound.winning_numbers,
                        activeRound.lottery_type,
                        amt,
                        setPrice,
                        DEFAULT_4_SET_SETTINGS.prizes
                      );
                      if (winResult.wins) {
                        win = winResult.payout;
                      }
                    }
                  }

                  if (!userSummaries[userId]) {
                    userSummaries[userId] = {
                      userId,
                      totalBet: 0,
                      totalCommission: 0,
                      totalWin: 0,
                      winCount: 0
                    };
                  }
                  userSummaries[userId].totalBet += amt;
                  userSummaries[userId].totalCommission += comm;
                  userSummaries[userId].totalWin += win;
                  if (sub.is_winner) {
                    userSummaries[userId].winCount++;
                  }
                });

                const userIds = Object.keys(userSummaries);
                const profilesMap: Record<string, string> = {};

                if (userIds.length > 0) {
                  const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds);
                  (profiles || []).forEach((p: any) => {
                    profilesMap[p.id] = p.full_name || 'ไม่ระบุชื่อ';
                  });
                }

                // Sort user summaries by net profit descending (so high winnings / payout first)
                const sortedUserSummaries = Object.values(userSummaries).sort((a, b) => {
                  const netA = a.totalWin - (a.totalBet - a.totalCommission);
                  const netB = b.totalWin - (b.totalBet - b.totalCommission);
                  return netB - netA;
                });

                const winNumStr = formatWinningNumbersForDisplay(activeRound.winning_numbers, activeRound.lottery_type);

                // Generate Flex bubble for each user
                const bubbles = sortedUserSummaries.map((u) => {
                  const userName = profilesMap[u.userId] || 'ไม่ระบุชื่อ';
                  const roundedBet = Math.round(u.totalBet);
                  const roundedComm = Math.round(u.totalCommission);
                  const roundedWin = Math.round(u.totalWin);
                  const net = u.totalWin - (u.totalBet - u.totalCommission);
                  const roundedNet = Math.round(net);

                  let netLabel = '';
                  let netColor = '#888888';
                  if (roundedNet > 0) {
                    netLabel = `ต้องเก็บ ฿${roundedNet.toLocaleString('th-TH')}`;
                    netColor = '#10b981'; // Green
                  } else if (roundedNet < 0) {
                    netLabel = `ต้องจ่าย ฿${Math.abs(roundedNet).toLocaleString('th-TH')}`;
                    netColor = '#ef4444'; // Red
                  } else {
                    netLabel = 'เสมอ';
                    netColor = '#94a3b8';
                  }

                  return {
                    "type": "bubble",
                    "size": "mega",
                    "header": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#4f46e5",
                      "paddingAll": "lg",
                      "contents": [
                        {
                          "type": "text",
                          "text": `📊 ผลได้เสียการแทงของคุณ`,
                          "weight": "bold",
                          "size": "md",
                          "color": "#ffffff"
                        },
                        {
                          "type": "text",
                          "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)} (${activeRound.lottery_name || activeRound.lottery_type.toUpperCase()})`,
                          "size": "xs",
                          "color": "#c7d2fe",
                          "margin": "xs"
                        },
                        {
                          "type": "text",
                          "text": `🏆 ผลรางวัล: ${winNumStr}`,
                          "size": "sm",
                          "color": "#fbbf24",
                          "margin": "xs",
                          "weight": "bold"
                        },
                        {
                          "type": "text",
                          "text": `🎉 ประกาศผลรางวัลแล้ว`,
                          "size": "xs",
                          "color": "#10b981",
                          "margin": "xs",
                          "weight": "bold"
                        }
                      ]
                    },
                    "body": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#f8fafc",
                      "paddingAll": "md",
                      "contents": [
                        {
                          "type": "box",
                          "layout": "vertical",
                          "backgroundColor": "#ffffff",
                          "cornerRadius": "md",
                          "paddingAll": "lg",
                          "contents": [
                            {
                              "type": "text",
                              "text": `คุณ ${userName}`,
                              "weight": "bold",
                              "size": "md",
                              "color": "#0f172a"
                            },
                            {
                              "type": "separator",
                              "margin": "md",
                              "color": "#e2e8f0"
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "md",
                              "contents": [
                                { "type": "text", "text": "ยอดส่งแทง:", "size": "sm", "color": "#64748b" },
                                { "type": "text", "text": `฿${roundedBet.toLocaleString('th-TH')}`, "weight": "bold", "size": "sm", "color": "#0f172a", "align": "end" }
                              ]
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "sm",
                              "contents": [
                                { "type": "text", "text": "ส่วนลด/ค่าคอม:", "size": "sm", "color": "#64748b" },
                                { "type": "text", "text": `฿${roundedComm.toLocaleString('th-TH')}`, "weight": "bold", "size": "sm", "color": "#0f172a", "align": "end" }
                              ]
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "sm",
                              "contents": [
                                { "type": "text", "text": "ยอดถูกรางวัล:", "size": "sm", "color": "#64748b" },
                                { "type": "text", "text": `ถูก ${u.winCount} ครั้ง / ฿${roundedWin.toLocaleString('th-TH')}`, "weight": "bold", "size": "sm", "color": "#0f172a", "align": "end" }
                              ]
                            },
                            {
                              "type": "separator",
                              "margin": "md",
                              "color": "#e2e8f0"
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "md",
                              "contents": [
                                { "type": "text", "text": "สรุปยอดสุทธิ:", "weight": "bold", "size": "sm", "color": "#0f172a" },
                                { "type": "text", "text": netLabel, "weight": "bold", "size": "sm", "color": netColor, "align": "end" }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  };
                });

                // Send in chunks of 10
                const carouselMessages: any[] = [];
                const chunkSize = 10;
                for (let i = 0; i < bubbles.length; i += chunkSize) {
                  const chunk = bubbles.slice(i, i + chunkSize);
                  carouselMessages.push({
                    "type": "flex",
                    "altText": `📊 รายงานผลได้เสียสำหรับสมาชิกในกลุ่ม (${activeRound.lottery_type.toUpperCase()})`,
                    "contents": {
                      "type": "carousel",
                      "contents": chunk
                    }
                  });
                }

                if (targetGroupId === groupId) {
                  await sendLineReply(replyToken, carouselMessages);
                  currentGroupProcessed = true;
                } else {
                  console.log(`[แจ้งผล] pushing ${carouselMessages.length} messages to group=${targetGroupId}`);
                  for (const msg of carouselMessages) {
                    try {
                      await sendLinePush(targetGroupId, msg);
                      console.log(`[แจ้งผล] push success to group=${targetGroupId}`);
                    } catch (pushErr) {
                      console.error(`Failed to push results message to group ${targetGroupId}:`, pushErr);
                    }
                  }
                }
              }

              if (!currentGroupProcessed) {
                await sendLineReply(replyToken, `👥 ไม่มีรายการส่งเลขในกลุ่มนี้สำหรับงวดนี้ค่ะ`);
              }
              continue;
            }

            // ─── COMMAND: /กำไร ───
            if (text.startsWith('/กำไร')) {
              if (!permissions.can_view_total) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานสรุปกำไร/ขาดทุน`);
                continue;
              }

              const param = text.substring('/กำไร'.length).trim().toLowerCase();

              let startDate: string | null = null;
              let endDate: string | null = null;
              let rangeText = 'ทั้งหมด';
              let isValidFilter = true;
              let requestedMonthText = '';

              if (param === 'm') {
                rangeText = 'เดือนปัจจุบัน';
                const nowBangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
                const year = nowBangkok.getUTCFullYear();
                const month = nowBangkok.getUTCMonth(); // 0-11
                const firstDay = new Date(Date.UTC(year, month, 1));
                const lastDay = new Date(Date.UTC(year, month + 1, 0));
                startDate = `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-${String(firstDay.getUTCDate()).padStart(2, '0')}`;
                endDate = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`;
              } else if (param === 'w') {
                rangeText = 'สัปดาห์ปัจจุบัน';
                const nowBangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
                const day = nowBangkok.getUTCDay(); // 0 (Sun) to 6 (Sat)
                const dayOffset = day === 0 ? 6 : day - 1; // days since Monday
                const monday = new Date(nowBangkok.getTime() - dayOffset * 24 * 60 * 60 * 1000);
                const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
                startDate = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
                endDate = `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`;
              } else if (param !== '') {
                const parsed = parseMonthYearParam(param);
                if (parsed) {
                  const { month, year } = parsed;
                  requestedMonthText = `${month}-${year + 543}`; // Display as Buddhist Era (Thai year)
                  rangeText = `เดือน ${requestedMonthText}`;
                  const firstDay = new Date(Date.UTC(year, month - 1, 1));
                  const lastDay = new Date(Date.UTC(year, month, 0));
                  startDate = `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-${String(firstDay.getUTCDate()).padStart(2, '0')}`;
                  endDate = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`;
                } else {
                  isValidFilter = false;
                }
              }

              if (!isValidFilter) {
                await sendLineReply(replyToken, `❌ รูปแบบคำสั่งไม่ถูกต้อง\n\nคำสั่งที่รองรับ:\n• /กำไร - ดูประวัติกำไรทั้งหมด\n• /กำไร m - ดูกำไรเดือนปัจจุบัน\n• /กำไร w - ดูกำไรสัปดาห์ปัจจุบัน\n• /กำไร [เดือน-ปี] - เช่น /กำไร 6-69 หรือ /กำไร 6-2569`);
                continue;
              }

              let query = supabase
                .from('round_history')
                .select('*')
                .eq('dealer_id', dealerId);

              if (startDate && endDate) {
                query = query.gte('round_date', startDate).lte('round_date', endDate);
              }

              query = query.order('round_date', { ascending: false });

              const { data: historyList, error: historyErr } = await query;

              if (historyErr) {
                console.error('Error fetching round history for bot:', historyErr);
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลประวัติกำไร/ขาดทุน`);
                continue;
              }

              if (!historyList || historyList.length === 0) {
                await sendLineReply(replyToken, `📊 ไม่พบประวัติงวดหวยในช่วงเวลา "${rangeText}" ค่ะ`);
                continue;
              }

              let totalRounds = 0;
              let totalEntries = 0;
              let totalAmount = 0;
              let totalCommission = 0;
              let totalPayout = 0;

              let totalTransferredEntries = 0;
              let totalTransferred = 0;
              let totalUpstreamComm = 0;
              let totalUpstreamWin = 0;

              for (const h of historyList) {
                totalRounds++;
                totalEntries += (h.total_entries || 0);
                totalAmount += parseFloat(h.total_amount || 0);
                totalCommission += parseFloat(h.total_commission || 0);
                totalPayout += parseFloat(h.total_payout || 0);

                totalTransferredEntries += (h.transferred_entries || 0);
                totalTransferred += parseFloat(h.transferred_amount || 0);
                totalUpstreamComm += parseFloat(h.upstream_commission || 0);
                totalUpstreamWin += parseFloat(h.upstream_winnings || 0);
              }

              const incomingProfit = totalAmount - totalCommission - totalPayout;
              const outgoingProfit = totalUpstreamWin + totalUpstreamComm - totalTransferred;
              const totalProfit = incomingProfit + outgoingProfit;
              const hasOutgoing = totalTransferred > 0;

              const bodyContents: Array<any> = [
                {
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
                          "text": "🟢 ยอดรับ",
                          "weight": "bold",
                          "size": "sm",
                          "color": "#2e7d32"
                        },
                        {
                          "type": "text",
                          "text": `(${totalEntries.toLocaleString()} รายการ)`,
                          "size": "xs",
                          "color": "#757575",
                          "align": "end",
                          "gravity": "center"
                        }
                      ]
                    },
                    {
                      "type": "separator",
                      "margin": "sm",
                      "color": "#e2e8f0"
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "sm",
                      "contents": [
                        { "type": "text", "text": "ยอดรวม", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `+฿${Math.round(totalAmount).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#333333", "weight": "bold" }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "xs",
                      "contents": [
                        { "type": "text", "text": "ค่าคอม", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `-฿${Math.round(totalCommission).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#666666" }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "xs",
                      "contents": [
                        { "type": "text", "text": "จ่าย", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `-฿${Math.round(totalPayout).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#666666" }
                      ]
                    },
                    {
                      "type": "separator",
                      "margin": "sm",
                      "color": "#e2e8f0"
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "sm",
                      "contents": [
                        { "type": "text", "text": "กำไรยอดรับ", "weight": "bold", "size": "sm", "color": "#333333" },
                        {
                          "type": "text",
                          "text": `${incomingProfit >= 0 ? '+' : '-'}฿${Math.abs(Math.round(incomingProfit)).toLocaleString('th-TH')}`,
                          "weight": "bold",
                          "size": "sm",
                          "align": "end",
                          "color": incomingProfit >= 0 ? "#2e7d32" : "#c62828"
                        }
                      ]
                    }
                  ]
                }
              ];

              if (hasOutgoing) {
                bodyContents.push({
                  "type": "box",
                  "layout": "vertical",
                  "backgroundColor": "#fdf8f7",
                  "paddingAll": "md",
                  "cornerRadius": "md",
                  "margin": "md",
                  "contents": [
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "contents": [
                        {
                          "type": "text",
                          "text": "🔴 ยอดส่ง",
                          "weight": "bold",
                          "size": "sm",
                          "color": "#c62828"
                        },
                        {
                          "type": "text",
                          "text": `(${totalTransferredEntries.toLocaleString()} รายการ)`,
                          "size": "xs",
                          "color": "#757575",
                          "align": "end",
                          "gravity": "center"
                        }
                      ]
                    },
                    {
                      "type": "separator",
                      "margin": "sm",
                      "color": "#f1e3e1"
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "sm",
                      "contents": [
                        { "type": "text", "text": "ยอดรวม", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `-฿${Math.round(totalTransferred).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#333333", "weight": "bold" }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "xs",
                      "contents": [
                        { "type": "text", "text": "ค่าคอม", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `+฿${Math.round(totalUpstreamComm).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#666666" }
                      ]
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "xs",
                      "contents": [
                        { "type": "text", "text": "รับ", "size": "sm", "color": "#555555" },
                        { "type": "text", "text": `฿${Math.round(totalUpstreamWin).toLocaleString('th-TH')}`, "size": "sm", "align": "end", "color": "#666666" }
                      ]
                    },
                    {
                      "type": "separator",
                      "margin": "sm",
                      "color": "#f1e3e1"
                    },
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "sm",
                      "contents": [
                        { "type": "text", "text": "กำไรยอดส่ง", "weight": "bold", "size": "sm", "color": "#333333" },
                        {
                          "type": "text",
                          "text": `${outgoingProfit >= 0 ? '+' : '-'}฿${Math.abs(Math.round(outgoingProfit)).toLocaleString('th-TH')}`,
                          "weight": "bold",
                          "size": "sm",
                          "align": "end",
                          "color": outgoingProfit >= 0 ? "#2e7d32" : "#c62828"
                        }
                      ]
                    }
                  ]
                });
              }

              const altText = `📊 สรุปกำไร/ขาดทุน\nช่วงเวลา: ${rangeText}\n(จำนวนงวด: ${totalRounds} งวด)\nกำไรรวม: ${totalProfit >= 0 ? '+' : '-'}฿${Math.abs(Math.round(totalProfit)).toLocaleString('th-TH')}`;

              const flexMessage = {
                "type": "flex",
                "altText": altText,
                "contents": {
                  "type": "bubble",
                  "size": "mega",
                  "header": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1F1A3A",
                    "paddingAll": "lg",
                    "contents": [
                      {
                        "type": "text",
                        "text": "📊 สรุปกำไร/ขาดทุน",
                        "weight": "bold",
                        "size": "lg",
                        "color": "#ffffff"
                      },
                      {
                        "type": "text",
                        "text": `ช่วงเวลา: ${rangeText} (${totalRounds} งวด)`,
                        "size": "xs",
                        "color": "#b8b2e0",
                        "margin": "xs"
                      }
                    ]
                  },
                  "body": {
                    "type": "box",
                    "layout": "vertical",
                    "paddingAll": "md",
                    "spacing": "md",
                    "contents": bodyContents
                  },
                  "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                      {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": totalProfit >= 0 ? "#e8f5e9" : "#ffebee",
                        "paddingAll": "md",
                        "cornerRadius": "md",
                        "contents": [
                          {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                              {
                                "type": "text",
                                "text": "💵 กำไรรวมสุทธิ",
                                "weight": "bold",
                                "size": "md",
                                "color": totalProfit >= 0 ? "#2e7d32" : "#c62828",
                                "gravity": "center"
                              },
                              {
                                "type": "text",
                                "text": `${totalProfit >= 0 ? '+' : '-'}฿${Math.abs(Math.round(totalProfit)).toLocaleString('th-TH')}`,
                                "weight": "bold",
                                "size": "lg",
                                "align": "end",
                                "color": totalProfit >= 0 ? "#1b5e20" : "#b71c1c"
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                }
              };

              await sendLineReply(replyToken, flexMessage);
              continue;
            }

            // ─── COMMAND: /สรุป หรือ /summary ───
            if (text.startsWith('/summary') || text.startsWith('/สรุป')) {
              if (!showOwnOnly && !permissions.can_view_total) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานสรุปงวด`);
                continue;
              }

              // --- PARSE PARAM: winning numbers (announce) OR a past round date ---
              const isSummaryTh = text.startsWith('/สรุป');
              const prefixLen = isSummaryTh ? '/สรุป'.length : '/summary'.length;
              const param = text.substring(prefixLen).trim();

              // A date param (e.g. 10-6-26, 10-6-2569) selects a past round for read-only summary
              const requestedRoundDate = param !== "" ? parseRoundDateParam(param) : null;

              let activeRound: any;
              if (requestedRoundDate) {
                const { data: dateRound } = await supabase
                  .from('lottery_rounds')
                  .select('*')
                  .eq('dealer_id', dealerId)
                  .eq('lottery_type', groupLink.lottery_type)
                  .eq('round_date', requestedRoundDate)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (!dateRound) {
                  await sendLineReply(replyToken, `❌ ไม่พบงวดหวย ${groupLink.lottery_type.toUpperCase()} ของวันที่ ${param}\n(งวดอาจถูกลบไปแล้ว หรือยังไม่ได้สร้างงวดของวันนั้น)`);
                  continue;
                }
                activeRound = dateRound;
              } else {
                const { data: latestRound } = await supabase
                  .from('lottery_rounds')
                  .select('*')
                  .eq('dealer_id', dealerId)
                  .eq('lottery_type', groupLink.lottery_type)
                  .in('status', ['open', 'closed', 'announced'])
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (!latestRound) {
                  await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงหรือกำลังตรวจผลสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                  continue;
                }
                activeRound = latestRound;
              }

              // Check if the param is a valid winning number format
              const isValidWinningNum = param !== "" && !requestedRoundDate && !!parseWinningNumbers(param, activeRound.lottery_type);

              let targetMember: any = null;
              if (param !== "" && !requestedRoundDate && !isValidWinningNum && !showOwnOnly) {
                // Look up member by name or user_id
                const { data: memberships } = await supabase
                  .from('user_dealer_memberships')
                  .select(`
                    user_id,
                    profiles:user_id (
                      id,
                      full_name,
                      line_user_id
                    )
                  `)
                  .eq('dealer_id', dealerId)
                  .eq('status', 'active');

                if (memberships && memberships.length > 0) {
                  const searchNormalized = param.trim().toLowerCase();
                  // Try exact ID match first
                  let matches = memberships.filter((m: any) => 
                    m.user_id === param || m.profiles?.id === param
                  );
                  // Fallback to name search
                  if (matches.length === 0) {
                    matches = memberships.filter((m: any) => 
                      m.profiles?.full_name?.toLowerCase().includes(searchNormalized)
                    );
                  }
                  if (matches.length === 1) {
                    targetMember = matches[0];
                  } else if (matches.length > 1) {
                    await sendLineReply(replyToken, `⚠️ พบสมาชิกมากกว่า 1 คนที่สอดคล้องกับ "${param}":\n` + 
                      matches.map((m: any) => `- ${m.profiles?.full_name} (ID: ${m.user_id})`).join('\n') + 
                      `\nกรุณาระบุชื่อที่เจาะจงขึ้น หรือใช้ ID แทนค่ะ`);
                    continue;
                  } else {
                    await sendLineReply(replyToken, `❌ ไม่พบสมาชิกที่มีชื่อหรือ ID สอดคล้องกับ "${param}"`);
                    continue;
                  }
                } else {
                  await sendLineReply(replyToken, `❌ ไม่พบข้อมูลสมาชิกในระบบดีลเลอร์นี้`);
                  continue;
                }
              }

              if (targetMember) {
                showOwnOnly = true;
                targetUserId = targetMember.user_id;
                memberProfileName = targetMember.profiles?.full_name || 'Member';
              }

              // Winning-number announcement only when param is provided AND is NOT a date AND is a valid winning number
              if (param !== "" && !requestedRoundDate && isValidWinningNum) {
                // ต้องปิดรับก่อนถึงจะประกาศผลได้
                if (activeRound.status === 'open') {
                  await sendLineReply(replyToken, `❌ ไม่สามารถประกาศผลได้ เพราะงวดนี้ยังเปิดรับแทงอยู่\nกรุณาปิดรับก่อนโดยใช้คำสั่ง /ปิด`);
                  continue;
                }
                if (showOwnOnly) {
                  await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์บันทึกผลรางวัล`);
                  continue;
                }

                const parsedWinning = parseWinningNumbers(param, activeRound.lottery_type);
                if (!parsedWinning) {
                  let formatHelp = '';
                  if (activeRound.lottery_type === 'lao' || activeRound.lottery_type === 'hanoi') {
                    formatHelp = `สำหรับหวยประเภท ${activeRound.lottery_type.toUpperCase()} กรุณาระบุเลขรางวัล 4 ตัว เช่น /สรุป 1234`;
                  } else if (activeRound.lottery_type === 'thai') {
                    formatHelp = `สำหรับหวยไทย กรุณาระบุ [เลขรางวัลที่หนึ่ง 6 ตัว]/[เลข 2 ตัวล่าง] เช่น /สรุป 123456/25`;
                  } else if (activeRound.lottery_type === 'stock') {
                    formatHelp = `สำหรับหวยหุ้น กรุณาระบุ [เลข 2 ตัวบน]/[เลข 2 ตัวล่าง] เช่น /สรุป 25/49`;
                  }
                  await sendLineReply(replyToken, `❌ รูปแบบเลขรางวัลไม่ถูกต้อง\n${formatHelp}`);
                  continue;
                }

                const isEditing = activeRound.is_result_announced === true;

                // Update lottery round with winning numbers
                const { error: updateRoundErr } = await supabase
                  .from('lottery_rounds')
                  .update({
                    winning_numbers: parsedWinning,
                    is_result_announced: true,
                    status: 'announced'
                  })
                  .eq('id', activeRound.id);

                if (updateRoundErr) {
                  console.error('updateRound ERROR:', JSON.stringify(updateRoundErr));
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการบันทึกผลรางวัล: ${updateRoundErr.message}`);
                  continue;
                }

                // If editing, reset previous winners first
                if (isEditing) {
                  await supabase
                    .from('submissions')
                    .update({ is_winner: false, prize_amount: 0 })
                    .eq('round_id', activeRound.id)
                    .eq('is_deleted', false);
                }

                // Calculate winners
                const { error: rpcErr } = await supabase
                  .rpc('calculate_round_winners', { p_round_id: activeRound.id });

                if (rpcErr) {
                  console.error('Error running calculate_round_winners:', JSON.stringify(rpcErr));
                }

                // Deduct billing based on subscription package
                try {
                  const { data: dealerSubs } = await supabase
                    .from('dealer_subscriptions')
                    .select('billing_model, subscription_packages(billing_model, profit_percentage_rate)')
                    .eq('dealer_id', activeRound.dealer_id)
                    .in('status', ['active', 'trial'])
                    .order('created_at', { ascending: false })
                    .limit(1);
                  
                  const dealerSub = dealerSubs?.[0];
                  const billingModel = dealerSub?.subscription_packages?.billing_model || dealerSub?.billing_model;

                  if (billingModel === 'profit_percentage') {
                    if (!isEditing) {
                      const previousPending = activeRound.charged_credit_amount || 0;
                      await deductProfitBasedCreditDeno(activeRound.dealer_id, activeRound.id, previousPending);
                    }
                  } else {
                    const previouslyCharged = activeRound.charged_credit_amount || 0;
                    await deductAdditionalCreditForRoundDeno(activeRound.dealer_id, activeRound.id, previouslyCharged);
                  }
                } catch (billingErr) {
                  console.error('Billing deduction calculation failed:', billingErr);
                }

                // Update local activeRound properties
                activeRound.winning_numbers = parsedWinning;
                activeRound.is_result_announced = true;
                activeRound.status = 'announced';
              }

              // Treat is_result_announced (+ winning_numbers) as the source of truth,
              // matching the web app. status may drift (e.g. closed/re-opened) but
              // results should still display once announced.
              const isAnnounced = activeRound.is_result_announced === true && !!activeRound.winning_numbers;

              // 1. Fetch Submissions (ยอดรับ)
              let submissions = [];
              let subErr = null;
              try {
                submissions = await fetchAllSubmissions(activeRound.id, showOwnOnly && targetUserId ? targetUserId : null);
              } catch (err) {
                subErr = err;
              }

              if (subErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลยอดรับ`);
                continue;
              }

              // Fetch profiles for users in submissions separately to avoid join errors
              const userIds = (submissions || []).map((s: any) => s.user_id).filter(Boolean);
              const uniqueUserIds = [...new Set(userIds)];
              const profilesMap: Record<string, { full_name: string; email: string }> = {};

              if (uniqueUserIds.length > 0) {
                const { data: profiles, error: profErr } = await supabase
                  .from('profiles')
                  .select('id, full_name, email')
                  .in('id', uniqueUserIds);

                if (!profErr && profiles) {
                  profiles.forEach((p: any) => {
                    profilesMap[p.id] = {
                      full_name: p.full_name || 'ไม่ระบุชื่อ',
                      email: p.email || ''
                    };
                  });
                }
              }

              // 2. Fetch Transfers (ยอดส่ง)
              let transfers: any[] = [];
              if (!showOwnOnly) {
                const { data: transData, error: transErr } = await supabase
                  .from('bet_transfers')
                  .select('*')
                  .eq('round_id', activeRound.id);

                if (transErr) {
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลยอดส่ง`);
                  continue;
                }
                transfers = transData || [];
              }

              // Calculate incoming totals
              let grandTotalBet = 0;
              let grandTotalCommission = 0;
              let grandTotalWin = 0;

              interface UserSummary {
                userId: string;
                userName: string;
                totalBet: number;
                totalCommission: number;
                totalWin: number;
                winCount: number;
                ticketCount: number;
              }

              const userSummaries: Record<string, UserSummary> = {};

              const setPrice = activeRound?.set_prices?.['4_top'] || 120;

              (submissions || []).forEach((sub: any) => {
                const amt = Number(sub.amount || 0);
                const comm = Number(sub.commission_amount || 0);

                // Use DB prize_amount as the primary source (same as web app getExpectedPayout).
                // For 4_set, DB stores per-set prize so we must multiply by numSets.
                // Fallback to checkTransferWin when is_winner=true but win=0
                // (handles both null and zero prize_amount from DB).
                let win = 0;
                if (isAnnounced && sub.is_winner) {
                  if (sub.bet_type === '4_set') {
                    const numSets = Math.max(1, Math.floor(amt / setPrice));
                    win = (sub.prize_amount != null ? Number(sub.prize_amount) : 0) * numSets;
                  } else {
                    win = sub.prize_amount != null ? Number(sub.prize_amount) : 0;
                  }
                  // Fallback to realtime calculation when DB prize_amount is missing or zero
                  if (win === 0) {
                    const winResult = checkTransferWin(
                      sub.bet_type,
                      sub.numbers,
                      activeRound.winning_numbers,
                      activeRound.lottery_type,
                      amt,
                      setPrice,
                      DEFAULT_4_SET_SETTINGS.prizes
                    );
                    if (winResult.wins) {
                      win = winResult.payout;
                    }
                  }
                }
                
                grandTotalBet += amt;
                grandTotalCommission += comm;
                grandTotalWin += win;

                const userId = sub.user_id;
                if (!userSummaries[userId]) {
                  const prof = profilesMap[userId] || { full_name: 'ไม่ระบุชื่อ', email: '' };
                  userSummaries[userId] = {
                    userId,
                    userName: prof.full_name,
                    totalBet: 0,
                    totalCommission: 0,
                    totalWin: 0,
                    winCount: 0,
                    ticketCount: 0
                  };
                }
                userSummaries[userId].totalBet += amt;
                userSummaries[userId].totalCommission += comm;
                userSummaries[userId].totalWin += win;
                userSummaries[userId].ticketCount++;
                if (isAnnounced && sub.is_winner) {
                  userSummaries[userId].winCount++;
                }
              });

              if (showOwnOnly && targetUserId) {
                // Ensure there is at least a blank summary for the user so it displays properly
                if (!userSummaries[targetUserId]) {
                  userSummaries[targetUserId] = {
                    userId: targetUserId,
                    userName: memberProfileName,
                    totalBet: 0,
                    totalCommission: 0,
                    totalWin: 0,
                    winCount: 0,
                    ticketCount: 0
                  };
                }
              }

              const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission;

              // Calculate outgoing totals (transfers)
              let outgoingTotalBet = 0;
              let outgoingTotalCommission = 0;
              let outgoingTotalWin = 0;
              let outgoingTicketCount = 0;

              if (!showOwnOnly) {
                // To calculate wins of linked transfers, we fetch target submissions
                const linkedTransfers = (transfers || []).filter((t: any) => t.is_linked && t.target_submission_id);
                const targetSubmissionIds = linkedTransfers.map((t: any) => t.target_submission_id);

                const upstreamSubsMap: Record<string, any> = {};
                if (targetSubmissionIds.length > 0) {
                  const { data: upstreamSubs } = await supabase
                    .from('submissions')
                    .select('id, is_winner, prize_amount, amount, bet_type')
                    .in('id', targetSubmissionIds)
                    .eq('is_deleted', false);

                  (upstreamSubs || []).forEach((sub: any) => {
                    upstreamSubsMap[sub.id] = sub;
                  });
                }

                // We also fetch upstream rounds to get set_prices for 4_set bets
                const targetRoundIds = linkedTransfers.map((t: any) => t.target_round_id).filter(Boolean);
                const upstreamRoundsMap: Record<string, any> = {};
                if (targetRoundIds.length > 0) {
                  const { data: upstreamRounds } = await supabase
                    .from('lottery_rounds')
                    .select('id, set_prices, status, is_result_announced')
                    .in('id', targetRoundIds);

                  (upstreamRounds || []).forEach((r: any) => {
                    upstreamRoundsMap[r.id] = r;
                  });
                }

                // We also need user_settings for linked transfers or connections for external transfers to compute commissions
                // Fetch user_settings for linked transfers where we are the user (dealerId)
                const uniqueUpstreamDealerIds = linkedTransfers.map((t: any) => t.upstream_dealer_id).filter(Boolean);
                const userSettingsMap: Record<string, any> = {};
                if (uniqueUpstreamDealerIds.length > 0) {
                  const { data: settings } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', dealerId)
                    .in('dealer_id', uniqueUpstreamDealerIds);

                  (settings || []).forEach((s: any) => {
                    userSettingsMap[s.dealer_id] = s;
                  });
                }

                // Fetch connections for external transfers
                const externalTransfers = (transfers || []).filter((t: any) => !t.is_linked);
                const uniqueExternalDealerNames = externalTransfers.map((t: any) => t.target_dealer_name).filter(Boolean);
                const connMap: Record<string, any> = {};
                if (uniqueExternalDealerNames.length > 0) {
                  const { data: connData } = await supabase
                    .from('dealer_upstream_connections')
                    .select('upstream_name, lottery_settings')
                    .eq('dealer_id', dealerId)
                    .in('upstream_name', uniqueExternalDealerNames);

                  (connData || []).forEach((c: any) => {
                    connMap[c.upstream_name] = c;
                  });
                }

                // Process each transfer
                const lotteryKey = activeRound.lottery_type === 'thai' ? 'thai' : activeRound.lottery_type === 'lao' ? 'lao' : activeRound.lottery_type === 'hanoi' ? 'hanoi' : 'thai';

                (transfers || []).forEach((t: any) => {
                  const amt = Number(t.amount || 0);
                  outgoingTotalBet += amt;
                  outgoingTicketCount++;

                  // Compute commission
                  let comm = 0;
                  let betSettings: any = null;

                  const settingsKey = getBetSettingsKey(t.bet_type, lotteryKey);
                  if (t.is_linked && t.upstream_dealer_id) {
                    const s = userSettingsMap[t.upstream_dealer_id];
                    betSettings = s?.lottery_settings?.[lotteryKey]?.[settingsKey];
                  } else if (!t.is_linked && t.target_dealer_name) {
                    const c = connMap[t.target_dealer_name];
                    betSettings = c?.lottery_settings?.[lotteryKey]?.[settingsKey];
                  }

                  if (t.bet_type === '4_set' || t.bet_type === '4_top') {
                    const setPrice = betSettings?.setPrice || activeRound?.set_prices?.['4_top'] || 120;
                    const numSets = Math.floor(amt / setPrice);
                    const commRate = betSettings?.commission !== undefined ? betSettings.commission : (DEFAULT_4_SET_SETTINGS.commission || 25);
                    comm = numSets * commRate;
                  } else {
                    let defaultComm = DEFAULT_COMMISSIONS[t.bet_type] || 15;
                    if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
                      const LAO_DEFAULTS: Record<string, number> = {
                        'run_top': 10, 'run_bottom': 10,
                        'pak_top': 20, 'pak_bottom': 20,
                        '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
                        '3_top': 20, '3_tod': 20, '3_bottom': 20,
                        '4_float': 20, '5_float': 20
                      };
                      defaultComm = LAO_DEFAULTS[t.bet_type] !== undefined ? LAO_DEFAULTS[t.bet_type] : 20;
                    }
                    const commissionRate = betSettings?.commission !== undefined 
                      ? betSettings.commission 
                      : defaultComm;
                    comm = amt * (commissionRate / 100);
                  }
                  outgoingTotalCommission += comm;

                  // Compute payout (win)
                  let win = 0;
                  if (isAnnounced) {
                    if (t.is_linked && t.target_submission_id) {
                      const sub = upstreamSubsMap[t.target_submission_id];
                      const upRound = upstreamRoundsMap[t.target_round_id];
                      const isUpstreamAnnounced = upRound?.status === 'announced' && upRound?.is_result_announced;
                      if (sub && sub.is_winner && isUpstreamAnnounced) {
                        if (sub.bet_type === '4_set') {
                          const setPrice = upRound?.set_prices?.['4_top'] || activeRound?.set_prices?.['4_top'] || 120;
                          const numSets = Math.max(1, Math.floor((sub.amount || 0) / setPrice));
                          win = (sub.prize_amount || 0) * numSets;
                        } else {
                          win = sub.prize_amount || 0;
                        }
                      }
                    } else if (!t.is_linked) {
                      // External transfers: calculate manually using checkTransferWin
                      const setPrice = activeRound.set_prices?.['4_top'] || 120;
                      const res = checkTransferWin(
                        t.bet_type,
                        t.numbers || '',
                        activeRound.winning_numbers,
                        activeRound.lottery_type,
                        amt,
                        setPrice,
                        DEFAULT_4_SET_SETTINGS.prizes
                      );
                      if (res.wins) {
                        win = res.payout;
                      }
                    }
                  }
                  outgoingTotalWin += win;
                });
              }

              const outgoingProfit = outgoingTotalWin + outgoingTotalCommission - outgoingTotalBet;
              const totalCombinedProfit = dealerProfit + outgoingProfit;

              // Format numbers as integers
              const roundedGrandTotalBet = Math.round(grandTotalBet);
              const roundedGrandTotalCommission = Math.round(grandTotalCommission);
              const roundedGrandTotalWin = Math.round(grandTotalWin);
              const roundedDealerProfit = Math.round(dealerProfit);

              const roundedOutgoingTotalBet = Math.round(outgoingTotalBet);
              const roundedOutgoingTotalCommission = Math.round(outgoingTotalCommission);
              const roundedOutgoingTotalWin = Math.round(outgoingTotalWin);
              const roundedOutgoingProfit = Math.round(outgoingProfit);

              const roundedTotalCombinedProfit = Math.round(totalCombinedProfit);

              // Sort user summaries by net profit descending (similar to frontend)
              const sortedUserSummaries = Object.values(userSummaries).sort((a, b) => {
                const netA = a.totalWin - (a.totalBet - a.totalCommission);
                const netB = b.totalWin - (b.totalBet - b.totalCommission);
                return netB - netA; // high winnings / payout first
              });

              // Construct AltText Summary (Thai Plaintext) and Flex Message
              let summaryText = '';
              let flexMessage: any;

              if (showOwnOnly) {
                const u = userSummaries[targetUserId!];
                const net = u.totalWin - (u.totalBet - u.totalCommission);
                const roundedNet = Math.round(net);
                const roundedBet = Math.round(u.totalBet);
                const roundedComm = Math.round(u.totalCommission);
                const roundedWin = Math.round(u.totalWin);

                let netLabel = '';
                let netColor = '#888888';
                if (roundedNet > 0) {
                  netLabel = `ต้องเก็บ ฿${roundedNet.toLocaleString('th-TH')}`;
                  netColor = '#10b981'; // Green (member collects from dealer)
                } else if (roundedNet < 0) {
                  netLabel = `ต้องจ่าย ฿${Math.abs(roundedNet).toLocaleString('th-TH')}`;
                  netColor = '#ef4444'; // Red (member pays dealer)
                } else {
                  netLabel = 'เสมอ';
                  netColor = '#94a3b8';
                }

                summaryText = showOwnOnly && targetUserId !== profile?.id 
                  ? `📊 สรุปยอดส่งของสมาชิก ${u.userName}\n`
                  : `📊 สรุปยอดส่งของคุณ ${u.userName}\n`;
                summaryText += `งวดวันที่: ${getRoundDisplayDate(activeRound, false)} (${activeRound.lottery_name || activeRound.lottery_type.toUpperCase()})\n`;
                summaryText += `--------------------------\n`;
                summaryText += `- ยอดส่ง: ฿${roundedBet.toLocaleString('th-TH')}\n`;
                summaryText += `- ค่าคอม: ฿${roundedComm.toLocaleString('th-TH')}\n`;
                summaryText += `- ถูก/ยอดได้: ${isAnnounced ? `${u.winCount}/฿${roundedWin.toLocaleString('th-TH')}` : '-'}\n`;
                summaryText += `- สรุป: ${netLabel}\n`;
                summaryText += `--------------------------`;

                flexMessage = {
                  "type": "flex",
                  "altText": summaryText.trim(),
                  "contents": {
                    "type": "bubble",
                    "size": "mega",
                    "header": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#4f46e5", // Indigo-600
                      "paddingAll": "lg",
                      "contents": [
                        {
                          "type": "text",
                          "text": showOwnOnly && targetUserId !== profile?.id ? `📊 สรุปยอดส่งของสมาชิก` : `📊 สรุปยอดส่งของคุณ`,
                          "weight": "bold",
                          "size": "md",
                          "color": "#ffffff"
                        },
                        {
                          "type": "text",
                          "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)} (${activeRound.lottery_name || activeRound.lottery_type.toUpperCase()})`,
                          "size": "xs",
                          "color": "#c7d2fe", // Indigo-200
                          "margin": "xs"
                        },
                        {
                          "type": "text",
                          "text": isAnnounced ? `🎉 เลขที่ออก: ${formatWinningNumbersForDisplay(activeRound.winning_numbers, activeRound.lottery_type)}` : `⏳ รอประกาศผลรางวัล`,
                          "size": isAnnounced ? "sm" : "xs",
                          "color": isAnnounced ? "#ffffff" : "#f59e0b",
                          "margin": "xs",
                          "weight": "bold"
                        }
                      ]
                    },
                    "body": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#f8fafc", // Slate-50
                      "paddingAll": "md",
                      "contents": [
                        {
                          "type": "box",
                          "layout": "vertical",
                          "backgroundColor": "#ffffff", // White Card
                          "cornerRadius": "md",
                          "paddingAll": "lg",
                          "contents": [
                            {
                              "type": "text",
                              "text": `คุณ ${u.userName}`,
                              "weight": "bold",
                              "size": "md",
                              "color": "#0f172a"
                            },
                            {
                              "type": "separator",
                              "margin": "md",
                              "color": "#e2e8f0"
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "md",
                              "contents": [
                                {
                                  "type": "text",
                                  "text": "ยอดส่งแทง:",
                                  "size": "sm",
                                  "color": "#64748b"
                                },
                                {
                                  "type": "text",
                                  "text": `฿${roundedBet.toLocaleString('th-TH')}`,
                                  "weight": "bold",
                                  "size": "sm",
                                  "color": "#0f172a",
                                  "align": "end"
                                }
                              ]
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "sm",
                              "contents": [
                                {
                                  "type": "text",
                                  "text": "ส่วนลด/ค่าคอม:",
                                  "size": "sm",
                                  "color": "#64748b"
                                },
                                {
                                  "type": "text",
                                  "text": `฿${roundedComm.toLocaleString('th-TH')}`,
                                  "weight": "bold",
                                  "size": "sm",
                                  "color": "#0f172a",
                                  "align": "end"
                                }
                              ]
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "sm",
                              "contents": [
                                {
                                  "type": "text",
                                  "text": "ยอดถูกรางวัล:",
                                  "size": "sm",
                                  "color": "#64748b"
                                },
                                {
                                  "type": "text",
                                  "text": isAnnounced ? `ถูก ${u.winCount} ครั้ง / ฿${roundedWin.toLocaleString('th-TH')}` : "-",
                                  "weight": "bold",
                                  "size": "sm",
                                  "color": "#0f172a",
                                  "align": "end"
                                }
                              ]
                            },
                            {
                              "type": "separator",
                              "margin": "md",
                              "color": "#e2e8f0"
                            },
                            {
                              "type": "box",
                              "layout": "horizontal",
                              "margin": "md",
                              "contents": [
                                {
                                  "type": "text",
                                  "text": "สรุปยอดสุทธิ:",
                                  "weight": "bold",
                                  "size": "sm",
                                  "color": "#0f172a"
                                },
                                {
                                  "type": "text",
                                  "text": netLabel,
                                  "weight": "bold",
                                  "size": "sm",
                                  "color": netColor,
                                  "align": "end"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                };

              } else {
                summaryText = `📊 สรุปงวดวันที่: ${getRoundDisplayDate(activeRound, false)} (${activeRound.lottery_name || activeRound.lottery_type.toUpperCase()})\n`;
                summaryText += `--------------------------\n`;
                summaryText += `1. ภาพรวม\n`;
                summaryText += `🟢 ยอดรับ ${submissions?.length || 0} รายการ\n`;
                summaryText += `- ยอดรวม: ฿${roundedGrandTotalBet.toLocaleString('th-TH')}\n`;
                summaryText += `- ค่าคอม: ฿${roundedGrandTotalCommission.toLocaleString('th-TH')}\n`;
                if (isAnnounced) {
                  summaryText += `- จ่าย: ฿${roundedGrandTotalWin.toLocaleString('th-TH')}\n`;
                  summaryText += `- กำไร: ฿${roundedDealerProfit.toLocaleString('th-TH')}\n`;
                }
                summaryText += `\n🔴 ยอดส่ง ${outgoingTicketCount} รายการ\n`;
                summaryText += `- ยอดรวม: ฿${roundedOutgoingTotalBet.toLocaleString('th-TH')}\n`;
                summaryText += `- ค่าคอม: ฿${roundedOutgoingTotalCommission.toLocaleString('th-TH')}\n`;
                if (isAnnounced) {
                  summaryText += `- รับ: ฿${roundedOutgoingTotalWin.toLocaleString('th-TH')}\n`;
                  summaryText += `- กำไร: ฿${roundedOutgoingProfit.toLocaleString('th-TH')}\n`;
                }
                if (isAnnounced) {
                  summaryText += `\n💰 กำไรรวม: ฿${roundedTotalCombinedProfit.toLocaleString('th-TH')}\n`;
                }
                summaryText += `--------------------------\n`;
                summaryText += `2. รายละเอียดแต่ละคน\n`;

                const memberBubbleContents: any[] = [];

                if (sortedUserSummaries.length === 0) {
                  summaryText += `ยังไม่มียอดแทงส่งเข้ามาค่ะ\n`;
                  memberBubbleContents.push({
                    "type": "text",
                    "text": "ยังไม่มียอดแทงส่งเข้ามาค่ะ",
                    "size": "sm",
                    "color": "#64748b",
                    "align": "center",
                    "margin": "md"
                  });
                } else {
                  sortedUserSummaries.forEach((u, idx) => {
                    const net = u.totalWin - (u.totalBet - u.totalCommission);
                    const roundedNet = Math.round(net);
                    const roundedBet = Math.round(u.totalBet);
                    const roundedComm = Math.round(u.totalCommission);
                    const roundedWin = Math.round(u.totalWin);

                    let netLabel = '';
                    let netColor = '#888888';
                    if (roundedNet > 0) {
                      netLabel = `ต้องจ่าย ฿${roundedNet.toLocaleString('th-TH')}`;
                      netColor = '#ef4444'; // Red (dealer has to pay member)
                    } else if (roundedNet < 0) {
                      netLabel = `ต้องเก็บ ฿${Math.abs(roundedNet).toLocaleString('th-TH')}`;
                      netColor = '#10b981'; // Green (dealer collects from member)
                    } else {
                      netLabel = 'เสมอ';
                      netColor = '#64748b';
                    }

                    summaryText += `${idx + 1}. คุณ ${u.userName}\n`;
                    summaryText += `- ยอดแทง: ฿${roundedBet.toLocaleString('th-TH')} | ค่าคอม: ฿${roundedComm.toLocaleString('th-TH')}\n`;
                    summaryText += `- ถูก/ยอดได้: ${isAnnounced ? `${u.winCount}/฿${roundedWin.toLocaleString('th-TH')}` : '-'}\n`;
                    summaryText += `- สรุป: ${netLabel}\n\n`;

                    // Add Flex Row for Member
                    memberBubbleContents.push(
                      {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": "#ffffff", // White Card
                        "cornerRadius": "md",
                        "paddingAll": "md",
                        "margin": "md",
                        "contents": [
                          {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                              {
                                "type": "text",
                                "text": `คุณ ${u.userName}`,
                                "weight": "bold",
                                "size": "sm",
                                "color": "#0f172a",
                                "flex": 7
                              },
                              {
                                "type": "text",
                                "text": netLabel,
                                "weight": "bold",
                                "size": "sm",
                                "color": netColor,
                                "align": "end",
                                "flex": 5
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
                                "text": `แทง: ฿${roundedBet.toLocaleString('th-TH')}`,
                                "size": "xs",
                                "color": "#64748b",
                                "flex": 4
                              },
                              {
                                "type": "text",
                                "text": `คอม: ฿${roundedComm.toLocaleString('th-TH')}`,
                                "size": "xs",
                                "color": "#64748b",
                                "flex": 4
                              },
                              {
                                "type": "text",
                                "text": isAnnounced ? `ถูก: ${u.winCount}/฿${roundedWin.toLocaleString('th-TH')}` : "ถูก: -",
                                "size": "xs",
                                "color": "#64748b",
                                "align": "end",
                                "flex": 4
                              }
                            ]
                          }
                        ]
                      }
                    );
                  });
                }

                // Create Overview Box for body
                const overviewBoxContents: any[] = [
                  {
                    "type": "text",
                    "text": "1. ภาพรวมงวด",
                    "weight": "bold",
                    "size": "sm",
                    "color": "#0f172a",
                    "margin": "none"
                  },
                  // ยอดรับ Row
                  {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "sm",
                    "contents": [
                      {
                        "type": "text",
                        "text": `🟢 ยอดรับ (${submissions?.length || 0} รายการ)`,
                        "size": "xs",
                        "weight": "bold",
                        "color": "#10b981"
                      },
                      {
                        "type": "box",
                        "layout": "horizontal",
                        "margin": "xs",
                        "contents": [
                          { "type": "text", "text": `รวม: ฿${roundedGrandTotalBet.toLocaleString('th-TH')}`, "size": "xs", "color": "#64748b" },
                          { "type": "text", "text": `คอม: ฿${roundedGrandTotalCommission.toLocaleString('th-TH')}`, "size": "xs", "color": "#64748b" },
                          { "type": "text", "text": isAnnounced ? `จ่าย: ฿${roundedGrandTotalWin.toLocaleString('th-TH')}` : "จ่าย: -", "size": "xs", "color": "#64748b", "align": "end" },
                          { "type": "text", "text": isAnnounced ? `กำไร: ฿${roundedDealerProfit.toLocaleString('th-TH')}` : "กำไร: -", "size": "xs", "color": isAnnounced && roundedDealerProfit >= 0 ? "#10b981" : "#ef4444", "align": "end" }
                        ]
                      }
                    ]
                  },
                  // ยอดส่ง Row
                  {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "md",
                    "contents": [
                      {
                        "type": "text",
                        "text": `🔴 ยอดส่ง (${outgoingTicketCount} รายการ)`,
                        "size": "xs",
                        "weight": "bold",
                        "color": "#ef4444"
                      },
                      {
                        "type": "box",
                        "layout": "horizontal",
                        "margin": "xs",
                        "contents": [
                          { "type": "text", "text": `รวม: ฿${roundedOutgoingTotalBet.toLocaleString('th-TH')}`, "size": "xs", "color": "#64748b" },
                          { "type": "text", "text": `คอม: ฿${roundedOutgoingTotalCommission.toLocaleString('th-TH')}`, "size": "xs", "color": "#64748b" },
                          { "type": "text", "text": isAnnounced ? `รับ: ฿${roundedOutgoingTotalWin.toLocaleString('th-TH')}` : "รับ: -", "size": "xs", "color": "#64748b", "align": "end" },
                          { "type": "text", "text": isAnnounced ? `กำไร: ฿${roundedOutgoingProfit.toLocaleString('th-TH')}` : "กำไร: -", "size": "xs", "color": isAnnounced && roundedOutgoingProfit >= 0 ? "#10b981" : "#ef4444", "align": "end" }
                        ]
                      }
                    ]
                  }
                ];

                if (isAnnounced) {
                  overviewBoxContents.push(
                    {
                      "type": "box",
                      "layout": "horizontal",
                      "margin": "md",
                      "contents": [
                        {
                          "type": "text",
                          "text": "💰 กำไรรวมสุทธิ:",
                          "weight": "bold",
                          "size": "sm",
                          "color": "#0f172a"
                        },
                        {
                          "type": "text",
                          "text": `฿${roundedTotalCombinedProfit.toLocaleString('th-TH')}`,
                          "weight": "bold",
                          "size": "sm",
                          "align": "end",
                          "color": roundedTotalCombinedProfit >= 0 ? "#10b981" : "#ef4444"
                        }
                      ]
                    }
                  );
                }

                flexMessage = {
                  "type": "flex",
                  "altText": summaryText.trim(),
                  "contents": {
                    "type": "bubble",
                    "size": "mega",
                    "header": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#4f46e5", // Indigo-600
                      "paddingAll": "lg",
                      "contents": [
                        {
                          "type": "text",
                          "text": `📊 สรุปงวด (${activeRound.lottery_name || activeRound.lottery_type.toUpperCase()})`,
                          "weight": "bold",
                          "size": "md",
                          "color": "#ffffff"
                        },
                        {
                          "type": "text",
                          "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}`,
                          "size": "xs",
                          "color": "#c7d2fe", // Indigo-200
                          "margin": "xs"
                        },
                        {
                          "type": "text",
                          "text": isAnnounced ? `🎉 เลขที่ออก: ${formatWinningNumbersForDisplay(activeRound.winning_numbers, activeRound.lottery_type)}` : `⏳ รอประกาศผลรางวัล`,
                          "size": isAnnounced ? "sm" : "xs",
                          "color": isAnnounced ? "#ffffff" : "#f59e0b",
                          "margin": "xs",
                          "weight": "bold"
                        }
                      ]
                    },
                    "body": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#f8fafc", // Slate-50
                      "paddingAll": "md",
                      "contents": [
                        // Overview Section
                        {
                          "type": "box",
                          "layout": "vertical",
                          "backgroundColor": "#ffffff", // White Card
                          "cornerRadius": "md",
                          "paddingAll": "md",
                          "contents": overviewBoxContents
                        },
                        // Spacer
                        {
                          "type": "box",
                          "layout": "vertical",
                          "margin": "md",
                          "contents": [
                            {
                              "type": "text",
                              "text": "2. รายละเอียดสมาชิก",
                              "weight": "bold",
                              "size": "sm",
                              "color": "#0f172a"
                            }
                          ]
                        },
                        // Member List
                        ...memberBubbleContents
                      ]
                    }
                  }
                };
              }

              await sendLineReply(replyToken, flexMessage);
              continue;
            }

            // ─── COMMAND: /ยอดรวม หรือ /total ───
            if (text.startsWith('/total') || text.startsWith('/ยอดรวม')) {
              let searchArg = '';
              if (text.startsWith('/total')) {
                searchArg = text.substring('/total'.length).trim();
              } else if (text.startsWith('/ยอดรวม')) {
                searchArg = text.substring('/ยอดรวม'.length).trim();
              }

              if (searchArg !== '') {
                if (!permissions.can_view_total) {
                  await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานยอดรวมของสมาชิกรายอื่น`);
                  continue;
                }
              } else {
                if (!showOwnOnly && !permissions.can_view_total) {
                  await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานยอดรวม`);
                  continue;
                }
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              let matchedUserId: string | null = null;
              let matchedUserName = '';

              if (searchArg !== '') {
                // 1. Fetch dealer's active memberships
                const { data: memberships, error: memErr } = await supabase
                  .from('user_dealer_memberships')
                  .select(`
                    user_id,
                    profiles:user_id (
                      id,
                      full_name,
                      line_poy_display,
                      line_user_id,
                      email
                    )
                  `)
                  .eq('dealer_id', dealerId)
                  .eq('status', 'active');

                if (memErr) {
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิก`);
                  continue;
                }

                // 2. Fetch group members for this LINE group
                const { data: groupMembers } = await supabase
                  .from('line_group_members')
                  .select('user_id, line_user_id, display_name')
                  .eq('line_group_id', groupLink.line_group_id);

                const cleanArg = searchArg.toLowerCase().trim();

                // Find matches from memberships
                const candidates: Array<{
                  user_id: string;
                  full_name: string;
                  line_user_id: string;
                  email: string;
                  group_display_name: string;
                }> = [];

                (memberships || []).forEach((m: any) => {
                  const p = m.profiles;
                  if (p) {
                    const gm = (groupMembers || []).find((g: any) => g.user_id === p.id || (g.line_user_id === p.line_user_id && p.line_user_id));
                    candidates.push({
                      user_id: p.id,
                      full_name: p.full_name || '',
                      line_user_id: p.line_user_id || '',
                      email: p.email || '',
                      group_display_name: gm?.display_name || ''
                    });
                  }
                });

                // Let's perform matches
                // 1. Exact match on UUID
                let matches = candidates.filter(c => c.user_id.toLowerCase() === cleanArg);

                // 2. Exact match on line_user_id
                if (matches.length === 0) {
                  matches = candidates.filter(c => c.line_user_id.toLowerCase() === cleanArg);
                }

                // 3. Exact match on full_name or group_display_name
                if (matches.length === 0) {
                  matches = candidates.filter(c => 
                    c.full_name.toLowerCase() === cleanArg ||
                    c.group_display_name.toLowerCase() === cleanArg
                  );
                }

                // 4. Substring match on full_name, group_display_name, email
                if (matches.length === 0) {
                  matches = candidates.filter(c => 
                    c.full_name.toLowerCase().includes(cleanArg) ||
                    c.group_display_name.toLowerCase().includes(cleanArg) ||
                    c.email.toLowerCase().includes(cleanArg)
                  );
                }

                if (matches.length === 0) {
                  await sendLineReply(replyToken, `❌ ไม่พบสมาชิกที่ตรงกับ "${searchArg}"`);
                  continue;
                }

                if (matches.length > 1) {
                  const names = matches.map(c => `คุณ ${c.full_name || c.group_display_name || 'ไม่ทราบชื่อ'}`).join(', ');
                  await sendLineReply(replyToken, `⚠️ พบสมาชิกมากกว่า 1 คนที่ตรงกับ "${searchArg}":\n${names}\nกรุณาระบุชื่อที่ละเอียดขึ้นค่ะ`);
                  continue;
                }

                const matchedCandidate = matches[0];
                matchedUserId = matchedCandidate.user_id;
                matchedUserName = matchedCandidate.full_name || matchedCandidate.group_display_name || 'ไม่ทราบชื่อ';
              }

              let targetIdForSubmissions: string | null = null;
              if (matchedUserId) {
                targetIdForSubmissions = matchedUserId;
              } else if (showOwnOnly && targetUserId) {
                targetIdForSubmissions = targetUserId;
              }

              let submissions = [];
              let sumErr = null;
              try {
                submissions = await fetchAllSubmissions(activeRound.id, targetIdForSubmissions);
              } catch (err) {
                sumErr = err;
              }

              if (sumErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการคำนวณยอดรวม`);
                continue;
              }

              const betTypeTotals: Record<string, number> = {};
              let grandTotal = 0;
              let totalCommission = 0;
              (submissions || []).forEach((s: any) => {
                const amt = Number(s.amount || 0);
                const comm = Number(s.commission_amount || 0);
                betTypeTotals[s.bet_type] = (betTypeTotals[s.bet_type] || 0) + amt;
                grandTotal += amt;
                totalCommission += comm;
              });

              const leftAmount = grandTotal - totalCommission;

              const LABELS: Record<string, string> = {
                '2_top': '2 ตัวบน',
                '2_bottom': '2 ตัวล่าง',
                '3_top': groupLink.lottery_type === 'lao' || groupLink.lottery_type === 'hanoi' ? '3 ตัวตรง' : '3 ตัวบน',
                '3_tod': '3 ตัวโต๊ด',
                '3_front': '3 ตัวหน้า',
                '3_back': '3 ตัวหลัง',
                '4_tod': '4 ตัวโต๊ด',
                '4_set': '4 ตัวชุด',
                '6_top': '6 ตัวบน',
                '4_float': '4 ตัวลอยแพ',
                '5_float': '5 ตัวลอยแพ',
                'run_top': 'ลอยบน',
                'run_bottom': 'ลอยล่าง'
              };

              let summaryText = '';
              let headerTitle = '';
              const headerContents: any[] = [];

              if (matchedUserId) {
                headerTitle = `📈 ยอดรวมส่งโพยของ คุณ ${matchedUserName} (${groupLink.lottery_type.toUpperCase()})`;
                summaryText = `${headerTitle}\n`;
                summaryText += `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;
                summaryText += `ผู้ซื้อ: คุณ ${matchedUserName}\n`;

                headerContents.push(
                  {
                    "type": "text",
                    "text": headerTitle,
                    "weight": "bold",
                    "size": "md",
                    "color": "#ffffff"
                  },
                  {
                    "type": "text",
                    "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}`,
                    "size": "xs",
                    "color": "#e1d9f0",
                    "margin": "xs"
                  },
                  {
                    "type": "text",
                    "text": `ผู้ซื้อ: คุณ ${matchedUserName}`,
                    "size": "xs",
                    "color": "#e1d9f0",
                    "margin": "xs"
                  }
                );
              } else if (showOwnOnly) {
                headerTitle = `📈 ยอดรวมส่งโพยของคุณ (${groupLink.lottery_type.toUpperCase()})`;
                summaryText = `${headerTitle}\n`;
                summaryText += `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;
                summaryText += `ผู้ซื้อ: คุณ ${memberProfileName}\n`;

                headerContents.push(
                  {
                    "type": "text",
                    "text": headerTitle,
                    "weight": "bold",
                    "size": "md",
                    "color": "#ffffff"
                  },
                  {
                    "type": "text",
                    "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}`,
                    "size": "xs",
                    "color": "#e1d9f0",
                    "margin": "xs"
                  },
                  {
                    "type": "text",
                    "text": `ผู้ซื้อ: คุณ ${memberProfileName}`,
                    "size": "xs",
                    "color": "#e1d9f0",
                    "margin": "xs"
                  }
                );
              } else {
                headerTitle = `📈 ยอดรวมส่งโพย (${groupLink.lottery_type.toUpperCase()})`;
                summaryText = `${headerTitle}\n`;
                summaryText += `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;

                headerContents.push(
                  {
                    "type": "text",
                    "text": headerTitle,
                    "weight": "bold",
                    "size": "md",
                    "color": "#ffffff"
                  },
                  {
                    "type": "text",
                    "text": `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}`,
                    "size": "xs",
                    "color": "#e1d9f0",
                    "margin": "xs"
                  }
                );
              }
              summaryText += `--------------------------\n`;

              const bubbleBodyContents: any[] = [];

              if (Object.keys(betTypeTotals).length === 0) {
                const noBetsMsg = matchedUserId
                  ? `คุณ ${matchedUserName} ยังไม่มียอดแทงส่งเข้ามาในงวดนี้ค่ะ`
                  : (showOwnOnly ? `คุณยังไม่มียอดแทงส่งเข้ามาในงวดนี้ค่ะ` : `ยังไม่มียอดแทงส่งเข้ามาค่ะ`);
                summaryText += `${noBetsMsg}\n`;
                bubbleBodyContents.push({
                  "type": "text",
                  "text": noBetsMsg,
                  "size": "sm",
                  "color": "#888888",
                  "align": "center",
                  "margin": "md"
                });
              } else {
                for (const [type, sum] of Object.entries(betTypeTotals)) {
                  const roundedSum = Math.round(sum);
                  summaryText += `${LABELS[type] || type}: ฿${roundedSum.toLocaleString('th-TH')}\n`;

                  bubbleBodyContents.push({
                    "type": "box",
                    "layout": "horizontal",
                    "margin": "md",
                    "contents": [
                      {
                        "type": "text",
                        "text": `${LABELS[type] || type}`,
                        "size": "sm",
                        "color": "#333333",
                        "weight": "bold",
                        "flex": 6
                      },
                      {
                        "type": "text",
                        "text": `฿${roundedSum.toLocaleString('th-TH')}`,
                        "size": "sm",
                        "weight": "bold",
                        "align": "end",
                        "color": "#333333",
                        "flex": 5
                      }
                    ]
                  });
                }
              }

              const roundedGrandTotal = Math.round(grandTotal);
              const roundedTotalCommission = Math.round(totalCommission);
              const roundedLeftAmount = roundedGrandTotal - roundedTotalCommission;

              summaryText += `--------------------------\n`;
              summaryText += `💰 ยอดรวมทั้งหมด: ฿${roundedGrandTotal.toLocaleString('th-TH')}\n`;
              summaryText += `💸 ค่าคอม: ฿${roundedTotalCommission.toLocaleString('th-TH')}\n`;
              summaryText += `💵 เหลือ: ฿${roundedLeftAmount.toLocaleString('th-TH')}`;

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
                    "contents": headerContents
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
                    "contents": [
                      {
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
                                "text": "💰 ยอดรวมทั้งหมด:",
                                "size": "sm",
                                "color": "#555555"
                              },
                              {
                                "type": "text",
                                "text": `฿${roundedGrandTotal.toLocaleString('th-TH')}`,
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
                                "text": `฿${roundedTotalCommission.toLocaleString('th-TH')}`,
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
                                "text": `฿${roundedLeftAmount.toLocaleString('th-TH')}`,
                                "size": "sm",
                                "weight": "bold",
                                "align": "end",
                                "color": "#4A2E80"
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                }
              };

              await sendLineReply(replyToken, flexMessage);
              continue;
            }

            // ─── COMMAND: /ยอดเกิน หรือ /excess ───
            if (text.startsWith('/excess') || text.startsWith('/ยอดเกิน')) {
              if (!permissions.can_view_excess) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานยอดเกินอั้น`);
                continue;
              }

              const isPdf = text.toLowerCase().split(/\s+/).includes('pdf');

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, set_prices, lottery_type, lottery_name')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              const excessItems = await calculateRoundExcess(activeRound.id);

              const LABELS: Record<string, string> = {
                '2_top': '2 ตัวบน',
                '2_bottom': '2 ตัวล่าง',
                '3_top': groupLink.lottery_type === 'lao' || groupLink.lottery_type === 'hanoi' ? '3 ตัวตรง' : '3 ตัวบน',
                '3_tod': '3 ตัวโต๊ด',
                '3_front': '3 ตัวหน้า',
                '3_back': '3 ตัวหลัง',
                '4_tod': '4 ตัวโต๊ด',
                '4_set': '4 ตัวชุด',
                '6_top': '6 ตัวบน',
                '4_float': '4 ตัวลอยแพ',
                '5_float': '5 ตัวลอยแพ',
                'run_top': 'ลอยบน',
                'run_bottom': 'ลอยล่าง'
              };

              const LOTTERY_NAMES: Record<string, string> = { 'thai': 'หวยไทย', 'lao': 'หวยลาว', 'hanoi': 'หวยฮานอย', 'stock': 'หวยหุ้น', 'yeekee': 'หวยยี่กี', 'other': 'อื่นๆ' };
              const lotteryDisplayName = activeRound.lottery_name || LOTTERY_NAMES[groupLink.lottery_type] || groupLink.lottery_type.toUpperCase();
              const roundDateStr = getRoundDisplayDate(activeRound, false);

              if (isPdf) {
                const pdfCategories: PDFCategory[] = [];
                let totalExcess = 0;
                if (excessItems.length > 0) {
                  // Group items by bet_type
                  const betTypeOrder = ['run_top', 'run_bottom', 'pak_top', 'pak_bottom', '2_top', '2_front', '2_center', '2_run', '2_bottom', '3_top', '3_tod', '3_front', '3_back', '3_bottom', '4_set', '4_top', '4_tod', '4_float', '5_float', '6_top'];
                  const grouped: Record<string, typeof excessItems> = {};
                  excessItems.forEach((item) => {
                    if (!grouped[item.bet_type]) grouped[item.bet_type] = [];
                    grouped[item.bet_type].push(item);
                    totalExcess += item.amount;
                  });
                  const sortedTypes = Object.keys(grouped).sort((a, b) => {
                    const idxA = betTypeOrder.indexOf(a);
                    const idxB = betTypeOrder.indexOf(b);
                    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                  });

                  for (const betType of sortedTypes) {
                    const items = grouped[betType];
                    const label = LABELS[betType] || betType;
                    const pdfItems = items.map((item) => {
                      if (betType === '4_set') {
                        const setPrice = activeRound.set_prices?.['4_top'] || 120;
                        const numSets = Math.round(item.amount / setPrice);
                        return { numbers: item.numbers, amountText: `${numSets} ชุด` };
                      } else {
                        return { numbers: item.numbers, amountText: item.amount.toLocaleString('th-TH') };
                      }
                    });
                    pdfCategories.push({ label, items: pdfItems });
                  }
                }

                try {
                  const pdfBytes = await generateReportPDF(
                    `รายการเลขเกินอั้น (${lotteryDisplayName})`,
                    roundDateStr ? `งวดวันที่: ${roundDateStr}` : '',
                    pdfCategories,
                    `รวมยอดเกิน: ฿${totalExcess.toLocaleString('th-TH')}`
                  );
                  const fileName = `excess_${activeRound.id}_${Date.now()}.pdf`;
                  const signedUrl = await uploadPDFToStorage(pdfBytes, fileName);
                  await sendLineReply(replyToken, `📄 ดาวน์โหลด PDF รายการเลขเกินอั้น (${lotteryDisplayName})\nงวดวันที่: ${roundDateStr}\n\n👉 กดที่นี่เพื่อดาวน์โหลด:\n${signedUrl}`);
                } catch (pdfErr) {
                  console.error("PDF generation/upload error:", pdfErr);
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ${pdfErr.message}`);
                }
                continue;
              }

              let summaryText = `รายการเลขเกินอั้น ${lotteryDisplayName}\nงวดวันที่: ${roundDateStr}\n`;
              summaryText += `--------------------------\n`;

              let totalExcess = 0;
              if (excessItems.length === 0) {
                summaryText += `ไม่มียอดเกินอั้นค่ะ 🎉\n`;
              } else {
                // Group items by bet_type
                const betTypeOrder = ['run_top', 'run_bottom', 'pak_top', 'pak_bottom', '2_top', '2_front', '2_center', '2_run', '2_bottom', '3_top', '3_tod', '3_front', '3_back', '3_bottom', '4_set', '4_top', '4_tod', '4_float', '5_float', '6_top'];
                const grouped: Record<string, typeof excessItems> = {};
                excessItems.forEach((item) => {
                  if (!grouped[item.bet_type]) grouped[item.bet_type] = [];
                  grouped[item.bet_type].push(item);
                  totalExcess += item.amount;
                });
                const sortedTypes = Object.keys(grouped).sort((a, b) => {
                  const idxA = betTypeOrder.indexOf(a);
                  const idxB = betTypeOrder.indexOf(b);
                  if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                  if (idxA === -1) return 1;
                  if (idxB === -1) return -1;
                  return idxA - idxB;
                });
                sortedTypes.forEach((betType, idx) => {
                  const items = grouped[betType];
                  const label = LABELS[betType] || betType;
                  summaryText += `[${label}]\n`;
                  items.forEach((item) => {
                    if (betType === '4_set') {
                      const setPrice = activeRound.set_prices?.['4_top'] || 120;
                      const numSets = Math.round(item.amount / setPrice);
                      summaryText += `${item.numbers}=${numSets} ชุด\n`;
                    } else {
                      summaryText += `${item.numbers}=${item.amount}\n`;
                    }
                  });
                  if (idx < sortedTypes.length - 1) {
                    summaryText += `---------------\n`;
                  }
                });
              }
              summaryText += `--------------------------\n`;
              summaryText += `รวมยอดเกิน: ฿${totalExcess.toLocaleString('th-TH')}`;

              await sendLineReply(replyToken, summaryText);
              continue;
            }

            // Helper to split text by character limit without cutting lines
            function splitTextByLimit(textStr: string, limit = 4000): string[] {
              if (textStr.length <= limit) return [textStr];
              const lines = textStr.split('\n');
              const chunks: string[] = [];
              let currentChunk = '';
              for (const line of lines) {
                if ((currentChunk + '\n' + line).length > limit) {
                  if (currentChunk) chunks.push(currentChunk);
                  currentChunk = line;
                } else {
                  currentChunk = currentChunk === '' ? line : currentChunk + '\n' + line;
                }
              }
              if (currentChunk) chunks.push(currentChunk);
              return chunks;
            }

            const typeRanks: Record<string, number> = {
              'run_top': 100, 'run_bottom': 101, 'pak_top': 102, 'pak_bottom': 103,
              'front_top_1': 104, 'middle_top_1': 105, 'back_top_1': 106,
              'front_bottom_1': 107, 'back_bottom_1': 108,
              '2_top': 200, '2_bottom': 201, '2_front': 202, '2_center': 203, '2_run': 204, '2_spread': 205,
              '3_top': 300, '3_tod': 301, '3_front': 302, '3_back': 303, '3_bottom': 304,
              '4_set': 400, '4_tod': 401, '4_float': 402, '5_float': 403, '6_top': 404
            };

            // ─── COMMAND: /เลขรวม ───
            if (text.startsWith('/เลขรวม')) {
              if (!permissions.can_view_total && !permissions.can_view_stats) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานข้อมูลตัวเลข`);
                continue;
              }

              const isPdf = text.toLowerCase().split(/\s+/).includes('pdf');

              let sortByAmount: 'asc' | 'desc' | null = null;
              if (text.includes('น-ม')) {
                sortByAmount = 'asc';
              } else if (text.includes('ม-น')) {
                sortByAmount = 'desc';
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, lottery_type')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              let submissions = [];
              let sumErr = null;
              try {
                submissions = await fetchAllSubmissions(activeRound.id);
              } catch (err) {
                sumErr = err;
              }

              if (sumErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลเลขรวม`);
                continue;
              }

              const soldMap = new Map<string, Map<string, number>>();
              let grandTotal = 0;
              (submissions || []).forEach((s: any) => {
                const amt = Number(s.amount || 0);
                if (amt <= 0) return;
                if (!soldMap.has(s.bet_type)) {
                  soldMap.set(s.bet_type, new Map<string, number>());
                }
                const typeMap = soldMap.get(s.bet_type)!;
                typeMap.set(s.numbers, (typeMap.get(s.numbers) || 0) + amt);
                grandTotal += amt;
              });

              const sortedTypes = Array.from(soldMap.keys()).sort((a, b) => {
                const rankA = typeRanks[a] !== undefined ? typeRanks[a] : 500;
                const rankB = typeRanks[b] !== undefined ? typeRanks[b] : 500;
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
              });

              const LOTTERY_TYPE_NAMES: Record<string, string> = {
                lao: 'หวยลาว',
                thai: 'หวยไทย',
                hanoi: 'หวยฮานอย',
                stock: 'หวยหุ้น',
                yeekee: 'หวยยี่กี'
              };
              const typeNameInThai = LOTTERY_TYPE_NAMES[groupLink.lottery_type] || `หวย${groupLink.lottery_type.toUpperCase()}`;
              const roundDateStr = getRoundDisplayDate(activeRound, false);

              if (isPdf) {
                const pdfCategories: PDFCategory[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = soldMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const items = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return { numbers: num, amountText: amt.toLocaleString('th-TH') };
                  });
                  pdfCategories.push({ label, items });
                }

                try {
                  const pdfBytes = await generateReportPDF(
                    `รายงานเลขรวม (${typeNameInThai})`,
                    roundDateStr ? `งวดวันที่: ${roundDateStr}` : '',
                    pdfCategories,
                    `รวมยอดรวม: ฿${grandTotal.toLocaleString('th-TH')}`
                  );
                  const fileName = `total_${activeRound.id}_${Date.now()}.pdf`;
                  const signedUrl = await uploadPDFToStorage(pdfBytes, fileName);
                  await sendLineReply(replyToken, `📄 ดาวน์โหลด PDF รายงานเลขรวม (${typeNameInThai})\nงวดวันที่: ${roundDateStr}\n\n👉 กดที่นี่เพื่อดาวน์โหลด:\n${signedUrl}`);
                } catch (pdfErr) {
                  console.error("PDF generation/upload error:", pdfErr);
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ${pdfErr.message}`);
                }
                continue;
              }

              let summaryText = `รายงานเลขรวม (${typeNameInThai})\n`;
              if (roundDateStr) {
                summaryText += `งวดวันที่: ${roundDateStr}\n`;
              }
              summaryText += `รวมยอดรวม: ฿${grandTotal.toLocaleString('th-TH')}\n`;
              summaryText += `--------------------------\n`;

              if (soldMap.size === 0) {
                summaryText += `ยังไม่มียอดขายเข้ามาค่ะ\n`;
              } else {
                const categories: string[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = soldMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const betItemsStr = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return `${num}=${amt}`;
                  }).join('\n');

                  categories.push(`${label}\n${betItemsStr}`);
                }
                summaryText += categories.join('\n----------------\n') + '\n';
              }
              summaryText += `--------------------------`;

              await sendLineReply(replyToken, splitTextByLimit(summaryText));
              continue;
            }

            // ─── COMMAND: /เลขตี หรือ /เลขตีออก ───
            if (text.startsWith('/เลขตี') || text.startsWith('/เลขตีออก')) {
              if (!permissions.can_view_total && !permissions.can_view_stats) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานข้อมูลตัวเลข`);
                continue;
              }

              const isPdf = text.toLowerCase().split(/\s+/).includes('pdf');

              let sortByAmount: 'asc' | 'desc' | null = null;
              if (text.includes('น-ม')) {
                sortByAmount = 'asc';
              } else if (text.includes('ม-น')) {
                sortByAmount = 'desc';
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, lottery_type')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              const { data: transfers, error: trErr } = await supabase
                .from('bet_transfers')
                .select('bet_type, numbers, amount, status')
                .eq('round_id', activeRound.id);

              if (trErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลเลขตีออก`);
                continue;
              }

              const activeTransfers = (transfers || []).filter((t: any) => t.status !== 'returned');

              const transferMap = new Map<string, Map<string, number>>();
              let grandTotal = 0;
              activeTransfers.forEach((t: any) => {
                const amt = Number(t.amount || 0);
                if (amt <= 0) return;
                if (!transferMap.has(t.bet_type)) {
                  transferMap.set(t.bet_type, new Map<string, number>());
                }
                const typeMap = transferMap.get(t.bet_type)!;
                typeMap.set(t.numbers, (typeMap.get(t.numbers) || 0) + amt);
                grandTotal += amt;
              });

              const sortedTypes = Array.from(transferMap.keys()).sort((a, b) => {
                const rankA = typeRanks[a] !== undefined ? typeRanks[a] : 500;
                const rankB = typeRanks[b] !== undefined ? typeRanks[b] : 500;
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
              });

              const LOTTERY_TYPE_NAMES: Record<string, string> = {
                lao: 'หวยลาว',
                thai: 'หวยไทย',
                hanoi: 'หวยฮานอย',
                stock: 'หวยหุ้น',
                yeekee: 'หวยยี่กี'
              };
              const typeNameInThai = LOTTERY_TYPE_NAMES[groupLink.lottery_type] || `หวย${groupLink.lottery_type.toUpperCase()}`;
              const roundDateStr = getRoundDisplayDate(activeRound, false);

              if (isPdf) {
                const pdfCategories: PDFCategory[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = transferMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const items = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return { numbers: num, amountText: amt.toLocaleString('th-TH') };
                  });
                  pdfCategories.push({ label, items });
                }

                try {
                  const pdfBytes = await generateReportPDF(
                    `รายงานเลขตีออก (${typeNameInThai})`,
                    roundDateStr ? `งวดวันที่: ${roundDateStr}` : '',
                    pdfCategories,
                    `รวมยอดตีออก: ฿${grandTotal.toLocaleString('th-TH')}`
                  );
                  const fileName = `transfers_${activeRound.id}_${Date.now()}.pdf`;
                  const signedUrl = await uploadPDFToStorage(pdfBytes, fileName);
                  await sendLineReply(replyToken, `📄 ดาวน์โหลด PDF รายงานเลขตีออก (${typeNameInThai})\nงวดวันที่: ${roundDateStr}\n\n👉 กดที่นี่เพื่อดาวน์โหลด:\n${signedUrl}`);
                } catch (pdfErr) {
                  console.error("PDF generation/upload error:", pdfErr);
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ${pdfErr.message}`);
                }
                continue;
              }

              let summaryText = `รายงานเลขตีออก (${typeNameInThai})\n`;
              if (roundDateStr) {
                summaryText += `งวดวันที่: ${roundDateStr}\n`;
              }
              summaryText += `รวมยอดตีออก: ฿${grandTotal.toLocaleString('th-TH')}\n`;
              summaryText += `--------------------------\n`;

              if (transferMap.size === 0) {
                summaryText += `ยังไม่มีรายการตีออกในงวดนี้ค่ะ\n`;
              } else {
                const categories: string[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = transferMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const betItemsStr = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return `${num}=${amt}`;
                  }).join('\n');

                  categories.push(`${label}\n${betItemsStr}`);
                }
                summaryText += categories.join('\n----------------\n') + '\n';
              }
              summaryText += `--------------------------`;

              await sendLineReply(replyToken, splitTextByLimit(summaryText));
              continue;
            }

            // ─── COMMAND: /เลขเหลือ ───
            if (text.startsWith('/เลขเหลือ')) {
              if (!permissions.can_view_total && !permissions.can_view_stats) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าถึงรายงานข้อมูลตัวเลข`);
                continue;
              }

              const isPdf = text.toLowerCase().split(/\s+/).includes('pdf');

              let sortByAmount: 'asc' | 'desc' | null = null;
              if (text.includes('น-ม')) {
                sortByAmount = 'asc';
              } else if (text.includes('ม-น')) {
                sortByAmount = 'desc';
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, lottery_type')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              let submissions = [];
              let sumErr = null;
              try {
                submissions = await fetchAllSubmissions(activeRound.id);
              } catch (err) {
                sumErr = err;
              }

              const { data: transfers, error: trErr } = await supabase
                .from('bet_transfers')
                .select('bet_type, numbers, amount, status')
                .eq('round_id', activeRound.id);

              if (sumErr || trErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลตัวเลข`);
                continue;
              }

              const soldMap = new Map<string, Map<string, number>>();
              (submissions || []).forEach((s: any) => {
                const amt = Number(s.amount || 0);
                if (amt <= 0) return;
                if (!soldMap.has(s.bet_type)) {
                  soldMap.set(s.bet_type, new Map<string, number>());
                }
                const typeMap = soldMap.get(s.bet_type)!;
                typeMap.set(s.numbers, (typeMap.get(s.numbers) || 0) + amt);
              });

              const transferMap = new Map<string, Map<string, number>>();
              const activeTransfers = (transfers || []).filter((t: any) => t.status !== 'returned');
              activeTransfers.forEach((t: any) => {
                const amt = Number(t.amount || 0);
                if (amt <= 0) return;
                if (!transferMap.has(t.bet_type)) {
                  transferMap.set(t.bet_type, new Map<string, number>());
                }
                const typeMap = transferMap.get(t.bet_type)!;
                typeMap.set(t.numbers, (typeMap.get(t.numbers) || 0) + amt);
              });

              const remainingMap = new Map<string, Map<string, number>>();
              let grandRemainingTotal = 0;

              for (const [type, soldTypeMap] of soldMap.entries()) {
                const transferTypeMap = transferMap.get(type);
                for (const [num, soldAmt] of soldTypeMap.entries()) {
                  const trAmt = transferTypeMap?.get(num) || 0;
                  const remainingAmt = soldAmt - trAmt;
                  if (remainingAmt > 0) {
                     if (!remainingMap.has(type)) {
                       remainingMap.set(type, new Map<string, number>());
                     }
                     remainingMap.get(type)!.set(num, remainingAmt);
                     grandRemainingTotal += remainingAmt;
                  }
                }
              }

              const sortedTypes = Array.from(remainingMap.keys()).sort((a, b) => {
                const rankA = typeRanks[a] !== undefined ? typeRanks[a] : 500;
                const rankB = typeRanks[b] !== undefined ? typeRanks[b] : 500;
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
              });

              const LOTTERY_TYPE_NAMES: Record<string, string> = {
                lao: 'หวยลาว',
                thai: 'หวยไทย',
                hanoi: 'หวยฮานอย',
                stock: 'หวยหุ้น',
                yeekee: 'หวยยี่กี'
              };
              const typeNameInThai = LOTTERY_TYPE_NAMES[groupLink.lottery_type] || `หวย${groupLink.lottery_type.toUpperCase()}`;
              const roundDateStr = getRoundDisplayDate(activeRound, false);

              if (isPdf) {
                const pdfCategories: PDFCategory[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = remainingMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const items = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return { numbers: num, amountText: amt.toLocaleString('th-TH') };
                  });
                  pdfCategories.push({ label, items });
                }

                try {
                  const pdfBytes = await generateReportPDF(
                    `รายงานเลขเหลือ (${typeNameInThai})`,
                    roundDateStr ? `งวดวันที่: ${roundDateStr}` : '',
                    pdfCategories,
                    `รวมยอดเหลือ: ฿${grandRemainingTotal.toLocaleString('th-TH')}`
                  );
                  const fileName = `remaining_${activeRound.id}_${Date.now()}.pdf`;
                  const signedUrl = await uploadPDFToStorage(pdfBytes, fileName);
                  await sendLineReply(replyToken, `📄 ดาวน์โหลด PDF รายงานเลขเหลือ (${typeNameInThai})\nงวดวันที่: ${roundDateStr}\n\n👉 กดที่นี่เพื่อดาวน์โหลด:\n${signedUrl}`);
                } catch (pdfErr) {
                  console.error("PDF generation/upload error:", pdfErr);
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ${pdfErr.message}`);
                }
                continue;
              }

              let summaryText = `รายงานเลขเหลือ (${typeNameInThai})\n`;
              if (roundDateStr) {
                summaryText += `งวดวันที่: ${roundDateStr}\n`;
              }
              summaryText += `รวมยอดเหลือ: ฿${grandRemainingTotal.toLocaleString('th-TH')}\n`;
              summaryText += `--------------------------\n`;

              if (remainingMap.size === 0) {
                summaryText += `ไม่มีเลขคงเหลือในงวดนี้ค่ะ\n`;
              } else {
                const categories: string[] = [];
                for (const type of sortedTypes) {
                  const label = getThaiBetTypeLabel(type, groupLink.lottery_type);
                  const typeMap = remainingMap.get(type)!;
                  const sortedNums = Array.from(typeMap.keys()).sort((a, b) => {
                    if (sortByAmount) {
                      const amtA = typeMap.get(a)!;
                      const amtB = typeMap.get(b)!;
                      if (amtA !== amtB) {
                        return sortByAmount === 'asc' ? amtA - amtB : amtB - amtA;
                      }
                    }
                    const numA = parseInt(a, 10);
                    const numB = parseInt(b, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.localeCompare(b);
                  });

                  const betItemsStr = sortedNums.map(num => {
                    const amt = typeMap.get(num)!;
                    return `${num}=${amt}`;
                  }).join('\n');

                  categories.push(`${label}\n${betItemsStr}`);
                }
                summaryText += categories.join('\n----------------\n') + '\n';
              }
              summaryText += `--------------------------`;

              await sendLineReply(replyToken, splitTextByLimit(summaryText));
              continue;
            }

            // ─── COMMAND: /ตีออก ───
            if (text.startsWith('/ตีออก') || text.startsWith('/transfer')) {
              if (!permissions.can_transfer) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ในการสั่งตีออกตัวเลข`);
                continue;
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, set_prices, lottery_type')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              let commandArg = '';
              if (text.startsWith('/transfer')) {
                commandArg = text.substring('/transfer'.length).trim();
              } else if (text.startsWith('/ตีออก')) {
                commandArg = text.substring('/ตีออก'.length).trim();
              }

              const commandArgLower = commandArg.toLowerCase();
              if (commandArgLower === '') {
                // Fetch all transfers
                const { data: transfers, error: trErr } = await supabase
                  .from('bet_transfers')
                  .select('*')
                  .eq('round_id', activeRound.id);

                if (trErr || !transfers) {
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลรายการตีออก`);
                  continue;
                }

                const activeTransfers = transfers.filter((t: any) => t.status !== 'returned');

                if (activeTransfers.length === 0) {
                  await sendLineReply(replyToken, `ℹ️ ยังไม่มีรายการตีออกในงวดนี้ค่ะ`);
                  continue;
                }

                // Retrieve settings to compute commissions
                const linkedTransfers = activeTransfers.filter((t: any) => t.is_linked);
                const uniqueUpstreamDealerIds = [...new Set(linkedTransfers.map((t: any) => t.upstream_dealer_id).filter(Boolean))];
                const userSettingsMap: Record<string, any> = {};
                if (uniqueUpstreamDealerIds.length > 0) {
                  const { data: settings } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', dealerId)
                    .in('dealer_id', uniqueUpstreamDealerIds);

                  (settings || []).forEach((s: any) => {
                    userSettingsMap[s.dealer_id] = s;
                  });
                }

                const externalTransfers = activeTransfers.filter((t: any) => !t.is_linked);
                const uniqueExternalDealerNames = [...new Set(externalTransfers.map((t: any) => t.target_dealer_name).filter(Boolean))];
                const connMap: Record<string, any> = {};
                if (uniqueExternalDealerNames.length > 0) {
                  const { data: connData } = await supabase
                    .from('dealer_upstream_connections')
                    .select('upstream_name, lottery_settings')
                    .eq('dealer_id', dealerId)
                    .in('upstream_name', uniqueExternalDealerNames);

                  (connData || []).forEach((c: any) => {
                    connMap[c.upstream_name] = c;
                  });
                }

                const lotteryKey = activeRound.lottery_type === 'thai' ? 'thai' : activeRound.lottery_type === 'lao' ? 'lao' : activeRound.lottery_type === 'hanoi' ? 'hanoi' : 'thai';

                // Replicate commission calculation mapping helpers
                const getBetSettingsKey = (betType: string, lKey: string): string => {
                  if (lKey === 'lao' || lKey === 'hanoi') {
                    const LAO_MAP: Record<string, string> = { '3_top': '3_straight', '3_tod': '3_tod_single' };
                    return LAO_MAP[betType] || betType;
                  }
                  return betType;
                };

                const DEFAULT_COMMISSIONS: Record<string, number> = {
                  '3_top': 30, '3_tod': 30, '2_top': 28, '2_bottom': 28,
                  '3_front': 30, '3_back': 30, 'run_top': 12, 'run_bottom': 12
                };
                const DEFAULT_4_SET_SETTINGS = { commission: 25 };

                // Compute commission for each active transfer
                activeTransfers.forEach((t: any) => {
                  const amt = Number(t.amount || 0);
                  let comm = 0;
                  let betSettings: any = null;

                  const settingsKey = getBetSettingsKey(t.bet_type, lotteryKey);
                  if (t.is_linked && t.upstream_dealer_id) {
                    const s = userSettingsMap[t.upstream_dealer_id];
                    betSettings = s?.lottery_settings?.[lotteryKey]?.[settingsKey];
                  } else if (!t.is_linked && t.target_dealer_name) {
                    const c = connMap[t.target_dealer_name];
                    betSettings = c?.lottery_settings?.[lotteryKey]?.[settingsKey];
                  }

                  if (t.bet_type === '4_set' || t.bet_type === '4_top') {
                    const setPrice = betSettings?.setPrice || activeRound?.set_prices?.['4_top'] || 120;
                    const numSets = Math.floor(amt / setPrice);
                    const commRate = betSettings?.commission !== undefined ? betSettings.commission : (DEFAULT_4_SET_SETTINGS.commission || 25);
                    comm = numSets * commRate;
                  } else {
                    let defaultComm = DEFAULT_COMMISSIONS[t.bet_type] || 15;
                    if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
                      const LAO_DEFAULTS: Record<string, number> = {
                        'run_top': 10, 'run_bottom': 10,
                        'pak_top': 20, 'pak_bottom': 20,
                        '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
                        '3_top': 20, '3_tod': 20, '3_bottom': 20,
                        '4_float': 20, '5_float': 20
                      };
                      defaultComm = LAO_DEFAULTS[t.bet_type] !== undefined ? LAO_DEFAULTS[t.bet_type] : 20;
                    }
                    const commissionRate = betSettings?.commission !== undefined 
                      ? betSettings.commission 
                      : defaultComm;
                    comm = amt * (commissionRate / 100);
                  }
                  t.computedCommission = comm;
                });

                // Group active transfers by transfer_batch_id
                const batchesMap: Record<string, {
                  batchId: string;
                  createdAt: string;
                  targetDealer: string;
                  transfers: any[];
                  totalAmount: number;
                  totalCommission: number;
                }> = {};

                activeTransfers.forEach((t: any) => {
                  const batchId = t.transfer_batch_id || `single_${t.id}`;
                  if (!batchesMap[batchId]) {
                    batchesMap[batchId] = {
                      batchId,
                      createdAt: t.created_at || new Date().toISOString(),
                      targetDealer: t.target_dealer_name || 'ไม่ระบุชื่อ',
                      transfers: [],
                      totalAmount: 0,
                      totalCommission: 0
                    };
                  }
                  batchesMap[batchId].transfers.push(t);
                  batchesMap[batchId].totalAmount += Number(t.amount || 0);
                  batchesMap[batchId].totalCommission += Number(t.computedCommission || 0);
                });

                // Sort batches by createdAt descending (newest first)
                const sortedBatches = Object.values(batchesMap).sort((a, b) => 
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                let replyText = `📋 รายการตีออกแล้วทั้งหมดในงวดนี้\n`;
                replyText += `หวยประเภท: ${activeRound.lottery_type.toUpperCase()} (${activeRound.round_date})\n`;
                replyText += `จำนวนตีออก: ${sortedBatches.length} ครั้ง\n`;
                replyText += `--------------------------\n`;

                let grandTotalAmt = 0;
                let grandTotalComm = 0;

                sortedBatches.forEach((batch, index) => {
                  const dateObj = new Date(batch.createdAt);
                  const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) + ' น.';
                  const numStr = (sortedBatches.length - index).toString();
                  
                  replyText += `ครั้งที่ ${numStr} (${timeStr})\n`;
                  replyText += `- ส่งให้: ${batch.targetDealer}\n`;
                  replyText += `- ยอดส่ง: ฿${Math.round(batch.totalAmount).toLocaleString('th-TH')}\n`;
                  replyText += `- ค่าคอม: ฿${Math.round(batch.totalCommission).toLocaleString('th-TH')}\n`;
                  replyText += `- ยอดสุทธิ: ฿${Math.round(batch.totalAmount - batch.totalCommission).toLocaleString('th-TH')}\n`;
                  replyText += `--------------------------\n`;

                  grandTotalAmt += batch.totalAmount;
                  grandTotalComm += batch.totalCommission;
                });

                replyText += `💰 ยอดส่งรวมทั้งหมด: ฿${Math.round(grandTotalAmt).toLocaleString('th-TH')}\n`;
                replyText += `💸 ค่าคอมรวมทั้งหมด: ฿${Math.round(grandTotalComm).toLocaleString('th-TH')}\n`;
                replyText += `💵 ยอดสุทธิรวมทั้งหมด: ฿${Math.round(grandTotalAmt - grandTotalComm).toLocaleString('th-TH')}`;

                await sendLineReply(replyToken, replyText);
                continue;
              } else if (commandArgLower === 'เกิน' || commandArgLower === 'excess') {
                const excessItems = await calculateRoundExcess(activeRound.id);
                if (excessItems.length === 0) {
                  await sendLineReply(replyToken, `ℹ️ ไม่มียอดเกินลิมิตให้ออกในงวดนี้ค่ะ`);
                  continue;
                }

                const LABELS: Record<string, string> = {
                  '2_top': '2 ตัวบน',
                  '2_bottom': '2 ตัวล่าง',
                  '3_top': groupLink.lottery_type === 'lao' || groupLink.lottery_type === 'hanoi' ? '3 ตัวตรง' : '3 ตัวบน',
                  '3_tod': '3 ตัวโต๊ด',
                  '3_front': '3 ตัวหน้า',
                  '3_back': '3 ตัวหลัง',
                  '4_tod': '4 ตัวโต๊ด',
                  '4_set': '4 ตัวชุด',
                  '6_top': '6 ตัวบน',
                  '4_float': '4 ตัวลอยแพ',
                  '5_float': '5 ตัวลอยแพ',
                  'run_top': 'ลอยบน',
                  'run_bottom': 'ลอยล่าง'
                };

                const LOTTERY_NAMES2: Record<string, string> = { 'thai': 'หวยไทย', 'lao': 'หวยลาว', 'hanoi': 'หวยฮานอย', 'stock': 'หวยหุ้น', 'yeekee': 'หวยยี่กี', 'other': 'อื่นๆ' };
                const lotteryDisplayName2 = activeRound.lottery_name || LOTTERY_NAMES2[groupLink.lottery_type] || groupLink.lottery_type.toUpperCase();
                let summaryText = `รายการเลขเกินอั้น ${lotteryDisplayName2}\nงวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;
                summaryText += `--------------------------\n`;
                let totalExcess = 0;
                // Group items by bet_type
                const betTypeOrder2 = ['run_top', 'run_bottom', 'pak_top', 'pak_bottom', '2_top', '2_front', '2_center', '2_run', '2_bottom', '3_top', '3_tod', '3_front', '3_back', '3_bottom', '4_set', '4_top', '4_tod', '4_float', '5_float', '6_top'];
                const grouped2: Record<string, typeof excessItems> = {};
                excessItems.forEach((item) => {
                  if (!grouped2[item.bet_type]) grouped2[item.bet_type] = [];
                  grouped2[item.bet_type].push(item);
                  totalExcess += item.amount;
                });
                const sortedTypes2 = Object.keys(grouped2).sort((a, b) => {
                  const idxA = betTypeOrder2.indexOf(a);
                  const idxB = betTypeOrder2.indexOf(b);
                  if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                  if (idxA === -1) return 1;
                  if (idxB === -1) return -1;
                  return idxA - idxB;
                });
                sortedTypes2.forEach((betType, idx) => {
                  const items = grouped2[betType];
                  const label = LABELS[betType] || betType;
                  summaryText += `[${label}]\n`;
                  items.forEach((item) => {
                    if (betType === '4_set') {
                      const setPrice = activeRound.set_prices?.['4_top'] || 120;
                      const numSets = Math.round(item.amount / setPrice);
                      summaryText += `${item.numbers}=${numSets} ชุด\n`;
                    } else {
                      summaryText += `${item.numbers}=${item.amount}\n`;
                    }
                  });
                  if (idx < sortedTypes2.length - 1) {
                    summaryText += `---------------\n`;
                  }
                });
                summaryText += `--------------------------\n`;
                summaryText += `รวมยอดเกิน: ฿${totalExcess.toLocaleString('th-TH')}`;

                await sendLineReply(replyToken, {
                  type: "text",
                  text: summaryText + `\n\n⚠️ ต้องการตีออกยอดเกินอั้นทั้งหมดนี้หรือไม่?\n👉 พิมพ์ Y หรือกดปุ่มด้านล่างเพื่อยืนยันการทำรายการค่ะ`,
                  quickReply: {
                    items: [
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: "Y (ยืนยัน)",
                          text: "Y"
                        }
                      },
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: "ยกเลิก",
                          text: "ยกเลิก"
                        }
                      }
                    ]
                  }
                });
                continue;
              } else if (
                commandArgLower === 'เกิน y' || 
                commandArgLower === 'เกิน yes' || 
                commandArgLower === 'excess y' || 
                commandArgLower === 'excess yes'
              ) {
                const excessItems = await calculateRoundExcess(activeRound.id);
                if (excessItems.length === 0) {
                  await sendLineReply(replyToken, `ℹ️ ไม่มียอดเกินลิมิตให้ออกในงวดนี้ค่ะ`);
                  continue;
                }

                const result = await performLayoff(dealerId, activeRound.id, groupLink.lottery_type, excessItems);
                if (result.success && result.text) {
                  await sendLineReply(replyToken, `✅ ทำรายการตีออกยอดเกินอั้นสำเร็จแล้วค่ะ!\n\n${result.text}`);
                } else {
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${result.message}`);
                }
                continue;
              } else {
                const parsedBets = parseMultiLinePaste(commandArg, groupLink.lottery_type);
                if (parsedBets.length === 0) {
                  await sendLineReply(replyToken, `❌ รูปแบบคำสั่งตีออกไม่ถูกต้อง\n\n- ตีออกยอดเกิน:พิมพ์ /ตีออก เกิน\n- ตีออกเจาะจง: พิมพ์ /ตีออก [เลข] [ประเภท] [จำนวน]\n(เช่น /ตีออก 362 บน 200)`);
                  continue;
                }

                const itemsToTransfer: ExcessItem[] = parsedBets.map((b) => ({
                  bet_type: b.betType,
                  numbers: b.numbers,
                  amount: b.amount
                }));

                const result = await performLayoff(dealerId, activeRound.id, groupLink.lottery_type, itemsToTransfer);
                if (result.success && result.text) {
                  await sendLineReply(replyToken, `✅ ทำรายการตีออกเฉพาะเจาะจงสำเร็จแล้วค่ะ!\n\n${result.text}`);
                } else {
                  await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${result.message}`);
                }
                continue;
              }
            }

            // ─── COMMAND: /เอาคืน [ครั้งที่ตีออก] ───
            if (text.startsWith('/เอาคืน') || text.startsWith('/return')) {
              if (!permissions.can_transfer) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ในการเอาคืนยอดตีออก`);
                continue;
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date, close_time, set_prices, lottery_type')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              let returnArg = '';
              if (text.startsWith('/return')) {
                returnArg = text.substring('/return'.length).trim();
              } else {
                returnArg = text.substring('/เอาคืน'.length).trim();
              }

              const { data: transfers, error: trErr } = await supabase
                .from('bet_transfers')
                .select('*')
                .eq('round_id', activeRound.id);

              if (trErr) {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลรายการตีออก`);
                continue;
              }

              const activeTransfers = (transfers || []).filter((t: any) => t.status !== 'returned');

              if (activeTransfers.length === 0) {
                await sendLineReply(replyToken, `ℹ️ ยังไม่มีรายการตีออกที่สามารถเอาคืนได้ในงวดนี้ค่ะ`);
                continue;
              }

              // Group by batch using the SAME numbering as the /ตีออก listing
              const batchesMap: Record<string, {
                batchId: string;
                createdAt: string;
                targetDealer: string;
                transfers: any[];
                totalAmount: number;
              }> = {};

              activeTransfers.forEach((t: any) => {
                const bId = t.transfer_batch_id || `single_${t.id}`;
                if (!batchesMap[bId]) {
                  batchesMap[bId] = {
                    batchId: bId,
                    createdAt: t.created_at || new Date().toISOString(),
                    targetDealer: t.target_dealer_name || 'ไม่ระบุชื่อ',
                    transfers: [],
                    totalAmount: 0
                  };
                }
                batchesMap[bId].transfers.push(t);
                batchesMap[bId].totalAmount += Number(t.amount || 0);
              });

              // Sort ascending by time so ครั้งที่ 1 = ตีออกครั้งแรก, ครั้งล่าสุด = เลขสูงสุด
              const sortedBatches = Object.values(batchesMap).sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );

              const LABELS: Record<string, string> = {
                '2_top': '2 ตัวบน',
                '2_bottom': '2 ตัวล่าง',
                '3_top': groupLink.lottery_type === 'lao' || groupLink.lottery_type === 'hanoi' ? '3 ตัวตรง' : '3 ตัวบน',
                '3_tod': '3 ตัวโต๊ด',
                '3_front': '3 ตัวหน้า',
                '3_back': '3 ตัวหลัง',
                '4_tod': '4 ตัวโต๊ด',
                '4_set': '4 ตัวชุด',
                '6_top': '6 ตัวบน',
                '4_float': '4 ตัวลอยแพ',
                '5_float': '5 ตัวลอยแพ',
                'run_top': 'ลอยบน',
                'run_bottom': 'ลอยล่าง'
              };

              const setPrice = activeRound.set_prices?.['4_top'] || 120;
              const formatBatchItems = (batch: any): string => {
                let s = '';
                batch.transfers.forEach((t: any) => {
                  if (t.bet_type === '4_set') {
                    const numSets = Math.round(Number(t.amount) / setPrice);
                    s += `${t.numbers}=${numSets} ชุด [${LABELS[t.bet_type] || t.bet_type}]\n`;
                  } else {
                    s += `${t.numbers}=${Number(t.amount)} [${LABELS[t.bet_type] || t.bet_type}]\n`;
                  }
                });
                return s;
              };

              const argParts = returnArg.split(/\s+/).filter(Boolean);

              // No number provided → list the batches that can be returned
              if (argParts.length === 0) {
                let listText = `📋 รายการตีออกที่เอาคืนได้ (${groupLink.lottery_type.toUpperCase()})\n`;
                listText += `งวดวันที่: ${getRoundDisplayDate(activeRound, false)}\n`;
                listText += `--------------------------\n`;
                sortedBatches.forEach((batch, index) => {
                  const dateObj = new Date(batch.createdAt);
                  const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) + ' น.';
                  listText += `ครั้งที่ ${index + 1} (${timeStr}) → ${batch.targetDealer}\n`;
                  listText += `ยอดส่ง: ฿${Math.round(batch.totalAmount).toLocaleString('th-TH')}\n`;
                  listText += `--------------------------\n`;
                });
                listText += `👉 พิมพ์ /เอาคืน [ครั้งที่] เพื่อเลือกเอาคืน เช่น /เอาคืน ${sortedBatches.length}`;
                await sendLineReply(replyToken, listText);
                continue;
              }

              const batchNumber = parseInt(argParts[0], 10);
              if (isNaN(batchNumber) || batchNumber < 1 || batchNumber > sortedBatches.length) {
                await sendLineReply(replyToken, `❌ หมายเลขครั้งที่ตีออกไม่ถูกต้อง (มีทั้งหมด ${sortedBatches.length} ครั้ง)\n👉 พิมพ์ /เอาคืน เพื่อดูรายการทั้งหมดค่ะ`);
                continue;
              }

              const targetBatch = sortedBatches[batchNumber - 1];
              const confirmToken = (argParts[1] || '').toLowerCase();
              const isConfirmed = confirmToken === 'ยืนยัน' || confirmToken === 'y' || confirmToken === 'yes';
              const isCancelled = confirmToken === 'ยกเลิก' || confirmToken === 'n' || confirmToken === 'no';

              // Cancelled → abort the return
              if (isCancelled) {
                await sendLineReply(replyToken, `❌ ยกเลิกการเอาคืน ครั้งที่ ${batchNumber} เรียบร้อยแล้วค่ะ (ยังไม่มีการเปลี่ยนแปลงใด ๆ)`);
                continue;
              }

              // Not confirmed yet → ask Yes/No
              if (!isConfirmed) {
                let confirmText = `⚠️ ต้องการเอาคืนยอดตีออก ครั้งที่ ${batchNumber} นี้หรือไม่?\n`;
                confirmText += `ส่งให้: ${targetBatch.targetDealer}\n`;
                confirmText += `--------------------------\n`;
                confirmText += formatBatchItems(targetBatch);
                confirmText += `--------------------------\n`;
                confirmText += `ยอดรวม: ฿${Math.round(targetBatch.totalAmount).toLocaleString('th-TH')}\n\n`;
                confirmText += `👉 กดปุ่มด้านล่าง หรือพิมพ์ "/เอาคืน ${batchNumber} ยืนยัน" เพื่อยืนยัน / "/เอาคืน ${batchNumber} ยกเลิก" เพื่อยกเลิกค่ะ`;

                await sendLineReply(replyToken, {
                  type: "text",
                  text: confirmText,
                  quickReply: {
                    items: [
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: `ยืนยัน (Yes)`,
                          text: `/เอาคืน ${batchNumber} ยืนยัน`
                        }
                      },
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: `ยกเลิก (No)`,
                          text: `/เอาคืน ${batchNumber} ยกเลิก`
                        }
                      }
                    ]
                  }
                });
                continue;
              }

              // Confirmed → perform the return
              const result = await performReturnBatch(targetBatch.transfers);
              if (result.success) {
                let okText = `✅ เอาคืนยอดตีออก ครั้งที่ ${batchNumber} สำเร็จแล้วค่ะ!\n`;
                okText += `--------------------------\n`;
                okText += formatBatchItems(targetBatch);
                okText += `--------------------------\n`;
                okText += `ยอดที่เอาคืน: ฿${Math.round(targetBatch.totalAmount).toLocaleString('th-TH')}`;
                await sendLineReply(replyToken, okText);
              } else {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${result.message}`);
              }
              continue;
            }

            // ─── COMMAND: /คำสั่ง หรือ /help ───
            if (text.startsWith('/คำสั่ง') || text.startsWith('/help')) {
              const lotteryLabel = groupLink.lottery_type?.toUpperCase() || 'LAO';

              // Helper to create a command row
              const cmdRow = (cmd: string, desc: string, marginTop: string = 'sm') => ({
                "type": "box",
                "layout": "vertical",
                "margin": marginTop,
                "paddingAll": "sm",
                "backgroundColor": "#1a1a2e22",
                "cornerRadius": "md",
                "contents": [
                  { "type": "text", "text": cmd, "size": "sm", "weight": "bold", "color": "#E2B44D", "wrap": true },
                  { "type": "text", "text": desc, "size": "xs", "color": "#cccccc", "wrap": true, "margin": "xs" }
                ]
              });

              // Helper to create a section header inside body
              const sectionHeader = (emoji: string, title: string, marginTop: string = 'lg') => ({
                "type": "text",
                "text": `${emoji} ${title}`,
                "size": "sm",
                "weight": "bold",
                "color": "#ffffff",
                "margin": marginTop
              });

              if (showOwnOnly) {
                // ─── Member View: Single bubble ───
                const memberFlexMessage = {
                  "type": "flex",
                  "altText": `💡 คำสั่งบอทสำหรับสมาชิก (${lotteryLabel})`,
                  "contents": {
                    "type": "bubble",
                    "size": "mega",
                    "header": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#1B6B3A",
                      "paddingAll": "lg",
                      "contents": [
                        { "type": "text", "text": `💡 คำสั่งสำหรับสมาชิก`, "weight": "bold", "size": "lg", "color": "#ffffff" },
                        { "type": "text", "text": `กลุ่มหวย ${lotteryLabel}`, "size": "xs", "color": "#a7f3d0", "margin": "xs" }
                      ]
                    },
                    "body": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#1a1a2e",
                      "paddingAll": "lg",
                      "contents": [
                        cmdRow("/สรุป", "สรุปยอดแทง ส่วนลด ค่าคอม ถูกรางวัล ยอดสุทธิ ของตัวเองในงวดนี้", "none"),
                        cmdRow("/สรุป [งวดวันที่]", "ดูสรุปย้อนหลัง เช่น /สรุป 10-6-69"),
                        cmdRow("/ยอดรวม", "สรุปยอดรวมแทงทั้งหมดของตัวเองในงวดนี้"),
                        cmdRow("/โพย หรือ /bill", "ดูรายการบิลโพยของตัวเองในงวดนี้"),
                        cmdRow("/ยกเลิก", "ยกเลิกใบโพยล่าสุดของตัวเอง"),
                        cmdRow("/link หรือ /id", "ดู LINE User ID ของตัวเอง"),
                        cmdRow("/คำสั่ง หรือ /help", "แสดงรายการคำสั่งนี้")
                      ]
                    },
                    "footer": {
                      "type": "box",
                      "layout": "vertical",
                      "backgroundColor": "#1a1a2e",
                      "paddingAll": "md",
                      "contents": [
                        {
                          "type": "text",
                          "text": "💬 พิมพ์ ตัวเลข=ยอด เพื่อส่งโพย เช่น 123=100",
                          "size": "xs",
                          "color": "#888888",
                          "align": "center",
                          "wrap": true
                        }
                      ]
                    }
                  }
                };
                await sendLineReply(replyToken, memberFlexMessage);
              } else {
                // ─── Admin/Manager View: Carousel of 3 bubbles ───

                // ── Bubble 1: คำสั่งทั่วไป ──
                const bubble1 = {
                  "type": "bubble",
                  "size": "mega",
                  "header": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#4A2E80",
                    "paddingAll": "lg",
                    "contents": [
                      { "type": "text", "text": `👑 คำสั่งร้านค้า (1/3)`, "weight": "bold", "size": "lg", "color": "#ffffff" },
                      { "type": "text", "text": `กลุ่มหวย ${lotteryLabel} — คำสั่งทั่วไป`, "size": "xs", "color": "#e1d9f0", "margin": "xs" }
                    ]
                  },
                  "body": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1a1a2e",
                    "paddingAll": "lg",
                    "contents": [
                      sectionHeader("📊", "รายงาน & สรุป", "none"),
                      cmdRow("/สรุป", "สรุปงวดหวย ยอดรับ ยอดส่ง กำไร และยอดเคลียร์ของสมาชิก"),
                      cmdRow("/สรุป [เลขที่ออก]", "ประกาศผลและสรุปงวด เช่น /สรุป 1234"),
                      cmdRow("/สรุป [งวดวันที่]", "ดูสรุปย้อนหลัง เช่น /สรุป 10-6-69"),
                      cmdRow("/ยอดรวม", "รายงานยอดรับรวมแยกตามประเภทเลข"),
                      cmdRow("/กำไร [m/w/เดือน-ปี]", "สรุปกำไร/ขาดทุน (m=เดือน, w=สัปดาห์, ทั้งหมด)"),
                      cmdRow("/คนส่ง", "รายงานยอดรับแทงแยกตามสมาชิกแต่ละคน"),
                      cmdRow("/สมาชิก [ชื่อ]", "ค้นหายอดคงเหลือและข้อมูลสมาชิก")
                    ]
                  },
                  "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1a1a2e",
                    "paddingAll": "sm",
                    "contents": [
                      { "type": "text", "text": "👉 ปัดเพื่อดูคำสั่งเพิ่มเติม", "size": "xs", "color": "#888888", "align": "center" }
                    ]
                  }
                };

                // ── Bubble 2: จัดการงวด & ตีออก ──
                const bubble2 = {
                  "type": "bubble",
                  "size": "mega",
                  "header": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#B45309",
                    "paddingAll": "lg",
                    "contents": [
                      { "type": "text", "text": `⚙️ จัดการ & ตีออก (2/3)`, "weight": "bold", "size": "lg", "color": "#ffffff" },
                      { "type": "text", "text": `กลุ่มหวย ${lotteryLabel} — คำสั่งจัดการ`, "size": "xs", "color": "#fde68a", "margin": "xs" }
                    ]
                  },
                  "body": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1a1a2e",
                    "paddingAll": "lg",
                    "contents": [
                      sectionHeader("🎰", "จัดการงวดหวย", "none"),
                      cmdRow("/สร้าง [ประเภทหวย]", "สร้างงวดใหม่ เช่น /สร้าง ไทย, /สร้าง ลาว"),
                      cmdRow("/เริ่มขาย", "ประกาศเปิดรับแทงงวดล่าสุดไปยังทุกกลุ่ม"),
                      cmdRow("/ปิด", "ปิดรับแทงงวดปัจจุบัน"),
                      cmdRow("/เปิด", "เปิดรับแทงงวดที่ปิดอยู่ (ยังไม่ประกาศผล)"),
                      cmdRow("/แจ้งผล [เลขรางวัล]", "ประกาศผลรางวัลและคำนวณผลได้เสีย"),

                      sectionHeader("💸", "จัดการยอดเกิน / ตีออก"),
                      cmdRow("/ยอดเกิน", "แสดงตัวเลขและยอดเงินที่เกินลิมิตอั้น"),
                      cmdRow("/ตีออก เกิน", "สั่งตีออกยอดเกินอั้นทั้งหมดไปเจ้ามือปลายทาง"),
                      cmdRow("/ตีออก [เลข] [ประเภท] [ยอด]", "ตีออกเจาะจง เช่น /ตีออก 123 บน 100"),
                      cmdRow("/เอาคืน", "แสดงรายการครั้งที่ตีออกที่สามารถเอาคืนได้"),
                      cmdRow("/เอาคืน [ครั้งที่]", "ดึงยอดที่ตีออกกลับคืน เช่น /เอาคืน 3")
                    ]
                  },
                  "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1a1a2e",
                    "paddingAll": "sm",
                    "contents": [
                      { "type": "text", "text": "👉 ปัดเพื่อดูคำสั่งเพิ่มเติม", "size": "xs", "color": "#888888", "align": "center" }
                    ]
                  }
                };

                // ── Bubble 3: คำสั่งสมาชิก & ผูกกลุ่ม ──
                const bubble3 = {
                  "type": "bubble",
                  "size": "mega",
                  "header": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1B6B3A",
                    "paddingAll": "lg",
                    "contents": [
                      { "type": "text", "text": `👤 สมาชิก & ผูกกลุ่ม (3/3)`, "weight": "bold", "size": "lg", "color": "#ffffff" },
                      { "type": "text", "text": `กลุ่มหวย ${lotteryLabel} — คำสั่งเสริม`, "size": "xs", "color": "#a7f3d0", "margin": "xs" }
                    ]
                  },
                  "body": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1a1a2e",
                    "paddingAll": "lg",
                    "contents": [
                      sectionHeader("👤", "คำสั่งที่สมาชิกใช้ได้", "none"),
                      cmdRow("ตัวเลข=ยอดแทง", "ส่งโพยเข้าระบบ เช่น 123=100 หรือ วาง list"),
                      cmdRow("/สรุป (โดยสมาชิก)", "สรุปยอดและรางวัลเฉพาะของตัวเอง"),
                      cmdRow("/ยอดรวม (โดยสมาชิก)", "สรุปยอดแทงทั้งหมดเฉพาะของตัวเอง"),
                      cmdRow("/โพย หรือ /bill", "ดูรายการบิลโพยของตัวเอง"),
                      cmdRow("/ยกเลิก", "ยกเลิกใบโพยล่าสุดของตัวเอง"),
                      cmdRow("/link หรือ /id", "ดู LINE User ID ของตัวเอง"),

                      sectionHeader("📩", "ผูกกลุ่ม (แอดมินเท่านั้น)"),
                      cmdRow("/ขอรหัส", "ขอรหัสผูกกลุ่มใหม่ (ใช้ในแชทส่วนตัวกับบอท)"),
                      cmdRow("/bind [รหัส]", "ผูกกลุ่ม LINE ด้วยรหัส (ใช้ในกลุ่ม)"),

                      sectionHeader("❓", "อื่นๆ"),
                      cmdRow("/คำสั่ง หรือ /help", "แสดงรายการคำสั่งนี้")
                    ]
                  }
                };

                const helpFlexMessage = {
                  "type": "flex",
                  "altText": `💡 คำสั่งบอททั้งหมดสำหรับร้านค้า (${lotteryLabel})`,
                  "contents": {
                    "type": "carousel",
                    "contents": [bubble1, bubble2, bubble3]
                  }
                };
                await sendLineReply(replyToken, helpFlexMessage);
              }
              continue;
            }

            // ─── COMMAND: Y / ยืนยัน ───
            if (text.toLowerCase() === 'y' || text === 'ยืนยัน') {
              if (!permissions.can_transfer) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ในการสั่งตีออกตัวเลข`);
                continue;
              }

              const { data: activeRound } = await supabase
                .from('lottery_rounds')
                .select('id, round_date')
                .eq('dealer_id', dealerId)
                .eq('lottery_type', groupLink.lottery_type)
                .in('status', ['open', 'closed', 'announced'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!activeRound) {
                await sendLineReply(replyToken, `❌ ไม่มีงวดที่กำลังเปิดรับแทงสำหรับหวยประเภท ${groupLink.lottery_type.toUpperCase()}`);
                continue;
              }

              const excessItems = await calculateRoundExcess(activeRound.id);
              if (excessItems.length === 0) {
                await sendLineReply(replyToken, `ℹ️ ไม่มียอดเกินลิมิตให้ออกในงวดนี้ค่ะ`);
                continue;
              }

              const result = await performLayoff(dealerId, activeRound.id, groupLink.lottery_type, excessItems);
              if (result.success && result.text) {
                await sendLineReply(replyToken, `✅ ทำรายการตีออกยอดเกินอั้นสำเร็จแล้วค่ะ!\n\n${result.text}`);
              } else {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาด: ${result.message}`);
              }
              continue;
            }
          }

          // ─── COMMAND 1: /bind ───
        if (text.startsWith('/bind ')) {
          const code = text.replace('/bind ', '').trim().toUpperCase();
          
          // Check binding code in DB
          const { data: groupLink, error: fetchErr } = await supabase
            .from('line_groups')
            .select('*')
            .eq('binding_code', code)
            .single();

          if (fetchErr || !groupLink) {
            await sendLineReply(replyToken, `❌ ไม่พบรหัสผูกกลุ่ม "${code}" หรือรหัสถูกใช้งานไปแล้ว กรุณาตรวจสอบรหัสจากหน้าเว็บดีลเลอร์ของคุณค่ะ`);
            continue;
          }

          // Update group linkage
          const { data: dealerProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', groupLink.dealer_id)
            .single();

          const dealerName = dealerProfile?.full_name || 'Dealer';

          // Fetch real group name from LINE summary API
          const fetchedName = await fetchGroupName(groupId);

          const { error: updateErr } = await supabase
            .from('line_groups')
            .update({
              line_group_id: groupId,
              binding_code: null, // Clear the code once bound
              is_active: true,
              group_name: fetchedName || 'กลุ่มไลน์รับยอด',
              updated_at: new Date().toISOString()
            })
            .eq('id', groupLink.id);

          if (updateErr) {
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดทางเทคนิคในการผูกกลุ่ม กรุณาลองใหม่อีกครั้ง`);
          } else {
            await sendLineReply(replyToken, `✅ ผูกกลุ่มสำเร็จแล้วค่ะ!\n\nเจ้ามือหลัก: ${dealerName}\nประเภทหวยหลัก: ${groupLink.lottery_type.toUpperCase()}\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยหวยได้ในกลุ่มนี้ทันทีค่ะ 🎉`);
          }
          continue;
        }

        // ─── COMMAND: /ขอรหัส หรือ /ขอรหัสผูกกลุ่ม หรือ /bindcode ───
        if (text === '/ขอรหัส' || text === '/ขอรหัสผูกกลุ่ม' || text.toLowerCase() === '/bindcode') {
          if (sourceType !== 'user') {
            await sendLineReply(replyToken, `⚠️ เพื่อความปลอดภัย กรุณาพิมพ์คำสั่งนี้ในแชทส่วนตัวกับบอท (1-on-1) เท่านั้นค่ะ`);
            continue;
          }

          // Lookup profile by line_user_id
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('line_user_id', userId)
            .maybeSingle();

          const isStaffProfile = !profileErr && profile && (profile.role === 'dealer' || profile.role === 'superadmin' || profile.role === 'admin');
          let targetDealerId: string | null = null;

          if (isStaffProfile && profile) {
            targetDealerId = profile.id;
          } else {
            // Check if user is an active admin manager for any dealer
            const { data: adminManager } = await supabase
              .from('line_managers')
              .select('dealer_id')
              .eq('line_user_id', userId)
              .eq('role', 'admin')
              .eq('is_active', true)
              .maybeSingle();

            if (adminManager) {
              targetDealerId = adminManager.dealer_id;
            }
          }

          if (!targetDealerId) {
            await sendLineReply(replyToken, `❌ ขออภัยค่ะ คำสั่งนี้สามารถใช้งานได้เฉพาะบัญชีดีลเลอร์ แอดมิน หรือผู้ช่วยแอดมินกลุ่มของดีลเลอร์เท่านั้นค่ะ\n(กรุณานำ User ID ที่ได้จากคำสั่ง /link ไปกรอกเชื่อมต่อในระบบ หรือแจ้งเจ้ามือเพื่อเพิ่มชื่อท่านในบทบาทแอดมินของบอทนะคะ)`);
            continue;
          }

          // Check if there is already an active pending code
          const { data: pendingCode, error: pendingErr } = await supabase
            .from('line_groups')
            .select('*')
            .eq('dealer_id', targetDealerId)
            .is('is_active', false)
            .not('binding_code', 'is', null)
            .maybeSingle();

          if (pendingCode) {
            await sendLineReply(replyToken, [
              `คุณมีรหัสผูกกลุ่มที่ยังไม่ได้ใช้งานอยู่แล้วค่ะ\n\nสามารถนำรหัสนี้ไปพิมพ์ในห้องแชทกลุ่ม LINE ที่ต้องการผูกค่ะ\n\n*(หากต้องการรหัสใหม่ กรุณากดลบรหัสเดิมผ่านระบบหลังบ้านบนหน้าเว็บดีลเลอร์ก่อนนะคะ)*`,
              `รหัสผูกกลุ่ม: ${pendingCode.binding_code}`,
              `/bind ${pendingCode.binding_code}`
            ]);
            continue;
          }

          // Generate a random 6-digit alphanumeric code: BG-XXXXXX
          const code = 'BG-' + Math.random().toString(36).substring(2, 8).toUpperCase();

          const { error: insertErr } = await supabase
            .from('line_groups')
            .insert({
              line_group_id: 'pending-' + code,
              dealer_id: targetDealerId,
              lottery_type: 'thai', // default
              binding_code: code,
              is_active: false
            });

          if (insertErr) {
            console.error('Error inserting pending binding code from LINE Bot:', insertErr);
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดทางเทคนิคในการสร้างรหัสผูกกลุ่ม กรุณาลองใหม่อีกครั้ง`);
          } else {
            await sendLineReply(replyToken, [
              `✅ สร้างรหัสผูกกลุ่มใหม่สำเร็จแล้วค่ะ!\n\nกรุณาคัดลอกรหัสและคำสั่งด้านล่าง ไปพิมพ์ในห้องแชทกลุ่ม LINE ที่ต้องการเชื่อมโยงเพื่อทำการผูกกลุ่มแชทเข้ากับระบบรับโพยของท่านค่ะ 🤖`,
              `รหัสผูกกลุ่ม: ${code}`,
              `/bind ${code}`
            ]);
          }
          continue;
        }

        // ─── COMMAND 2: /link หรือ /id หรือ /myid ───
        if (text === '/link' || text === '/id' || text === '/myid') {
          if (groupLink && groupLink.member_permissions?.link === false) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();
            const targetDealerId = groupLink.dealer_id;
            const isStaffSender = senderProfile?.id === targetDealerId || senderProfile?.role === 'superadmin' || senderProfile?.role === 'admin';
            let isManagerSender = false;
            if (!isStaffSender && targetDealerId) {
              const { data: mgr } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              isManagerSender = !!mgr;
            }
            if (!isStaffSender && !isManagerSender) {
              await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานคำสั่งนี้สำหรับสมาชิกในกลุ่มนี้`);
              continue;
            }
          }

          await sendLineReply(replyToken, [
            `${userId}`,
            `รหัส LINE User ID ของคุณคือข้อความด้านบนค่ะ\n(รหัสย่อ 4 ตัวท้าย: ${userId.slice(-4)})\n\nกรุณาคัดลอกรหัสในข้อความแรกเพื่อนำไปเชื่อมต่อบัญชีหรือตั้งค่าสิทธิ์ผู้จัดการบนหน้าเว็บค่ะ 🤖`
          ]);
          continue;
        }

        // ─── COMMAND 3: /bal หรือ /credit ───
        if (text === '/bal' || text === '/credit' || text === '/ยอดเงิน') {
          if (groupLink && groupLink.member_permissions?.link === false) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();
            const targetDealerId = groupLink.dealer_id;
            const isStaffSender = senderProfile?.id === targetDealerId || senderProfile?.role === 'superadmin' || senderProfile?.role === 'admin';
            let isManagerSender = false;
            if (!isStaffSender && targetDealerId) {
              const { data: mgr } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              isManagerSender = !!mgr;
            }
            if (!isStaffSender && !isManagerSender) {
              await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานคำสั่งนี้สำหรับสมาชิกในกลุ่มนี้`);
              continue;
            }
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('line_user_id', userId)
            .single();

          if (!profile) {
            await sendLineReply(replyToken, `คุณยังไม่ได้เชื่อมต่อบัญชี LINE เข้ากับระบบค่ะ\n(พิมพ์ /link เพื่อคัดลอก User ID สำหรับใช้ผูกบัญชี)`);
            continue;
          }

          // Fetch active memberships
          const { data: memberships } = await supabase
            .from('user_dealer_memberships')
            .select(`
              status,
              profiles!user_dealer_memberships_dealer_id_fkey (
                full_name
              )
            `)
            .eq('user_id', profile.id)
            .eq('status', 'active');

          if (!memberships || memberships.length === 0) {
            await sendLineReply(replyToken, `คุณ ${profile.full_name} เชื่อมต่อบัญชีแล้ว แต่ไม่มีเจ้ามือที่อนุมัติสถานะการซื้อขายในขณะนี้ค่ะ`);
          } else {
            const dealersStr = memberships.map((m: any) => `- ${m.profiles?.full_name || 'Dealer'}`).join('\n');
            await sendLineReply(replyToken, `สวัสดีค่ะ คุณ ${profile.full_name} 😊\n\nสถานะการเชื่อมต่อบัญชี: อนุมัติสำเร็จ\n\nเจ้ามือของคุณที่พร้อมส่งโพย:\n${dealersStr}`);
          }
          continue;
        }

        // ─── COMMAND 4: /ยกเลิก หรือ /cancel ───
        if (text.startsWith('/cancel') || text.startsWith('/ยกเลิก')) {
          if (groupLink && groupLink.member_permissions?.cancel === false) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();
            const targetDealerId = groupLink.dealer_id;
            const isStaffSender = senderProfile?.id === targetDealerId || senderProfile?.role === 'superadmin' || senderProfile?.role === 'admin';
            let isManagerSender = false;
            if (!isStaffSender && targetDealerId) {
              const { data: mgr } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              isManagerSender = !!mgr;
            }
            if (!isStaffSender && !isManagerSender) {
              await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานยกเลิกใบโพยสำหรับสมาชิกในกลุ่มนี้`);
              continue;
            }
          }

          let cancelCode = '';
          if (text.startsWith('/cancel')) {
            cancelCode = text.substring('/cancel'.length).trim().toUpperCase();
          } else if (text.startsWith('/ยกเลิก')) {
            cancelCode = text.substring('/ยกเลิก'.length).trim().toUpperCase();
          }

          if (!cancelCode) {
            await sendLineReply(replyToken, `❌ กรุณาระบุเลขใบโพยที่ต้องการยกเลิก\n(เช่น /ยกเลิก 829471)`);
            continue;
          }

          // 1. Find the active submissions with this bill_id
          const { data: subs, error: fetchErr } = await supabase
            .from('submissions')
            .select('id, user_id, amount, round_id')
            .eq('bill_id', cancelCode)
            .eq('is_deleted', false);

          if (fetchErr || !subs || subs.length === 0) {
            await sendLineReply(replyToken, `❌ ไม่พบใบโพยหมายเลข "${cancelCode}" หรือใบโพยนี้ถูกยกเลิกไปแล้ว`);
            continue;
          }

          const submissionUserId = subs[0].user_id;
          const targetRoundId = subs[0].round_id;

          // Fetch dealer_id from round
          const { data: roundData } = await supabase
            .from('lottery_rounds')
            .select('dealer_id')
            .eq('id', targetRoundId)
            .maybeSingle();

          const targetDealerId = roundData?.dealer_id;

          // 2. Identify the sender's profile
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('id, role')
            .eq('line_user_id', userId)
            .maybeSingle();

          let isAuthorized = false;

          if (senderProfile) {
            // Check if sender is the creator of the bill
            if (senderProfile.id === submissionUserId) {
              isAuthorized = true;
            }
            // Check if sender is the dealer themselves
            if (senderProfile.id === targetDealerId) {
              isAuthorized = true;
            }
          }

          // If not authorized yet, check if sender is an active manager of the dealer
          if (!isAuthorized && targetDealerId) {
            const { data: manager } = await supabase
              .from('line_managers')
              .select('id')
              .eq('dealer_id', targetDealerId)
              .eq('line_user_id', userId)
              .eq('is_active', true)
              .maybeSingle();

            if (manager) {
              isAuthorized = true;
            }
          }

          if (!isAuthorized) {
            await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ในการยกเลิกใบโพยนี้ (เฉพาะผู้ส่งโพยเอง หรือผู้จัดการ/เจ้ามือของกลุ่มเท่านั้น)`);
            continue;
          }

          // 3. Soft-delete the submissions
          const timestamp = new Date().toISOString();
          const { error: updateErr } = await supabase
            .from('submissions')
            .update({
              is_deleted: true,
              deleted_at: timestamp
            })
            .eq('bill_id', cancelCode);

          if (updateErr) {
            console.error("Failed to cancel bill:", updateErr);
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดทางเทคนิคในการยกเลิกใบโพย`);
          } else {
            // Trigger Credit pending calculation update in background
            if (targetDealerId) {
              updatePendingDeduction(targetDealerId).catch(err => {
                console.error("Failed updating credit pending:", err);
              });
            }

            const totalCancelled = subs.reduce((sum, s) => sum + Number(s.amount || 0), 0);
            await sendLineReply(replyToken, `✅ ยกเลิกใบโพยหมายเลข "${cancelCode}" สำเร็จเรียบร้อยแล้วค่ะ!\n(ยอดเดิมที่ถูกยกเลิก: ฿${totalCancelled.toLocaleString('th-TH')})`);
          }
          continue;
        }

        // ─── COMMAND 4.5: /โพยย่อ หรือ /โพยเต็ม ───
        if (text === '/โพยย่อ' || text === '/โพยเต็ม') {
          try {
            // Find sender's profile
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('line_user_id', userId)
              .maybeSingle();

            if (!senderProfile) {
              await sendLineReply(replyToken, [
                `❌ คุณยังไม่ได้เชื่อมบัญชี LINE ของคุณกับระบบ Big Lotto\nกรุณานำ LINE User ID ด้านล่างไปใส่ในเมนูโปรไฟล์บนเว็บเพื่อเชื่อมต่อ`,
                userId
              ]);
              continue;
            }

            const displayMode = text === '/โพยย่อ' ? 'short' : 'full';
            const { error: updateErr } = await supabase
              .from('profiles')
              .update({ line_poy_display: displayMode })
              .eq('id', senderProfile.id);

            if (updateErr) {
              console.error("Failed to update poy display mode:", updateErr);
              await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการตั้งค่าการแสดงผลโพย`);
            } else {
              const displayLabel = displayMode === 'short' ? 'แบบย่อ' : 'แบบเต็ม';
              await sendLineReply(replyToken, `✅ ตั้งค่าการแสดงผลโพยหลังบันทึกเป็น "${displayLabel}" สำเร็จแล้วค่ะ!`);
            }
          } catch (err) {
            console.error("Error setting poy display mode:", err);
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการทำรายการ: ${err.message}`);
          }
          continue;
        }

        // ─── COMMAND 5: /โพย หรือ /bill ───
        if (text.startsWith('/bill') || text.startsWith('/โพย')) {
          if (groupLink && groupLink.member_permissions?.bill === false) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();
            const targetDealerId = groupLink.dealer_id;
            const isStaffSender = senderProfile?.id === targetDealerId || senderProfile?.role === 'superadmin' || senderProfile?.role === 'admin';
            let isManagerSender = false;
            if (!isStaffSender && targetDealerId) {
              const { data: mgr } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              isManagerSender = !!mgr;
            }
            if (!isStaffSender && !isManagerSender) {
              await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการใช้งานเรียกดูใบโพยสำหรับสมาชิกในกลุ่มนี้`);
              continue;
            }
          }

          try {
            let billCode = '';
            if (text.startsWith('/bill')) {
              billCode = text.substring('/bill'.length).trim();
            } else if (text.startsWith('/โพย')) {
              billCode = text.substring('/โพย'.length).trim();
            }

            if (!billCode) {
              // ─── /โพย (no argument): show ALL of the sender's bills for the active round ───
              // 1. Group must be bound to a dealer
              const { data: groupLink } = await supabase
                .from('line_groups')
                .select('dealer_id, lottery_type')
                .eq('line_group_id', groupId)
                .eq('is_active', true)
                .maybeSingle();

              if (!groupLink) {
                await sendLineReply(replyToken, `❌ กลุ่มนี้ยังไม่ได้ผูกกับเจ้ามือ ไม่สามารถเรียกดูใบโพยได้`);
                continue;
              }

              const listDealerId = groupLink.dealer_id;
              const listLotteryType = groupLink.lottery_type;

              // 2. Identify the sender's linked profile
              const { data: senderProfile } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();

              if (!senderProfile) {
                await sendLineReply(replyToken, [
                  `❌ คุณยังไม่ได้เชื่อมบัญชี LINE ของคุณกับระบบ Big Lotto\nกรุณานำ LINE User ID ด้านล่างไปใส่ในเมนูโปรไฟล์บนเว็บเพื่อเชื่อมต่อ`,
                  userId
                ]);
                continue;
              }

              // 3. Find the active round for this dealer + lottery type
              const { data: listOpenRounds } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', listDealerId)
                .eq('lottery_type', listLotteryType)
                .in('status', ['open', 'closed'])
                .order('open_time', { ascending: false });

              const nowList = new Date();
              const listActiveRound = (listOpenRounds || []).find((round: any) => {
                if (!round.is_active) return false;
                return nowList >= new Date(round.open_time);
              });

              if (!listActiveRound) {
                await sendLineReply(replyToken, `❌ ขณะนี้ยังไม่มีงวดหวยประเภท ${listLotteryType.toUpperCase()} ที่เปิดอยู่ค่ะ`);
                continue;
              }

              // 4. Fetch all of this member's submissions in this round
              let mySubs = [];
              try {
                mySubs = await fetchAllSubmissions(listActiveRound.id, senderProfile.id);
                mySubs.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              } catch (err) {
                console.error("Failed to fetch myBills submissions:", err);
              }

              if (!mySubs || mySubs.length === 0) {
                await sendLineReply(replyToken, `📭 คุณ ${senderProfile.full_name} ยังไม่มีใบโพยในงวดนี้ค่ะ`);
                continue;
              }

              // 5. Group submissions by bill_id (preserve first-seen order).
              // "รายการซื้อ" counts the number of typed lines, i.e. distinct entry_id groups
              // (each input line shares one entry_id). Legacy rows without entry_id count as 1 each.
              const billOrder: string[] = [];
              const billMap = new Map<string, { billId: string; note: string; lineKeys: Set<string>; total: number; commission: number }>();
              mySubs.forEach((s: any, rowIdx: number) => {
                const bid = s.bill_id || '-';
                if (!billMap.has(bid)) {
                  billMap.set(bid, { billId: bid, note: s.bill_note || '-', lineKeys: new Set<string>(), total: 0, commission: 0 });
                  billOrder.push(bid);
                }
                const b = billMap.get(bid)!;
                b.lineKeys.add(s.entry_id || `__row_${rowIdx}`);
                b.total += Number(s.amount || 0);
                b.commission += Number(s.commission_amount || 0);
              });

              // 6. Build output
              const TYPE_NAMES: Record<string, string> = {
                lao: 'หวยลาว', thai: 'หวยไทย', hanoi: 'หวยฮานอย', stock: 'หวยหุ้น', yeekee: 'หวยยี่กี'
              };
              const typeName = TYPE_NAMES[listLotteryType] || listLotteryType;

              let grandTotal = 0;
              let grandCommission = 0;

              let out = `ประเภท: ${typeName}(${listLotteryType.toUpperCase()})\n`;
              out += `งวดวันที่: ${getRoundDisplayDate(listActiveRound, false)}\n`;
              out += `----------------------\n`;

              billOrder.forEach((bid, idx) => {
                const b = billMap.get(bid)!;
                grandTotal += b.total;
                grandCommission += b.commission;
                out += `${idx + 1}. ใบโพยเลขที่: ${b.billId}\n`;
                out += `บันทึกโน๊ต: ${b.note}\n`;
                out += `รายการซื้อ: ${b.lineKeys.size} รายการ\n`;
                out += `รวมเงิน: ฿${b.total.toLocaleString('th-TH')}\n`;
                out += `----------------------\n`;
              });

              const remaining = grandTotal - grandCommission;
              out += `รวมใบโพย: ${billOrder.length} ใบ\n`;
              out += `ยอดรวม: ฿${grandTotal.toLocaleString('th-TH')}\n`;
              out += `ค่าคอม: ฿${grandCommission.toLocaleString('th-TH')}\n`;
              out += `เหลือส่ง: ฿${remaining.toLocaleString('th-TH')}`;

              await sendLineReply(replyToken, out);
              continue;
            }

            // 1. Find the active submissions with this bill_id
            const { data: subs, error: fetchErr } = await supabase
              .from('submissions')
              .select('id, amount, bet_type, numbers, user_id, round_id, entry_id, display_numbers, display_amount, display_bet_type')
              .eq('bill_id', billCode)
              .eq('is_deleted', false)
              .order('created_at', { ascending: true })
              .order('id', { ascending: true });

            if (fetchErr || !subs || subs.length === 0) {
              await sendLineReply(replyToken, `❌ ไม่พบใบโพยหมายเลข "${billCode}" หรือใบโพยนี้ถูกยกเลิกไปแล้ว`);
              continue;
            }

            const userIdOfBill = subs[0].user_id;
            const roundIdOfBill = subs[0].round_id;

            // 2. Fetch user profile and round details
            const [profileRes, roundRes] = await Promise.all([
              supabase.from('profiles').select('full_name').eq('id', userIdOfBill).maybeSingle(),
              supabase.from('lottery_rounds').select('lottery_type, round_date, close_time, dealer_id').eq('id', roundIdOfBill).maybeSingle()
            ]);

            const buyerName = profileRes.data?.full_name || 'Unknown User';
            const roundData = roundRes.data;

            if (!roundData) {
              await sendLineReply(replyToken, `❌ ไม่พบข้อมูลรอบหวยที่เกี่ยวข้องกับใบโพยนี้`);
              continue;
            }

            const targetDealerId = roundData.dealer_id;

            // Fetch owner's user settings to determine bonus
            const { data: ownerSettings } = await supabase
              .from('user_settings')
              .select('lottery_settings')
              .eq('user_id', userIdOfBill)
              .eq('dealer_id', targetDealerId)
              .maybeSingle();

            const getLotteryTypeKeyForOwner = (lotteryType: string) => {
              if (lotteryType === 'thai') return 'thai';
              if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao';
              if (lotteryType === 'stock') return 'stock';
              return 'thai';
            };
            const ownerLk = getLotteryTypeKeyForOwner(roundData.lottery_type);
            const ownerTabSettings = ownerSettings?.lottery_settings?.[ownerLk];
            const isOwnerBonusEnabled = !!ownerTabSettings?.bonusEnabled;

            const isLaoOrHanoiForOwner = ['lao', 'hanoi'].includes(ownerLk);
            const REVERSE_LAO_MAP_OWNER: Record<string, string> = { '3_straight': '3_top', '3_tod_single': '3_tod' };
            const ownerBetTypeBonus: Record<string, number> = {};
            if (isOwnerBonusEnabled && ownerTabSettings) {
              Object.entries(ownerTabSettings).forEach(([key, val]) => {
                if (key === 'bonusEnabled' || key === '4_set' || typeof val !== 'object') return;
                const typedVal = val as { bonus?: number };
                if (typedVal.bonus && typedVal.bonus > 0) {
                  ownerBetTypeBonus[key] = typedVal.bonus;
                  if (isLaoOrHanoiForOwner && REVERSE_LAO_MAP_OWNER[key]) {
                    ownerBetTypeBonus[REVERSE_LAO_MAP_OWNER[key]] = typedVal.bonus;
                  }
                }
              });
            }

            // 3. Verify sender authorization
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();

            let isAuthorized = false;
            if (senderProfile) {
              if (senderProfile.id === targetDealerId || senderProfile.id === userIdOfBill) {
                isAuthorized = true;
              } else {
                const { data: membership } = await supabase
                  .from('user_dealer_memberships')
                  .select('id')
                  .eq('user_id', senderProfile.id)
                  .eq('dealer_id', targetDealerId)
                  .eq('status', 'active')
                  .maybeSingle();
                if (membership) {
                  isAuthorized = true;
                }
              }
            }

            if (!isAuthorized && targetDealerId) {
              const { data: manager } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              if (manager) {
                isAuthorized = true;
              }
            }

            if (!isAuthorized) {
              await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์เข้าดูรายละเอียดใบโพยนี้`);
              continue;
            }

            // 4. Format and reply with the list of purchases grouped by entry_id
            const isLaoOrHanoi = roundData.lottery_type === 'lao' || roundData.lottery_type === 'hanoi';
            const LABELS = {
              '2_top': 'บน',
              '2_bottom': 'ล่าง',
              '3_top': isLaoOrHanoi ? 'ตรง' : 'บน',
              '3_tod': 'โต๊ด',
              '3_front': '3 ตัวหน้า',
              '3_back': '3 ตัวหลัง',
              '4_tod': '4 ตัวโต๊ด',
              '4_set': '4 ตัวชุด',
              '6_top': '6 ตัวบน',
              '4_float': '4 ตัวลอยแพ',
              '5_float': '5 ตัวลอยแพ',
              'run_top': 'ลอยบน',
              'run_bottom': 'ลอยล่าง'
            };

            // Grouping algorithm
            const formattedLines = [];
            let totalAmount = 0;
            let totalBaseAmount = 0;

            const getBaseAmountForSub = (sub: any) => {
              let base = Number(sub.amount || 0);
              const displayAmtStr = typeof sub.display_amount === 'string' ? sub.display_amount : String(sub.display_amount || '');
              const hasBonusOnTag = displayAmtStr.includes('\u200B');
              const hasBonusOffTag = displayAmtStr.includes('\u200C');
              
              if (hasBonusOffTag) return base;
              
              const shouldApplyReverseMath = hasBonusOnTag || (!hasBonusOnTag && !hasBonusOffTag);
              if (shouldApplyReverseMath) {
                const bt = sub.bet_type;
                if (bt !== '4_set') {
                  const bonusPct = ownerBetTypeBonus[bt] || 0;
                  if (bonusPct > 0) {
                    base = Math.round(Number(sub.amount || 0) / (1 + bonusPct / 100));
                  }
                }
              }
              return base;
            };

            // Separate items by whether they have entry_id
            const withEntryId = subs.filter(s => s.entry_id);
            const withoutEntryId = subs.filter(s => !s.entry_id);

            // Process items with entry_id
            const entryGroups = new Map();
            withEntryId.forEach(s => {
              const gid = s.entry_id;
              if (!entryGroups.has(gid)) {
                entryGroups.set(gid, []);
              }
              entryGroups.get(gid).push(s);
            });

            entryGroups.forEach((group) => {
              const first = group[0];
              const count = group.length;
              const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
              const groupBaseSum = group.reduce((sum, s) => sum + getBaseAmountForSub(s), 0);
              totalAmount += groupSum;
              totalBaseAmount += groupBaseSum;

              let disp = first.display_numbers;
              if (!disp) {
                const numStr = first.numbers || '';
                const betTypeStr = first.bet_type || '';
                const len = numStr.length;
                if (len === 2 && count === 2 && betTypeStr.startsWith('2_')) {
                  const label = betTypeStr === '2_top' ? 'บนกลับ' : 'ล่างกลับ';
                  disp = `${numStr}=${first.amount}*${first.amount} ${label}`;
                } else if (len === 3 && count > 1 && betTypeStr === '3_top') {
                  disp = `${numStr}=${first.amount}*${count} คูณชุด`;
                } else {
                  const label = LABELS[betTypeStr] || betTypeStr;
                  disp = `${numStr}=${first.amount} ${label}`;
                }
              }

              const countSuffix = count > 1 ? ` (${count})` : '';
              formattedLines.push(`${disp}${countSuffix}`);
            });

            // Process items without entry_id (historical/fallback grouping)
            const visited = new Set();
            for (let i = 0; i < withoutEntryId.length; i++) {
              if (visited.has(i)) continue;
              const current = withoutEntryId[i];
              const numStr = current.numbers || '';
              const betTypeStr = current.bet_type || '';
              const len = numStr.length;

              // A. 3-digit permutation grouping
              if (len === 3 && betTypeStr === '3_top') {
                const group = [current];
                visited.add(i);
                const currentSorted = numStr.split('').sort().join('');

                for (let j = i + 1; j < withoutEntryId.length; j++) {
                  if (visited.has(j)) continue;
                  const other = withoutEntryId[j];
                  const otherNumStr = other.numbers || '';
                  if (otherNumStr.length === 3 && other.bet_type === '3_top' && other.amount === current.amount) {
                    const otherSorted = otherNumStr.split('').sort().join('');
                    if (currentSorted === otherSorted) {
                      group.push(other);
                      visited.add(j);
                    }
                  }
                }

                const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
                const groupBaseSum = group.reduce((sum, s) => sum + getBaseAmountForSub(s), 0);
                totalAmount += groupSum;
                totalBaseAmount += groupBaseSum;

                if (group.length > 1) {
                  const count = group.length;
                  formattedLines.push(`${numStr}=${current.amount}*${count} คูณชุด (${count})`);
                } else {
                  formattedLines.push(`${numStr}=${current.amount} ${isLaoOrHanoi ? 'ตรง' : 'บน'}`);
                }
              }
              // B. 2-digit reverse grouping
              else if (len === 2 && (betTypeStr === '2_top' || betTypeStr === '2_bottom')) {
                const group = [current];
                visited.add(i);
                const reversed = numStr.split('').reverse().join('');

                if (reversed !== numStr) {
                  for (let j = i + 1; j < withoutEntryId.length; j++) {
                    if (visited.has(j)) continue;
                    const other = withoutEntryId[j];
                    const otherNumStr = other.numbers || '';
                    if (otherNumStr.length === 2 && other.bet_type === current.bet_type && other.amount === current.amount && otherNumStr === reversed) {
                      group.push(other);
                      visited.add(j);
                      break;
                    }
                  }
                }

                const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
                const groupBaseSum = group.reduce((sum, s) => sum + getBaseAmountForSub(s), 0);
                totalAmount += groupSum;
                totalBaseAmount += groupBaseSum;

                if (group.length > 1) {
                  const label = betTypeStr === '2_top' ? 'บนกลับ' : 'ล่างกลับ';
                  formattedLines.push(`${numStr}=${current.amount}*${current.amount} ${label} (${group.length})`);
                } else {
                  const label = betTypeStr === '2_top' ? 'บน' : 'ล่าง';
                  formattedLines.push(`${numStr}=${current.amount} ${label}`);
                }
              }
              // C. Other items (singles, double 2-digits like 77, 4-digits, runners, etc.)
              else {
                visited.add(i);
                totalAmount += Number(current.amount || 0);
                totalBaseAmount += getBaseAmountForSub(current);
                const label = LABELS[betTypeStr] || betTypeStr;
                formattedLines.push(`${numStr}=${current.amount} ${label}`);
              }
            }

            let summaryText = `📄 ใบโพย: ${billCode}\n`;
            summaryText += `ประเภท: ${roundData.lottery_type.toUpperCase()}\n`;
            summaryText += `งวดวันที่: ${getRoundDisplayDate(roundData, false)}\n`;
            summaryText += `ผู้ซื้อ: คุณ ${buyerName}\n`;
            summaryText += `จำนวนรายการ: ${subs.length}\n`;
            summaryText += `--------------------------\n`;

            summaryText += formattedLines.join('\n') + '\n';

            const totalBonusAmount = totalAmount - totalBaseAmount;
            summaryText += `--------------------------\n`;
            if (totalBonusAmount > 0) {
              summaryText += `💰 ยอดแทง: ฿${totalBaseAmount.toLocaleString('th-TH')}\n`;
              summaryText += `🎁 ยอดแถม: ฿${totalBonusAmount.toLocaleString('th-TH')}`;
            } else {
              summaryText += `💰 ยอดรวม: ฿${totalAmount.toLocaleString('th-TH')}`;
            }

            await sendLineReply(replyToken, summaryText);
          } catch (err) {
            console.error("Error handling /โพย command:", err);
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลใบโพย:\n${err.message}\n${err.stack || ''}`);
          }
          continue;
        }

// ─── NORMAL MESSAGE (Check if in a bound group for processing bets) ───
        if (!groupLink) {
          // Message not in a registered group, ignore it
          continue;
        }

        // Auto-heal group name if empty or missing
        if (!groupLink.group_name && groupId.startsWith('C')) {
          const fetchedName = await fetchGroupName(groupId);
          if (fetchedName) {
            await supabase
              .from('line_groups')
              .update({ group_name: fetchedName })
              .eq('id', groupLink.id);
            groupLink.group_name = fetchedName; // update local object reference
          }
        }

        const dealerId = groupLink.dealer_id;
        const lotteryType = groupLink.lottery_type;

        console.log(`[LINE BOT MSG] Found groupLink for group: ${groupId}, dealerId: ${dealerId}`);

        // Verify if sender has a linked profile
        let { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id, full_name, is_active, role, line_poy_display')
          .eq('line_user_id', userId)
          .eq('is_active', true)
          .maybeSingle();

        const senderPoyDisplay = profile?.line_poy_display || 'short';
        console.log(`[LINE BOT MSG] profile lookup result:`, { profile, profileErr, senderPoyDisplay });

        // Check if sender is a manager for this dealer
        const { data: managerRecord, error: managerErr } = await supabase
          .from('line_managers')
          .select('id')
          .eq('dealer_id', dealerId)
          .eq('line_user_id', userId)
          .eq('is_active', true)
          .maybeSingle();

        console.log(`[LINE BOT MSG] managerRecord lookup result:`, { managerRecord, managerErr });

        const isDealer = profile?.role === 'dealer';
        const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
        const isManager = !!managerRecord;

        // If the user has NOT bound their ID and is not staff or manager
        if (!profile && !isDealer && !isAdmin && !isManager) {
          // Display their LINE User ID every time they perform any activity (send any message)
          await sendLineReply(replyToken, [
            `❌ คุณยังไม่ได้เชื่อมบัญชี LINE ของคุณกับระบบ Big Lotto\nกรุณานำ LINE User ID ด้านล่างไปใส่ในเมนูโปรไฟล์บนเว็บเพื่อเชื่อมต่อ \nหรือแจ้ง admin เพื่อช่วยเหลือในการเชื่อมต่อ`,
            userId
          ]);
          continue;
        }

        const parsedBets = parseMultiLinePaste(text, lotteryType);
        const isStaffSender = isDealer || isAdmin || isManager;
        let originalSenderId = profile?.id || null;

        if (isStaffSender) {
          if (parsedBets.length > 0) {
            // Check if group settings allow staff betting and have a valid representative member
            if (!groupLink.allow_staff_bet || !groupLink.staff_member_id) {
              await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ ซื้อเลข(แทง)ในกลุ่มนี้`);
              continue;
            }

            // Fetch representative member profile
            const { data: repProfile } = await supabase
              .from('profiles')
              .select('id, full_name, role, is_active, line_poy_display')
              .eq('id', groupLink.staff_member_id)
              .eq('is_active', true)
              .maybeSingle();

            if (!repProfile) {
              await sendLineReply(replyToken, `❌ ไม่พบหรือไม่สามารถใช้งานบัญชีสมาชิกตัวแทนที่เจ้ามือตั้งค่าไว้ได้`);
              continue;
            }

            // Override profile with the representative profile for the bet process
            profile = repProfile;
          } else {
            // It's not a bet format, ignore
            continue;
          }
        } else {
          // For linked members, check if the text contains a bet. If not, ignore silently
          if (parsedBets.length === 0) {
            // Random chat message, ignore it
            continue;
          }

          // Check if bets are allowed for members
          if (groupLink.member_permissions?.bet === false) {
            await sendLineReply(replyToken, `❌ ดีลเลอร์ปิดการรับยอดแทงผ่านแชท LINE ในกลุ่มนี้สำหรับสมาชิกทั่วไป`);
            continue;
          }
        }

        const submittedById = originalSenderId || (profile ? profile.id : null);

        // Check active membership with the group's dealer
        const { data: membership } = await supabase
          .from('user_dealer_memberships')
          .select('id, status')
          .eq('user_id', profile.id)
          .eq('dealer_id', dealerId)
          .eq('status', 'active')
          .single();

        if (!membership) {
          await sendLineReply(replyToken, `❌ ขออภัยค่ะ คุณ ${profile.full_name} ไม่มีสิทธิ์ส่งโพยกับดีลเลอร์กลุ่มนี้ หรือสิทธิ์ของท่านถูกระงับชั่วคราว`);
          continue;
        }

        // Check active round for this dealer (must be open or closed, is_active=true, and current time is past open time)
        const { data: openRounds } = await supabase
          .from('lottery_rounds')
          .select('*')
          .eq('dealer_id', dealerId)
          .eq('lottery_type', lotteryType)
          .in('status', ['open', 'closed'])
          .order('open_time', { ascending: false });

        const now = new Date();
        const activeRound = (openRounds || []).find(round => {
          if (!round.is_active) return false;
          const openTime = new Date(round.open_time);
          return now >= openTime;
        });

        if (!activeRound) {
          await sendLineReply(
            replyToken,
            `❌ ขออภัยค่ะ ขณะนี้ยังไม่มีงวดหวยประเภท ${lotteryType.toUpperCase()} เปิดให้ป้อนข้อมูล หรือยังไม่ถึงเวลาเปิดรับแทงตามที่กลุ่มนี้ผูกอยู่ค่ะ`
          );
          continue;
        }

        // If round status is closed or past its close time, reject betting with specific message
        const closeTime = new Date(activeRound.close_time);
        if (activeRound.status === 'closed' || now >= closeTime) {
          await sendLineReply(
            replyToken,
            `❌ ขออภัยค่ะ งวดหวยประเภท ${lotteryType.toUpperCase()} ปิดรับแทงแล้วค่ะ`
          );
          continue;
        }

        // Retrieve returnExcessOnOverflow setting for the member
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('lottery_settings')
          .eq('user_id', profile.id)
          .eq('dealer_id', dealerId)
          .maybeSingle();

        const returnExcess = !!userSettings?.lottery_settings?.[lotteryType]?.returnExcessOnOverflow;

        // Build betTypeBonus dictionary for applying bonuses
        const getLotteryTypeKey = (lotteryType: string) => {
          if (lotteryType === 'thai') return 'thai';
          if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao';
          if (lotteryType === 'stock') return 'stock';
          return 'thai';
        };
        const lk = getLotteryTypeKey(lotteryType);
        const tabSettings = userSettings?.lottery_settings?.[lk];
        const isBonusEnabled = !!tabSettings?.bonusEnabled;

        const isLaoOrHanoiForSettings = ['lao', 'hanoi'].includes(lk);
        const REVERSE_LAO_MAP: Record<string, string> = { '3_straight': '3_top', '3_tod_single': '3_tod' };
        const betTypeBonus: Record<string, number> = {};
        if (isBonusEnabled && tabSettings) {
          Object.entries(tabSettings).forEach(([key, val]) => {
            if (key === 'bonusEnabled' || key === '4_set' || typeof val !== 'object') return;
            const typedVal = val as { bonus?: number };
            if (typedVal.bonus && typedVal.bonus > 0) {
              betTypeBonus[key] = typedVal.bonus;
              if (isLaoOrHanoiForSettings && REVERSE_LAO_MAP[key]) {
                betTypeBonus[REVERSE_LAO_MAP[key]] = typedVal.bonus;
              }
            }
          });
        }

        let typeLimitsMap: Record<string, number> = {};
        let numberLimits: any[] = [];
        const currentTotals = new Map<string, number>();
        let transfersList: any[] = [];
        const isSetBasedLottery = ['lao', 'hanoi'].includes(lotteryType);

        if (returnExcess) {
          // Fetch type limits
          const { data: typeLimitsData } = await supabase
            .from('type_limits')
            .select('bet_type, max_per_number')
            .eq('round_id', activeRound.id);
          (typeLimitsData || []).forEach((tl: any) => {
            typeLimitsMap[tl.bet_type] = Number(tl.max_per_number);
          });

          // Fetch number limits
          const { data: numberLimitsData } = await supabase
            .from('number_limits')
            .select('bet_type, numbers, max_amount, is_active, limit_type, include_reversed, reversed_numbers')
            .eq('round_id', activeRound.id);
          numberLimits = (numberLimitsData || []).filter((nl: any) => nl.is_active === undefined || nl.is_active === true);

          // Fetch submissions totals
          let submissionsData = [];
          try {
            submissionsData = await fetchAllSubmissions(activeRound.id);
          } catch (err) {
            console.error("Failed to fetch submissions totals:", err);
          }
          (submissionsData || []).forEach((s: any) => {
            const key = `${s.bet_type}|${s.numbers}`;
            currentTotals.set(key, (currentTotals.get(key) || 0) + Number(s.amount || 0));
          });

          // Fetch layoffs
          const { data: transfersData } = await supabase
            .from('bet_transfers')
            .select('bet_type, numbers, amount, status')
            .eq('round_id', activeRound.id);
          transfersList = (transfersData || []).filter((t: any) => t.status !== 'returned');
        }

        // Calculate total bet amount
        let totalBetAmount = 0;
        const processedInserts = [];

        // Generate a 6-character readable alphanumeric code for the bill_id
        // Excludes easily confused characters: 0, 1, I, O (Base32 format)
        const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        let billId = "";
        const randomBytes = new Uint8Array(6);
        crypto.getRandomValues(randomBytes);
        for (let i = 0; i < 6; i++) {
          billId += chars[randomBytes[i] % chars.length];
        }

        const baseTimestamp = new Date();
        let insertIndex = 0;
        const buyerNote = extractBuyerNote(text, lotteryType);
        const finalBillNote = buyerNote || 'LINE Bot';

        // Group bets to fetch commissions
        for (const bet of parsedBets) {
          const entryId = crypto.randomUUID(); // Group ID for all sub-bets of this single input line
          let straightAmt = bet.amount;
          let betType = bet.betType;

          // display variables
          const displayNumbers = bet.formattedLine || bet.numbers;
          let displayAmount = bet.amount.toString();
          let displayBetType = bet.typeLabel;

          // 4 ตัวชุด price calculation
          if (betType === '4_set') {
            const setPrice = activeRound.set_prices?.['4_top'] || 120;
            // amount field from parser represents set count
            const setCount = bet.amount || 1;
            straightAmt = setCount * setPrice;
            displayAmount = `${straightAmt} บาท (${setCount} ชุด)`;
            displayBetType = `4 ตัวชุด`;
          }

          let permsCount = 1;
          if (bet.specialType && (bet.specialType === 'set3' || bet.specialType === 'set6' || bet.specialType.startsWith('set'))) {
            permsCount = getPermutations(bet.numbers).length;
            displayAmount = `${bet.amount} (${permsCount} ชุด)`;
            displayBetType = `คูณชุด ${permsCount}`;
          } else if (bet.specialType === '3xPerm' && bet.amount2) {
            displayAmount = `${bet.amount}*${bet.amount2}`;
            displayBetType = 'คูณชุด';
          } else if (bet.specialType === 'tengTod' && bet.amount2) {
            displayAmount = `${bet.amount}*${bet.amount2}`;
            displayBetType = 'เต็งโต๊ด';
          } else if (bet.specialType === 'reverse' && bet.amount2) {
            displayAmount = `${bet.amount}*${bet.amount2}`;
          }

          // Retrieve commission settings for this specific user (using pre-fetched settings)
          const commInfo = getCommissionInfo(userSettings?.lottery_settings, betType, lotteryType);

          if (bet.specialType && (bet.specialType === 'set3' || bet.specialType === 'set6' || bet.specialType.startsWith('set'))) {
            // คูณชุด - 3 digits
            const perms = getPermutations(bet.numbers);
            const bonusPct = betTypeBonus[betType] || 0;
            const originalAmount = bet.amount;
            const boostedAmt = (betType !== '4_set' && bonusPct > 0) ? Math.round(originalAmount * (1 + bonusPct / 100)) : originalAmount;
            const dispAmt = (betType !== '4_set' && bonusPct > 0) ? boostedAmt.toString() + '\u200B' : originalAmount.toString() + '\u200C';

            const commissionAmount = commInfo.isFixed
              ? commInfo.rate
              : (boostedAmt * commInfo.rate) / 100;

            totalBetAmount += boostedAmt * perms.length;

            perms.forEach((perm) => {
              const timestamp = new Date(baseTimestamp.getTime() + (insertIndex++)).toISOString();
              processedInserts.push({
                entry_id: entryId,
                round_id: activeRound.id,
                user_id: profile.id,
                bill_id: billId,
                bill_note: finalBillNote,
                bet_type: betType,
                numbers: perm,
                amount: boostedAmt,
                commission_rate: commInfo.rate,
                commission_amount: commissionAmount,
                is_deleted: false,
                is_paid: false,
                source: 'user',
                submitted_by: submittedById,
                submitted_by_type: 'user',
                display_numbers: displayNumbers,
                display_amount: dispAmt,
                display_bet_type: displayBetType,
                created_at: timestamp,
                updated_at: timestamp
              });
            });
          } else if (bet.specialType === '3xPerm') {
            // คูณชุด - 4 or 5 digits
            let combos: string[] = [];
            if (bet.numbers.length === 4) {
              combos = getUnique3DigitPermsFrom4(bet.numbers);
            } else if (bet.numbers.length === 5) {
              combos = getUnique3DigitPermsFrom5(bet.numbers);
            }

            const bonusPct = betTypeBonus[betType] || 0;
            const originalAmount = bet.amount;
            const boostedAmt = (betType !== '4_set' && bonusPct > 0) ? Math.round(originalAmount * (1 + bonusPct / 100)) : originalAmount;
            const dispAmt = (betType !== '4_set' && bonusPct > 0) ? boostedAmt.toString() + '\u200B' : originalAmount.toString() + '\u200C';

            const commissionAmount = commInfo.isFixed
              ? commInfo.rate
              : (boostedAmt * commInfo.rate) / 100;

            totalBetAmount += boostedAmt * combos.length;

            combos.forEach((combo) => {
              const timestamp = new Date(baseTimestamp.getTime() + (insertIndex++)).toISOString();
              processedInserts.push({
                entry_id: entryId,
                round_id: activeRound.id,
                user_id: profile.id,
                bill_id: billId,
                bill_note: finalBillNote,
                bet_type: betType,
                numbers: combo,
                amount: boostedAmt,
                commission_rate: commInfo.rate,
                commission_amount: commissionAmount,
                is_deleted: false,
                is_paid: false,
                source: 'user',
                submitted_by: submittedById,
                submitted_by_type: 'user',
                display_numbers: displayNumbers,
                display_amount: dispAmt,
                display_bet_type: displayBetType,
                created_at: timestamp,
                updated_at: timestamp
              });
            });
          } else {
            // Normal straight/single bet (including tengTod and reverse base part)
            const bonusPct = betTypeBonus[betType] || 0;
            const boostedStraightAmt = (betType !== '4_set' && bonusPct > 0) ? Math.round(straightAmt * (1 + bonusPct / 100)) : straightAmt;
            const straightDispAmt = (betType !== '4_set' && bonusPct > 0) ? boostedStraightAmt.toString() + '\u200B' : straightAmt.toString() + '\u200C';

            const commissionAmount = commInfo.isFixed
              ? commInfo.rate * (betType === '4_set' || betType === '4_top' ? bet.amount : 1)
              : (boostedStraightAmt * commInfo.rate) / 100;

            totalBetAmount += boostedStraightAmt;

            const timestamp = new Date(baseTimestamp.getTime() + (insertIndex++)).toISOString();
            processedInserts.push({
              entry_id: entryId,
              round_id: activeRound.id,
              user_id: profile.id,
              bill_id: billId,
              bill_note: finalBillNote,
              bet_type: betType,
              numbers: bet.numbers,
              amount: boostedStraightAmt,
              commission_rate: commInfo.rate,
              commission_amount: commissionAmount,
              is_deleted: false,
              is_paid: false,
              source: 'user',
              submitted_by: submittedById,
              submitted_by_type: 'user',
              display_numbers: displayNumbers,
              display_amount: straightDispAmt,
              display_bet_type: displayBetType,
              created_at: timestamp,
              updated_at: timestamp
            });

            // Special Type - เต็งโต๊ด (3_straight_tod): insert additional tod item
            if (bet.specialType === 'tengTod' && bet.amount2) {
              const todAmt = bet.amount2;
              const sortedNumbers = bet.numbers.split('').sort().join('');
              const todCommInfo = getCommissionInfo(userSettings?.lottery_settings, '3_tod', lotteryType);

              const todBonusPct = betTypeBonus['3_tod'] || 0;
              const boostedTodAmt = todBonusPct > 0 ? Math.round(todAmt * (1 + todBonusPct / 100)) : todAmt;
              const todDispAmt = todBonusPct > 0 ? boostedTodAmt.toString() + '\u200B' : todAmt.toString() + '\u200C';

              const todCommAmt = todCommInfo.isFixed ? todCommInfo.rate : (boostedTodAmt * todCommInfo.rate) / 100;

              totalBetAmount += boostedTodAmt;

              const todTimestamp = new Date(baseTimestamp.getTime() + (insertIndex++)).toISOString();
              processedInserts.push({
                entry_id: entryId,
                round_id: activeRound.id,
                user_id: profile.id,
                bill_id: billId,
                bill_note: finalBillNote,
                bet_type: '3_tod',
                numbers: sortedNumbers,
                amount: boostedTodAmt,
                commission_rate: todCommInfo.rate,
                commission_amount: todCommAmt,
                is_deleted: false,
                is_paid: false,
                source: 'user',
                submitted_by: submittedById,
                submitted_by_type: 'user',
                display_numbers: displayNumbers,
                display_amount: todDispAmt,
                display_bet_type: displayBetType,
                created_at: todTimestamp,
                updated_at: todTimestamp
              });
            }

            // Special Type - กลับ (reverse): insert other unique permuted numbers
            if (bet.specialType === 'reverse' && bet.amount2) {
              const revAmt = bet.amount2;
              const perms = getPermutations(bet.numbers).filter(p => p !== bet.numbers);
              
              const revBonusPct = betTypeBonus[betType] || 0;
              const boostedRevAmt = revBonusPct > 0 ? Math.round(revAmt * (1 + revBonusPct / 100)) : revAmt;
              const revDispAmt = revBonusPct > 0 ? boostedRevAmt.toString() + '\u200B' : revAmt.toString() + '\u200C';

              const revCommInfo = getCommissionInfo(userSettings?.lottery_settings, betType, lotteryType);
              for (const permNum of perms) {
                const revCommAmt = revCommInfo.isFixed ? revCommInfo.rate : (boostedRevAmt * revCommInfo.rate) / 100;

                totalBetAmount += boostedRevAmt;

                const revTimestamp = new Date(baseTimestamp.getTime() + (insertIndex++)).toISOString();
                processedInserts.push({
                  entry_id: entryId,
                  round_id: activeRound.id,
                  user_id: profile.id,
                  bill_id: billId,
                  bill_note: finalBillNote,
                  bet_type: betType,
                  numbers: permNum,
                  amount: boostedRevAmt,
                  commission_rate: revCommInfo.rate,
                  commission_amount: revCommAmt,
                  is_deleted: false,
                  is_paid: false,
                  source: 'user',
                  submitted_by: submittedById,
                  submitted_by_type: 'user',
                  display_numbers: displayNumbers,
                  display_amount: revDispAmt,
                  display_bet_type: displayBetType,
                  created_at: revTimestamp,
                  updated_at: revTimestamp
                });
              }
            }
          }
        }

        const finalInserts = [];
        const returnedBets: { numbers: string; betType: string; amount: number; typeLabel: string }[] = [];

        if (returnExcess) {
          const currentExactSetsMap = new Map<string, number>();
          const current3SetTotalMap = new Map<string, number>();
          const setPrice = activeRound.set_prices?.['4_top'] || 120;

          if (isSetBasedLottery) {
            for (const [key, val] of currentTotals.entries()) {
              const [bt, num] = key.split('|');
              if ((bt === '4_set' || bt === '4_top') && num?.length === 4) {
                const sets = Math.ceil(val / setPrice);
                currentExactSetsMap.set(num, (currentExactSetsMap.get(num) || 0) + sets);

                const last3 = num.slice(-3);
                current3SetTotalMap.set(last3, (current3SetTotalMap.get(last3) || 0) + sets);
              }
            }
          }

          for (const insert of processedInserts) {
            const betType = insert.bet_type;
            const numbers = insert.numbers;
            const amount = insert.amount;

            if (isSetBasedLottery && (betType === '4_set' || betType === '4_top') && numbers?.length === 4) {
              const proposedSets = amount / setPrice;
              const last3 = numbers.slice(-3);

              const limit4Set = typeLimitsMap['4_set'] !== undefined ? typeLimitsMap['4_set'] : (typeLimitsMap['4_top'] !== undefined ? typeLimitsMap['4_top'] : 999999999);
              const exactTransferred = transfersList
                .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top') && t.numbers === numbers)
                .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0);
              const effectiveLimit4Set = limit4Set + exactTransferred;
              const currentExactSets = currentExactSetsMap.get(numbers) || 0;
              const remaining4Set = Math.max(0, effectiveLimit4Set - currentExactSets);

              const limit3Set = typeLimitsMap['3_set'] !== undefined ? typeLimitsMap['3_set'] : 999999999;
              const totalTransferred3Set = transfersList
                .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers?.slice(-3) === last3)
                .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0);
              const effectiveLimit3Set = limit3Set + totalTransferred3Set;
              const current3SetTotal = current3SetTotalMap.get(last3) || 0;
              const remaining3Set = Math.max(0, effectiveLimit3Set - current3SetTotal);

              const acceptedSets = Math.min(proposedSets, remaining4Set, remaining3Set);
              const acceptedAmount = acceptedSets * setPrice;
              const excessAmount = (proposedSets - acceptedSets) * setPrice;

              if (acceptedSets > 0) {
                insert.amount = acceptedAmount;
                const commInfo = getCommissionInfo(userSettings?.lottery_settings, betType, lotteryType);
                insert.commission_amount = commInfo.isFixed ? commInfo.rate * acceptedSets : (acceptedAmount * commInfo.rate) / 100;
                insert.display_amount = `${acceptedAmount} บาท (${acceptedSets} ชุด)\u200C`;
                finalInserts.push(insert);

                currentExactSetsMap.set(numbers, currentExactSets + acceptedSets);
                current3SetTotalMap.set(last3, current3SetTotal + acceptedSets);
              }

              if (excessAmount > 0) {
                returnedBets.push({
                  numbers,
                  betType,
                  amount: excessAmount,
                  typeLabel: '4 ตัวชุด'
                });
              }
            } else {
              const matchingLimit = findMatchingLimit(numberLimits, betType, numbers);
              let limit = 999999999;
              if (matchingLimit) {
                limit = Number(matchingLimit.max_amount);
              } else {
                const typeLimit = typeLimitsMap[betType];
                if (typeLimit !== undefined) {
                  limit = typeLimit;
                }
              }

              const alreadyTransferred = transfersList
                .filter(t => t.bet_type === betType && t.numbers === numbers)
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);
              const effectiveLimit = limit + alreadyTransferred;
              const currentTotal = currentTotals.get(`${betType}|${numbers}`) || 0;
              const remaining = Math.max(0, effectiveLimit - currentTotal);

              const acceptedAmount = Math.min(amount, remaining);
              const excessAmount = amount - acceptedAmount;

              if (acceptedAmount > 0) {
                insert.amount = acceptedAmount;
                const commInfo = getCommissionInfo(userSettings?.lottery_settings, betType, lotteryType);
                insert.commission_amount = commInfo.isFixed ? commInfo.rate : (acceptedAmount * commInfo.rate) / 100;
                
                const bonusPct = betTypeBonus[betType] || 0;
                insert.display_amount = (betType !== '4_set' && bonusPct > 0)
                  ? acceptedAmount.toString() + '\u200B'
                  : acceptedAmount.toString() + '\u200C';
                
                finalInserts.push(insert);

                currentTotals.set(`${betType}|${numbers}`, currentTotal + acceptedAmount);
              }

              if (excessAmount > 0) {
                const bonusPct = betTypeBonus[betType] || 0;
                const baseExcess = (betType !== '4_set' && bonusPct > 0)
                  ? Math.round(excessAmount / (1 + bonusPct / 100))
                  : excessAmount;
                returnedBets.push({
                  numbers,
                  betType,
                  amount: baseExcess,
                  typeLabel: getThaiBetTypeLabel(betType, lotteryType)
                });
              }
            }
          }

          // Replace processedInserts with finalInserts
          processedInserts.length = 0;
          processedInserts.push(...finalInserts);
          totalBetAmount = processedInserts.reduce((sum, insert) => sum + insert.amount, 0);

          if (processedInserts.length === 0) {
            const setPrice = activeRound?.set_prices?.['4_top'] || 120;
            // Group and summarize returned bets
            const groupedReturned = new Map<string, { numbers: string; betType: string; typeLabel: string; amount: number }>();
            returnedBets.forEach(rb => {
              const key = `${rb.numbers}|${rb.typeLabel}`;
              const existing = groupedReturned.get(key);
              if (existing) {
                existing.amount += rb.amount;
              } else {
                groupedReturned.set(key, { ...rb });
              }
            });

            let summaryText = `❌ ส่งโพยไม่สำเร็จ: เลขทุกตัวที่ส่งมามีมูลค่าเกินลิมิตของงวดนี้แล้ว จึงถูกตีคืนทั้งหมดค่ะ\n\n`;
            summaryText += `⚠️ ยอดที่คืนสมาชิก:\n`;
            for (const rb of groupedReturned.values()) {
              const cleanTypeLabel = rb.typeLabel.replace(/\s+/g, '');
              if (isSetBasedLottery && (rb.betType === '4_set' || rb.betType === '4_top')) {
                const sets = Math.round(rb.amount / setPrice);
                summaryText += `${rb.numbers} (${cleanTypeLabel}) คืน: ${sets} ชุด=฿${rb.amount.toLocaleString('th-TH')}\n`;
              } else {
                summaryText += `${rb.numbers} (${cleanTypeLabel}) คืน: ฿${rb.amount.toLocaleString('th-TH')}\n`;
              }
            }
            await sendLineReply(replyToken, summaryText.trim());
            continue;
          }
        }

        // Verify Credit Limit of Dealer
        const creditCheck = await checkDealerCreditForBet(dealerId, totalBetAmount);
        if (!creditCheck.allowed) {
          await sendLineReply(replyToken, `❌ ส่งโพยไม่สำเร็จ: เครดิตห้องของเจ้ามือไม่เพียงพอกรุณาแจ้งเจ้ามือเพื่อเพิ่มเครดิตค่ะ\n(${creditCheck.message})`);
          continue;
        }

        // Write Submissions to Database
        const { error: insertErr } = await supabase
          .from('submissions')
          .insert(processedInserts);

        if (insertErr) {
          console.error("Submissions insert failed:", insertErr);
          await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลโพย กรุณาส่งใหม่อีกครั้ง`);
          continue;
        }

        // Trigger Credit pending calculation update in background
        updatePendingDeduction(dealerId).catch(err => {
          console.error("Failed updating credit pending:", err);
        });

        // Format and send confirmation ticket
        let summaryText = `✅บันทึกโพยสำเร็จ!✅\n`;
        summaryText += `------------------------\n`;

        const formattedDetailLines: string[] = [];
        if (senderPoyDisplay === 'full') {
          const entryGroups = new Map<string, any[]>();
          processedInserts.forEach((insert) => {
            const gid = insert.entry_id;
            if (gid) {
              if (!entryGroups.has(gid)) {
                entryGroups.set(gid, []);
              }
              entryGroups.get(gid)!.push(insert);
            }
          });

          entryGroups.forEach((group) => {
            const first = group[0];
            const count = group.length;
            const countSuffix = count > 1 ? ` (${count})` : '';
            formattedDetailLines.push(`${first.display_numbers}${countSuffix}`);
          });
        }

        const totalBaseAmount = processedInserts.reduce((sum, insert) => {
          const bt = insert.bet_type;
          const bonusPct = betTypeBonus[bt] || 0;
          const base = (bt !== '4_set' && bonusPct > 0)
            ? Math.round(insert.amount / (1 + bonusPct / 100))
            : insert.amount;
          return sum + base;
        }, 0);
        const totalBonusAmount = totalBetAmount - totalBaseAmount;

        if (returnedBets && returnedBets.length > 0) {
          const setPrice = activeRound?.set_prices?.['4_top'] || 120;
          const totalReturnedAmount = returnedBets.reduce((sum, rb) => sum + rb.amount, 0);
          const totalReturnedCount = returnedBets.reduce((sum, rb) => {
            if (isSetBasedLottery && (rb.betType === '4_set' || rb.betType === '4_top')) {
              return sum + Math.round(rb.amount / setPrice);
            }
            return sum + 1;
          }, 0);
          const originalTotalAmount = totalBaseAmount + totalReturnedAmount;

          const totalCommission = processedInserts.reduce((sum, insert) => sum + (Number(insert.commission_amount) || 0), 0);
          const netAmount = totalBetAmount - totalCommission;

          summaryText += `จำนวน: ${parsedBets.length} รายการ\n`;
          if (totalBonusAmount > 0) {
            summaryText += `ยอดแทง: ฿${totalBaseAmount.toLocaleString('th-TH')}\n`;
            summaryText += `ยอดแถม: ฿${totalBonusAmount.toLocaleString('th-TH')}\n`;
          } else {
            summaryText += `ยอดรวม: ฿${originalTotalAmount.toLocaleString('th-TH')}\n`;
          }
          summaryText += `คืนยอด: ${totalReturnedCount} รายการ\n`;
          summaryText += `ยอดคืน: ฿${totalReturnedAmount.toLocaleString('th-TH')}\n`;
          summaryText += `------------------------\n`;
          summaryText += `คงเหลือยอดส่ง: ฿${totalBetAmount.toLocaleString('th-TH')}\n`;
          summaryText += `ค่าคอม: ฿${totalCommission.toLocaleString('th-TH')}\n`;
          summaryText += `คงเหลือ: ฿${netAmount.toLocaleString('th-TH')}\n`;
          summaryText += `------------------------\n`;
          if (senderPoyDisplay === 'full' && formattedDetailLines.length > 0) {
            summaryText += formattedDetailLines.join('\n') + '\n';
            summaryText += `------------------------\n`;
          }

          // Group and summarize returned bets
          const groupedReturned = new Map<string, { numbers: string; betType: string; typeLabel: string; amount: number }>();
          returnedBets.forEach(rb => {
            const key = `${rb.numbers}|${rb.typeLabel}`;
            const existing = groupedReturned.get(key);
            if (existing) {
              existing.amount += rb.amount;
            } else {
              groupedReturned.set(key, { ...rb });
            }
          });

          summaryText += `⚠️ ยอดที่คืนสมาชิก:\n`;
          for (const rb of groupedReturned.values()) {
            const cleanTypeLabel = rb.typeLabel.replace(/\s+/g, '');
            if (isSetBasedLottery && (rb.betType === '4_set' || rb.betType === '4_top')) {
              const sets = Math.round(rb.amount / setPrice);
              summaryText += `${rb.numbers} (${cleanTypeLabel}) คืน: ${sets} ชุด=฿${rb.amount.toLocaleString('th-TH')}\n`;
            } else {
              summaryText += `${rb.numbers} (${cleanTypeLabel}) คืน: ฿${rb.amount.toLocaleString('th-TH')}\n`;
            }
          }
          summaryText = summaryText.trimEnd();
        } else {
          summaryText += `จำนวน: ${parsedBets.length} รายการ\n`;
          if (totalBonusAmount > 0) {
            summaryText += `ยอดแทง: ฿${totalBaseAmount.toLocaleString('th-TH')}\n`;
            summaryText += `ยอดแถม: ฿${totalBonusAmount.toLocaleString('th-TH')}\n`;
          } else {
            summaryText += `ยอดรวม: ฿${totalBetAmount.toLocaleString('th-TH')}\n`;
          }
          summaryText += `------------------------\n`;
          if (senderPoyDisplay === 'full' && formattedDetailLines.length > 0) {
            summaryText += formattedDetailLines.join('\n') + '\n';
            summaryText += `------------------------\n`;
          }
          summaryText = summaryText.trimEnd();
        }

        const cancelMsg = `/ยกเลิก ${billId}`;
        await sendLineReply(replyToken, [summaryText, cancelMsg]);
      }
      } catch (error: any) {
        console.error('Error handling loop event:', error);
        if (replyToken) {
          try {
            await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดของบอท: ${error.message || error}\n${error.stack || ''}`);
          } catch (sendErr) {
            console.error('Failed to send error reply:', sendErr);
          }
        }
      }
    }
    if (isProcessingQueue) {
      await supabase
        .from('line_webhook_queue')
        .update({ status: 'completed' })
        .eq('id', currentQueueId)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error('Error handling webhook event:', error);

    if (isProcessingQueue) {
      try {
        await supabase
          .from('line_webhook_queue')
          .update({ status: 'failed', error_message: error.message || String(error) })
          .eq('id', currentQueueId)
      } catch (dbErr) {
        console.error('Failed to update queue status on error:', dbErr);
      }
    }

    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
