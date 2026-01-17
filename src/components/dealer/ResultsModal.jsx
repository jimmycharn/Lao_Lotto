import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { FiCheck, FiX, FiEdit2 } from 'react-icons/fi'
import { LOTTERY_TYPES } from '../../constants/lotteryTypes'

export default function ResultsModal({ round, onClose }) {
    const { toast } = useToast()
    const lotteryType = round.lottery_type
    const isEditing = round.is_result_announced

    const [thaiForm, setThaiForm] = useState({
        '6_top': '',
        '2_bottom': '',
        '3_bottom_1': '',
        '3_bottom_2': '',
        '3_bottom_3': '',
        '3_bottom_4': ''
    })

    const [laoForm, setLaoForm] = useState({ '4_set': '' })
    const [hanoiForm, setHanoiForm] = useState({ '4_set': '', '2_bottom': '' })
    const [stockForm, setStockForm] = useState({ '2_top': '', '2_bottom': '' })
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isEditing && round.winning_numbers) {
            const wn = round.winning_numbers

            if (lotteryType === 'thai') {
                setThaiForm({
                    '6_top': wn['6_top'] || '',
                    '2_bottom': wn['2_bottom'] || '',
                    '3_bottom_1': wn['3_bottom']?.[0] || '',
                    '3_bottom_2': wn['3_bottom']?.[1] || '',
                    '3_bottom_3': wn['3_bottom']?.[2] || '',
                    '3_bottom_4': wn['3_bottom']?.[3] || ''
                })
            } else if (lotteryType === 'lao') {
                setLaoForm({ '4_set': wn['4_set'] || '' })
            } else if (lotteryType === 'hanoi') {
                setHanoiForm({ '4_set': wn['4_set'] || '', '2_bottom': wn['2_bottom'] || '' })
            } else if (lotteryType === 'stock') {
                setStockForm({ '2_top': wn['2_top'] || '', '2_bottom': wn['2_bottom'] || '' })
            }
        }
    }, [round, isEditing, lotteryType])

    const getDerivedNumbers = () => {
        if (lotteryType === 'lao') {
            const set4 = laoForm['4_set']
            return {
                '2_top': set4.length >= 2 ? set4.slice(-2) : '',
                '2_bottom': set4.length >= 2 ? set4.slice(0, 2) : '',
                '3_top': set4.length >= 3 ? set4.slice(-3) : ''
            }
        }
        if (lotteryType === 'hanoi') {
            const set4 = hanoiForm['4_set']
            return {
                '2_top': set4.length >= 2 ? set4.slice(-2) : '',
                '3_top': set4.length >= 3 ? set4.slice(-3) : ''
            }
        }
        if (lotteryType === 'thai') {
            const six = thaiForm['6_top']
            return {
                '2_top': six.length >= 2 ? six.slice(-2) : '',
                '3_top': six.length >= 3 ? six.slice(-3) : ''
            }
        }
        return {}
    }

    const derived = getDerivedNumbers()

    const buildWinningNumbers = () => {
        if (lotteryType === 'thai') {
            return {
                '6_top': thaiForm['6_top'],
                '2_top': derived['2_top'],
                '3_top': derived['3_top'],
                '2_bottom': thaiForm['2_bottom'],
                '3_bottom': [
                    thaiForm['3_bottom_1'],
                    thaiForm['3_bottom_2'],
                    thaiForm['3_bottom_3'],
                    thaiForm['3_bottom_4']
                ].filter(n => n.length === 3)
            }
        }
        if (lotteryType === 'lao') {
            return {
                '4_set': laoForm['4_set'],
                '2_top': derived['2_top'],
                '2_bottom': derived['2_bottom'],
                '3_top': derived['3_top']
            }
        }
        if (lotteryType === 'hanoi') {
            return {
                '4_set': hanoiForm['4_set'],
                '2_top': derived['2_top'],
                '2_bottom': hanoiForm['2_bottom'],
                '3_top': derived['3_top']
            }
        }
        if (lotteryType === 'stock') {
            return {
                '2_top': stockForm['2_top'],
                '2_bottom': stockForm['2_bottom']
            }
        }
        return {}
    }

    async function handleAnnounce() {
        setLoading(true)
        try {
            const winningNumbers = buildWinningNumbers()

            const { error: roundError } = await supabase
                .from('lottery_rounds')
                .update({
                    winning_numbers: winningNumbers,
                    is_result_announced: true,
                    status: 'announced'
                })
                .eq('id', round.id)

            if (roundError) throw roundError

            if (isEditing) {
                await supabase
                    .from('submissions')
                    .update({ is_winner: false, prize_amount: 0 })
                    .eq('round_id', round.id)
                    .eq('is_deleted', false)
            }

            let winCount = 0
            try {
                const { data } = await supabase.rpc('calculate_round_winners', { p_round_id: round.id })
                winCount = data || 0
            } catch (rpcError) {
                console.warn('RPC function not available:', rpcError)
            }

            const message = isEditing
                ? `อัปเดตผลรางวัลสำเร็จ! มีผู้ถูกรางวัล ${winCount} รายการ`
                : `ประกาศผลสำเร็จ! มีผู้ถูกรางวัล ${winCount} รายการ`
            toast.success(message)
            onClose()
        } catch (error) {
            console.error('Error announcing:', error)
            toast.error('เกิดข้อผิดพลาด: ' + (error.message || 'Unknown error'))
        } finally {
            setLoading(false)
        }
    }

    const renderNumberInput = (label, value, onChange, maxLength, placeholder, isLarge = false) => (
        <div className={`form-group ${isLarge ? 'full-width' : ''}`}>
            <label className="form-label">{label}</label>
            <input
                type="text"
                inputMode="numeric"
                className={`form-input result-input ${isLarge ? 'result-input-large' : ''}`}
                maxLength={maxLength}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
            />
        </div>
    )

    const renderDerivedPreview = (numbers) => (
        <div className="derived-preview">
            <span className="derived-label">เลขที่จะบันทึก:</span>
            <div className="derived-numbers">
                {Object.entries(numbers).filter(([k, v]) => v).map(([key, val]) => (
                    <span key={key} className="derived-item">
                        <span className="derived-key">{key.replace('_', ' ')}</span>
                        <span className="derived-value">{val}</span>
                    </span>
                ))}
            </div>
        </div>
    )

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiCheck /> ใส่ผลรางวัล - {LOTTERY_TYPES[lotteryType]}</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>

                <div className="modal-body">
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        กรอกเลขที่ออกรางวัลสำหรับ <strong>{round.lottery_name}</strong>
                    </p>

                    {lotteryType === 'thai' && (
                        <div className="results-form results-form-thai">
                            {renderNumberInput('🏆 รางวัลที่ 1 (6 ตัว)', thaiForm['6_top'], val => setThaiForm({ ...thaiForm, '6_top': val }), 6, '000000', true)}
                            {derived['2_top'] && (
                                <div className="auto-derived-info">
                                    <span>→ 2 ตัวบน: <strong>{derived['2_top']}</strong></span>
                                    <span>→ 3 ตัวบน: <strong>{derived['3_top']}</strong></span>
                                </div>
                            )}
                            <div className="form-divider"></div>
                            {renderNumberInput('2 ตัวล่าง', thaiForm['2_bottom'], val => setThaiForm({ ...thaiForm, '2_bottom': val }), 2, '00')}
                            <div className="form-divider"></div>
                            <div className="form-section-label">3 ตัวล่าง (4 รางวัล)</div>
                            <div className="three-bottom-grid">
                                {renderNumberInput('ชุดที่ 1', thaiForm['3_bottom_1'], val => setThaiForm({ ...thaiForm, '3_bottom_1': val }), 3, '000')}
                                {renderNumberInput('ชุดที่ 2', thaiForm['3_bottom_2'], val => setThaiForm({ ...thaiForm, '3_bottom_2': val }), 3, '000')}
                                {renderNumberInput('ชุดที่ 3', thaiForm['3_bottom_3'], val => setThaiForm({ ...thaiForm, '3_bottom_3': val }), 3, '000')}
                                {renderNumberInput('ชุดที่ 4', thaiForm['3_bottom_4'], val => setThaiForm({ ...thaiForm, '3_bottom_4': val }), 3, '000')}
                            </div>
                        </div>
                    )}

                    {lotteryType === 'lao' && (
                        <div className="results-form results-form-lao">
                            {renderNumberInput('🎯 เลขชุด 4 ตัว', laoForm['4_set'], val => setLaoForm({ ...laoForm, '4_set': val }), 4, '0000', true)}
                            {laoForm['4_set'].length >= 2 && renderDerivedPreview({
                                '2 ตัวบน': derived['2_top'],
                                '2 ตัวล่าง': derived['2_bottom'],
                                '3 ตัวบน': derived['3_top']
                            })}
                        </div>
                    )}

                    {lotteryType === 'hanoi' && (
                        <div className="results-form results-form-hanoi">
                            {renderNumberInput('🎯 เลขชุด 4 ตัว', hanoiForm['4_set'], val => setHanoiForm({ ...hanoiForm, '4_set': val }), 4, '0000', true)}
                            {hanoiForm['4_set'].length >= 2 && (
                                <div className="auto-derived-info">
                                    <span>→ 2 ตัวบน: <strong>{derived['2_top']}</strong></span>
                                    <span>→ 3 ตัวบน: <strong>{derived['3_top']}</strong></span>
                                </div>
                            )}
                            <div className="form-divider"></div>
                            {renderNumberInput('2 ตัวล่าง (กรอกเอง)', hanoiForm['2_bottom'], val => setHanoiForm({ ...hanoiForm, '2_bottom': val }), 2, '00')}
                        </div>
                    )}

                    {lotteryType === 'stock' && (
                        <div className="results-form results-form-stock">
                            <p className="form-note">หวยหุ้น - แทงเลข 2 ตัว บนและล่าง</p>
                            <div className="stock-inputs-row">
                                {renderNumberInput('2 ตัวบน', stockForm['2_top'], val => setStockForm({ ...stockForm, '2_top': val }), 2, '00')}
                                {renderNumberInput('2 ตัวล่าง', stockForm['2_bottom'], val => setStockForm({ ...stockForm, '2_bottom': val }), 2, '00')}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
                    <button className="btn btn-primary" onClick={handleAnnounce} disabled={loading}>
                        {loading ? (isEditing ? 'กำลังอัปเดต...' : 'กำลังประกาศ...') : (
                            <>{isEditing ? <><FiEdit2 /> อัปเดตผล</> : <><FiCheck /> ประกาศผล</>}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
