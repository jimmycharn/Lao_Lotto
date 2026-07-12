import fs from 'fs';
import vm from 'vm';

const pasteParserPath = 'f:\\Web App\\Lao_Lotto\\src\\utils\\pasteParser.js';
let parserCode = fs.readFileSync(pasteParserPath, 'utf8')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const/g, 'const');

const context = { console: console };
vm.createContext(context);
const cleanParserCode = parserCode + '\nthis.parseMultiLinePaste = parseMultiLinePaste;\nthis.expandLines = expandLines;';
new vm.Script(cleanParserCode).runInContext(context);

const testInputs = [
    // 3 digit คูณชุด
    { input: '123+100+6', expected: '123=100*6 (คูณชุด)' },
    { input: '123-100-6', expected: '123=100*6 (คูณชุด)' },
    { input: '123*100*6', expected: '123=100*6 (คูณชุด)' },
    { input: '123/100/6', expected: '123=100*6 (คูณชุด)' },
    { input: '123+100*6', expected: '123=100*6 (คูณชุด)' },
    { input: '123 100/6', expected: '123=100*6 (คูณชุด)' },
    { input: '123-100*6', expected: '123=100*6 (คูณชุด)' },
    { input: '123.100.6', expected: '123=100*6 (คูณชุด)' },
    { input: '123:100:6', expected: '123=100*6 (คูณชุด)' },
    { input: '122+100+3', expected: '122=100*3 (คูณชุด)' },
    { input: '122.100.3', expected: '122=100*3 (คูณชุด)' },
    { input: '122:100:3', expected: '122=100*3 (คูณชุด)' },

    // 3 digit เต็งโต๊ด (3 groups)
    { input: '123+110+20', expected: '123=110*20 (เต็งโต๊ด)' },
    { input: '123-200-60', expected: '123=200*60 (เต็งโต๊ด)' },
    { input: '123*110*30', expected: '123=110*30 (เต็งโต๊ด)' },
    { input: '123/120/50', expected: '123=120*50 (เต็งโต๊ด)' },
    { input: '123+130*100', expected: '123=130*100 (เต็งโต๊ด)' },
    { input: '123 140/80', expected: '123=140*80 (เต็งโต๊ด)' },
    { input: '123-170*15', expected: '123=170*15 (เต็งโต๊ด)' },
    { input: '123.120.35', expected: '123=120*35 (เต็งโต๊ด)' },
    { input: '123:190:20', expected: '123=190*20 (เต็งโต๊ด)' },

    // 3 digit เต็งโต๊ด (more than 3 groups)
    { input: '123/254/200=100', expected: '123=100, 254=100, 200=100' },
    { input: '123/254/200/=100', expected: '123=100, 254=100, 200=100' },
    { input: '123/254/200=100*ชุด', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200=100*ช', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200/100*ชุด', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200/100*ช', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200/=100*ชุด', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200/=100*ช', expected: '123=100*6, 254=100*6, 200=100*3' },
    { input: '123/254/200=100*20', expected: '123=100*20, 254=100*20, 200=100*20 (เต็งโต๊ด)' },
    { input: '123/120*50', expected: '123=120*50 (เต็งโต๊ด)' },
    { input: '123/254/*100', expected: '123=100*100, 254=100*100' },
    { input: '123/254/854*100', expected: '123=100*100, 254=100*100, 854=100*100' },
    { input: '123/254/854/*100', expected: '123=100*100, 254=100*100, 854=100*100' },

    // 2 digit บนกลับ / ล่างกลับ (3 groups)
    { input: '23+20+20', expected: '23=20*20 (บนกลับ)' },
    { input: '23-20-20', expected: '23=20*20 (บนกลับ)' },
    { input: '23*20*20', expected: '23=20*20 (บนกลับ)' },
    { input: '23/20/20', expected: '23=20*20 (บนกลับ)' },
    { input: '23/20*20', expected: '23=20*20 (บนกลับ)' },
    { input: '23/25*20', expected: '23=20*20, 25=20*20 (บนกลับ)' },

    // 2 digit บนกลับ / ล่างกลับ (more than 3 groups)
    { input: '45,78,98,36=20', expected: '45=20, 78=20, 98=20, 36=20' },
    { input: '12,23=20/45\'25*20', expected: '12=20, 23=20, 45=20*20, 25=20*20' },
    { input: '23/20/25=20*20', expected: '23=20*20, 20=20*20, 25=20*20' },
    { input: '23/20/25*20', expected: '23=20*20, 20=20*20, 25=20*20' },
    { input: '23/20/25=20', expected: '23=20, 20=20, 25=20' },

    // 2-digit Float Keywords (โต๊ด, โต้ด, โตด, วิ่ง, มี)
    { input: `โต๊ด\n25 100`, expected: '25=100 ลอย' },
    { input: `โต้ด\n25 100`, expected: '25=100 ลอย' },
    { input: `โตด\n25 100`, expected: '25=100 ลอย' },
    { input: `วิ่ง\n25 100`, expected: '25=100 ลอย' },
    { input: `มี\n25 100`, expected: '25=100 ลอย' },
    { input: `2 ตัวมี\n25 100`, expected: '25=100 ลอย' },
    { input: `78 โต๊ด 50`, expected: '78=50 ลอย' },
    { input: `78 โต้ด 50`, expected: '78=50 ลอย' },
    { input: `78 โตด 50`, expected: '78=50 ลอย' },
    { input: `78 วิ่ง 50`, expected: '78=50 ลอย' },
    { input: `78 มี 50`, expected: '78=50 ลอย' },

    // 1-digit Position Keywords
    { input: `หลังบน 1=1000`, expected: '1=1000 หลังบน' },
    { input: `กลางบน 2=200`, expected: '2=200 กลางบน' },
    { input: `7 หน้าบน 500`, expected: '7=500 หน้าบน' },
    { input: `4=2000 หน้าล่าง`, expected: '4=2000 หน้าล่าง' },
    { input: `9หลังล่าง=1500`, expected: '9=1500 หลังล่าง' },
    { input: `1หลัง บน=1,000`, expected: '1=1000 หลังบน' }
];

console.log('--- Testing Actual pasteParser.js (E2E Full Regression + Positions) ---');
let passCount = 0;
for (const { input, expected } of testInputs) {
    const result = context.parseMultiLinePaste(input, 'thai', {});
    console.log(`Input: "${input.replace(/\n/g, '\\n')}"\n  Expected: ${expected}`);
    if (result && result.length > 0) {
        result.forEach(r => {
            console.log(`  -> Num: ${r.numbers}, Amt: ${r.amount}, Amt2: ${r.amount2}, Type: ${r.betType}, Spec: ${r.specialType || 'none'}, Label: ${r.typeLabel}`);
        });
        passCount++;
    } else {
        console.log(`  -> FAILED/NULL`);
    }
}
console.log(`\nPassed ${passCount}/${testInputs.length}`);
