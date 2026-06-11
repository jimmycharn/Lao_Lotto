const fs = require('fs');
const logFilePath = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\5276a4ed-b9ef-484d-b17d-9cfb38530d67\\.system_generated\\logs\\transcript.jsonl';

try {
    const data = fs.readFileSync(logFilePath, 'utf8');
    const lines = data.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (parsed.content && parsed.content.includes('COMMAND 3: /bal')) {
            console.log(`Step ${parsed.step_index}:`);
            console.log(parsed.content);
            console.log("---------------------------------------");
        }
    }
} catch (e) {
    console.error(e);
}
