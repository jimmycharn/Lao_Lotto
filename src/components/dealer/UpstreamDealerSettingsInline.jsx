import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiInfo,
    FiEdit2,
    FiPackage,
    FiCheck
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import UpstreamDealerSettings from './UpstreamDealerSettings'

// Upstream Dealer Settings Inline Component - For displaying commission and payout rates inline
export default function UpstreamDealerSettingsInline({ dealer, isLinked, onSaved }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('lao')

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
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
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

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

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

    const updateSetPrize = (tab, prizeKey, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                '4_set': {
                    ...prev[tab]['4_set'],
                    prizes: {
                        ...prev[tab]['4_set'].prizes,
                        [prizeKey]: parseFloat(value) || 0
                    }
                }
            }
        }))
    }

    // Handle Enter key to jump to next input and select all
    const handleSettingsInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const form = e.target.closest('.upstream-dealer-settings-inline')
            if (!form) return

            const inputs = Array.from(form.querySelectorAll('input[type="number"]:not([disabled])'))
            const currentIndex = inputs.indexOf(e.target)

            if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
                const nextInput = inputs[currentIndex + 1]
                nextInput.focus()
                nextInput.select()
            }
        }
    }

    // Handle focus to select all text
    const handleSettingsInputFocus = (e) => {
        e.target.select()
    }

    if (loading) {
        return <div className="loading-state"><div className="spinner"></div></div>
    }

    // For linked dealers, show read-only view
    const readOnly = isLinked

    return (
        <div className="upstream-dealer-settings-inline">
            {readOnly && (
                <div style={{
                    background: 'rgba(212, 175, 55, 0.1)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--color-warning)'
                }}>
                    <FiInfo style={{ marginRight: '0.5rem' }} />
                    ค่าคอมและอัตราจ่ายถูกกำหนดโดยเจ้ามือที่รับเลขจากคุณ (แก้ไขไม่ได้)
                </div>
            )}
            {!readOnly && (
                <div style={{
                    background: 'rgba(76, 175, 80, 0.1)',
                    border: '1px solid rgba(76, 175, 80, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--color-success)'
                }}>
                    <FiEdit2 style={{ marginRight: '0.5rem' }} />
                    กรอกค่าคอมและอัตราจ่ายที่เจ้ามือนอกระบบให้คุณ เพื่อใช้คำนวณรายได้
                </div>
            )}

            {/* Lottery Type Tabs */}
            <div className="settings-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {LOTTERY_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 4 ตัวชุด Section for Lao or Hanoi */}
            {(activeTab === 'lao' || activeTab === 'hanoi') && settings[activeTab]?.['4_set'] && (
                <div className="set-settings-section" style={{
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(212, 175, 55, 0.05)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(212, 175, 55, 0.2)'
                }}>
                    <h4 style={{ marginBottom: '1rem', color: 'var(--color-primary)', fontSize: '1rem' }}>
                        <FiPackage style={{ marginRight: '0.5rem' }} />
                        4 ตัวชุด
                    </h4>

                    {/* Set Price and Commission */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ราคาชุดละ</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings[activeTab]['4_set'].setPrice || 0}
                                onChange={e => updateSetting(activeTab, '4_set', 'setPrice', e.target.value)}
                                onKeyDown={handleSettingsInputKeyDown}
                                onFocus={handleSettingsInputFocus}
                                disabled={readOnly}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ค่าคอม (%)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings[activeTab]['4_set'].commission || 0}
                                onChange={e => updateSetting(activeTab, '4_set', 'commission', e.target.value)}
                                onKeyDown={handleSettingsInputKeyDown}
                                onFocus={handleSettingsInputFocus}
                                disabled={readOnly}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Prize Settings */}
                    <div style={{ fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--color-text)' }}>อัตราจ่ายรางวัล</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        {Object.entries(settings[activeTab]['4_set'].prizes || {}).map(([prizeKey, prizeValue]) => (
                            <div key={prizeKey}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                                    {SET_PRIZE_LABELS[prizeKey] || prizeKey}
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={prizeValue}
                                    onChange={e => updateSetPrize(activeTab, prizeKey, e.target.value)}
                                    onKeyDown={handleSettingsInputKeyDown}
                                    onFocus={handleSettingsInputFocus}
                                    disabled={readOnly}
                                    style={{ width: '100%', fontSize: '0.9rem' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Regular Bet Types */}
            <div className="bet-settings-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '0.75rem'
            }}>
                {Object.entries(BET_LABELS[activeTab] || {}).filter(([key]) => key !== '4_set').map(([key, label]) => (
                    <div key={key} className="bet-setting-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--color-surface-light)',
                        borderRadius: 'var(--radius-sm)'
                    }}>
                        <span style={{ flex: '1', fontSize: '0.9rem', color: 'var(--color-text)' }}>{label}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>คอม%</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={settings[activeTab]?.[key]?.commission || 0}
                                    onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                    onKeyDown={handleSettingsInputKeyDown}
                                    onFocus={handleSettingsInputFocus}
                                    disabled={readOnly}
                                    style={{ width: '60px', textAlign: 'center', fontSize: '0.85rem', padding: '0.3rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>จ่าย</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={settings[activeTab]?.[key]?.payout || 0}
                                    onChange={e => updateSetting(activeTab, key, 'payout', e.target.value)}
                                    onKeyDown={handleSettingsInputKeyDown}
                                    onFocus={handleSettingsInputFocus}
                                    disabled={readOnly}
                                    style={{ width: '70px', textAlign: 'center', fontSize: '0.85rem', padding: '0.3rem' }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Save Button - Only for non-linked dealers */}
            {!readOnly && (
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                    </button>
                </div>
            )}
        </div>
    )
}
