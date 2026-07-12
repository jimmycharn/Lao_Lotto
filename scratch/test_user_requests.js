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
    '123+100+6',
    '123-100-6',
    '123*100*6',
    '123/100/6',
    '123+100*6',
    '123 100/6',
    '123-100*6',
    '123.100.6',
    '123:100:6',
    '122+100+3',
    '122.100.3',
    '122:100:3',

    // 3 digit เต็งโต๊ด (3 groups)
    '123+110+20',
    '123-200-60',
    '123*110*30',
    '123/120/50',
    '123+130*100',
    '123 140/80',
    '123-170*15',
    '123.120.35',
    '123:190:20',

    // 3 digit เต็งโต๊ด (more than 3 groups)
    '123/254/200=100',
    '123/254/200/=100',
    '123/254/200=100*ชุด',
    '123/254/200=100*ช',
    '123/254/200/100*ชุด',
    '123/254/200/100*ช',
    '123/254/200/=100*ชุด',
    '123/254/200/=100*ช',
    '123/254/200=100*20',
    '123/120*50',
    '123/254/*100',
    '123/254/854*100',
    '123/254/854/*100',

    // 2 digit บนกลับ / ล่างกลับ (3 groups)
    '23+20+20',
    '23-20-20',
    '23*20*20',
    '23/20/20',
    '23/20*20',
    '23/25*20',

    // 2 digit บนกลับ / ล่างกลับ (more than 3 groups)
    '45,78,98,36=20',
    '12,23=20/45\'25*20',
    '23/20/25=20*20',
    '23/20/25*20',
    '23/20/25=20'
];

console.log('--- Testing Current Parsing Behavior ---');
for (const input of testInputs) {
    const result = context.parseMultiLinePaste(input, 'thai', {});
    console.log(`Input: "${input}"`);
    if (result && result.length > 0) {
        result.forEach(r => {
            console.log(`  -> Num: ${r.numbers}, Amt: ${r.amount}, Amt2: ${r.amount2}, Type: ${r.betType}, Spec: ${r.specialType || 'none'}, Label: ${r.typeLabel}`);
        });
    } else {
        console.log(`  -> FAILED/NULL`);
    }
}
