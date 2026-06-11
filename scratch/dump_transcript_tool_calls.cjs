const fs = require('fs');
const logFilePath = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\5276a4ed-b9ef-484d-b17d-9cfb38530d67\\.system_generated\\logs\\transcript.jsonl';

try {
    const data = fs.readFileSync(logFilePath, 'utf8');
    const lines = data.split('\n');
    let idx = 0;
    for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        
        // Look for tool calls to replace_file_content or multi_replace_file_content or view_file targeting index.ts
        if (parsed.tool_calls) {
            for (const tc of parsed.tool_calls) {
                if (tc.function && tc.function.name === 'replace_file_content' && tc.function.arguments && tc.function.arguments.includes('line-bot/index.ts')) {
                    console.log(`[Step ${parsed.step_index}] replace_file_content Call:`);
                    const args = JSON.parse(tc.function.arguments);
                    console.log("StartLine:", args.StartLine, "EndLine:", args.EndLine);
                    console.log("TargetContent length:", args.TargetContent ? args.TargetContent.length : 0);
                    console.log("ReplacementContent length:", args.ReplacementContent ? args.ReplacementContent.length : 0);
                    console.log("------------------------------------------------");
                }
                if (tc.function && tc.function.name === 'view_file' && tc.function.arguments && tc.function.arguments.includes('line-bot/index.ts')) {
                    const args = JSON.parse(tc.function.arguments);
                    console.log(`[Step ${parsed.step_index}] view_file Call:`, args.StartLine, "to", args.EndLine);
                    console.log("------------------------------------------------");
                }
            }
        }
        
        // Also check if this is the step response that returned the view_file content of index.ts
        if (parsed.type === 'VIEW_FILE' && parsed.status === 'DONE' && parsed.content && parsed.content.includes('line-bot/index.ts')) {
            console.log(`[Step ${parsed.step_index}] VIEW_FILE DONE. Length:`, parsed.content.length);
            console.log("------------------------------------------------");
        }
    }
} catch (e) {
    console.error(e);
}
