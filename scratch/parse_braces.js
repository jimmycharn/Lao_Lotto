import fs from 'fs'

const code = fs.readFileSync('supabase/functions/line-bot/index.ts', 'utf8')
const lines = code.split('\n')

let braceCount = 0
const blocks = []

for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Count braces
    for (let char of line) {
        if (char === '{') {
            braceCount++
            if (line.includes('if (isManagerCommand)') || line.includes('serve(') || line.includes("event.type === 'message'")) {
                blocks.push({ type: 'open', line: i + 1, content: line.trim(), level: braceCount })
            }
        } else if (char === '}') {
            braceCount--
            if (blocks.length > 0 && blocks[blocks.length - 1].level > braceCount) {
                const last = blocks.pop()
                if (last.content.includes('isManagerCommand') || last.content.includes('serve(') || last.content.includes("event.type === 'message'")) {
                    console.log(`Block "${last.content}" started at line ${last.line} ended at line ${i + 1}`)
                }
            }
        }
    }
}
console.log('Final brace count:', braceCount)
