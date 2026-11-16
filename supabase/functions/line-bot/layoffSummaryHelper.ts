// layoffSummaryHelper.ts
// Financial aggregation, winning calculation, and Flex Message formatting for Layoff (ตีออก) commands.

export interface WinningNumbersMap {
  '6_top'?: string;
  '4_set'?: string;
  '3_top'?: string;
  '3_tod'?: string;
  '3_bottom'?: string | string[];
  '3_front'?: string | string[];
  '2_top'?: string;
  '2_bottom'?: string;
  [key: string]: any;
}

export interface UpstreamConnection {
  id?: string;
  upstream_dealer_id?: string | null;
  upstream_name?: string;
  upstream_code?: string;
  is_linked?: boolean;
  is_active?: boolean;
  lottery_settings?: any;
  upstream_profile?: {
    id?: string;
    member_code?: string;
    full_name?: string;
    email?: string;
  } | null;
  [key: string]: any;
}

export interface LayoffDealerSummary {
  dealerKey: string;
  dealerName: string;
  dealerCode: string;
  totalBet: number;
  totalCommission: number;
  totalWin: number;
  winCount: number;
  ticketCount: number;
  net: number; // totalWin + totalCommission - totalBet
  winningTransfers: any[];
}

export interface LayoffOverallTotals {
  totalBet: number;
  totalCommission: number;
  totalWin: number;
  net: number;
  ticketCount: number;
  winCount: number;
  winningTransfers: any[];
}

export interface LayoffRoundInfo {
  lotteryName?: string;
  roundDate?: string;
  winningResultStr?: string;
  [key: string]: any;
}

export const DEFAULT_PAYOUTS: Record<string, number> = {
  'run_top': 3,
  'run_bottom': 4,
  'pak_top': 8,
  'pak_bottom': 6,
  'front_top_1': 8,
  'middle_top_1': 8,
  'back_top_1': 8,
  'front_bottom_1': 6,
  'back_bottom_1': 6,
  '2_top': 65,
  '2_back': 65,
  '2_bottom': 65,
  '2_front': 65,
  '2_front_single': 65,
  '2_center': 65,
  '2_spread': 65,
  '2_tang': 65,
  '2_run': 10,
  '2_have': 10,
  '2_teng': 10,
  '3_top': 550,
  '3_straight': 550,
  '3_tod': 100,
  '3_tod_single': 100,
  '3_bottom': 135,
  '3_front': 100,
  '3_back': 135,
  '4_float': 20,
  '4_tod': 100,
  '5_float': 10,
  '6_top': 1000000
};

export const DEFAULT_COMMISSION_RATES: Record<string, number> = {
  'run_top': 12,
  'run_bottom': 12,
  'pak_top': 12,
  'pak_bottom': 12,
  'front_top_1': 12,
  'middle_top_1': 12,
  'back_top_1': 12,
  'front_bottom_1': 12,
  'back_bottom_1': 12,
  '2_top': 28,
  '2_back': 28,
  '2_bottom': 28,
  '2_front': 28,
  '2_front_single': 28,
  '2_center': 28,
  '2_spread': 28,
  '2_tang': 28,
  '2_run': 28,
  '2_have': 28,
  '2_teng': 28,
  '3_top': 30,
  '3_straight': 30,
  '3_tod': 30,
  '3_tod_single': 30,
  '3_bottom': 30,
  '3_front': 30,
  '3_back': 30,
  '4_tod': 25,
  '4_set': 25,
  '4_float': 25,
  '5_float': 25,
  '6_top': 25
};

export const DEFAULT_4_SET_PRIZES: Record<string, number> = {
  '4_straight_set': 100000,
  '4_tod_set': 4000,
  '3_straight_set': 30000,
  '3_tod_set': 3000,
  '2_front_set': 1000,
  '2_back_set': 1000
};

export function getLotteryTypeKey(lotteryType: string): string {
  const lt = (lotteryType || '').toLowerCase();
  if (lt.includes('lao') || lt.includes('hanoi')) return 'lao';
  if (lt.includes('stock')) return 'stock';
  return 'thai';
}

export function normalizeBetType(betType: string): string {
  const ALIAS_MAP: Record<string, string> = {
    '2_spread': '2_center',
    '2_tang': '2_center',
    '2_teng': '2_run',
    '2_have': '2_run',
    '2_back': '2_top',
    '2_front_single': '2_front',
    '3_straight': '3_top',
    '3_tod_single': '3_tod',
    '1_top': 'run_top',
    '1_bottom': 'run_bottom'
  };
  return ALIAS_MAP[betType] || betType;
}

export function getBetTypeShortLabel(betType: string): string {
  const map: Record<string, string> = {
    '3_top': 'ตรง',
    '3_straight': 'ตรง',
    '3_tod': 'โต๊ด',
    '3_tod_single': 'โต๊ด',
    '3_bottom': '3 ล่าง',
    '3_front': '3 หน้า',
    '2_top': 'บน',
    '2_back': 'บน',
    '2_bottom': 'ล่าง',
    '2_front': '2 หน้า',
    '2_front_single': '2 หน้า',
    '2_center': '2 ถ่าง',
    '2_spread': '2 ถ่าง',
    '2_tang': '2 ถ่าง',
    '2_run': '2 ลอย',
    '2_have': '2 ลอย',
    '2_teng': '2 ลอย',
    'run_top': 'วิ่งบน',
    '1_top': 'วิ่งบน',
    'run_bottom': 'วิ่งล่าง',
    '1_bottom': 'วิ่งล่าง',
    'pak_top': 'ปักบน',
    'front_top_1': 'หน้าบน',
    'middle_top_1': 'กลางบน',
    'back_top_1': 'หลังบน',
    'pak_bottom': 'ปักล่าง',
    'front_bottom_1': 'หน้าล่าง',
    'back_bottom_1': 'หลังล่าง',
    '4_set': '4 ตัวชุด',
    '4_float': '4 ตัวลอย',
    '5_float': '5 ตัวลอย',
    '6_top': 'รางวัลที่ 1'
  };
  return map[betType] || betType;
}

/**
 * Evaluates 4 ตัวชุด prizes and returns highest prize amount.
 */
export function calculate4SetPrizes(betNumber: string, winningNumber: string, prizeSettings: Record<string, number> = DEFAULT_4_SET_PRIZES) {
  if (!betNumber || !winningNumber || betNumber.length !== 4 || winningNumber.length !== 4) {
    return { totalPrize: 0, prizeType: '' };
  }

  const prizes: { type: string; amount: number }[] = [];

  // 1. 4 ตัวตรงชุด
  if (betNumber === winningNumber) {
    prizes.push({ type: '4_straight_set', amount: prizeSettings['4_straight_set'] || 100000 });
  }

  // 2. 4 ตัวโต๊ดชุด
  const betSorted = betNumber.split('').sort().join('');
  const winSorted = winningNumber.split('').sort().join('');
  if (betSorted === winSorted && betNumber !== winningNumber) {
    prizes.push({ type: '4_tod_set', amount: prizeSettings['4_tod_set'] || 4000 });
  }

  // 3. 3 ตัวตรงชุด (last 3)
  if (betNumber.slice(1) === winningNumber.slice(1)) {
    prizes.push({ type: '3_straight_set', amount: prizeSettings['3_straight_set'] || 30000 });
  }

  // 4. 3 ตัวโต๊ดชุด (last 3 sorted)
  const betL3S = betNumber.slice(1).split('').sort().join('');
  const winL3S = winningNumber.slice(1).split('').sort().join('');
  if (betL3S === winL3S && betNumber.slice(1) !== winningNumber.slice(1)) {
    prizes.push({ type: '3_tod_set', amount: prizeSettings['3_tod_set'] || 3000 });
  }

  // 5. 2 ตัวหน้าชุด
  if (betNumber.slice(0, 2) === winningNumber.slice(0, 2)) {
    prizes.push({ type: '2_front_set', amount: prizeSettings['2_front_set'] || 1000 });
  }

  // 6. 2 ตัวหลังชุด
  if (betNumber.slice(2) === winningNumber.slice(2)) {
    prizes.push({ type: '2_back_set', amount: prizeSettings['2_back_set'] || 1000 });
  }

  if (prizes.length === 0) return { totalPrize: 0, prizeType: '' };
  prizes.sort((a, b) => b.amount - a.amount);
  return { totalPrize: prizes[0].amount, prizeType: prizes[0].type };
}

/**
 * Calculates commission earned for an upstream transfer ticket.
 */
export function calculateTransferCommission(
  transfer: any,
  upstreamConnection: any = null,
  lotteryType: string = 'thai',
  setPrice: number = 120
): number {
  if (transfer?.commission_earned !== undefined && transfer?.commission_earned !== null && Number(transfer.commission_earned) > 0) {
    return Number(transfer.commission_earned);
  }
  const amt = Number(transfer?.amount || 0);
  if (amt <= 0) return 0;

  const lKey = getLotteryTypeKey(lotteryType);
  const bt = normalizeBetType(transfer?.bet_type || '');

  const connSettings = upstreamConnection?.lottery_settings || upstreamConnection;
  const s = connSettings?.[lKey] || connSettings?.[lotteryType] || connSettings;
  const betSettings = s?.[bt] || s?.[transfer?.bet_type];

  if (bt === '4_set') {
    const sp = Number(betSettings?.setPrice || setPrice || 120);
    const numSets = Math.max(1, Math.floor(amt / sp));
    const commPerSet = betSettings?.commission !== undefined && betSettings?.commission !== null
      ? Number(betSettings.commission)
      : 25;
    return numSets * commPerSet;
  }

  if (betSettings?.commission !== undefined && betSettings?.commission !== null && !isNaN(Number(betSettings.commission))) {
    const rate = Number(betSettings.commission) / 100;
    return amt * rate;
  }

  const defaultRate = DEFAULT_COMMISSION_RATES[bt] ?? DEFAULT_COMMISSION_RATES[transfer?.bet_type] ?? 25;
  return amt * (defaultRate / 100);
}

/**
 * Checks whether an upstream transfer ticket is a winner against winning numbers and computes prize amount.
 */
export function calculateTransferWinning(
  transfer: any,
  winningNumbers: any,
  lotteryType: string = 'thai',
  setPrice: number = 120,
  setPrizes: any = null,
  upstreamConnection: any = null
): number {
  if (!transfer || !winningNumbers) return 0;

  const wn = winningNumbers;
  const lt = (lotteryType || transfer.lottery_type || 'thai').toLowerCase();
  const num = String(transfer.numbers || '').trim();
  const rawBt = transfer.bet_type || '';
  const bt = normalizeBetType(rawBt);
  const amt = Number(transfer.amount || 0);
  if (amt <= 0 || !num) return 0;

  const w6top = wn['6_top'] || wn['six_top'] || '';
  const w4set = wn['4_set'] || wn['four_set'] || '';
  let w3top = wn['3_top'] || wn['three_top'] || '';
  if (!w3top) {
    if (lt !== 'thai' && w4set.length >= 3) {
      w3top = w4set.slice(1);
    } else if (lt === 'thai' && w6top.length >= 3) {
      w3top = w6top.slice(-3);
    }
  }

  let w2top = wn['2_top'] || wn['two_top'] || '';
  if (!w2top) {
    if (w3top.length >= 2) {
      w2top = w3top.slice(-2);
    } else if (lt !== 'thai' && w4set.length >= 2) {
      w2top = w4set.slice(2);
    }
  }

  let w2bottom = wn['2_bottom'] || wn['two_bottom'] || '';
  if (!w2bottom && lt === 'lao' && w4set.length >= 2) {
    w2bottom = w4set.slice(0, 2);
  }

  const w3topSorted = w3top ? w3top.split('').sort().join('') : '';

  // 3_bottom in Thai lottery can be an array of strings or comma-separated string
  let w3bottomList: string[] = [];
  const raw3Bottom = wn['3_bottom'] || wn['three_bottom'];
  if (Array.isArray(raw3Bottom)) {
    w3bottomList = raw3Bottom.map(x => String(x).trim());
  } else if (typeof raw3Bottom === 'string' && raw3Bottom) {
    w3bottomList = raw3Bottom.split(',').map(x => x.trim());
  }

  // 3_front in Thai lottery
  let w3frontList: string[] = [];
  const raw3Front = wn['3_front'] || wn['three_front'];
  if (Array.isArray(raw3Front)) {
    w3frontList = raw3Front.map(x => String(x).trim());
  } else if (typeof raw3Front === 'string' && raw3Front) {
    w3frontList = raw3Front.split(',').map(x => x.trim());
  }

  const floatCheck = (src: string, target: string) => {
    let temp = target;
    for (const ch of src) {
      const idx = temp.indexOf(ch);
      if (idx === -1) return false;
      temp = temp.slice(0, idx) + temp.slice(idx + 1);
    }
    return true;
  };

  let isWinner = false;
  let customPrizeAmount = 0;

  // Resolve payout rate
  const lKey = getLotteryTypeKey(lt);
  const connSettings = upstreamConnection?.lottery_settings || upstreamConnection;
  const s = connSettings?.[lKey] || connSettings?.[lt] || connSettings;
  const betSettings = s?.[bt] || s?.[rawBt];

  let payoutRate = DEFAULT_PAYOUTS[bt] ?? DEFAULT_PAYOUTS[rawBt] ?? 0;
  if (betSettings?.payout !== undefined && betSettings?.payout !== null && !isNaN(Number(betSettings.payout))) {
    payoutRate = Number(betSettings.payout);
  }

  if ((bt === 'run_top' || rawBt === '1_top') && w3top && num.length === 1) {
    isWinner = w3top.includes(num);
  } else if ((bt === 'run_bottom' || rawBt === '1_bottom') && w2bottom && num.length === 1) {
    isWinner = w2bottom.includes(num);
  } else if (rawBt === 'front_top_1' && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[0];
  } else if (rawBt === 'middle_top_1' && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[1];
  } else if (rawBt === 'back_top_1' && w3top.length === 3 && num.length === 1) {
    isWinner = num === w3top[2];
  } else if (rawBt === 'front_bottom_1' && w2bottom.length === 2 && num.length === 1) {
    isWinner = num === w2bottom[0];
  } else if (rawBt === 'back_bottom_1' && w2bottom.length === 2 && num.length === 1) {
    isWinner = num === w2bottom[1];
  } else if (bt === 'pak_top' && w3top && num.length === 1) {
    isWinner = w3top.includes(num);
  } else if (bt === 'pak_bottom' && w2bottom && num.length === 1) {
    isWinner = w2bottom.includes(num);
  } else if ((bt === '2_top' || rawBt === '2_back') && w2top && num.length === 2) {
    isWinner = num === w2top;
  } else if (bt === '2_bottom' && w2bottom && num.length === 2) {
    isWinner = num === w2bottom;
  } else if ((bt === '2_front' || rawBt === '2_front_single') && w3top.length === 3 && num.length === 2) {
    isWinner = num === w3top.slice(0, 2);
  } else if ((bt === '2_center' || rawBt === '2_spread' || rawBt === '2_tang') && w3top.length === 3 && num.length === 2) {
    isWinner = num === (w3top[0] + w3top[2]);
  } else if ((bt === '2_run' || rawBt === '2_have' || rawBt === '2_teng') && w3top && num.length === 2) {
    isWinner = w3top.includes(num[0]) && w3top.includes(num[1]);
  } else if ((bt === '3_top' || rawBt === '3_straight') && w3top && num.length === 3) {
    isWinner = num === w3top;
  } else if ((bt === '3_tod' || rawBt === '3_tod_single') && w3top && num.length === 3) {
    isWinner = num.split('').sort().join('') === w3topSorted;
  } else if (bt === '3_bottom' && num.length === 3) {
    isWinner = w3bottomList.includes(num);
  } else if (bt === '3_front' && num.length === 3) {
    isWinner = w3frontList.includes(num);
  } else if (bt === '4_float' && w3top.length === 3 && num.length === 4) {
    isWinner = floatCheck(w3top, num);
  } else if (bt === '5_float' && w3top.length === 3 && num.length === 5) {
    isWinner = floatCheck(w3top, num);
  } else if (bt === '4_set' && w4set && num.length === 4) {
    const prizesConfig = betSettings?.prizes || setPrizes || DEFAULT_4_SET_PRIZES;
    const { totalPrize } = calculate4SetPrizes(num, w4set, prizesConfig);
    if (totalPrize > 0) {
      isWinner = true;
      customPrizeAmount = totalPrize;
    }
  } else if (bt === '6_top' && w6top && num.length === 6) {
    isWinner = num === w6top;
  }

  if (isWinner) {
    if (bt === '4_set') {
      const sp = Number(betSettings?.setPrice || setPrice || 120);
      const numSets = Math.max(1, Math.floor(amt / sp));
      return Math.round(customPrizeAmount * numSets);
    }
    return Math.round(amt * payoutRate);
  }

  return 0;
}

/**
 * Aggregates transfers per upstream dealer and overall totals.
 * Sorts `sortedDealers` by totalBet descending.
 */
export function calculateLayoffSummaries(
  transfers: any[] = [],
  upstreamConnections: UpstreamConnection[] = [],
  winningNumbers: any = null,
  lotteryType: string = 'thai',
  setPrice: number = 120,
  setPrizes: any = null
): { overallTotals: LayoffOverallTotals; sortedDealers: LayoffDealerSummary[] } {
  const dealerMap = new Map<string, LayoffDealerSummary>();

  const overallTotals: LayoffOverallTotals = {
    totalBet: 0,
    totalCommission: 0,
    totalWin: 0,
    net: 0,
    ticketCount: 0,
    winCount: 0,
    winningTransfers: []
  };

  for (const t of transfers || []) {
    const amt = Number(t.amount || 0);

    // Match upstream connection
    const tUpstreamId = t.upstream_dealer_id;
    const tDealerName = (t.target_dealer_name || t.dealerName || '').trim();

    const conn = (upstreamConnections || []).find((c: any) => {
      if (tUpstreamId && (c.upstream_dealer_id === tUpstreamId || c.id === tUpstreamId)) {
        return true;
      }
      const cName = (c.upstream_name || '').trim();
      return tDealerName && cName && tDealerName.toLowerCase() === cName.toLowerCase();
    });

    const dealerName = (conn?.upstream_name || tDealerName || conn?.upstream_profile?.full_name || 'ไม่ระบุเจ้ามือ').trim();
    const dealerCode = (conn?.upstream_code || conn?.upstream_profile?.member_code || '').trim();
    const dealerKey = conn?.id || conn?.upstream_code || dealerName;

    // Commission
    const comm = calculateTransferCommission(t, conn, lotteryType, setPrice);

    // Win amount
    const winAmt = calculateTransferWinning(t, winningNumbers, lotteryType, setPrice, setPrizes, conn);
    const isWinner = winAmt > 0;

    const transferWithDetails = {
      ...t,
      dealerName,
      dealerCode,
      commission_earned: comm,
      winAmount: winAmt,
      isWinner
    };

    if (!dealerMap.has(dealerKey)) {
      dealerMap.set(dealerKey, {
        dealerKey,
        dealerName,
        dealerCode,
        totalBet: 0,
        totalCommission: 0,
        totalWin: 0,
        winCount: 0,
        ticketCount: 0,
        net: 0,
        winningTransfers: []
      });
    }

    const dealerSummary = dealerMap.get(dealerKey)!;
    dealerSummary.totalBet += amt;
    dealerSummary.totalCommission += comm;
    dealerSummary.totalWin += winAmt;
    dealerSummary.ticketCount += 1;
    if (isWinner) {
      dealerSummary.winCount += 1;
      dealerSummary.winningTransfers.push(transferWithDetails);
      overallTotals.winCount += 1;
      overallTotals.winningTransfers.push(transferWithDetails);
    }

    overallTotals.totalBet += amt;
    overallTotals.totalCommission += comm;
    overallTotals.totalWin += winAmt;
    overallTotals.ticketCount += 1;
  }

  // Calculate net for each dealer: totalWin + totalCommission - totalBet
  const sortedDealers: LayoffDealerSummary[] = Array.from(dealerMap.values()).map(d => {
    return {
      ...d,
      net: Math.round((d.totalWin + d.totalCommission - d.totalBet) * 100) / 100
    };
  });

  // Sort descending by totalBet
  sortedDealers.sort((a, b) => b.totalBet - a.totalBet);

  // Overall net
  overallTotals.net = Math.round((overallTotals.totalWin + overallTotals.totalCommission - overallTotals.totalBet) * 100) / 100;

  return { overallTotals, sortedDealers };
}

/**
 * Builds full LINE Flex Message bubble JSON according to LINE Messaging API spec.
 */
export function generateLayoffSummaryFlex(
  overallTotals: LayoffOverallTotals,
  sortedDealers: LayoffDealerSummary[],
  roundInfo: LayoffRoundInfo = {}
): any {
  const lotteryTitle = roundInfo.lotteryName || 'หวย';
  const roundDate = roundInfo.roundDate || '-';
  const winningResultStr = roundInfo.winningResultStr;

  // Header contents
  const headerContents: any[] = [
    {
      type: 'text',
      text: `📤 สรุปตีออก (${lotteryTitle})`,
      weight: 'bold',
      size: 'md',
      color: '#ffffff'
    },
    {
      type: 'text',
      text: `งวดวันที่: ${roundDate}`,
      size: 'xs',
      color: '#c7d2fe',
      margin: 'xs'
    }
  ];

  if (winningResultStr) {
    headerContents.push({
      type: 'text',
      text: `🎉 เลขที่ออก: ${winningResultStr}`,
      size: 'sm',
      weight: 'bold',
      color: '#fef08a',
      margin: 'xs'
    });
  }

  // Section 1: Overview
  const netProfit = Math.round(overallTotals.net);
  const isNetPositive = netProfit > 0;
  const isNetNegative = netProfit < 0;

  const netBannerBg = isNetPositive ? '#ecfdf5' : isNetNegative ? '#fef2f2' : '#f1f5f9';
  const netBannerBorder = isNetPositive ? '#a7f3d0' : isNetNegative ? '#fecaca' : '#cbd5e1';
  const netBannerColor = isNetPositive ? '#059669' : isNetNegative ? '#dc2626' : '#475569';
  const netBannerText = isNetPositive
    ? `กำไรสุทธิรวม: +฿${netProfit.toLocaleString('th-TH')}`
    : isNetNegative
      ? `กำไรสุทธิรวม: -฿${Math.abs(netProfit).toLocaleString('th-TH')}`
      : `กำไรสุทธิรวม: ฿0 (เสมอ)`;

  const overviewBox: any = {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#f8fafc',
    cornerRadius: 'md',
    paddingAll: 'md',
    margin: 'sm',
    borderColor: '#e2e8f0',
    borderWidth: '1px',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `ยอดตีออก (${overallTotals.ticketCount} รายการ):`, size: 'xs', color: '#64748b', flex: 6 },
          { type: 'text', text: `฿${Math.round(overallTotals.totalBet).toLocaleString('th-TH')}`, size: 'xs', weight: 'bold', color: '#1e293b', align: 'end', flex: 6 }
        ]
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: 'ค่าคอมมิชชั่น:', size: 'xs', color: '#64748b', flex: 6 },
          { type: 'text', text: `฿${Math.round(overallTotals.totalCommission).toLocaleString('th-TH')}`, size: 'xs', color: '#475569', align: 'end', flex: 6 }
        ]
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: 'ยอดสุทธิส่ง (หักคอม):', size: 'xs', color: '#64748b', flex: 6 },
          { type: 'text', text: `฿${Math.round(overallTotals.totalBet - overallTotals.totalCommission).toLocaleString('th-TH')}`, size: 'xs', color: '#475569', align: 'end', flex: 6 }
        ]
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: 'รับ (เงินรางวัล):', size: 'xs', color: '#64748b', flex: 6 },
          {
            type: 'text',
            text: `฿${Math.round(overallTotals.totalWin).toLocaleString('th-TH')}`,
            size: 'xs',
            weight: 'bold',
            color: overallTotals.totalWin > 0 ? '#059669' : '#64748b',
            align: 'end',
            flex: 6
          }
        ]
      },
      {
        type: 'separator',
        margin: 'sm',
        color: '#e2e8f0'
      },
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: netBannerBg,
        cornerRadius: 'sm',
        paddingAll: 'sm',
        margin: 'sm',
        borderColor: netBannerBorder,
        borderWidth: '1px',
        alignItems: 'center',
        contents: [
          {
            type: 'text',
            text: netBannerText,
            weight: 'bold',
            size: 'sm',
            color: netBannerColor
          }
        ]
      }
    ]
  };

  // Section 2: Dealer list (limit to 15 to stay safely under 30KB LINE Flex limit)
  const dealerCards: any[] = [];
  const displayDealers = sortedDealers.slice(0, 15);

  if (displayDealers.length === 0) {
    dealerCards.push({
      type: 'box',
      layout: 'vertical',
      paddingAll: 'md',
      alignItems: 'center',
      contents: [
        { type: 'text', text: 'ไม่มีรายการตีออกในงวดนี้ค่ะ', size: 'sm', color: '#94a3b8' }
      ]
    });
  } else {
    displayDealers.forEach((dealer, idx) => {
      const net = Math.round(dealer.net);
      const isPos = net > 0;
      const isNeg = net < 0;

      const badgeBg = isPos ? '#ecfdf5' : isNeg ? '#fef2f2' : '#f1f5f9';
      const badgeColor = isPos ? '#059669' : isNeg ? '#dc2626' : '#64748b';
      const badgeText = isPos
        ? `ต้องเก็บ ฿${net.toLocaleString('th-TH')}`
        : isNeg
          ? `ต้องจ่าย ฿${Math.abs(net).toLocaleString('th-TH')}`
          : 'เสมอ';

      const codeStr = dealer.dealerCode ? ` (${dealer.dealerCode})` : '';

      dealerCards.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ffffff',
        cornerRadius: 'md',
        paddingAll: 'md',
        margin: 'sm',
        borderColor: '#e2e8f0',
        borderWidth: '1px',
        contents: [
          // Row 1: Header name + Net badge
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: `${idx + 1}. คุณ ${dealer.dealerName}${codeStr}`,
                weight: 'bold',
                size: 'sm',
                color: '#1e293b',
                flex: 7,
                wrap: true
              },
              {
                type: 'box',
                layout: 'horizontal',
                backgroundColor: badgeBg,
                cornerRadius: 'sm',
                paddingStart: 'sm',
                paddingEnd: 'sm',
                paddingTop: 'xs',
                paddingBottom: 'xs',
                contents: [
                  {
                    type: 'text',
                    text: badgeText,
                    size: 'xs',
                    weight: 'bold',
                    color: badgeColor
                  }
                ]
              }
            ]
          },
          {
            type: 'separator',
            margin: 'sm',
            color: '#f1f5f9'
          },
          // Sub row 1: ตีออก | เหลือ
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: `ตีออก: ฿${Math.round(dealer.totalBet).toLocaleString('th-TH')}`,
                size: 'xs',
                color: '#475569',
                flex: 1
              },
              {
                type: 'text',
                text: `เหลือ: ฿${Math.round(dealer.totalBet - dealer.totalCommission).toLocaleString('th-TH')}`,
                size: 'xs',
                color: '#475569',
                align: 'end',
                flex: 1
              }
            ]
          },
          // Sub row 2: คอม | ถูก
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
              {
                type: 'text',
                text: `คอม: ฿${Math.round(dealer.totalCommission).toLocaleString('th-TH')}`,
                size: 'xs',
                color: '#64748b',
                flex: 1
              },
              {
                type: 'text',
                text: `ถูก: ${dealer.winCount} ครั้ง/฿${Math.round(dealer.totalWin).toLocaleString('th-TH')}`,
                size: 'xs',
                color: dealer.totalWin > 0 ? '#059669' : '#64748b',
                weight: dealer.totalWin > 0 ? 'bold' : 'regular',
                align: 'end',
                flex: 1
              }
            ]
          }
        ]
      });
    });

    if (sortedDealers.length > 15) {
      dealerCards.push({
        type: 'text',
        text: `...และอีก ${sortedDealers.length - 15} เจ้ามือ (พิมพ์ /สรุปตีออก [id] เพื่อดูเจาะจง)`,
        size: 'xxs',
        color: '#94a3b8',
        align: 'center',
        margin: 'sm'
      });
    }
  }

  const bubbleContents = [
    {
      type: 'text',
      text: '1. ภาพรวมการตีออก',
      weight: 'bold',
      size: 'sm',
      color: '#0f172a'
    },
    overviewBox,
    {
      type: 'text',
      text: '2. รายละเอียดเจ้ามือตีออก',
      weight: 'bold',
      size: 'sm',
      color: '#0f172a',
      margin: 'lg'
    },
    ...dealerCards
  ];

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#4f46e5',
      paddingAll: 'lg',
      contents: headerContents
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f8fafc',
      paddingAll: 'md',
      contents: bubbleContents
    }
  };
}

/**
 * Builds targeted single-dealer LINE Flex Message bubble JSON for `/สรุปตีออก [id]`.
 */
export function generateTargetedLayoffSummaryFlex(
  targetDealer: LayoffDealerSummary,
  roundInfo: LayoffRoundInfo = {}
): any {
  const lotteryTitle = roundInfo.lotteryName || 'หวย';
  const roundDate = roundInfo.roundDate || '-';
  const winningResultStr = roundInfo.winningResultStr;

  const headerContents: any[] = [
    {
      type: 'text',
      text: `📤 สรุปตีออก - คุณ ${targetDealer.dealerName}`,
      weight: 'bold',
      size: 'md',
      color: '#ffffff'
    },
    {
      type: 'text',
      text: `งวดวันที่: ${roundDate} (${lotteryTitle})`,
      size: 'xs',
      color: '#c7d2fe',
      margin: 'xs'
    }
  ];

  if (winningResultStr) {
    headerContents.push({
      type: 'text',
      text: `🎉 เลขที่ออก: ${winningResultStr}`,
      size: 'sm',
      weight: 'bold',
      color: '#fef08a',
      margin: 'xs'
    });
  }

  const net = Math.round(targetDealer.net);
  const isPos = net > 0;
  const isNeg = net < 0;

  const badgeBg = isPos ? '#ecfdf5' : isNeg ? '#fef2f2' : '#f1f5f9';
  const badgeBorder = isPos ? '#a7f3d0' : isNeg ? '#fecaca' : '#cbd5e1';
  const badgeColor = isPos ? '#059669' : isNeg ? '#dc2626' : '#475569';
  const badgeText = isPos
    ? `ต้องเก็บ ฿${net.toLocaleString('th-TH')}`
    : isNeg
      ? `ต้องจ่าย ฿${Math.abs(net).toLocaleString('th-TH')}`
      : 'เสมอ ฿0';

  const bodyContents: any[] = [
    {
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: `คุณ ${targetDealer.dealerName}`,
          weight: 'bold',
          size: 'md',
          color: '#1e293b',
          flex: 8
        },
        ...(targetDealer.dealerCode ? [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#fef3c7',
            cornerRadius: 'sm',
            paddingStart: 'sm',
            paddingEnd: 'sm',
            paddingTop: 'xs',
            paddingBottom: 'xs',
            contents: [
              {
                type: 'text',
                text: `ID: ${targetDealer.dealerCode}`,
                size: 'xs',
                weight: 'bold',
                color: '#d97706'
              }
            ]
          }
        ] : [])
      ]
    },
    {
      type: 'separator',
      margin: 'sm',
      color: '#e2e8f0'
    },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `ยอดส่งตีออก (${targetDealer.ticketCount} รายการ):`, size: 'sm', color: '#64748b', flex: 7 },
            { type: 'text', text: `฿${Math.round(targetDealer.totalBet).toLocaleString('th-TH')}`, size: 'sm', weight: 'bold', color: '#1e293b', align: 'end', flex: 5 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: 'ค่าคอมมิชชั่น:', size: 'sm', color: '#64748b', flex: 7 },
            { type: 'text', text: `฿${Math.round(targetDealer.totalCommission).toLocaleString('th-TH')}`, size: 'sm', color: '#475569', align: 'end', flex: 5 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: 'ยอดสุทธิส่ง (หักคอม):', size: 'sm', color: '#64748b', flex: 7 },
            { type: 'text', text: `฿${Math.round(targetDealer.totalBet - targetDealer.totalCommission).toLocaleString('th-TH')}`, size: 'sm', color: '#475569', align: 'end', flex: 5 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: 'ยอดถูกรางวัล:', size: 'sm', color: '#64748b', flex: 5 },
            {
              type: 'text',
              text: `ถูก ${targetDealer.winCount} ครั้ง / ฿${Math.round(targetDealer.totalWin).toLocaleString('th-TH')}`,
              size: 'sm',
              weight: 'bold',
              color: targetDealer.totalWin > 0 ? '#059669' : '#64748b',
              align: 'end',
              flex: 7
            }
          ]
        }
      ]
    },
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: badgeBg,
      cornerRadius: 'md',
      paddingAll: 'md',
      margin: 'lg',
      borderColor: badgeBorder,
      borderWidth: '1px',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: `สถานะสุทธิ: ${badgeText}`,
          weight: 'bold',
          size: 'md',
          color: badgeColor
        }
      ]
    }
  ];

  if (targetDealer.winningTransfers && targetDealer.winningTransfers.length > 0) {
    const winItems: any[] = [];
    targetDealer.winningTransfers.slice(0, 5).forEach((t: any) => {
      const typeLabel = getBetTypeShortLabel(t.bet_type);
      winItems.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: `• ${t.numbers}=${t.amount} (${typeLabel})`, size: 'xs', color: '#334155', flex: 7 },
          { type: 'text', text: `฿${Math.round(t.winAmount).toLocaleString('th-TH')}`, size: 'xs', weight: 'bold', color: '#059669', align: 'end', flex: 5 }
        ]
      });
    });

    bodyContents.push(
      {
        type: 'text',
        text: '🏆 รายการที่ถูกรางวัล (ตัวอย่าง):',
        size: 'xs',
        weight: 'bold',
        color: '#059669',
        margin: 'md'
      },
      ...winItems
    );
  }

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#4f46e5',
      paddingAll: 'lg',
      contents: headerContents
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#ffffff',
      paddingAll: 'md',
      contents: bodyContents
    }
  };
}

/**
 * Formats text message listing winning transferred bets for `/โพยตีออกถูก` and `/โพยตีออกถูก [id]`.
 */
export function formatLayoffWinningBetsMessage(
  winningTransfers: any[] = [],
  targetDealer: any = null,
  roundInfo: LayoffRoundInfo = {}
): string {
  let filtered = winningTransfers || [];
  if (targetDealer) {
    const code = (targetDealer.dealerCode || '').trim().toLowerCase();
    const name = (targetDealer.dealerName || '').trim().toLowerCase();
    filtered = filtered.filter(t => {
      const tCode = (t.dealerCode || '').trim().toLowerCase();
      const tName = (t.dealerName || t.target_dealer_name || '').trim().toLowerCase();
      if (code && code !== '-' && tCode === code) return true;
      if (name && tName === name) return true;
      return false;
    });
  }

  if (filtered.length === 0) {
    return '🎉 ไม่มีรายการตีออกที่ถูกรางวัลในงวดนี้ค่ะ';
  }

  const lines: string[] = [];
  lines.push('🏆 รายการตีออกที่ถูกรางวัล');
  if (roundInfo.lotteryName) {
    lines.push(`ประเภท: ${roundInfo.lotteryName}`);
  }
  if (roundInfo.roundDate) {
    lines.push(`งวดวันที่: ${roundInfo.roundDate}`);
  }
  if (roundInfo.winningResultStr) {
    lines.push(`🎯 ผลรางวัล: ${roundInfo.winningResultStr}`);
  }
  lines.push('-----------------------');

  // Group by dealer
  const dealerGroups = new Map<string, any[]>();
  for (const t of filtered) {
    const dName = t.dealerName || t.target_dealer_name || 'ไม่ระบุเจ้ามือ';
    const dCode = t.dealerCode || '-';
    const key = `${dName}__${dCode}`;
    if (!dealerGroups.has(key)) {
      dealerGroups.set(key, []);
    }
    dealerGroups.get(key)!.push(t);
  }

  let totalWinPrize = 0;
  for (const [key, items] of dealerGroups.entries()) {
    const [dName, dCode] = key.split('__');
    const codeDisplay = dCode && dCode !== '-' ? ` (${dCode})` : '';
    lines.push(`[เจ้ามือ: ${dName}${codeDisplay}]`);
    for (const item of items) {
      const typeLabel = getBetTypeShortLabel(item.bet_type);
      const winAmt = Number(item.winAmount || item.winnings || 0);
      totalWinPrize += winAmt;
      lines.push(`- ${item.numbers}=${item.amount} (${typeLabel}) [ถูกรางวัล: ฿${Math.round(winAmt).toLocaleString('th-TH')}]`);
    }
  }

  lines.push('-----------------------');
  lines.push(`รวมถูกรางวัลทั้งหมด: ${filtered.length} รายการ`);
  lines.push(`💰 ยอดรวมรางวัล: ฿${Math.round(totalWinPrize).toLocaleString('th-TH')}`);

  return lines.join('\n');
}

export interface ParsedLayoffCommand {
  type: 'summary' | 'winning';
  targetId: string;
}

export function parseLayoffCommand(text: string): ParsedLayoffCommand | null {
  const trimmed = (text || '').trim();
  if (/^\/สรุปตีออก(?:[\/\s]+.*)?$/i.test(trimmed)) {
    const rawTarget = trimmed.replace(/^\/สรุปตีออก[\/\s]*/, '').trim();
    const targetId = rawTarget.replace(/^[\[\(]|[\)\]]$/g, '').trim();
    return { type: 'summary', targetId };
  }
  if (/^\/โพยตีออก(?:\s*[\/\s]?\s*ถูก)?(?:[\/\s]+.*)?$/i.test(trimmed)) {
    let remainder = trimmed.replace(/^\/โพยตีออก/, '').trim();
    if (remainder.startsWith('/') || remainder.startsWith(' ')) {
      remainder = remainder.replace(/^[\/\s]+/, '');
    }
    if (remainder.startsWith('ถูก')) {
      remainder = remainder.substring('ถูก'.length).trim();
    }
    if (remainder.startsWith('/') || remainder.startsWith(' ')) {
      remainder = remainder.replace(/^[\/\s]+/, '');
    }
    const targetId = remainder.replace(/^[\[\(]|[\)\]]$/g, '').trim();
    return { type: 'winning', targetId };
  }
  return null;
}

export function checkLayoffAuthorization(
  senderProfile: { id?: string; role?: string } | null,
  targetDealerId: string | null,
  isManagerSender: boolean
): boolean {
  if (!senderProfile && !isManagerSender) return false;
  const isDealer = senderProfile?.id === targetDealerId || senderProfile?.role === 'dealer';
  const isAdmin = senderProfile?.role === 'superadmin' || senderProfile?.role === 'admin';
  return Boolean(isDealer || isAdmin || isManagerSender);
}

