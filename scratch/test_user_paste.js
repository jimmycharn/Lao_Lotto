import { parseMultiLinePaste } from '../src/utils/pasteParser.js';

const text = `307=10*10
896=10*10
906=10*10
890=10*10

ล
14=10*10

ป้าตา`;

console.log("Parsing text for lao:");
const result = parseMultiLinePaste(text, 'lao');
console.log(JSON.stringify(result, null, 2));
