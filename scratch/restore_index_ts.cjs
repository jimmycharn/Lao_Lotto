const fs = require('fs');

const logFilePath = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\5276a4ed-b9ef-484d-b17d-9cfb38530d67\\.system_generated\\logs\\transcript.jsonl';

try {
    const data = fs.readFileSync(logFilePath, 'utf8');
    const lines = data.split('\n');
    let indexTsContent = '';
    
    // We want to search for the view_file tool output of index.ts that showed lines 1720 to 1880 in the first step.
    for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        const text = JSON.stringify(parsed);
        
        if (text.includes('1720:             await sendLineReply(replyToken') && text.includes('1880:           .single();')) {
            console.log("Found matching view_file output in transcript!");
            if (parsed.content) {
                console.log(parsed.content);
            } else if (parsed.tool_calls) {
                console.log(JSON.stringify(parsed.tool_calls));
            } else {
                console.log("Found raw step:", text.substring(0, 1000));
            }
        }
    }
} catch (e) {
    console.error(e);
}
