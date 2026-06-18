import { parseMultiLinePaste } from '../supabase/functions/line-bot/pasteParser.ts';

const text1 = `ลอยทั่วไป
11-=50
22-=50
66-=50
88=50
77=50
99=50
33=50`;

const text2 = `วิ่งล่าง
11=50
22=50`;

const text3 = `12-=50
34=-50`;

console.log("Parsing text1 (ลอยทั่วไป with -=):");
console.log(JSON.stringify(parseMultiLinePaste(text1, 'lao'), null, 2));

console.log("\nParsing text2 (วิ่งล่าง 2-digit):");
console.log(JSON.stringify(parseMultiLinePaste(text2, 'lao'), null, 2));

console.log("\nParsing text3 (inline typos):");
console.log(JSON.stringify(parseMultiLinePaste(text3, 'lao'), null, 2));

