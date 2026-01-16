import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FiAlertTriangle, FiX, FiPlus, FiTrash2 } from 'react-icons/fi'
import { BET_TYPES, BET_TYPES_BY_LOTTERY } from '../../constants/lotteryTypes'

export default function NumberLimitsModal({ round, onClose }) {
    const [limits, setLimits] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newLimit, setNewLimit] = useState({
        bet_type: Object.keys(BET_TYPES_BY_LOTTERY[round.lottery_type] || {})[0] || '2_top',
        numbers: '',
        max_amount: ''
    })

    useEffect(() => {
        fetchLimits()
    }, [round.id])

    async function fetchLimits() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('number_limits')
                .select('*')
                .eq('round_id', round.id)
                .order('created_at', { ascending: false })

            if (!error) setLimits(data || [])
        } catch (error) {
            console.error('Error fetching limits:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleAddLimit() {
        if (!newLimit.numbers || !newLimit.max_amount) {
            alert('กรุณากรอกข้อมูลให้ครบ')
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase
                .from('number_limits')
                .insert({
                    round_id: round.id,
                    bet_type: newLimit.bet_type,
                    numbers: newLimit.numbers,
                    max_amount: parseFloat(newLimit.max_amount)
                })

            if (error) throw error

            setNewLimit({ ...newLimit, numbers: '', max_amount: '' })
            fetchLimits()
        } catch (error) {
            console.error('Error adding limit:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteLimit(id) {
        if (!confirm('ต้องการลบเลขอั้นนี้?')) return

        try {
            const { error } = await supabase
                .from('number_limits')
                .delete()
                .eq('id', id)

            if (!error) fetchLimits()
        } catch (error) {
            console.error('Error deleting limit:', error)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiAlertTriangle /> ตั้งค่าเลขอั้น - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="add-limit-form card">
                        <h4>เพิ่มเลขอั้นใหม่</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">ประเภท</label>
                                <select
                                    className="form-input"
                                    value={newLimit.bet_type}
                                    onChange={e => setNewLimit({ ...newLimit, bet_type: e.target.value })}
                                >
                                    {Object.entries(BET_TYPES_BY_LOTTERY[round.lottery_type] || {}).map(([key, config]) => (
                                        <option key={key} value={key}>{config.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">เลข</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 47"
                                    value={newLimit.numbers}
                                    onChange={e => setNewLimit({ ...newLimit, numbers: e.target.value.replace(/\D/g, '') })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">รับสูงสุด ({round.currency_name})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    placeholder="0"
                                    value={newLimit.max_amount}
                                    onChange={e => setNewLimit({ ...newLimit, max_amount: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button
                                    className="btn btn-primary full-width"
                                    onClick={(e) => {
                                        e.target.blur()
                                        handleAddLimit()
                                    }}
                                    disabled={saving}
                                >
                                    <FiPlus /> เพิ่ม
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="limits-list-section">
                        <h4>รายการเลขอั้นปัจจุบัน</h4>
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                            </div>
                        ) : limits.length === 0 ? (
                            <p className="text-muted">ยังไม่มีการตั้งค่าเลขอั้นเฉพาะเลข</p>
                        ) : (
                            <div className="table-wrap">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ประเภท</th>
                                            <th>เลข</th>
                                            <th>รับสูงสุด</th>
                                            <th>จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {limits.map(limit => (
                                            <tr key={limit.id}>
                                                <td>{BET_TYPES[limit.bet_type]}</td>
                                                <td className="number-cell">{limit.numbers}</td>
                                                <td>{round.currency_symbol}{limit.max_amount?.toLocaleString()}</td>
                                                <td>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={() => handleDeleteLimit(limit.id)}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    )
}
