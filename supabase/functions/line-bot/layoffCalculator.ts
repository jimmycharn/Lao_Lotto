export interface WinNums {
  w6top: string;
  w4set: string;
  w3top: string;
  w3topSorted: string;
  w2top: string;
  w2front: string;
  w2center: string;
  w2bottom: string;
}

export interface BetItem {
  bet_type: string;
  numbers: string;
  total_amount: number;
  transferred: number;
  net_amount: number;
  payout_rate: number;
  set_prizes: any;
  set_price?: number;
  num_sets?: number;
  total_commission: number;
  net_commission: number;
  details: { user_id: string; amount: number }[];
}

export interface Scenario {
  winning_number: string;
  label?: string;
  total_payout: number;
  net: number;
  affected_bets: {
    bet_type: string;
    numbers: string;
    net_amount: number;
    payout: number;
    set_price?: number;
    num_sets?: number;
  }[];
}

export interface Recommendation {
  bet_type: string;
  numbers: string;
  current_amount: number;
  transfer_amount: number;
  keep_amount: number;
  reason: string;
}

export const DEFAULT_PAYOUTS: Record<string, number> = {
  'run_top': 3, 'run_bottom': 4,
  'pak_top': 8, 'pak_bottom': 6,
  'front_top_1': 8, 'middle_top_1': 8, 'back_top_1': 8,
  'front_bottom_1': 6, 'back_bottom_1': 6,
  '2_top': 65, '2_front': 65, '2_center': 65, '2_run': 10, '2_bottom': 65,
  '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
  '4_float': 20, '4_tod': 100, '5_float': 10, '6_top': 1000000
};

export const DEFAULT_COMMISSIONS: Record<string, number> = {
  'run_top': 10, 'run_bottom': 10,
  'pak_top': 15, 'pak_bottom': 15,
  'front_top_1': 15, 'middle_top_1': 15, 'back_top_1': 15,
  'front_bottom_1': 15, 'back_bottom_1': 15,
  '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
  '3_top': 30, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
  '4_tod': 15, '4_set': 15, '4_float': 15, '5_float': 15, '6_top': 15
};

export function deriveWinningNumbers(primaryNumber: string, lotteryType: string, bottomNumber = ''): WinNums {
  const lt = lotteryType;
  const result: WinNums = {
    w6top: '',
    w4set: '',
    w3top: '',
    w3topSorted: '',
    w2top: '',
    w2front: '',
    w2center: '',
    w2bottom: '',
  };

  if (lt === 'thai') {
    if (primaryNumber.length === 6) {
      result.w6top = primaryNumber;
      result.w3top = primaryNumber.slice(3);
      result.w2top = result.w3top.slice(1);
      result.w2front = result.w3top.slice(0, 2);
      result.w2center = result.w3top[0] + result.w3top[2];
    } else if (primaryNumber.length === 3) {
      result.w3top = primaryNumber;
      result.w2top = primaryNumber.slice(1);
      result.w2front = primaryNumber.slice(0, 2);
      result.w2center = primaryNumber[0] + primaryNumber[2];
    }
    result.w2bottom = bottomNumber || '';
    result.w3topSorted = result.w3top.split('').sort().join('');
  } else if (lt === 'lao' || lt === 'hanoi') {
    if (primaryNumber.length === 4) {
      result.w4set = primaryNumber;
      result.w3top = primaryNumber.slice(1);
      result.w2top = result.w3top.slice(1);
      result.w2front = result.w3top.slice(0, 2);
      result.w2center = result.w3top[0] + result.w3top[2];
      if (lt === 'lao') {
        result.w2bottom = primaryNumber.slice(0, 2);
      }
    }
    result.w3topSorted = result.w3top.split('').sort().join('');
  } else if (lt === 'stock') {
    if (primaryNumber.length === 2) {
      result.w2top = primaryNumber;
    }
  }

  return result;
}

export function calculate4SetPrizes(betNumber: string, winningNumber: string, prizeSettings: any) {
  if (!betNumber || !winningNumber || betNumber.length !== 4 || winningNumber.length !== 4) {
    return { prizes: [], totalPrize: 0 };
  }
  const settings = prizeSettings || {
    '4_straight_set': 100000,
    '4_tod_set': 4000,
    '3_straight_set': 30000,
    '3_tod_set': 3000,
    '2_front_set': 1000,
    '2_back_set': 1000
  };
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

export function checkBetWin(
  betType: string,
  betNumbers: string,
  winNums: WinNums,
  payoutRate: number,
  amount: number,
  setPrice: number,
  setPrizes: any
): { wins: boolean; payout: number } {
  const bt = betType;
  const num = betNumbers;
  const { w6top, w4set, w3top, w3topSorted, w2top, w2front, w2center, w2bottom } = winNums;

  const floatCheck = (src: string, target: string): boolean => {
    let temp = target;
    for (const ch of src) {
      const idx = temp.indexOf(ch);
      if (idx === -1) return false;
      temp = temp.slice(0, idx) + temp.slice(idx + 1);
    }
    return true;
  };

  if (bt === '6_top' && num.length === 6 && w6top) {
    if (num === w6top) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '4_set' && num.length === 4 && w4set) {
    const { totalPrize } = calculate4SetPrizes(num, w4set, setPrizes);
    if (totalPrize > 0) {
      const numSets = Math.floor(amount / (setPrice || 120));
      return { wins: true, payout: numSets * totalPrize };
    }
    return { wins: false, payout: 0 };
  }

  if (bt === '5_float' && num.length === 5 && w3top && w3top.length === 3) {
    if (floatCheck(w3top, num)) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '4_float' && num.length === 4 && w3top && w3top.length === 3) {
    if (floatCheck(w3top, num)) return { wins: true, payout: amount * payoutRate };
  }

  if ((bt === '3_top' || bt === '3_straight') && num.length === 3 && w3top) {
    if (num === w3top) return { wins: true, payout: amount * payoutRate };
  }

  if ((bt === '3_tod' || bt === '3_tod_single') && num.length === 3 && w3top) {
    const numSorted = num.split('').sort().join('');
    if (numSorted === w3topSorted && num !== w3top) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '2_top' && num.length === 2 && w2top) {
    if (num === w2top) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '2_bottom' && num.length === 2 && w2bottom) {
    if (num === w2bottom) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '2_front' && num.length === 2 && w3top && w3top.length === 3) {
    if (num === w2front) return { wins: true, payout: amount * payoutRate };
  }

  if ((bt === '2_center' || bt === '2_spread') && num.length === 2 && w3top && w3top.length === 3) {
    if (num === w2center) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === '2_run' && num.length === 2 && w3top && w3top.length === 3) {
    if (w3top.includes(num[0]) && w3top.includes(num[1])) {
      return { wins: true, payout: amount * payoutRate };
    }
  }

  if (bt === 'run_top' && num.length === 1 && w3top) {
    if (w3top.includes(num)) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'run_bottom' && num.length === 1 && w2bottom) {
    if (w2bottom.includes(num)) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'pak_top' && num.length === 1 && w3top && w3top.length === 3) {
    if (w3top.includes(num)) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'pak_bottom' && num.length === 1 && w2bottom && w2bottom.length === 2) {
    if (w2bottom.includes(num)) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'front_top_1' && num.length === 1 && w3top && w3top.length === 3) {
    if (num === w3top[0]) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'middle_top_1' && num.length === 1 && w3top && w3top.length === 3) {
    if (num === w3top[1]) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'back_top_1' && num.length === 1 && w3top && w3top.length === 3) {
    if (num === w3top[2]) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'front_bottom_1' && num.length === 1 && w2bottom && w2bottom.length === 2) {
    if (num === w2bottom[0]) return { wins: true, payout: amount * payoutRate };
  }

  if (bt === 'back_bottom_1' && num.length === 1 && w2bottom && w2bottom.length === 2) {
    if (num === w2bottom[1]) return { wins: true, payout: amount * payoutRate };
  }

  return { wins: false, payout: 0 };
}

export function getPermutations(str: string): string[] {
  if (str.length <= 1) return [str];
  const result: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const rest = str.slice(0, i) + str.slice(i + 1);
    for (const perm of getPermutations(rest)) {
      result.push(str[i] + perm);
    }
  }
  return [...new Set(result)];
}

function getLotteryTypeKey(lotteryType: string): string {
  if (lotteryType === 'thai') return 'thai';
  if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao';
  if (lotteryType === 'stock') return 'stock';
  return 'thai';
}

function getCommissionRate(betType: string, userId: string, lotteryType: string, userSettingsMap: any): number {
  const lotteryKey = getLotteryTypeKey(lotteryType);
  const settingsKey = getSettingsKey(betType, lotteryKey);
  const settings = userSettingsMap?.[userId]?.[lotteryKey]?.[settingsKey];
  if (settings?.commission !== undefined) return settings.commission;
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    const LAO_DEFAULTS: Record<string, number> = {
      'run_top': 10, 'run_bottom': 10,
      'pak_top': 20, 'pak_bottom': 20,
      '2_top': 20, '2_bottom': 20, '2_front': 20, '2_center': 20, '2_spread': 20, '2_run': 20,
      '3_top': 20, '3_tod': 20, '3_bottom': 20,
      '4_top': 25, '4_set': 25, '4_float': 20,
      '5_float': 20
    };
    return LAO_DEFAULTS[betType] !== undefined ? LAO_DEFAULTS[betType] : 20;
  }
  return DEFAULT_COMMISSIONS[betType] || 15;
}

function getPayoutRate(betType: string, userId: string, lotteryType: string, userSettingsMap: any): number {
  const lotteryKey = getLotteryTypeKey(lotteryType);
  const settingsKey = getSettingsKey(betType, lotteryKey);
  const settings = userSettingsMap?.[userId]?.[lotteryKey]?.[settingsKey];
  if (settings?.payout !== undefined) return settings.payout;
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    if (['2_top', '2_front', '2_center', '2_spread', '2_bottom'].includes(betType)) {
      return 70;
    }
  }
  return DEFAULT_PAYOUTS[betType] || 1;
}

function getSetPrizes(userId: string, lotteryType: string, userSettingsMap: any) {
  const lotteryKey = getLotteryTypeKey(lotteryType);
  const settings = userSettingsMap?.[userId]?.[lotteryKey]?.['4_set'];
  if (settings?.prizes) return settings.prizes;
  return {
    '4_straight_set': 100000,
    '4_tod_set': 4000,
    '3_straight_set': 30000,
    '3_tod_set': 3000,
    '2_front_set': 1000,
    '2_back_set': 1000
  };
}

function getSettingsKey(betType: string, lotteryKey: string): string {
  if (betType === '4_set') return '4_set';
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    const LAO_MAP: Record<string, string> = { '3_top': '3_straight', '3_tod': '3_tod_single' };
    return LAO_MAP[betType] || betType;
  }
  return betType;
}

export function buildBetItems(submissions: any[], transfers: any[], userSettingsMap: any, lotteryType: string, setPrice = 120): BetItem[] {
  const transferredMap: Record<string, number> = {};
  (transfers || []).forEach(t => {
    const key = `${t.bet_type}|${t.numbers}`;
    transferredMap[key] = (transferredMap[key] || 0) + (t.amount || 0);
  });

  const groups: Record<string, { bet_type: string; numbers: string; total_amount: number; details: { user_id: string; amount: number }[] }> = {};
  (submissions || []).forEach(s => {
    const key = `${s.bet_type}|${s.numbers}`;
    if (!groups[key]) {
      groups[key] = {
        bet_type: s.bet_type,
        numbers: s.numbers,
        total_amount: 0,
        details: []
      };
    }
    groups[key].total_amount += s.amount || 0;
    groups[key].details.push({ user_id: s.user_id, amount: s.amount || 0 });
  });

  const betItems = Object.entries(groups).map(([key, g]) => {
    const transferred = transferredMap[key] || 0;
    const netAmount = Math.max(0, g.total_amount - transferred);

    let totalCommission = 0;
    g.details.forEach(d => {
      if (g.bet_type === '4_set') {
        const commRate = getCommissionRate('4_set', d.user_id, lotteryType, userSettingsMap);
        const numSets = Math.floor(d.amount / setPrice);
        totalCommission += numSets * commRate;
      } else {
        const commRate = getCommissionRate(g.bet_type, d.user_id, lotteryType, userSettingsMap);
        totalCommission += (d.amount || 0) * (commRate / 100);
      }
    });

    let payoutRate = DEFAULT_PAYOUTS[g.bet_type] || 1;
    let setPrizes = {
      '4_straight_set': 100000,
      '4_tod_set': 4000,
      '3_straight_set': 30000,
      '3_tod_set': 3000,
      '2_front_set': 1000,
      '2_back_set': 1000
    };
    if (g.bet_type === '4_set') {
      g.details.forEach(d => {
        const userPrizes = getSetPrizes(d.user_id, lotteryType, userSettingsMap);
        const maxPrize = Math.max(...Object.values(userPrizes).map(v => Number(v) || 0));
        const defaultMax = Math.max(...Object.values(setPrizes).map(v => Number(v) || 0));
        if (maxPrize > defaultMax) setPrizes = userPrizes;
      });
      payoutRate = 0;
    } else {
      g.details.forEach(d => {
        const p = getPayoutRate(g.bet_type, d.user_id, lotteryType, userSettingsMap);
        if (p > payoutRate) payoutRate = p;
      });
    }

    return {
      bet_type: g.bet_type,
      numbers: g.numbers,
      total_amount: g.total_amount,
      transferred,
      net_amount: netAmount,
      payout_rate: payoutRate,
      set_prizes: setPrizes,
      set_price: g.bet_type === '4_set' ? setPrice : undefined,
      num_sets: g.bet_type === '4_set' ? Math.floor(netAmount / setPrice) : undefined,
      total_commission: totalCommission,
      net_commission: transferred > 0
        ? totalCommission * (netAmount / g.total_amount)
        : totalCommission,
      details: g.details
    };
  }).filter(b => b.net_amount > 0);

  return betItems;
}

export function generateCandidateNumbers(betItems: BetItem[], lotteryType: string) {
  const candidates = new Set<string>();

  if (lotteryType === 'stock') {
    for (let i = 0; i < 100; i++) {
      candidates.add(i.toString().padStart(2, '0'));
    }
    return [...candidates];
  }

  if (lotteryType === 'thai') {
    const top3Candidates = new Set<string>();
    betItems.forEach(b => {
      if ((b.bet_type === '3_top' || b.bet_type === '3_straight') && b.numbers.length === 3) {
        top3Candidates.add(b.numbers);
      }
      if ((b.bet_type === '3_tod' || b.bet_type === '3_tod_single') && b.numbers.length === 3) {
        const perms = getPermutations(b.numbers);
        perms.forEach(p => top3Candidates.add(p));
      }
      if (b.bet_type === '2_top' && b.numbers.length === 2) {
        for (let d = 0; d <= 9; d++) {
          top3Candidates.add(d.toString() + b.numbers);
        }
      }
      if (b.bet_type === '2_front' && b.numbers.length === 2) {
        for (let d = 0; d <= 9; d++) {
          top3Candidates.add(b.numbers + d.toString());
        }
      }
      if ((b.bet_type === '2_center' || b.bet_type === '2_spread') && b.numbers.length === 2) {
        for (let d = 0; d <= 9; d++) {
          top3Candidates.add(b.numbers[0] + d.toString() + b.numbers[1]);
        }
      }
      if (b.bet_type === '4_float' && b.numbers.length === 4) {
        for (let i = 0; i < 4; i++) {
          const combo = b.numbers.slice(0, i) + b.numbers.slice(i + 1);
          const perms = getPermutations(combo);
          perms.forEach(p => top3Candidates.add(p));
        }
      }
      if (b.bet_type === '5_float' && b.numbers.length === 5) {
        const chars = b.numbers.split('');
        for (let i = 0; i < 5; i++) {
          for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
              const combo = chars[i] + chars[j] + chars[k];
              const perms = getPermutations(combo);
              perms.forEach(p => top3Candidates.add(p));
            }
          }
        }
      }
    });

    const bottom2Candidates = new Set<string>();
    betItems.forEach(b => {
      if (b.bet_type === '2_bottom' && b.numbers.length === 2) {
        bottom2Candidates.add(b.numbers);
      }
      if (b.bet_type === 'run_bottom' && b.numbers.length === 1) {
        for (let d = 0; d <= 9; d++) {
          bottom2Candidates.add(b.numbers + d.toString());
          bottom2Candidates.add(d.toString() + b.numbers);
        }
      }
      if ((b.bet_type === 'pak_bottom' || b.bet_type === 'front_bottom_1' || b.bet_type === 'back_bottom_1') && b.numbers.length === 1) {
        for (let d = 0; d <= 9; d++) {
          bottom2Candidates.add(b.numbers + d.toString());
          bottom2Candidates.add(d.toString() + b.numbers);
        }
      }
    });

    return {
      type: 'thai',
      top3: [...top3Candidates],
      bottom2: [...bottom2Candidates]
    };
  }

  betItems.forEach(b => {
    if (b.bet_type === '4_set' && b.numbers.length === 4) {
      candidates.add(b.numbers);
    }
  });

  betItems.forEach(b => {
    if ((b.bet_type === '3_top' || b.bet_type === '3_straight' || b.bet_type === '3_tod' || b.bet_type === '3_tod_single') && b.numbers.length === 3) {
      if (b.bet_type === '3_tod' || b.bet_type === '3_tod_single') {
        const perms = getPermutations(b.numbers);
        for (const p of perms) {
          for (let d = 0; d <= 9; d++) {
            candidates.add(d.toString() + p);
          }
        }
      } else {
        for (let d = 0; d <= 9; d++) {
          candidates.add(d.toString() + b.numbers);
        }
      }
    }
  });

  betItems.forEach(b => {
    if (b.bet_type === '2_top' && b.numbers.length === 2) {
      for (let a = 0; a <= 9; a++) {
        for (let c = 0; c <= 9; c++) {
          candidates.add(a.toString() + c.toString() + b.numbers);
        }
      }
    }
    if (b.bet_type === '2_bottom' && b.numbers.length === 2) {
      for (let c = 0; c <= 9; c++) {
        for (let d = 0; d <= 9; d++) {
          candidates.add(b.numbers + c.toString() + d.toString());
        }
      }
    }
  });

  let result = [...candidates];
  if (result.length > 5000) {
    result = result.filter(c =>
      betItems.some(b =>
        (b.bet_type === '4_set' && b.numbers === c) ||
        ((b.bet_type === '3_top' || b.bet_type === '3_straight') && c.slice(1) === b.numbers)
      )
    );
  }

  return result;
}

export function calculateScenarios(betItems: BetItem[], lotteryType: string, setPrice = 120): Scenario[] {
  const candidateData = generateCandidateNumbers(betItems, lotteryType);

  const totalIncome = betItems.reduce((sum, b) => sum + b.net_amount, 0);
  const totalCommission = betItems.reduce((sum, b) => sum + b.net_commission, 0);
  const baseProfit = totalIncome - totalCommission;

  const scenarios: Scenario[] = [];

  if (lotteryType === 'thai' && candidateData && typeof candidateData === 'object' && 'type' in candidateData && candidateData.type === 'thai') {
    const topScenarios: Scenario[] = [];
    for (const w3 of candidateData.top3) {
      const winNums = deriveWinningNumbers(w3, 'thai_3digit');
      winNums.w3top = w3;
      winNums.w3topSorted = w3.split('').sort().join('');
      winNums.w2top = w3.slice(1);
      winNums.w2front = w3.slice(0, 2);
      winNums.w2center = w3[0] + w3[2];

      let totalPayout = 0;
      const affected: Scenario['affected_bets'] = [];

      for (const bet of betItems) {
        if (bet.net_amount <= 0) continue;
        if (['2_bottom', 'run_bottom', 'pak_bottom', 'front_bottom_1', 'back_bottom_1'].includes(bet.bet_type)) continue;

        const result = checkBetWin(
          bet.bet_type, bet.numbers, winNums,
          bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
        );
        if (result.wins && result.payout > 0) {
          totalPayout += result.payout;
          affected.push({
            bet_type: bet.bet_type,
            numbers: bet.numbers,
            net_amount: bet.net_amount,
            payout: result.payout
          });
        }
      }

      if (affected.length > 0) {
        topScenarios.push({
          winning_number: w3,
          label: `3 ตัวบน: ${w3}`,
          total_payout: totalPayout,
          net: baseProfit - totalPayout,
          affected_bets: affected
        });
      }
    }

    const bottomScenarios: any[] = [];
    for (const w2b of candidateData.bottom2) {
      const winNums: any = {
        w6top: '', w4set: '', w3top: '', w3topSorted: '',
        w2top: '', w2front: '', w2center: '',
        w2bottom: w2b
      };

      let totalPayout = 0;
      const affected: Scenario['affected_bets'] = [];

      for (const bet of betItems) {
        if (bet.net_amount <= 0) continue;
        if (!['2_bottom', 'run_bottom', 'pak_bottom', 'front_bottom_1', 'back_bottom_1'].includes(bet.bet_type)) continue;

        const result = checkBetWin(
          bet.bet_type, bet.numbers, winNums,
          bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
        );
        if (result.wins && result.payout > 0) {
          totalPayout += result.payout;
          affected.push({
            bet_type: bet.bet_type,
            numbers: bet.numbers,
            net_amount: bet.net_amount,
            payout: result.payout
          });
        }
      }

      if (affected.length > 0) {
        bottomScenarios.push({
          winning_number: w2b,
          label: `2 ตัวล่าง: ${w2b}`,
          total_payout: totalPayout,
          affected_bets: affected
        });
      }
    }

    topScenarios.sort((a, b) => b.total_payout - a.total_payout);
    bottomScenarios.sort((a, b) => b.total_payout - a.total_payout);

    const worstBottom = bottomScenarios[0]?.total_payout || 0;

    for (const ts of topScenarios) {
      const combinedPayout = ts.total_payout + worstBottom;
      const combinedAffected = [...ts.affected_bets];
      if (worstBottom > 0 && bottomScenarios[0]) {
        combinedAffected.push(...bottomScenarios[0].affected_bets);
      }
      scenarios.push({
        winning_number: ts.winning_number,
        label: ts.label + (worstBottom > 0 ? ` + ล่าง ${bottomScenarios[0].winning_number}` : ''),
        total_payout: combinedPayout,
        net: baseProfit - combinedPayout,
        affected_bets: combinedAffected
      });
    }

    for (const bs of bottomScenarios) {
      scenarios.push({
        winning_number: bs.winning_number,
        label: bs.label,
        total_payout: bs.total_payout,
        net: baseProfit - bs.total_payout,
        affected_bets: bs.affected_bets
      });
    }
  } else {
    const candidates = Array.isArray(candidateData) ? candidateData : [];
    for (const winNum of candidates) {
      const winNums = deriveWinningNumbers(winNum, lotteryType);
      let totalPayout = 0;
      const affected: Scenario['affected_bets'] = [];

      for (const bet of betItems) {
        if (bet.net_amount <= 0) continue;

        const result = checkBetWin(
          bet.bet_type, bet.numbers, winNums,
          bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
        );
        if (result.wins && result.payout > 0) {
          totalPayout += result.payout;
          affected.push({
            bet_type: bet.bet_type,
            numbers: bet.numbers,
            net_amount: bet.net_amount,
            payout: result.payout
          });
        }
      }

      if (affected.length > 0) {
        scenarios.push({
          winning_number: winNum,
          label: winNum,
          total_payout: totalPayout,
          net: baseProfit - totalPayout,
          affected_bets: affected
        });
      }
    }
  }

  scenarios.push({
    winning_number: '-',
    label: 'ไม่มีใครถูก',
    total_payout: 0,
    net: baseProfit,
    affected_bets: []
  });

  const seen = new Set<string>();
  const unique = scenarios.filter(s => {
    const key = s.total_payout + '|' + s.affected_bets.map(a => `${a.bet_type}:${a.numbers}:${a.payout}`).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.net - b.net);

  return unique;
}

interface PayoutEntry {
  si: number;
  ppu: number;
  is4set: boolean;
}

function buildPayoutIndex(scenarios: Scenario[], setPrice: number): Record<string, PayoutEntry[]> {
  const index: Record<string, PayoutEntry[]> = {};
  scenarios.forEach((s, si) => {
    s.affected_bets.forEach(ab => {
      const key = `${ab.bet_type}|${ab.numbers}`;
      if (!index[key]) index[key] = [];
      const is4set = ab.bet_type === '4_set';
      let ppu = 0;
      if (is4set) {
        const numSets = Math.floor(ab.net_amount / setPrice);
        ppu = numSets > 0 ? ab.payout / numSets : 0;
      } else {
        ppu = ab.net_amount > 0 ? ab.payout / ab.net_amount : 0;
      }
      index[key].push({ si, ppu, is4set });
    });
  });
  return index;
}

function fastRecalcPayouts(scenarios: Scenario[], payoutIndex: Record<string, PayoutEntry[]>, remaining: Record<string, number>, setPrice: number): Float64Array {
  const payouts = new Float64Array(scenarios.length);
  for (const betKey in payoutIndex) {
    const rem = remaining[betKey] || 0;
    if (rem <= 0) continue;
    for (const entry of payoutIndex[betKey]) {
      if (entry.is4set) {
        const numSets = Math.floor(rem / setPrice);
        payouts[entry.si] += entry.ppu * numSets;
      } else {
        payouts[entry.si] += entry.ppu * rem;
      }
    }
  }
  return payouts;
}

export function greedyRecommendations(
  scenarios: Scenario[],
  betItems: BetItem[],
  budget: number,
  setPrice = 120,
  lotteryType = 'lao'
): Recommendation[] {
  if (scenarios.length === 0) return [];

  const payoutIndex = buildPayoutIndex(scenarios, setPrice);
  const remaining: Record<string, number> = {};
  const betItemMap: Record<string, BetItem> = {};
  betItems.forEach(b => {
    const key = `${b.bet_type}|${b.numbers}`;
    remaining[key] = b.net_amount;
    betItemMap[key] = b;
  });

  const baseProfit = betItems.reduce((s, b) => s + b.net_amount, 0)
    - betItems.reduce((s, b) => s + b.net_commission, 0);
  const payoutThreshold = baseProfit + budget;

  const recMap: Record<string, Recommendation> = {};
  const maxIterations = 1000;
  let iterCount = 0;

  while (iterCount++ < maxIterations) {
    const payouts = fastRecalcPayouts(scenarios, payoutIndex, remaining, setPrice);

    let worstIdx = 0;
    let worstPayout = payouts[0];
    for (let i = 1; i < payouts.length; i++) {
      if (payouts[i] > worstPayout) {
        worstPayout = payouts[i];
        worstIdx = i;
      }
    }

    if (worstPayout <= payoutThreshold) break;

    const excess = worstPayout - payoutThreshold;

    const worstScenario = scenarios[worstIdx];
    let bestKey: string | null = null;
    let bestScore = -1;
    let bestPPU = 0;

    for (const ab of worstScenario.affected_bets) {
      const key = `${ab.bet_type}|${ab.numbers}`;
      const rem = remaining[key] || 0;
      if (rem <= 0) continue;

      const entries = payoutIndex[key];
      if (!entries) continue;

      let weightedReduction = 0;
      for (const entry of entries) {
        const scenarioExcess = payouts[entry.si] - payoutThreshold;
        if (scenarioExcess > 0) {
          weightedReduction += entry.ppu * scenarioExcess;
        }
      }

      const score = weightedReduction;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
        const worstEntry = entries.find(e => e.si === worstIdx);
        bestPPU = worstEntry ? worstEntry.ppu : entries[0]?.ppu || 1;
      }
    }

    if (!bestKey || bestScore <= 0) break;

    const currentRem = remaining[bestKey] || 0;
    const betItem = betItemMap[bestKey];
    const is4set = betItem?.bet_type === '4_set';

    let minTransfer;
    if (is4set) {
      const setsNeeded = Math.ceil(excess / bestPPU);
      minTransfer = setsNeeded * setPrice;
    } else {
      minTransfer = Math.ceil(excess / bestPPU);
    }

    let transferAmount = Math.min(minTransfer, currentRem);

    if (is4set) {
      transferAmount = Math.ceil(transferAmount / setPrice) * setPrice;
      transferAmount = Math.min(transferAmount, currentRem);
    }

    if (transferAmount <= 0) transferAmount = is4set ? setPrice : 1;

    transferAmount = Math.min(transferAmount, currentRem);
    if (transferAmount <= 0) break;

    remaining[bestKey] = Math.max(0, currentRem - transferAmount);

    if (recMap[bestKey]) {
      recMap[bestKey].transfer_amount += transferAmount;
      recMap[bestKey].keep_amount = remaining[bestKey];
    } else {
      const entries = payoutIndex[bestKey] || [];
      const overBudgetCount = entries.filter(e => payouts[e.si] > payoutThreshold).length;

      recMap[bestKey] = {
        bet_type: betItem?.bet_type || bestKey.split('|')[0],
        numbers: betItem?.numbers || bestKey.split('|')[1],
        current_amount: betItem?.net_amount || currentRem,
        transfer_amount: transferAmount,
        keep_amount: remaining[bestKey],
        reason: `ลด ${overBudgetCount} scenarios (${Math.round(bestScore).toLocaleString()}/หน่วย)`
      };
    }
  }

  return Object.values(recMap);
}
