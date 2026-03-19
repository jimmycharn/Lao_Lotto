import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BET_TYPES } from '../../constants/lotteryTypes'
import { FiCpu, FiAlertTriangle, FiCheckCircle, FiArrowRight, FiLoader } from 'react-icons/fi'

const RISK_COLORS = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#f97316',
    critical: '#ef4444'
}

const RISK_LABELS = {
    low: 'ต่ำ',
    medium: 'ปานกลาง',
    high: 'สูง',
    critical: 'วิกฤต'
}

export default function AIAnalysisModal({ 
    show, 
    onClose, 
    round, 
    user, 
    onApplyRecommendations 
}) {
    const [budget, setBudget] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [selectedRecs, setSelectedRecs] = useState({})

    if (!show) return null

    const currencySymbol = round?.currency_symbol || '฿'

    const handleAnalyze = async () => {
        const budgetNum = parseInt(budget)
        if (!budgetNum || budgetNum <= 0) {
            setError('กรุณากรอกวงเงินสู้')
            return
        }

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            const response = await fetch(`${supabaseUrl}/functions/v1/ai-analyze-transfers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'apikey': supabaseAnonKey
                },
                body: JSON.stringify({
                    round_id: round.id,
                    budget: budgetNum,
                    dealer_id: user.id,
                    lottery_type: round.lottery_type,
                    currency_symbol: currencySymbol
                })
            })

            const data = await response.json()
            if (!data?.success) throw new Error(data?.message || 'AI analysis failed')

            setResult(data)
            // Auto-select all recommendations
            const autoSelect = {}
            data.data?.recommendations?.forEach((rec, i) => {
                autoSelect[i] = true
            })
            setSelectedRecs(autoSelect)
        } catch (err) {
            console.error('AI analysis error:', err)
            setError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์')
        } finally {
            setLoading(false)
        }
    }

    const toggleRec = (index) => {
        setSelectedRecs(prev => ({ ...prev, [index]: !prev[index] }))
    }

    const toggleSelectAll = () => {
        const recs = result?.data?.recommendations || []
        const allSelected = recs.every((_, i) => selectedRecs[i])
        const newSelected = {}
        if (!allSelected) {
            recs.forEach((_, i) => { newSelected[i] = true })
        }
        setSelectedRecs(newSelected)
    }

    const handleApply = () => {
        if (!result?.data?.recommendations) return
        const selected = result.data.recommendations.filter((_, i) => selectedRecs[i])
        if (selected.length === 0) return
        onApplyRecommendations(selected)
        onClose()
    }

    const selectedCount = Object.values(selectedRecs).filter(Boolean).length
    const totalTransferAmount = result?.data?.recommendations
        ?.filter((_, i) => selectedRecs[i])
        ?.reduce((sum, r) => sum + (r.transfer_amount || 0), 0) || 0

    const analysis = result?.data?.analysis
    const recommendations = result?.data?.recommendations || []
    const meta = result?.meta

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'auto' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <FiCpu style={{ color: 'var(--color-primary)' }} /> AI วิเคราะห์ตีออก
                    </h3>
                    <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.25rem', padding: '0.25rem' }}>✕</button>
                </div>

                {/* Budget Input */}
                {!result && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                            กรอกวงเงินที่คุณพร้อมสู้ (budget) แล้ว AI จะวิเคราะห์ว่าควรตีออกเลขไหนบ้าง
                        </p>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                            วงเงินสู้ ({currencySymbol})
                        </label>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="เช่น 500000"
                                value={budget}
                                onChange={e => setBudget(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                style={{ flex: 1, fontSize: '1.1rem' }}
                                autoFocus
                            />
                            <button 
                                className="btn btn-primary" 
                                onClick={handleAnalyze} 
                                disabled={loading || !budget}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
                            >
                                {loading ? (
                                    <><span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> กำลังวิเคราะห์...</>
                                ) : (
                                    <><FiCpu /> วิเคราะห์</>
                                )}
                            </button>
                        </div>

                        {/* Quick budget buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                            {[100000, 200000, 500000, 1000000, 2000000].map(amt => (
                                <button 
                                    key={amt}
                                    className="btn btn-outline" 
                                    onClick={() => setBudget(amt.toString())}
                                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                >
                                    {currencySymbol}{amt.toLocaleString()}
                                </button>
                            ))}
                        </div>

                        {error && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: '8px', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
                                <FiAlertTriangle style={{ marginRight: '0.5rem' }} />{error}
                            </div>
                        )}
                    </div>
                )}

                {/* Loading state */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
                        <div style={{ 
                            width: '40px', height: '40px', margin: '0 auto 1rem', 
                            border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid var(--color-primary)', 
                            borderRadius: '50%', animation: 'spin 1s linear infinite' 
                        }} />
                        <p style={{ color: 'var(--color-text-muted)' }}>AI กำลังวิเคราะห์ข้อมูล...</p>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>อาจใช้เวลา 3-10 วินาที</p>
                    </div>
                )}

                {/* Results */}
                {result && !loading && (
                    <>
                        {/* Analysis Summary */}
                        {analysis && (
                            <div style={{ 
                                marginBottom: '1.5rem', padding: '1rem', 
                                background: 'var(--color-surface)', borderRadius: '10px',
                                border: `1px solid ${RISK_COLORS[analysis.risk_level] || '#666'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>ผลวิเคราะห์</span>
                                    <span style={{ 
                                        padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                                        background: `${RISK_COLORS[analysis.risk_level]}20`,
                                        color: RISK_COLORS[analysis.risk_level]
                                    }}>
                                        ความเสี่ยง: {RISK_LABELS[analysis.risk_level] || analysis.risk_level}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>วงเงินสู้: </span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{currencySymbol}{analysis.budget?.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>จ่ายสูงสุด (worst case): </span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{currencySymbol}{(analysis.worst_case_payout || meta?.worst_case_payout)?.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>เลขเสี่ยงสูงสุด: </span>
                                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>{analysis.worst_case_number || meta?.worst_case_number || '-'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>scenarios เกินงบ: </span>
                                        <span style={{ fontWeight: 600, color: meta?.scenarios_over_budget > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                            {meta?.scenarios_over_budget || 0} / {meta?.scenario_count || 0}
                                        </span>
                                    </div>
                                </div>

                                {analysis.summary && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: 0, lineHeight: 1.5 }}>
                                        {analysis.summary}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Recommendations */}
                        {recommendations.length > 0 ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                        รายการแนะนำตีออก ({recommendations.length} รายการ)
                                    </h4>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={recommendations.length > 0 && recommendations.every((_, i) => selectedRecs[i])}
                                            onChange={toggleSelectAll}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                                        />
                                        เลือกทั้งหมด
                                    </label>
                                </div>

                                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                                    {recommendations.map((rec, i) => (
                                        <label 
                                            key={i} 
                                            style={{ 
                                                display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem',
                                                background: selectedRecs[i] ? 'rgba(99,102,241,0.08)' : 'var(--color-surface)',
                                                borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer',
                                                border: selectedRecs[i] ? '1px solid var(--color-primary)' : '1px solid transparent',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={!!selectedRecs[i]} 
                                                onChange={() => toggleRec(i)}
                                                style={{ marginTop: '0.2rem', width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                    <div>
                                                        <span style={{ 
                                                            fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem',
                                                            color: 'var(--color-text)', letterSpacing: '0.05em'
                                                        }}>
                                                            {rec.numbers}
                                                        </span>
                                                        <span style={{ 
                                                            marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.1rem 0.4rem',
                                                            background: 'var(--color-surface-alt, rgba(255,255,255,0.05))', borderRadius: '4px',
                                                            color: 'var(--color-text-muted)'
                                                        }}>
                                                            {BET_TYPES[rec.bet_type] || rec.bet_type}
                                                        </span>
                                                    </div>
                                                    <span style={{ 
                                                        fontWeight: 700, color: 'var(--color-danger)', fontSize: '0.95rem'
                                                    }}>
                                                        ตีออก {currencySymbol}{rec.transfer_amount?.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                                                    <span>ยอดปัจจุบัน: {currencySymbol}{rec.current_amount?.toLocaleString()}</span>
                                                    <span><FiArrowRight style={{ verticalAlign: 'middle' }} /></span>
                                                    <span>เก็บไว้: {currencySymbol}{rec.keep_amount?.toLocaleString()}</span>
                                                </div>
                                                {rec.reason && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                        💡 {rec.reason}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {/* Action buttons */}
                                <div style={{ 
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '1rem', background: 'var(--color-surface)', borderRadius: '10px',
                                    marginTop: '0.5rem'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                            เลือก {selectedCount}/{recommendations.length} รายการ
                                        </div>
                                        <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                                            รวมตีออก: {currencySymbol}{totalTransferAmount.toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn btn-outline" onClick={() => { setResult(null); setSelectedRecs({}); }}>
                                            วิเคราะห์ใหม่
                                        </button>
                                        <button 
                                            className="btn btn-primary" 
                                            onClick={handleApply} 
                                            disabled={selectedCount === 0}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                        >
                                            <FiCheckCircle /> ยืนยันตีออก ({selectedCount})
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-success)' }}>
                                <FiCheckCircle style={{ fontSize: '2rem', marginBottom: '0.5rem' }} />
                                <p style={{ fontWeight: 600 }}>ไม่จำเป็นต้องตีออก</p>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                    ความเสี่ยงอยู่ในระดับที่วงเงินสู้รับไหว
                                </p>
                            </div>
                        )}

                        {/* Token usage info */}
                        {meta?.tokens_used > 0 && (
                            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                                AI tokens used: {meta.tokens_used}
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
