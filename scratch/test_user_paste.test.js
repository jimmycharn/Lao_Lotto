import { describe, it, expect } from 'vitest';
import { parseMultiLinePaste } from '../src/utils/pasteParser.js';

describe('user paste test analysis', () => {
  it('should print parsing results for comma-separated with x', () => {
    const text1 = `48,26×50`;
    const result1 = parseMultiLinePaste(text1, 'lao');
    expect(result1.map(r => r.formattedLine)).toEqual(['48=50 บน', '26=50 บน']);

    const text2 = `48'26×50`;
    const result2 = parseMultiLinePaste(text2, 'lao');
    expect(result2.map(r => r.formattedLine)).toEqual(['48=50 บน', '26=50 บน']);

    const text3 = `12×150/48'26×50`;
    const result3 = parseMultiLinePaste(text3, 'lao');
    expect(result3.map(r => r.formattedLine)).toEqual(['12=150 บน', '48=50 บน', '26=50 บน']);
  });

  it('should auto-revert list items when x_separator_behavior is revert', () => {
    const text1 = `48,26×50`;
    const result1 = parseMultiLinePaste(text1, 'lao', { x_separator_behavior: 'revert' });
    expect(result1.map(r => r.formattedLine)).toEqual(['48=50 บน', '84=50 บน', '26=50 บน', '62=50 บน']);

    const text2 = `12×150/48'26×50`;
    const result2 = parseMultiLinePaste(text2, 'lao', { x_separator_behavior: 'revert' });
    expect(result2.map(r => r.formattedLine)).toEqual(['12=150 บน', '21=150 บน', '48=50 บน', '84=50 บน', '26=50 บน', '62=50 บน']);

    const text3 = `45×100/10×50/56'59×30/`;
    const result3 = parseMultiLinePaste(text3, 'lao', { x_separator_behavior: 'revert' });
    expect(result3.map(r => r.formattedLine)).toEqual([
      '45=100 บน', '54=100 บน',
      '10=50 บน', '01=50 บน',
      '56=30 บน', '65=30 บน',
      '59=30 บน', '95=30 บน'
    ]);

    const text4 = `11:35 ดำ 25×10\n11:35 ดำ 03×10`;
    const result4 = parseMultiLinePaste(text4, 'lao', { x_separator_behavior: 'revert' });
    expect(result4.map(r => r.formattedLine)).toEqual([
      '25=10 บน', '52=10 บน',
      '03=10 บน', '30=10 บน'
    ]);
  });

  it('debugs 80-60-40', () => {
    const text = "80-60-40 50*50 บนล่างกลับ";
    const result = parseMultiLinePaste(text, 'lao');
    console.log("DEBUG 80-60-40:", JSON.stringify(result, null, 2));
  });

  it('reproduces reported issue with multiline 80-60-40 50*50', () => {
    const text = "80\n60\n40\n50*50 บนล่างกลับ";
    const result = parseMultiLinePaste(text, 'lao');
    console.log("REPRODUCTION RESULT:", JSON.stringify(result, null, 2));
    expect(result.map(r => r.formattedLine)).toEqual([
      '80=50*50 บนกลับ',
      '80=50*50 ล่างกลับ',
      '60=50*50 บนกลับ',
      '60=50*50 ล่างกลับ',
      '40=50*50 บนกลับ',
      '40=50*50 ล่างกลับ'
    ]);
  });

  it('defaults to บน when no context is specified (50*50 กลับ)', () => {
    const text = "80\n60\n40\n50*50 กลับ";
    const result = parseMultiLinePaste(text, 'lao');
    expect(result.map(r => r.formattedLine)).toEqual([
      '80=50*50 บนกลับ',
      '60=50*50 บนกลับ',
      '40=50*50 บนกลับ'
    ]);
  });

  it('defaults to บน when no context is specified (50*50)', () => {
    const text = "80\n60\n40\n50*50";
    const result = parseMultiLinePaste(text, 'lao');
    expect(result.map(r => r.formattedLine)).toEqual([
      '80=50*50 บนกลับ',
      '60=50*50 บนกลับ',
      '40=50*50 บนกลับ'
    ]);
  });

  it('should parse compound line with inline bare numbers correctly', () => {
    const text = "04,47X100,54,52X50=600.";
    const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'revert' });
    expect(result.map(r => r.formattedLine)).toEqual([
      '04=100 บน',
      '40=100 บน',
      '47=100 บน',
      '74=100 บน',
      '54=50 บน',
      '45=50 บน',
      '52=50 บน',
      '25=50 บน'
    ]);
  });

  it('should distinguish × (reverse) and = (direct) with single-quote separator', () => {
    // Full real-world input: × means reverse, = means direct (palindromes)
    const text = "35×100/48'57'70×50/12'06'04'64'14×15/92'52'17×20/27'15×30/66'77'88'55=30/11=20/";
    const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'revert' });
    const formatted = result.map(r => r.formattedLine);

    // Group 1: 35×100 → reverse: 35, 53
    expect(formatted).toContain('35=100 บน');
    expect(formatted).toContain('53=100 บน');

    // Group 2: 48'57'70×50 → reverse each: 48/84, 57/75, 70/07
    expect(formatted).toContain('48=50 บน');
    expect(formatted).toContain('84=50 บน');
    expect(formatted).toContain('57=50 บน');
    expect(formatted).toContain('75=50 บน');
    expect(formatted).toContain('70=50 บน');
    expect(formatted).toContain('07=50 บน');

    // Group 3: 12'06'04'64'14×15 → reverse each
    expect(formatted).toContain('12=15 บน');
    expect(formatted).toContain('21=15 บน');
    expect(formatted).toContain('06=15 บน');
    expect(formatted).toContain('60=15 บน');
    expect(formatted).toContain('04=15 บน');
    expect(formatted).toContain('40=15 บน');
    expect(formatted).toContain('64=15 บน');
    expect(formatted).toContain('46=15 บน');
    expect(formatted).toContain('14=15 บน');
    expect(formatted).toContain('41=15 บน');

    // Group 4: 92'52'17×20 → reverse each
    expect(formatted).toContain('92=20 บน');
    expect(formatted).toContain('29=20 บน');
    expect(formatted).toContain('52=20 บน');
    expect(formatted).toContain('25=20 บน');
    expect(formatted).toContain('17=20 บน');
    expect(formatted).toContain('71=20 บน');

    // Group 5: 27'15×30 → reverse each
    expect(formatted).toContain('27=30 บน');
    expect(formatted).toContain('72=30 บน');
    expect(formatted).toContain('15=30 บน');
    expect(formatted).toContain('51=30 บน');

    // Group 6: 66'77'88'55=30 → direct (palindromes, NO reverse)
    expect(formatted).toContain('66=30 บน');
    expect(formatted).toContain('77=30 บน');
    expect(formatted).toContain('88=30 บน');
    expect(formatted).toContain('55=30 บน');

    // Group 7: 11=20 → direct (palindrome, NO reverse)
    expect(formatted).toContain('11=20 บน');

    // Total: 2 + 6 + 10 + 6 + 4 + 4 + 1 = 33 entries
    expect(formatted.length).toBe(33);
  });

  it('should NOT reverse = groups even when x_separator_behavior is revert', () => {
    // Only '=' numbers - should never reverse
    const text = "66'77'88=30/11=20";
    const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'revert' });
    const formatted = result.map(r => r.formattedLine);
    expect(formatted).toEqual([
      '66=30 บน',
      '77=30 บน',
      '88=30 บน',
      '11=20 บน'
    ]);
  });

  it('should handle mixed × and = in same line with single-quote separator', () => {
    // Mixed: × reverses, = does not
    const text = "35×100/55=30";
    const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'revert' });
    const formatted = result.map(r => r.formattedLine);
    expect(formatted).toEqual([
      '35=100 บน',
      '53=100 บน',
      '55=30 บน'
    ]);
  });

  it('should handle hyphen separator behavior correctly', () => {
    // Option 1: 'equal' behavior (Default)
    const text1 = "123-200*200";
    const res1 = parseMultiLinePaste(text1, 'lao', { hyphen_separator_behavior: 'equal' });
    expect(res1.map(r => r.formattedLine)).toEqual([
      '123=200*200 เต็งโต๊ด'
    ]);

    const text2 = "12-20*30";
    const res2 = parseMultiLinePaste(text2, 'lao', { hyphen_separator_behavior: 'equal' });
    expect(res2.map(r => r.formattedLine)).toEqual([
      '12=20*30 บนกลับ'
    ]);

    // Option 2: 'separator' behavior
    const text3 = "123-100*100";
    const res3 = parseMultiLinePaste(text3, 'lao', { hyphen_separator_behavior: 'separator' });
    // Should split 123 and 100 as separate bets, inheriting the amount 100*100
    expect(res3.map(r => r.formattedLine)).toEqual([
      '123=100*100 เต็งโต๊ด',
      '100=100*100 เต็งโต๊ด'
    ]);

    const text4 = "12-20*30";
    const res4 = parseMultiLinePaste(text4, 'lao', { hyphen_separator_behavior: 'separator' });
    // Should split 12 and 20 as separate bets, inheriting the amount 30*30
    expect(res4.map(r => r.formattedLine)).toEqual([
      '12=30*30 บนกลับ',
      '20=30*30 บนกลับ'
    ]);

    // Test with prefix context
    const text5 = "ล่าง 12-20*30";
    const res5 = parseMultiLinePaste(text5, 'lao', { hyphen_separator_behavior: 'separator' });
    expect(res5.map(r => r.formattedLine)).toEqual([
      '12=30*30 ล่างกลับ',
      '20=30*30 ล่างกลับ'
    ]);
  });
});
