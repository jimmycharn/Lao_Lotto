import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiSettings,
    FiPackage,
    FiCheck,
    FiX
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

// Upstream Dealer Settings Component - For setting commission and payout rates
export default function UpstreamDealerSettings({ dealer, onClose, onSaved }) {
    const { user } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('thai')

    const getDefaultSettings = () => ({
        thai: {
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_top': { commission: 30, payout: 550 },
            '3_tod': { commission: 15, payout: 100 },
            '3_bottom': { commission: 15, payout: 135 },
            '4_float': { commission: 15, payout: 20 },
            '5_float': { commission: 15, payout: 10 }
        },
        lao: {
            '4_set': {
                commission: 25,
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_float': { commission: 15, payout: 20 },
            '5_float': { commission: 15, payout: 10 }
        },
        hanoi: {
            '4_set': {
                commission: 25,
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_float': { commission: 15, payout: 20 },
            '5_float': { commission: 15, payout: 10 }
        },
        stock: {
            '2_top': { commission: 15, payout: 65 },
            '2_bottom': { commission: 15, payout: 65 }
        }
    })

    const [settings, setSettings] = useState(getDefaultSettings())

    const BET_LABELS = {
        thai: {
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวบน', '3_tod': '3 ตัวโต๊ด', '3_bottom': '3 ตัวล่าง',
            '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
        },
        lao: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวตรง', '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวตรง', '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
        },
        stock: { '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง' }
    }

    const SET_PRIZE_LABELS = {
        '4_straight_set': '4 ตัวตรงชุด',
        '4_tod_set': '4 ตัวโต๊ดชุด',
        '3_straight_set': '3 ตัวตรงชุด',
        '3_tod_set': '3 ตัวโต๊ดชุด',
        '2_front_set': '2 ตัวหน้าชุด',
        '2_back_set': '2 ตัวหลังชุด'
    }

    useEffect(() => {
        fetchSettings()
    }, [dealer.id])

    async function fetchSettings() {
        setLoading(true)
        try {
            if (dealer.lottery_settings) {
                const merged = { ...getDefaultSettings() }
                Object.keys(dealer.lottery_settings).forEach(tab => {
                    if (merged[tab]) {
                        Object.keys(dealer.lottery_settings[tab]).forEach(key => {
                            if (merged[tab][key]) {
                                merged[tab][key] = { ...merged[tab][key], ...dealer.lottery_settings[tab][key] }
                            }
                        })
                    }
                })
                setSettings(merged)
            }
        } catch (error) {
            console.error('Error loading settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({
                    lottery_settings: settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.id)

            if (error) throw error
            toast.success('บันทึกการตั้งค่าสำเร็จ')
            onSaved?.()
            onClose()
        } catch (error) {
            console.error('Error saving settings:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const updateSetting = (tab, key, field, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                [key]: { ...prev[tab][key], [field]: parseFloat(value) || 0 }
            }
        }))
    }

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiSettings /> ตั้งค่าเจ้ามือ: {dealer.upstream_name}</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state"><div className="spinner"></div></div>
                    ) : (
                        <div className="settings-form">
                            <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                ตั้งค่าคอมมิชชั่นและอัตราจ่ายสำหรับเลขที่รับจากเจ้ามือนี้
                            </p>
                            <div className="settings-tabs">
                                {LOTTERY_TABS.map(tab => (
                                    <button
                                        key={tab.key}
                                        className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* 4 ตัวชุด Section for Lao or Hanoi */}
                            {(activeTab === 'lao' || activeTab === 'hanoi') && settings[activeTab]?.['4_set'] && (
                                <div className="set-settings-section" style={{ marginBottom: '1.5rem' }}>
                                    <h4 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>
                                        <FiPackage style={{ marginRight: '0.5rem' }} />
                                        4 ตัวชุด
                                    </h4>

                                    {/* Set Price and Commission Row */}
                                    <div className="set-config-row">
                                        <div className="set-config-item">
                                            <span className="info-label">ราคาชุดละ:</span>
                                            <div className="input-group input-group-wide">
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={settings[activeTab]['4_set'].setPrice || 120}
                                                    onChange={e => {
                                                        const newSettings = { ...settings }
                                                        newSettings[activeTab]['4_set'].setPrice = Number(e.target.value)
                                                        setSettings(newSettings)
                                                    }}
                                                />
                                                <span className="input-suffix">บาท</span>
                                            </div>
                                        </div>
                                        <div className="set-config-item">
                                            <span className="info-label">ค่าคอม:</span>
                                            <div className="input-group input-group-wide">
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={settings[activeTab]['4_set'].commission}
                                                    onChange={e => {
                                                        const newSettings = { ...settings }
                                                        newSettings[activeTab]['4_set'].commission = Number(e.target.value)
                                                        setSettings(newSettings)
                                                    }}
                                                />
                                                <span className="input-suffix">฿/ชุด</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Prize Table */}
                                    <table className="settings-table settings-table-wide">
                                        <thead>
                                            <tr>
                                                <th>ประเภทรางวัล</th>
                                                <th>เงินรางวัล (บาท/ชุด)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(settings[activeTab]['4_set'].prizes || {}).map(([prizeKey, prizeAmount]) => (
                                                <tr key={prizeKey}>
                                                    <td className="type-cell">{SET_PRIZE_LABELS[prizeKey] || prizeKey}</td>
                                                    <td>
                                                        <div className="input-group input-group-wide">
                                                            <input
                                                                type="number"
                                                                className="form-input"
                                                                value={prizeAmount}
                                                                onChange={e => {
                                                                    const newSettings = { ...settings }
                                                                    newSettings[activeTab]['4_set'].prizes[prizeKey] = Number(e.target.value)
                                                                    setSettings(newSettings)
                                                                }}
                                                            />
                                                            <span className="input-suffix">บาท</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Regular Bet Types Table */}
                            <div className="settings-table-wrap">
                                <table className="settings-table settings-table-wide">
                                    <thead>
                                        <tr>
                                            <th>ประเภท</th>
                                            <th>ค่าคอม</th>
                                            <th>อัตราจ่าย</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(settings[activeTab] || {})
                                            .filter(([key]) => key !== '4_set')
                                            .map(([key, value]) => (
                                                <tr key={key}>
                                                    <td className="type-cell">{BET_LABELS[activeTab]?.[key] || key}</td>
                                                    <td>
                                                        <div className="input-group input-group-wide">
                                                            <input
                                                                type="number"
                                                                className="form-input"
                                                                value={value.commission}
                                                                onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                                            />
                                                            <span className="input-suffix">%</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="input-group input-group-wide">
                                                            <input
                                                                type="number"
                                                                className="form-input"
                                                                value={value.payout}
                                                                onChange={e => updateSetting(activeTab, key, 'payout', e.target.value)}
                                                            />
                                                            <span className="input-suffix">เท่า</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
