const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states
const stateTarget = 'const [historyDetails, setHistoryDetails] = useState({})';
const stateReplacement = `const [historyDetails, setHistoryDetails] = useState({})
    const [deleteHistoryItem, setDeleteHistoryItem] = useState(null)
    const [deletingHistory, setDeletingHistory] = useState(false)`;

content = content.replace(stateTarget, stateReplacement);

// 2. Add confirmDeleteHistoryRecord function after fetchHistoryDetails
const funcTarget = `            setHistoryDetails(prev => ({
                ...prev,
                [historyId]: {
                    loading: false,
                    loaded: true,
                    userHistories: userHistoriesWithProfiles,
                    transfers: transfers
                }
            }))
        } catch (err) {
            console.error('Error fetching history details:', err)
            setHistoryDetails(prev => ({
                ...prev,
                [historyId]: { loading: false, loaded: true, userHistories: [] }
            }))
        }
    }`;

const funcReplacement = `            setHistoryDetails(prev => ({
                ...prev,
                [historyId]: {
                    loading: false,
                    loaded: true,
                    userHistories: userHistoriesWithProfiles,
                    transfers: transfers
                }
            }))
        } catch (err) {
            console.error('Error fetching history details:', err)
            setHistoryDetails(prev => ({
                ...prev,
                [historyId]: { loading: false, loaded: true, userHistories: [] }
            }))
        }
    }

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
    }`;

content = content.replace(funcTarget, funcReplacement);

// 3. Add Trash Button in round card header right after round-name
const roundNameTarget = `<span className="round-name" style={{ fontWeight: 600 }}>
                                                                                {LOTTERY_TYPES[history.lottery_type] || history.lottery_type}
                                                                            </span>`;

const roundNameReplacement = `<span className="round-name" style={{ fontWeight: 600 }}>
                                                                                {LOTTERY_TYPES[history.lottery_type] || history.lottery_type}
                                                                            </span>
                                                                            <button
                                                                                title="ลบประวัติงวดนี้"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDeleteHistoryItem(history);
                                                                                }}
                                                                                style={{
                                                                                    background: 'none',
                                                                                    border: 'none',
                                                                                    color: '#ef4444',
                                                                                    cursor: 'pointer',
                                                                                    padding: '0.15rem 0.35rem',
                                                                                    borderRadius: '4px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    marginLeft: '0.25rem',
                                                                                    transition: 'background 0.2s'
                                                                                }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                                                            >
                                                                                <FiTrash2 size={16} />
                                                                            </button>`;

content = content.replace(roundNameTarget, roundNameReplacement);

// 4. Add Delete Modal before Create Round Modal
const modalTarget = '{/* Create Round Modal */}';
const modalReplacement = `{/* Delete History Item Modal */}
            {deleteHistoryItem && (
                <div className="modal-overlay" onClick={() => setDeleteHistoryItem(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
                        <div style={{ color: '#ef4444', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '1rem', borderRadius: '50%', display: 'inline-flex' }}>
                                <FiTrash2 size={36} />
                            </div>
                        </div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            ยืนยันลบประวัติงวดหวย?
                        </h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            คุณต้องการลบประวัติงวด <strong style={{ color: 'var(--color-text-main)' }}>{LOTTERY_TYPES[deleteHistoryItem.lottery_type] || deleteHistoryItem.lottery_type}</strong> ({formatDate(deleteHistoryItem.round_date)}) หรือไม่? 
                            <br />
                            <span style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.5rem', display: 'block' }}>*รายการประวัติและสรุปงวดนี้จะถูกลบออกจากระบบโดยสมบูรณ์</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setDeleteHistoryItem(null)} 
                                disabled={deletingHistory}
                                style={{ flex: 1 }}
                            >
                                ยกเลิก
                            </button>
                            <button 
                                className="btn" 
                                onClick={confirmDeleteHistoryRecord} 
                                disabled={deletingHistory}
                                style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                            >
                                {deletingHistory ? 'กำลังลบ...' : 'ยืนยันลบ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Round Modal */}`;

content = content.replace(modalTarget, modalReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script add_trash_icon_clean.cjs finished!');
