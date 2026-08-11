const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const funcCode = `
    async function confirmDeleteHistoryRecord() {
        if (!deleteHistoryItem) return
        setDeletingHistory(true)
        try {
            const historyId = deleteHistoryItem.id
            const roundId = deleteHistoryItem.round_id || deleteHistoryItem.id

            // 1. Delete from round_history
            const { error: err1 } = await supabase
                .from('round_history')
                .delete()
                .or(\`id.eq.\${historyId},round_id.eq.\${roundId}\`)

            if (err1) console.warn('round_history delete note:', err1)

            // 2. Delete from user_round_history
            await supabase
                .from('user_round_history')
                .delete()
                .eq('round_id', roundId)

            // 3. Delete from lottery_rounds if active closed/announced round
            await supabase
                .from('lottery_rounds')
                .delete()
                .eq('id', roundId)

            toast.success('ลบประวัติงวดหวยเรียบร้อยแล้ว')
            setDeleteHistoryItem(null)
            fetchRoundHistory()
        } catch (err) {
            console.error('Error deleting history record:', err)
            toast.error('เกิดข้อผิดพลาดในการลบประวัติ: ' + (err.message || ''))
        } finally {
            setDeletingHistory(false)
        }
    }
`;

for (let i = 270; i < 300; i++) {
    if (lines[i].includes('const toggleExpandHistory =')) {
        lines.splice(i, 0, funcCode);
        console.log('Inserted confirmDeleteHistoryRecord before toggleExpandHistory!');
        break;
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done inserting function!');
