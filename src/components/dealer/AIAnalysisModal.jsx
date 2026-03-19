import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BET_TYPES } from '../../constants/lotteryTypes'
import { FiCpu, FiAlertTriangle, FiCheckCircle, FiArrowRight, FiZap } from 'react-icons/fi'
// scenarioCalculator runs inside a Web Worker to avoid blocking the main thread

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

function getRiskLevel(worstPayout, budget) {
    if (worstPayout <= 0) return 'low'
    const ratio = worstPayout / budget
    if (ratio <= 0.5) return 'low'
    if (ratio <= 1.0) return 'medium'
    if (ratio <= 2.0) return 'high'
    return 'critical'
}

export default function AIAnalysisModal({ 
    show, 
    onClose, 
    round, 
    user,
    submissions,
    transfers,
    userSettingsMap,
    onApplyRecommendations 
}) {
    const [budget, setBudget] = useState('')
    const [loading, setLoading] = useState(false)
    const [mode, setMode] = useState(null) // null | 'formula' | 'ai'
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [selectedRecs, setSelectedRecs] = useState({})

    if (!show) return null

    const currencySymbol = round?.currency_symbol || '฿'
    const setPrice = round?.set_prices?.['4_top'] || 120

    // ---- Formula-based analysis (runs in Web Worker to avoid blocking UI) ----
    const handleFormulaAnalyze = () => {
        const budgetNum = parseInt(budget)
        if (!budgetNum || budgetNum <= 0) { setError('กรุณากรอกวงเงินสู้'); return }

        setLoading(true); setError(null); setResult(null); setMode('formula')

        const worker = new Worker(
            new URL('../../utils/scenarioWorker.js', import.meta.url),
            { type: 'module' }
        )

        worker.onmessage = (e) => {
            worker.terminate()
            const { success, result: res, error: errMsg } = e.data
            if (!success) {
                console.error('Formula worker error:', errMsg)
                setError(errMsg || 'เกิดข้อผิดพลาดในการคำนวณ')
                setLoading(false)
                return
            }
            const pre = res.pre_transfer
            const risk = getRiskLevel(pre.worst_case_payout, budgetNum)
            setResult({
                source: 'formula',
                data: {
                    analysis: {
                        budget: budgetNum, risk_level: risk,
                        worst_case_payout: pre.worst_case_payout,
                        worst_case_number: pre.worst_case_number,
                        worst_case_net: pre.worst_case_net,
                        best_case_payout: pre.best_case_payout,
                        best_case_number: pre.best_case_number,
                        best_case_net: pre.best_case_net,
                        summary: pre.scenarios_over_budget > 0
                            ? `มี ${pre.scenarios_over_budget} scenarios เกินงบ แนะนำตีออก ${res.recommendations.length} รายการ`
                            : 'ทุก scenario อยู่ในวงเงินสู้ ไม่ต้องตีออก'
                    },
                    recommendations: res.recommendations
                },
                meta: {
                    total_bet: pre.total_income, total_commission: pre.total_commission,
                    base_profit: pre.base_profit,
                    worst_case_payout: pre.worst_case_payout,
                    worst_case_number: pre.worst_case_number,
                    scenario_count: pre.total_scenarios,
                    scenarios_over_budget: pre.scenarios_over_budget,
                    item_count: res.betItems.length
                },
                post_transfer: res.post_transfer
            })
            const autoSelect = {}
            res.recommendations.forEach((_, i) => { autoSelect[i] = true })
            setSelectedRecs(autoSelect)
            setLoading(false)
        }

        worker.onerror = (e) => {
            worker.terminate()
            console.error('Formula worker error:', e)
            setError('เกิดข้อผิดพลาดในการคำนวณ')
            setLoading(false)
        }

        worker.postMessage({
            submissions: submissions || [],
            transfers: transfers || [],
            userSettingsMap: userSettingsMap || {},
            lotteryType: round.lottery_type,
            budget: budgetNum,
            setPrice
        })
    }

    // ---- AI-based analysis (calls Edge Function) ----
    const handleAIAnalyze = async () => {
        const budgetNum = parseInt(budget)
        if (!budgetNum || budgetNum <= 0) { setError('กรุณากรอกวงเงินสู้'); return }

        setLoading(true); setError(null); setResult(null); setMode('ai')
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
                    round_id: round.id, budget: budgetNum,
                    dealer_id: user.id, lottery_type: round.lottery_type,
                    currency_symbol: currencySymbol
                })
            })
            const data = await response.json()
            if (!data?.success) throw new Error(data?.message || 'AI analysis failed')
            setResult({ ...data, source: 'ai' })
            const autoSelect = {}
            data.data?.recommendations?.forEach((_, i) => { autoSelect[i] = true })
            setSelectedRecs(autoSelect)
        } catch (err) {
            console.error('AI error:', err)
            setError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์')
        } finally { setLoading(false) }
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

    const resetAnalysis = () => { setResult(null); setSelectedRecs({}); setMode(null); setError(null) }

    const selectedCount = Object.values(selectedRecs).filter(Boolean).length
    const totalTransferAmount = result?.data?.recommendations
        ?.filter((_, i) => selectedRecs[i])
        ?.reduce((sum, r) => sum + (r.transfer_amount || 0), 0) || 0

    const analysis = result?.data?.analysis
    const recommendations = result?.data?.recommendations || []
    const meta = result?.meta
    const postTransfer = result?.post_transfer

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <FiCpu style={{ color: 'var(--color-primary)' }} /> วิเคราะห์ตีออก
                    </h3>
                    <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.25rem', padding: '0.25rem' }}>✕</button>
                </div>

                {/* Budget Input + Mode Selection */}
                {!result && !loading && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                            กรอกวงเงินที่คุณพร้อมสู้ แล้วเลือกวิธีวิเคราะห์
                        </p>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                            วงเงินสู้ ({currencySymbol})
                        </label>
                        <input
                            type="number"
                            className="form-input"
                            placeholder="เช่น 500000"
                            value={budget}
                            onChange={e => setBudget(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleFormulaAnalyze()}
                            style={{ width: '100%', fontSize: '1.1rem', marginBottom: '0.75rem' }}
                            autoFocus
                        />

                        {/* Quick budget buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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

                        {/* Two analysis mode buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button 
                                onClick={handleFormulaAnalyze} 
                                disabled={!budget}
                                style={{ 
                                    flex: 1, padding: '0.85rem', borderRadius: '10px', cursor: budget ? 'pointer' : 'default',
                                    background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff',
                                    border: 'none', fontWeight: 600, fontSize: '0.9rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    opacity: budget ? 1 : 0.5
                                }}
                            >
                                <FiZap /> คำนวณตีออก
                                <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(สูตร)</span>
                            </button>
                            <button 
                                onClick={handleAIAnalyze} 
                                disabled={!budget}
                                style={{ 
                                    flex: 1, padding: '0.85rem', borderRadius: '10px', cursor: budget ? 'pointer' : 'default',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                                    border: 'none', fontWeight: 600, fontSize: '0.9rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    opacity: budget ? 1 : 0.5
                                }}
                            >
                                <FiCpu /> AI วิเคราะห์
                                <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(ลึก, 5-15s)</span>
                            </button>
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
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{mode === 'formula' ? '⚡' : '🤖'}</div>
                        <div style={{ 
                            width: '40px', height: '40px', margin: '0 auto 1rem', 
                            border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid var(--color-primary)', 
                            borderRadius: '50%', animation: 'spin 1s linear infinite' 
                        }} />
                        <p style={{ color: 'var(--color-text-muted)' }}>{mode === 'formula' ? 'กำลังคำนวณสูตร...' : 'AI กำลังวิเคราะห์...'}</p>
                        {mode === 'ai' && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>อาจใช้เวลา 5-15 วินาที</p>}
                    </div>
                )}

                {/* Results */}
                {result && !loading && (
                    <>
                        {/* Source badge */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <span style={{
                                padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                background: result.source === 'formula' ? 'rgba(6,182,212,0.15)' : 'rgba(99,102,241,0.15)',
                                color: result.source === 'formula' ? '#06b6d4' : '#818cf8'
                            }}>
                                {result.source === 'formula' ? '⚡ สูตรคำนวณ' : '🤖 AI วิเคราะห์'}
                            </span>
                        </div>

                        {/* Analysis Summary */}
                        {analysis && (
                            <div style={{ 
                                marginBottom: '1rem', padding: '1rem', 
                                background: 'var(--color-surface)', borderRadius: '10px',
                                border: `1px solid ${RISK_COLORS[analysis.risk_level] || '#666'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>ก่อนตีออก</span>
                                    <span style={{ 
                                        padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                                        background: `${RISK_COLORS[analysis.risk_level]}20`,
                                        color: RISK_COLORS[analysis.risk_level]
                                    }}>
                                        ความเสี่ยง: {RISK_LABELS[analysis.risk_level] || analysis.risk_level}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>วงเงินสู้: </span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{currencySymbol}{analysis.budget?.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>scenarios เกินงบ: </span>
                                        <span style={{ fontWeight: 600, color: (meta?.scenarios_over_budget || 0) > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                            {meta?.scenarios_over_budget || 0} / {meta?.scenario_count || 0}
                                        </span>
                                    </div>
                                </div>

                                {/* Worst case box */}
                                <div style={{ padding: '0.6rem', borderRadius: '8px', marginBottom: '0.4rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem' }}>
                                        Worst Case (เลข {analysis.worst_case_number || meta?.worst_case_number || '-'})
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>ต้องจ่าย:</span>
                                        <span style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: '1rem' }}>
                                            {currencySymbol}{(analysis.worst_case_payout || meta?.worst_case_payout || 0)?.toLocaleString()}
                                        </span>
                                    </div>
                                    {analysis.worst_case_net !== undefined && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>กำไร/ขาดทุน:</span>
                                            <span style={{ fontWeight: 700, color: analysis.worst_case_net >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '1rem' }}>
                                                {analysis.worst_case_net >= 0 ? '+' : ''}{currencySymbol}{Math.round(analysis.worst_case_net)?.toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Best case box */}
                                {analysis.best_case_net !== undefined && (
                                    <div style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem' }}>
                                            Best Case (เลข {analysis.best_case_number || '-'})
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>กำไรสูงสุด:</span>
                                            <span style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '1rem' }}>
                                                +{currencySymbol}{Math.round(analysis.best_case_net)?.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {analysis.summary && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                                        {analysis.summary}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Post-transfer summary (formula mode) */}
                        {recommendations.length > 0 && postTransfer && (
                            <div style={{ 
                                marginBottom: '1rem', padding: '0.75rem', 
                                background: 'var(--color-surface)', borderRadius: '10px',
                                border: '1px solid rgba(34,197,94,0.4)'
                            }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--color-success)' }}>
                                    หลังตีออก (ถ้าตีทั้งหมด)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.3rem', fontSize: '0.8rem' }}>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Worst จ่าย: </span>
                                        <span style={{ fontWeight: 600, color: postTransfer.worst_case_payout > analysis?.budget ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                            {currencySymbol}{Math.round(postTransfer.worst_case_payout)?.toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Worst กำไร: </span>
                                        <span style={{ fontWeight: 600, color: postTransfer.worst_case_net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                            {postTransfer.worst_case_net >= 0 ? '+' : ''}{currencySymbol}{Math.round(postTransfer.worst_case_net)?.toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Best กำไร: </span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                                            +{currencySymbol}{Math.round(postTransfer.best_case_net)?.toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)' }}>เกินงบ: </span>
                                        <span style={{ fontWeight: 600, color: postTransfer.scenarios_over_budget > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                            {postTransfer.scenarios_over_budget} / {postTransfer.total_scenarios}
                                        </span>
                                    </div>
                                </div>
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
                                        <button className="btn btn-outline" onClick={resetAnalysis}>
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
