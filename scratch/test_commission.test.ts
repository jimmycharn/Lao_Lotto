import { describe, it, expect } from 'vitest';

const POSITION_MAP: Record<string, string> = {
  'front_top_1': 'pak_top', 'middle_top_1': 'pak_top', 'back_top_1': 'pak_top',
  'front_bottom_1': 'pak_bottom', 'back_bottom_1': 'pak_bottom',
  '2_spread': '2_center', '2_tang': '2_center',
  '2_teng': '2_run', '2_have': '2_run',
  '2_back': '2_top', '2_front_single': '2_front'
};

const getBetSettingsKey = (betType: string, lKey: string): string => {
  const mapped = POSITION_MAP[betType] || betType;
  if (lKey === 'lao' || lKey === 'hanoi') {
    const LAO_MAP: Record<string, string> = { '3_top': '3_straight', '3_tod': '3_tod_single' };
    return LAO_MAP[mapped] || mapped;
  }
  return mapped;
};

const DEFAULT_COMMISSIONS: Record<string, number> = {
  'run_top': 10, 'run_bottom': 10,
  'pak_top': 15, 'pak_bottom': 15,
  'front_top_1': 15, 'middle_top_1': 15, 'back_top_1': 15,
  'front_bottom_1': 15, 'back_bottom_1': 15,
  '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
  '3_top': 30, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
  '4_tod': 15, '4_set': 15, '4_float': 15, '5_float': 15, '6_top': 15
};

function calculateSubmissionCommission(
  sub: any,
  lotteryType: string,
  userSetting: any,
  round?: any
): { commission: number; rate: number; isFixed: boolean; isSet: boolean } {
  const amt = Number(sub.amount || 0);
  const lotteryKey = lotteryType === 'thai' ? 'thai' : lotteryType === 'lao' ? 'lao' : lotteryType === 'hanoi' ? 'hanoi' : 'thai';
  const settingsKey = getBetSettingsKey(sub.bet_type, lotteryKey);
  const settings = userSetting?.lottery_settings?.[lotteryKey]?.[settingsKey];

  if (sub.bet_type === '4_set' || sub.bet_type === '4_top') {
    const setPrice = settings?.setPrice || round?.set_prices?.['4_top'] || 120;
    const numSets = Math.floor(amt / setPrice);
    const commRate = settings?.commission !== undefined ? Number(settings.commission) : 25;
    return {
      commission: numSets * commRate,
      rate: commRate,
      isFixed: true,
      isSet: true
    };
  }

  if (settings?.commission !== undefined) {
    const rate = Number(settings.commission);
    const isFixed = !!settings.isFixed;
    const commission = isFixed ? rate : amt * (rate / 100);
    return {
      commission,
      rate,
      isFixed,
      isSet: false
    };
  }

  let defaultRate = DEFAULT_COMMISSIONS[sub.bet_type] ?? 15;
  return {
    commission: amt * (defaultRate / 100),
    rate: defaultRate,
    isFixed: false,
    isSet: false
  };
}

describe('Commission calculation for Member 10019', () => {
  it('should calculate 1983.3 total commission and round to 1983', () => {
    const member10019Settings = {
      lottery_settings: {
        thai: {
          '3_top': { commission: 30, payout: 550 },
          '3_tod': { commission: 15, payout: 100 },
          '2_bottom': { commission: 15, payout: 65 },
          '2_top': { commission: 15, payout: 65 },
          'run_top': { commission: 10, payout: 3 },
          'run_bottom': { commission: 10, payout: 4 }
        }
      }
    };

    const mockSubmissions = [
      { bet_type: '3_top', amount: 4651 },
      { bet_type: '3_tod', amount: 2410 },
      { bet_type: '2_bottom', amount: 430 },
      { bet_type: '2_top', amount: 80 },
      { bet_type: 'run_top', amount: 500 },
      { bet_type: 'run_bottom', amount: 1000 }
    ];

    interface BetTypeSummary {
      amount: number;
      commission: number;
      rates: Set<number>;
    }

    const betTypeSummaries: Record<string, BetTypeSummary> = {};
    let grandTotal = 0;
    let totalCommission = 0;

    mockSubmissions.forEach(s => {
      const commInfo = calculateSubmissionCommission(s, 'thai', member10019Settings);
      if (!betTypeSummaries[s.bet_type]) {
        betTypeSummaries[s.bet_type] = {
          amount: 0,
          commission: 0,
          rates: new Set()
        };
      }
      betTypeSummaries[s.bet_type].amount += s.amount;
      betTypeSummaries[s.bet_type].commission += commInfo.commission;
      betTypeSummaries[s.bet_type].rates.add(commInfo.rate);

      grandTotal += s.amount;
      totalCommission += commInfo.commission;
    });

    expect(grandTotal).toBe(9071);
    expect(totalCommission).toBeCloseTo(1983.3, 1);
    expect(Math.round(totalCommission)).toBe(1983);
    expect(grandTotal - Math.round(totalCommission)).toBe(7088);

    // Verify per-item commission
    expect(betTypeSummaries['3_top'].commission).toBeCloseTo(1395.3, 1);
    expect(Array.from(betTypeSummaries['3_top'].rates)[0]).toBe(30);

    expect(betTypeSummaries['3_tod'].commission).toBeCloseTo(361.5, 1);
    expect(Array.from(betTypeSummaries['3_tod'].rates)[0]).toBe(15);

    expect(betTypeSummaries['2_bottom'].commission).toBeCloseTo(64.5, 1);
    expect(Array.from(betTypeSummaries['2_bottom'].rates)[0]).toBe(15);

    expect(betTypeSummaries['2_top'].commission).toBeCloseTo(12.0, 1);
    expect(Array.from(betTypeSummaries['2_top'].rates)[0]).toBe(15);

    expect(betTypeSummaries['run_top'].commission).toBeCloseTo(50.0, 1);
    expect(Array.from(betTypeSummaries['run_top'].rates)[0]).toBe(10);

    expect(betTypeSummaries['run_bottom'].commission).toBeCloseTo(100.0, 1);
    expect(Array.from(betTypeSummaries['run_bottom'].rates)[0]).toBe(10);
  });
});
