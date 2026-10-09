# LINE Bot Convert 3-Tod to 3-Top Layoff (`/ตีออกแปลง`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มคำสั่งใหม่ใน LINE Bot คือ `/ตีออกแปลง` (และ `/ตีออกแปลงเลข`) เพื่อตีออกเฉพาะเลขที่กำหนด โดยแปลง 3 ตัวโต๊ดเป็น 3 ตัวตรง/บน ทุกประตูด้วยสูตรปัดเศษขึ้น (`Math.ceil`) และรวมยอดเงินเข้ากับ 3 ตัวตรงเดิมที่มีอยู่ พร้อมบันทึก metadata เพื่อการหักลบยอดที่สอดคล้องกับหน้าเว็บ

**Architecture:** สร้างโมดูลคำนวณและแปลงโต๊ดแยกเดี่ยว `supabase/functions/line-bot/layoffTodConverter.ts` พร้อม unit tests ใน `supabase/functions/line-bot/layoffTodConverter.test.ts` แล้วนำมาเชื่อมเข้ากับ handler ของคำสั่งตีออกใน `supabase/functions/line-bot/index.ts` โดยปรับปรุงให้รองรับทั้ง `/ตีออกเฉพาะ` และ `/ตีออกแปลง` ผ่าน Unified Pipeline และส่ง metadata `notes` ไปยัง `performLayoff`

**Tech Stack:** TypeScript (Deno runtime for Supabase Edge Functions), Vitest, Supabase Database

## Global Constraints
- ไม่ทำการปรับโครงสร้างตารางฐานข้อมูลโดยเด็ดขาด (ใช้ field `notes` ใน `bet_transfers` สำหรับเก็บ metadata ตามมาตรฐานเดิมของระบบ)
- ห้ามแตะต้อง ลบ หรือเปลี่ยนแปลงข้อมูลจริงในฐานข้อมูลโดยพลการ (Strict Domain Rule 3)
- การทดสอบทั้งหมดต้องรันผ่าน `npm.cmd test -- --run supabase/functions/line-bot/layoffTodConverter.test.ts` และ `npm.cmd test`
- วันที่งวดและเวลาต้องคำนึงถึงไทม์โซนประเทศไทย (`Asia/Bangkok` / UTC+7) เสมอ

---

### Task 1: Create LINE Bot Tod Converter Utility (`layoffTodConverter.ts`)

**Files:**
- Create: `supabase/functions/line-bot/layoffTodConverter.ts`
- Test: `supabase/functions/line-bot/layoffTodConverter.test.js` (or `.ts`)

**Interfaces:**
- Produces:
  - `get3DigitPermutations(numbers: string): string[]`
  - `encodeTodConversionNote(item: LayoffItem, userNote?: string): string`
  - `convertAndMergeTodItems<T extends LayoffItem>(items: T[], lotteryType: string): T[]`
  - Types: `LayoffItem`

- [ ] **Step 1: Write unit tests for permutations, ceil math, and item conversion & merging**

Create `supabase/functions/line-bot/layoffTodConverter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  get3DigitPermutations,
  encodeTodConversionNote,
  convertAndMergeTodItems,
  LayoffItem
} from './layoffTodConverter';

describe('layoffTodConverter (LINE Bot)', () => {
  describe('get3DigitPermutations', () => {
    it('generates 6 unique permutations for 3 distinct digits', () => {
      const perms = get3DigitPermutations('259');
      expect(perms).toHaveLength(6);
      expect(perms.sort()).toEqual(['259', '295', '529', '592', '925', '952'].sort());
    });

    it('generates 3 unique permutations for double digits', () => {
      const perms = get3DigitPermutations('995');
      expect(perms).toHaveLength(3);
      expect(perms.sort()).toEqual(['995', '959', '599'].sort());
    });

    it('generates 1 unique permutation for triple digits', () => {
      const perms = get3DigitPermutations('111');
      expect(perms).toEqual(['111']);
    });

    it('returns original input if not a 3-digit string', () => {
      expect(get3DigitPermutations('25')).toEqual(['25']);
    });
  });

  describe('convertAndMergeTodItems', () => {
    it('returns items unchanged if no 3_tod items exist', () => {
      const items: LayoffItem[] = [
        { bet_type: '2_top', numbers: '25', amount: 100 },
        { bet_type: '3_top', numbers: '123', amount: 50 }
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toEqual(items);
    });

    it('converts 3_tod into 3_top permutations using Math.ceil(amount / perms.length)', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_tod', numbers: '259', amount: 70 } // 70 / 6 = 11.67 -> 12 each
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toHaveLength(6);
      result.forEach(item => {
        expect(item.bet_type).toBe('3_top');
        expect(item.amount).toBe(12);
        expect(item.isConvertedFromTod).toBe(true);
        expect(item.notes).toContain('[TOD_CONV:');
      });
      const nums = result.map(i => i.numbers).sort();
      expect(nums).toEqual(['259', '295', '529', '592', '925', '952'].sort());
    });

    it('merges converted 3_tod into existing 3_top items by summing amounts', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_top', numbers: '259', amount: 133 },
        { bet_type: '3_top', numbers: '295', amount: 133 },
        { bet_type: '3_tod', numbers: '259', amount: 70 } // 70 / 6 = 12
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      
      // Should have 6 items in total (2 merged + 4 newly created permutations)
      expect(result).toHaveLength(6);

      const item259 = result.find(i => i.numbers === '259');
      expect(item259).toBeDefined();
      expect(item259?.amount).toBe(133 + 12); // 145
      expect(item259?.isMergedWithTod).toBe(true);
      expect(item259?.notes).toContain('"is_merged":true');

      const item295 = result.find(i => i.numbers === '295');
      expect(item295?.amount).toBe(133 + 12); // 145

      const item529 = result.find(i => i.numbers === '529');
      expect(item529?.amount).toBe(12);

      // Verify no 3_tod remains
      expect(result.some(i => i.bet_type === '3_tod')).toBe(false);
    });

    it('handles double digits (3 perms) correctly', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_tod', numbers: '995', amount: 60 } // 60 / 3 = 20 each
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toHaveLength(3);
      result.forEach(item => {
        expect(item.amount).toBe(20);
        expect(item.bet_type).toBe('3_top');
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --run supabase/functions/line-bot/layoffTodConverter.test.ts`
Expected: FAIL because `layoffTodConverter.ts` does not exist yet.

- [ ] **Step 3: Implement `supabase/functions/line-bot/layoffTodConverter.ts`**

Create `supabase/functions/line-bot/layoffTodConverter.ts`:
```typescript
export interface LayoffItem {
  bet_type: string;
  numbers: string;
  amount: number;
  notes?: string;
  isConvertedFromTod?: boolean;
  isMergedWithTod?: boolean;
  originalTodNumbers?: string;
  originalTodAmount?: number;
  convertedTodAmount?: number;
  originalTopAmount?: number;
  [key: string]: any;
}

const METADATA_PREFIX = '[TOD_CONV:';
const METADATA_SUFFIX = ']';

/**
 * Returns all unique permutations of a 3-digit number string.
 */
export function get3DigitPermutations(numbers: string): string[] {
  if (!numbers || typeof numbers !== 'string' || numbers.length !== 3) {
    return [numbers || ''];
  }
  const chars = numbers.split('');
  const permutations = new Set<string>();

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (j === i) continue;
      for (let k = 0; k < 3; k++) {
        if (k === i || k === j) continue;
        permutations.add(chars[i] + chars[j] + chars[k]);
      }
    }
  }
  return Array.from(permutations);
}

/**
 * Encodes tod conversion metadata into transfer note string.
 */
export function encodeTodConversionNote(item: LayoffItem, userNote = ''): string {
  if (!item.isConvertedFromTod) return userNote || '';
  const meta = {
    orig_num: item.originalTodNumbers,
    orig_excess: item.originalTodAmount,
    allocated: item.convertedTodAmount,
    is_merged: !!item.isMergedWithTod,
    top_excess: item.originalTopAmount || 0
  };
  const metaStr = `${METADATA_PREFIX}${JSON.stringify(meta)}${METADATA_SUFFIX}`;
  return userNote ? `${metaStr} ${userNote}` : metaStr;
}

/**
 * Converts 3_tod excess items into 3_top permutations and merges with existing 3_top items.
 */
export function convertAndMergeTodItems<T extends LayoffItem>(items: T[], _lotteryType?: string): T[] {
  const nonTodItems: T[] = [];
  const todItems: T[] = [];

  for (const item of items) {
    if (item.bet_type === '3_tod') {
      todItems.push(item);
    } else {
      nonTodItems.push({ ...item });
    }
  }

  if (todItems.length === 0) {
    return nonTodItems;
  }

  // Generate converted items
  const convertedItems: T[] = [];
  for (const tod of todItems) {
    const perms = get3DigitPermutations(tod.numbers);
    const perPermAmount = Math.ceil(tod.amount / perms.length);

    for (const p of perms) {
      const conv = {
        ...tod,
        bet_type: '3_top',
        numbers: p,
        amount: perPermAmount,
        isConvertedFromTod: true,
        isMergedWithTod: false,
        originalTodNumbers: tod.numbers,
        originalTodAmount: tod.amount,
        convertedTodAmount: perPermAmount
      } as T;
      convertedItems.push(conv);
    }
  }

  // Index non-tod items
  const resultMap = new Map<string, T>();
  for (const item of nonTodItems) {
    resultMap.set(`${item.bet_type}|${item.numbers}`, item);
  }

  // Merge converted items
  for (const conv of convertedItems) {
    const key = `3_top|${conv.numbers}`;
    if (resultMap.has(key)) {
      const existing = resultMap.get(key)!;
      const originalTopAmount = existing.amount || 0;
      const newAmount = originalTopAmount + conv.amount;
      const mergedItem = {
        ...existing,
        amount: newAmount,
        isConvertedFromTod: true,
        isMergedWithTod: true,
        originalTopAmount,
        convertedTodAmount: conv.convertedTodAmount,
        originalTodNumbers: conv.originalTodNumbers,
        originalTodAmount: conv.originalTodAmount
      } as T;
      mergedItem.notes = encodeTodConversionNote(mergedItem, existing.notes || '');
      resultMap.set(key, mergedItem);
    } else {
      const newItem = { ...conv };
      newItem.notes = encodeTodConversionNote(newItem, conv.notes || '');
      resultMap.set(key, newItem);
    }
  }

  return Array.from(resultMap.values());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --run supabase/functions/line-bot/layoffTodConverter.test.ts`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-bot/layoffTodConverter.ts supabase/functions/line-bot/layoffTodConverter.test.ts
git commit -m "feat(line-bot): add layoffTodConverter utility with tests"
```

---

### Task 2: Integrate `/ตีออกแปลง` and `/ตีออกแปลงเลข` into LINE Bot Handler

**Files:**
- Modify: `supabase/functions/line-bot/index.ts:2475-2510` (Support `notes` in `performLayoff`)
- Modify: `supabase/functions/line-bot/index.ts:13130-13365` (Support `/ตีออกแปลง` and `/ตีออกแปลงเลข`)
- Test: `supabase/functions/line-bot/layoffCommands.test.ts`

**Interfaces:**
- Consumes:
  - `convertAndMergeTodItems` from `./layoffTodConverter.ts`
- Produces:
  - LINE Bot handles `/ตีออกแปลง` and `/ตีออกแปลงเลข`
  - Saves `notes` in `bet_transfers` table

- [ ] **Step 1: Write integration test for `/ตีออกแปลง` parsing and flow**

Create `supabase/functions/line-bot/layoffCommands.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { convertAndMergeTodItems } from './layoffTodConverter';

describe('layoff commands logic', () => {
  it('detects /ตีออกแปลง and /ตีออกแปลงเลข prefixes correctly', () => {
    const texts = [
      '/ตีออกแปลง 123 100 บตก ตกลง',
      '/ตีออกแปลงเลข 123 100 บตก ตกลง',
      '/ตีออกเฉพาะ 123 100 บตก ตกลง',
      '/ตีออกเฉพาะเลข 123 100 บตก ตกลง'
    ];

    texts.forEach(text => {
      const isLayoffSpecific = text.startsWith('/ตีออกเฉพาะ') || text.startsWith('/ตีออกเฉพาะเลข');
      const isLayoffConverted = text.startsWith('/ตีออกแปลง') || text.startsWith('/ตีออกแปลงเลข');
      expect(isLayoffSpecific || isLayoffConverted).toBe(true);
    });
  });

  it('correctly transforms excess items for /ตีออกแปลง with real-life scenario', () => {
    // Simulated excess items from user screenshot:
    // บน: 259=133, 295=133, 529=100, 592=100, 925=111, 952=100
    // โต๊ด: 259=70
    const rawExcess = [
      { bet_type: '3_top', numbers: '259', amount: 133 },
      { bet_type: '3_top', numbers: '295', amount: 133 },
      { bet_type: '3_top', numbers: '529', amount: 100 },
      { bet_type: '3_top', numbers: '592', amount: 100 },
      { bet_type: '3_top', numbers: '925', amount: 111 },
      { bet_type: '3_top', numbers: '952', amount: 100 },
      { bet_type: '3_tod', numbers: '259', amount: 70 }
    ];

    const converted = convertAndMergeTodItems(rawExcess, 'thai');

    // All 6 items should have 12 added to their top amount
    expect(converted.find(i => i.numbers === '259')?.amount).toBe(133 + 12);
    expect(converted.find(i => i.numbers === '295')?.amount).toBe(133 + 12);
    expect(converted.find(i => i.numbers === '529')?.amount).toBe(100 + 12);
    expect(converted.find(i => i.numbers === '592')?.amount).toBe(100 + 12);
    expect(converted.find(i => i.numbers === '925')?.amount).toBe(111 + 12);
    expect(converted.find(i => i.numbers === '952')?.amount).toBe(100 + 12);

    // No tod remaining
    expect(converted.filter(i => i.bet_type === '3_tod')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm.cmd test -- --run supabase/functions/line-bot/layoffCommands.test.ts`
Expected: PASS

- [ ] **Step 3: Modify `supabase/functions/line-bot/index.ts`**

1. Import `convertAndMergeTodItems` at top of `index.ts`:
```typescript
import { convertAndMergeTodItems } from './layoffTodConverter.ts';
```

2. Update `performLayoff` to persist `notes` into `transferInserts`:
```typescript
    transferInserts.push({
      round_id: roundId,
      bet_type: item.bet_type,
      numbers: item.numbers,
      amount: item.amount,
      target_dealer_name: targetDealerName,
      transfer_batch_id: batchId,
      notes: (item as any).notes || null,
      upstream_dealer_id: upstreamDealerId || null,
      is_linked: !!targetRoundId,
      target_round_id: targetRoundId,
      target_submission_id: targetSubmissionId,
      created_at: timestamp,
      updated_at: timestamp
    });
```

3. Update Command Handler around line 13132:
```typescript
            // ─── COMMAND: /ตีออกเฉพาะ, /ตีออกเฉพาะเลข, /ตีออกแปลง, /ตีออกแปลงเลข ───
            const isLayoffSpecific = text.startsWith('/ตีออกเฉพาะ') || text.startsWith('/ตีออกเฉพาะเลข');
            const isLayoffConverted = text.startsWith('/ตีออกแปลง') || text.startsWith('/ตีออกแปลงเลข');

            if (isLayoffSpecific || isLayoffConverted) {
              if (!permissions.can_transfer) {
                await sendLineReply(replyToken, `❌ คุณไม่มีสิทธิ์ในการสั่งตีออกตัวเลข`);
                continue;
              }

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

              let rawBody = '';
              if (text.startsWith('/ตีออกแปลงเลข')) {
                rawBody = text.substring('/ตีออกแปลงเลข'.length).trim();
              } else if (text.startsWith('/ตีออกแปลง')) {
                rawBody = text.substring('/ตีออกแปลง'.length).trim();
              } else if (text.startsWith('/ตีออกเฉพาะเลข')) {
                rawBody = text.substring('/ตีออกเฉพาะเลข'.length).trim();
              } else {
                rawBody = text.substring('/ตีออกเฉพาะ'.length).trim();
              }

              const cmdPrefix = isLayoffConverted ? '/ตีออกแปลง' : '/ตีออกเฉพาะ';
              if (!rawBody) {
                await sendLineReply(replyToken, `❌ กรุณาระบุเลขและเงื่อนไขการ${isLayoffConverted ? 'ตีออกแปลง' : 'ตีออกเฉพาะ'} เช่น\n${cmdPrefix}\n12,31,95 100 บลก`);
                continue;
              }

              let isConfirmed = false;
              let body = rawBody;
              const confirmSuffixMatch = rawBody.match(/\s+(ตกลง|ยืนยัน|y|yes)$/i);
              if (confirmSuffixMatch) {
                isConfirmed = true;
                body = rawBody.substring(0, confirmSuffixMatch.index).trim();
              }

              const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
              const parsedLines: ParsedLayoffLine[] = [];
              for (const line of lines) {
                const parsed = parseSpecificLayoffLine(line, activeRound.lottery_type);
                if (parsed) {
                  parsedLines.push(parsed);
                }
              }

              if (parsedLines.length === 0) {
                await sendLineReply(replyToken, `❌ ไม่พบข้อมูลเลขที่ถูกต้องในคำสั่ง ให้ระบุตัวเลข เช่น 1,2,3 100/200`);
                continue;
              }

              // ... (fetching submissions, limits, etc. remains identical) ...

              // After calculating excessItems:
              let itemsToLayoff = excessItems;
              if (isLayoffConverted) {
                itemsToLayoff = convertAndMergeTodItems(excessItems, activeRound.lottery_type);
              }

              if (itemsToLayoff.length === 0) {
                await sendLineReply(replyToken, `ℹ️ เลขที่ระบุไม่มีสัดส่วนที่เกินจากเกณฑ์ ไม่จำเป็นต้องตีออกค่ะ 🎉`);
                continue;
              }

              if (!isConfirmed) {
                const totalAmount = itemsToLayoff.reduce((sum, item) => sum + item.amount, 0);
                const lotteryName = activeRound.lottery_name || activeRound.lottery_type.toUpperCase();
                const roundDateStr = getRoundDisplayDate(activeRound, false);

                let previewText = isLayoffConverted ? `⚡ ยืนยันการตีออกแปลงเลข\n` : `⚡ ยืนยันการตีออกเฉพาะเลข\n`;
                previewText += `ประเภทหวย: ${lotteryName}\n`;
                if (roundDateStr) previewText += `งวดวันที่: ${roundDateStr}\n`;
                previewText += `จำนวน: ${itemsToLayoff.length} รายการ\n`;
                previewText += `💰 ยอดรวมตีออก: ฿${totalAmount.toLocaleString('th-TH')}\n`;
                previewText += `--------------------------\n`;

                const itemLines = itemsToLayoff.map(item => {
                  const label = getThaiBetTypeLabel(item.bet_type, activeRound.lottery_type);
                  return `• ${item.numbers} (${label}) = ฿${item.amount.toLocaleString('th-TH')}`;
                });
                previewText += itemLines.join('\n');
                previewText += `\n--------------------------\n`;
                previewText += `👉 กดปุ่ม "ตกลง" ด้านล่างเพื่อยืนยัน หรือกด "ยกเลิก" เพื่อยกเลิกรายการค่ะ`;

                const confirmCmdText = `${cmdPrefix}\n${body} ตกลง`;

                await sendLineReply(replyToken, {
                  type: "text",
                  text: previewText,
                  quickReply: {
                    items: [
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: "ตกลง",
                          text: confirmCmdText
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
              }

              const result = await performLayoff(dealerId, activeRound.id, activeRound.lottery_type, itemsToLayoff);
              if (result.success) {
                await sendLineReply(replyToken, result.text || `✅ ตีออก${isLayoffConverted ? 'แปลง' : 'เฉพาะ'}เลขสำเร็จเรียบร้อยแล้วค่ะ`);
              } else {
                await sendLineReply(replyToken, `❌ เกิดข้อผิดพลาดในการตีออก:\n${result.message}`);
              }
              continue;
            }
```

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `npm.cmd test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-bot/index.ts supabase/functions/line-bot/layoffCommands.test.ts
git commit -m "feat(line-bot): implement /ตีออกแปลง and /ตีออกแปลงเลข command"
```

---

### Task 3: Build & Verification

- [ ] **Step 1: Run project build**

Run: `npm.cmd run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 2: Commit any final cleanup**
