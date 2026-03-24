import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiSettings,
    FiPackage,
    FiCheck,
    FiX,
    FiGift
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

// Member Settings Component - With Lottery Type Tabs
// Refactored from UserSettingsModal to support inline rendering
export default function MemberSettings({ member, onClose, isInline = false }) {
    const { user } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('thai')

    // Default settings structure with commission and payout rates
    const getDefaultSettings = () => ({
        thai: {
            bonusEnabled: false,
            'run_top': { commission: 15, payout: 3, bonus: 0 },
            'run_bottom': { commission: 15, payout: 4, bonus: 0 },
            'pak_top': { commission: 15, payout: 8, bonus: 0 },
            'pak_bottom': { commission: 15, payout: 6, bonus: 0 },
            '2_top': { commission: 15, payout: 65, bonus: 0 },
            '2_front': { commission: 15, payout: 65, bonus: 0 },
            '2_center': { commission: 15, payout: 65, bonus: 0 },
            '2_run': { commission: 15, payout: 10, bonus: 0 },
            '2_bottom': { commission: 15, payout: 65, bonus: 0 },
            '3_top': { commission: 30, payout: 550, bonus: 0 },
            '3_tod': { commission: 15, payout: 100, bonus: 0 },
            '3_bottom': { commission: 15, payout: 135, bonus: 0 },
            '4_float': { commission: 15, payout: 20, bonus: 0 },
            '5_float': { commission: 15, payout: 10, bonus: 0 }
        },
        lao: {
            bonusEnabled: false,
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
            'run_top': { commission: 15, payout: 3, bonus: 0 },
            'run_bottom': { commission: 15, payout: 4, bonus: 0 },
            'pak_top': { commission: 15, payout: 8, bonus: 0 },
            'pak_bottom': { commission: 15, payout: 6, bonus: 0 },
            '2_top': { commission: 15, payout: 65, bonus: 0 },
            '2_front': { commission: 15, payout: 65, bonus: 0 },
            '2_center': { commission: 15, payout: 65, bonus: 0 },
            '2_run': { commission: 15, payout: 10, bonus: 0 },
            '2_bottom': { commission: 15, payout: 65, bonus: 0 },
            '3_straight': { commission: 30, payout: 550, bonus: 0 },
            '3_tod_single': { commission: 15, payout: 100, bonus: 0 },
            '4_float': { commission: 15, payout: 20, bonus: 0 },
            '5_float': { commission: 15, payout: 10, bonus: 0 }
        },
        hanoi: {
            bonusEnabled: false,
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
            'run_top': { commission: 15, payout: 3, bonus: 0 },
            'run_bottom': { commission: 15, payout: 4, bonus: 0 },
            'pak_top': { commission: 15, payout: 8, bonus: 0 },
            'pak_bottom': { commission: 15, payout: 6, bonus: 0 },
            '2_top': { commission: 15, payout: 65, bonus: 0 },
            '2_front': { commission: 15, payout: 65, bonus: 0 },
            '2_center': { commission: 15, payout: 65, bonus: 0 },
            '2_run': { commission: 15, payout: 10, bonus: 0 },
            '2_bottom': { commission: 15, payout: 65, bonus: 0 },
            '3_straight': { commission: 30, payout: 550, bonus: 0 },
            '3_tod_single': { commission: 15, payout: 100, bonus: 0 },
            '4_float': { commission: 15, payout: 20, bonus: 0 },
            '5_float': { commission: 15, payout: 10, bonus: 0 }
        },
        stock: {
            bonusEnabled: false,
            '2_top': { commission: 15, payout: 65, bonus: 0 },
            '2_bottom': { commission: 15, payout: 65, bonus: 0 }
        }
    })

    const [settings, setSettings] = useState(getDefaultSettings())
    const [blockedLotteryTypes, setBlockedLotteryTypes] = useState([])

    // Labels for each bet type
    const BET_LABELS = {
        thai: {
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวบน',
            '3_tod': '3 ตัวโต๊ด',
            '3_bottom': '3 ตัวล่าง',
            '4_float': '4 ตัวลอย',
            '5_float': '5 ตัวลอย'
        },
        lao: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง',
            '3_tod_single': '3 ตัวโต๊ด',
            '4_float': '4 ตัวลอย',
            '5_float': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง',
            '3_tod_single': '3 ตัวโต๊ด',
            '4_float': '4 ตัวลอย',
            '5_float': '5 ตัวลอย'
        },
        stock: {
            '2_top': '2 ตัวบน',
            '2_bottom': '2 ตัวล่าง'
        }
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
    }, [member.id])

    async function fetchSettings() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', member.id)
                .eq('dealer_id', user.id)
                .single()

            if (data && data.lottery_settings) {
                const merged = { ...getDefaultSettings() }
                Object.keys(data.lottery_settings).forEach(tab => {
                    if (tab === '_blocked_lottery_types') return
                    if (merged[tab]) {
                        // Merge bonusEnabled flag
                        if (data.lottery_settings[tab].bonusEnabled !== undefined) {
                            merged[tab].bonusEnabled = data.lottery_settings[tab].bonusEnabled
                        }
                        Object.keys(data.lottery_settings[tab]).forEach(key => {
                            if (key === 'bonusEnabled') return
                            if (merged[tab][key]) {
                                // Handle 4_set with nested prizes structure
                                if (key === '4_set' && data.lottery_settings[tab][key].prizes) {
                                    merged[tab][key] = {
                                        ...merged[tab][key],
                                        ...data.lottery_settings[tab][key],
                                        prizes: {
                                            ...merged[tab][key].prizes,
                                            ...data.lottery_settings[tab][key].prizes
                                        }
                                    }
                                } else {
                                    merged[tab][key] = { ...merged[tab][key], ...data.lottery_settings[tab][key] }
                                }
                            }
                        })
                    }
                })
                setSettings(merged)
                // Load blocked lottery types
                if (data.lottery_settings._blocked_lottery_types) {
                    setBlockedLotteryTypes(data.lottery_settings._blocked_lottery_types)
                }
            }
        } catch (error) {
            console.error('Error fetching user settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const settingsToSave = { ...settings, _blocked_lottery_types: blockedLotteryTypes }
            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: member.id,
                    dealer_id: user.id,
                    lottery_settings: settingsToSave,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, dealer_id' })

            if (error) throw error
            toast.success('บันทึกการตั้งค่าสำเร็จ')
            if (!isInline) onClose()
        } catch (error) {
            console.error('Error saving user settings:', error)
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
                [key]: {
                    ...prev[tab][key],
                    [field]: parseFloat(value) || 0
                }
            }
        }))
    }

    // Handle Enter key to jump to next input and select all
    const handleSettingsInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const form = e.target.closest('.settings-form, .member-settings-inline')
            if (!form) return

            const inputs = Array.from(form.querySelectorAll('input[type="number"]:not([disabled])'))
            const currentIndex = inputs.indexOf(e.target)

            if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
                const nextInput = inputs[currentIndex + 1]
                nextInput.focus()
                nextInput.select() // Select all text in next input
            }
        }
    }

    // Handle focus to select all text
    const handleSettingsInputFocus = (e) => {
        e.target.select()
    }

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    const content = (
        <div className={isInline ? "member-settings-inline" : "modal modal-xl"} onClick={e => !isInline && e.stopPropagation()}>
            {!isInline && (
                <div className="modal-header">
                    <h3><FiSettings /> ตั้งค่าสมาชิก: {member.full_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>
            )}

            {isInline && (
                <div className="settings-header-inline" style={{ marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>ตั้งค่า: {member.full_name}</h3>
                </div>
            )}

            <div className={isInline ? "settings-body" : "modal-body"}>
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div className="settings-form">
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

                        {/* เปิดแถม Checkbox */}
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                margin: '0.75rem 0 0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.95rem',
                                color: settings[activeTab]?.bonusEnabled ? '#22c55e' : 'var(--color-text)'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={settings[activeTab]?.bonusEnabled || false}
                                onChange={(e) => {
                                    setSettings(prev => ({
                                        ...prev,
                                        [activeTab]: {
                                            ...prev[activeTab],
                                            bonusEnabled: e.target.checked
                                        }
                                    }))
                                }}
                                style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
                            />
                            <FiGift style={{ color: settings[activeTab]?.bonusEnabled ? '#22c55e' : 'var(--color-text-muted)' }} />
                            <span style={{ fontWeight: 500 }}>เปิดแถมเงินแทง</span>
                        </label>

                        {/* ไม่อนุญาตส่งโพย Checkbox */}
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                margin: '0.75rem 0 1rem',
                                cursor: 'pointer',
                                fontSize: '0.95rem',
                                color: blockedLotteryTypes.includes(activeTab) ? '#ef4444' : 'var(--color-text)'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={blockedLotteryTypes.includes(activeTab)}
                                onChange={(e) => {
                                    setBlockedLotteryTypes(prev => 
                                        e.target.checked 
                                            ? [...prev, activeTab]
                                            : prev.filter(t => t !== activeTab)
                                    )
                                }}
                                style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 500 }}>ไม่อนุญาตส่งโพย</span>
                        </label>

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
                                                onKeyDown={handleSettingsInputKeyDown}
                                                onFocus={handleSettingsInputFocus}
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
                                                onKeyDown={handleSettingsInputKeyDown}
                                                onFocus={handleSettingsInputFocus}
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
                                                            onKeyDown={handleSettingsInputKeyDown}
                                                            onFocus={handleSettingsInputFocus}
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
                            <table className="settings-table">
                                <thead>
                                    <tr>
                                        <th>ประเภท</th>
                                        <th>ค่าคอม</th>
                                        <th>อัตราจ่าย</th>
                                        {settings[activeTab]?.bonusEnabled && <th>แถม</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(settings[activeTab] || {})
                                        .filter(([key]) => key !== '4_set' && key !== 'bonusEnabled')
                                        .map(([key, value]) => (
                                            <tr key={key}>
                                                <td className="type-cell">
                                                    {BET_LABELS[activeTab]?.[key] || key}
                                                </td>
                                                <td>
                                                    <div className="input-group">
                                                        <input
                                                            type="number"
                                                            className="form-input small"
                                                            value={value.commission}
                                                            onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                                            onKeyDown={handleSettingsInputKeyDown}
                                                            onFocus={handleSettingsInputFocus}
                                                        />
                                                        <span className="input-suffix">%</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="input-group">
                                                        <input
                                                            type="number"
                                                            className="form-input small"
                                                            value={value.payout}
                                                            onChange={e => updateSetting(activeTab, key, 'payout', e.target.value)}
                                                            onKeyDown={handleSettingsInputKeyDown}
                                                            onFocus={handleSettingsInputFocus}
                                                        />
                                                        <span className="input-suffix">เท่า</span>
                                                    </div>
                                                </td>
                                                {settings[activeTab]?.bonusEnabled && (
                                                    <td>
                                                        <div className="input-group">
                                                            <input
                                                                type="number"
                                                                className="form-input small"
                                                                value={value.bonus || 0}
                                                                onChange={e => updateSetting(activeTab, key, 'bonus', e.target.value)}
                                                                onKeyDown={handleSettingsInputKeyDown}
                                                                onFocus={handleSettingsInputFocus}
                                                            />
                                                            <span className="input-suffix">%</span>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Save Button - Inline mode only */}
                        {isInline && (
                            <div className="settings-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={loading || saving}
                                    style={{ minWidth: '180px' }}
                                >
                                    {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!isInline && (
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading || saving}
                    >
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                    </button>
                </div>
            )}
        </div>
    )

    if (isInline) return content

    return (
        <div className="modal-overlay" onClick={onClose}>
            {content}
        </div>
    )
}

