import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
    FiCalendar,
    FiAward,
    FiUser,
    FiDollarSign,
    FiCheck,
    FiCreditCard,
    FiStar,
    FiGift
} from 'react-icons/fi'
import BankAccountCard from '../BankAccountCard'

// Dealer Info Tab Component - Shows selected dealer's information
export default function DealerInfoTab({ dealer, userSettings: userSettingsProp, isOwnDealer }) {
    const { user } = useAuth()
    // Local mirror for optimistic UI updates (toggles reflect immediately without waiting for realtime)
    const [userSettings, setUserSettings] = useState(userSettingsProp)
    useEffect(() => { setUserSettings(userSettingsProp) }, [userSettingsProp])
    const [dealerProfile, setDealerProfile] = useState(null)
    const [dealerBankAccounts, setDealerBankAccounts] = useState([])
    const [assignedBankAccountId, setAssignedBankAccountId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [subTab, setSubTab] = useState(isOwnDealer ? 'rounds' : 'profile') // Different default tabs
    const [ratesTab, setRatesTab] = useState('thai') // lottery type tab for rates
    const [savingBonus, setSavingBonus] = useState(false)
    const [savingDealerCanSubmit, setSavingDealerCanSubmit] = useState(false)

    // User's own bank accounts
    const [userBankAccounts, setUserBankAccounts] = useState([])
    const [memberBankAccountId, setMemberBankAccountId] = useState(null)
    const [savingBank, setSavingBank] = useState(false)

    useEffect(() => {
        if (dealer?.id) {
            fetchDealerInfo()
        }
    }, [dealer?.id])

    async function fetchDealerInfo() {
        setLoading(true)
        try {
            // Fetch dealer profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', dealer.id)
                .single()

            if (profileData) {
                setDealerProfile(profileData)
            }

            // Fetch dealer bank accounts
            const { data: bankData } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', dealer.id)
                .order('is_default', { ascending: false })

            if (bankData) {
                setDealerBankAccounts(bankData)
            }

            // Fetch membership to get assigned_bank_account_id and member_bank_account_id
            if (user?.id) {
                const { data: membershipData } = await supabase
                    .from('user_dealer_memberships')
                    .select('assigned_bank_account_id, member_bank_account_id')
                    .eq('user_id', user.id)
                    .eq('dealer_id', dealer.id)
                    .eq('status', 'active')
                    .single()

                if (membershipData) {
                    setAssignedBankAccountId(membershipData.assigned_bank_account_id)
                    setMemberBankAccountId(membershipData.member_bank_account_id)
                }

                // Fetch user's own bank accounts
                const { data: userBanks } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true })

                if (userBanks) {
                    setUserBankAccounts(userBanks)
                }
            }
        } catch (error) {
            console.error('Error fetching dealer info:', error)
        } finally {
            setLoading(false)
        }
    }

    // Get assigned bank account or default/first bank account
    const primaryBank = assignedBankAccountId
        ? dealerBankAccounts.find(b => b.id === assignedBankAccountId)
        : (dealerBankAccounts.find(b => b.is_default) || dealerBankAccounts[0])

    // Get the user bank account currently assigned to this dealer
    const currentMemberBank = memberBankAccountId
        ? userBankAccounts.find(b => b.id === memberBankAccountId)
        : (userBankAccounts.find(b => b.is_default) || userBankAccounts[0])

    // Update which user bank account is visible to this dealer
    async function handleUpdateMemberBank(bankAccountId) {
        setSavingBank(true)
        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ member_bank_account_id: bankAccountId || null })
                .eq('user_id', user.id)
                .eq('dealer_id', dealer.id)
                .eq('status', 'active')

            if (error) throw error
            setMemberBankAccountId(bankAccountId || null)
        } catch (error) {
            console.error('Error updating member bank:', error)
        } finally {
            setSavingBank(false)
        }
    }

    // Commission and payout rates from user settings
    const commissionRates = userSettings?.commission_rates || {}
    const payoutRates = userSettings?.payout_rates || {}

    if (loading) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
            </div>
        )
    }

    // Default settings and labels for rates display
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

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    // Merge user settings with defaults
    const getMergedSettings = () => {
        const defaults = getDefaultSettings()
        if (!userSettings?.lottery_settings) return defaults

        const merged = { ...defaults }
        Object.keys(userSettings.lottery_settings).forEach(tab => {
            if (tab === '_blocked_lottery_types') return
            if (merged[tab]) {
                if (userSettings.lottery_settings[tab].bonusEnabled !== undefined) {
                    merged[tab].bonusEnabled = userSettings.lottery_settings[tab].bonusEnabled
                }
                if (userSettings.lottery_settings[tab].dealerCanSubmit !== undefined) {
                    merged[tab].dealerCanSubmit = userSettings.lottery_settings[tab].dealerCanSubmit
                }
                Object.keys(userSettings.lottery_settings[tab]).forEach(key => {
                    if (key === 'bonusEnabled' || key === 'dealerCanSubmit') return
                    if (merged[tab][key]) {
                        merged[tab][key] = { ...merged[tab][key], ...userSettings.lottery_settings[tab][key] }
                    }
                })
            }
        })
        return merged
    }

    const settings = getMergedSettings()

    // Save bonus settings (bonusEnabled + bonus %) to user_settings
    async function handleSaveBonusSettings(lotteryKey, bonusEnabled, bonusUpdates) {
        setSavingBonus(true)
        try {
            // Build updated lottery_settings preserving existing data
            const existingSettings = userSettings?.lottery_settings || {}
            const updatedTab = { ...existingSettings[lotteryKey], bonusEnabled }
            // Apply bonus % updates
            for (const [betKey, bonusVal] of Object.entries(bonusUpdates)) {
                if (updatedTab[betKey]) {
                    updatedTab[betKey] = { ...updatedTab[betKey], bonus: bonusVal }
                }
            }
            const newLotterySettings = { ...existingSettings, [lotteryKey]: updatedTab }

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    dealer_id: dealer.id,
                    lottery_settings: newLotterySettings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, dealer_id' })

            if (error) throw error
            // Optimistically reflect in local state so UI updates immediately
            setUserSettings(prev => ({ ...(prev || {}), lottery_settings: newLotterySettings }))
        } catch (error) {
            console.error('Error saving bonus settings:', error)
        } finally {
            setSavingBonus(false)
        }
    }

    // Save dealerCanSubmit flag to user_settings.lottery_settings[lotteryKey]
    async function handleSaveDealerCanSubmit(lotteryKey, dealerCanSubmit) {
        setSavingDealerCanSubmit(true)
        try {
            const existingSettings = userSettings?.lottery_settings || {}
            const updatedTab = { ...existingSettings[lotteryKey], dealerCanSubmit }
            const newLotterySettings = { ...existingSettings, [lotteryKey]: updatedTab }

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    dealer_id: dealer.id,
                    lottery_settings: newLotterySettings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, dealer_id' })

            if (error) throw error
            // Optimistically reflect in local state so UI updates immediately
            setUserSettings(prev => ({ ...(prev || {}), lottery_settings: newLotterySettings }))
        } catch (error) {
            console.error('Error saving dealerCanSubmit:', error)
        } finally {
            setSavingDealerCanSubmit(false)
        }
    }

    return (
        <div className="dealer-info-section">
            {/* Sub-tabs */}
            <div className="sub-tabs">
                {isOwnDealer ? (
                    // Own dealer tabs: งวดที่เปิด | ผลรางวัล | โปรไฟล์
                    <>
                        <button
                            className={`sub-tab-btn ${subTab === 'rounds' ? 'active' : ''}`}
                            onClick={() => setSubTab('rounds')}
                        >
                            <FiCalendar /> งวดที่เปิด
                        </button>
                        <button
                            className={`sub-tab-btn ${subTab === 'results' ? 'active' : ''}`}
                            onClick={() => setSubTab('results')}
                        >
                            <FiAward /> ผลรางวัล
                        </button>
                        <button
                            className={`sub-tab-btn ${subTab === 'profile' ? 'active' : ''}`}
                            onClick={() => setSubTab('profile')}
                        >
                            <FiUser /> โปรไฟล์
                        </button>
                    </>
                ) : (
                    // Other dealer tabs: งวดที่เปิด | ผลรางวัล | เจ้ามือ
                    <>
                        <button
                            className={`sub-tab-btn ${subTab === 'profile' ? 'active' : ''}`}
                            onClick={() => setSubTab('profile')}
                        >
                            <FiUser /> โปรไฟล์เจ้ามือ
                        </button>
                        <button
                            className={`sub-tab-btn ${subTab === 'rates' ? 'active' : ''}`}
                            onClick={() => setSubTab('rates')}
                        >
                            <FiDollarSign /> ค่าคอม/อัตราจ่าย
                        </button>
                    </>
                )}
            </div>

            {subTab === 'profile' ? (
                <>
                    {/* Dealer Info Card */}
                    <div className="profile-card card">
                        <div className="profile-header">
                            <div className="profile-avatar dealer-avatar">
                                <FiUser />
                            </div>
                            <div className="profile-info">
                                <h2>{dealerProfile?.full_name || dealer.full_name || 'ไม่ระบุชื่อ'}</h2>
                                <p className="email">{dealerProfile?.email || dealer.email}</p>
                                <span className="role-badge role-dealer">เจ้ามือ</span>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="profile-details card">
                        <h3>ข้อมูลติดต่อ</h3>
                        <div className="profile-info-list">
                            <div className="info-row">
                                <span className="info-label">ชื่อ</span>
                                <span className="info-value">{dealerProfile?.full_name || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">อีเมล</span>
                                <span className="info-value">{dealerProfile?.email || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">เบอร์โทร</span>
                                <span className="info-value">{dealerProfile?.phone || '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Dealer's Bank Account for Transfer */}
                    <div className="profile-details card">
                        <h3>บัญชีเจ้ามือ (สำหรับโอนเงิน)</h3>
                        {primaryBank ? (
                            <BankAccountCard bank={primaryBank} />
                        ) : (
                            <div className="empty-state small">
                                <p>ยังไม่มีข้อมูลบัญชีธนาคาร</p>
                            </div>
                        )}
                    </div>

                    {/* My Bank Account visible to this dealer */}
                    {!isOwnDealer && (
                        <div className="profile-details card">
                            <h3><FiCreditCard style={{ verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />บัญชีของฉันที่เจ้ามือเห็น</h3>
                            {userBankAccounts.length > 0 ? (
                                <>
                                    {/* Current assigned bank display */}
                                    {currentMemberBank && (
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <BankAccountCard bank={currentMemberBank} />
                                        </div>
                                    )}

                                    {/* Dropdown to change */}
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <label style={{
                                            display: 'block',
                                            color: 'var(--color-text-muted)',
                                            fontSize: '0.85rem',
                                            marginBottom: '0.35rem',
                                            fontWeight: 500
                                        }}>
                                            เลือกบัญชีที่ต้องการให้เจ้ามือเห็น:
                                        </label>
                                        <select
                                            className="form-input"
                                            value={memberBankAccountId || ''}
                                            onChange={(e) => handleUpdateMemberBank(e.target.value || null)}
                                            disabled={savingBank}
                                            style={{ width: '100%', fontSize: '0.9rem' }}
                                        >
                                            <option value="">ใช้บัญชีหลัก (Default)</option>
                                            {userBankAccounts.map(bank => (
                                                <option key={bank.id} value={bank.id}>
                                                    {bank.bank_name} - {bank.bank_account}
                                                    {bank.is_default ? ' (หลัก)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {savingBank && (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                                                กำลังบันทึก...
                                            </span>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state small">
                                    <p style={{ color: 'var(--color-text-muted)' }}>
                                        ยังไม่มีบัญชีธนาคาร กรุณาเพิ่มบัญชีที่หน้าโปรไฟล์ก่อน
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Commission and Payout Rates */}
                    <div className="rates-section card">
                        <h3><FiDollarSign /> ค่าคอมมิชชั่นและอัตราจ่าย</h3>
                        <p className="rates-description">อัตราที่เจ้ามือกำหนดให้กับคุณ</p>

                        {/* Lottery Type Tabs */}
                        <div className="rates-tabs">
                            {LOTTERY_TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`rates-tab ${ratesTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setRatesTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* 4 ตัวชุด Section for Lao or Hanoi */}
                        {(ratesTab === 'lao' || ratesTab === 'hanoi') && settings[ratesTab]?.['4_set'] && (
                            <div className="set-rates-section" style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-primary)', fontSize: '1rem' }}>
                                    4 ตัวชุด (ราคาชุดละ {settings[ratesTab]['4_set'].setPrice || 120} บาท)
                                </h4>
                                <div className="info-row" style={{ marginBottom: '0.75rem' }}>
                                    <span className="info-label">ค่าคอม:</span>
                                    <span className="info-value" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                        {settings[ratesTab]['4_set'].commission} ฿/ชุด
                                    </span>
                                </div>
                                <table className="rates-table">
                                    <thead>
                                        <tr>
                                            <th>ประเภทรางวัล</th>
                                            <th>เงินรางวัล</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(settings[ratesTab]['4_set'].prizes || {}).map(([prizeKey, prizeAmount]) => (
                                            <tr key={prizeKey}>
                                                <td className="type-cell">{SET_PRIZE_LABELS[prizeKey] || prizeKey}</td>
                                                <td className="rate-cell">
                                                    <span className="rate-value">{prizeAmount?.toLocaleString()}</span>
                                                    <span className="rate-unit">บาท/ชุด</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Toggles row: Bonus + Dealer can submit */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', margin: '0.75rem 0' }}>
                            {/* Bonus Settings Toggle */}
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.95rem',
                                    color: settings[ratesTab]?.bonusEnabled ? '#22c55e' : 'var(--color-text)'
                                }}
                                onClick={async (e) => {
                                    const newEnabled = !settings[ratesTab]?.bonusEnabled
                                    // Collect current bonus values
                                    const bonusUpdates = {}
                                    Object.entries(settings[ratesTab] || {}).forEach(([key, val]) => {
                                        if (key !== '4_set' && key !== 'bonusEnabled' && key !== 'dealerCanSubmit' && typeof val === 'object') {
                                            bonusUpdates[key] = val.bonus || 0
                                        }
                                    })
                                    await handleSaveBonusSettings(ratesTab, newEnabled, bonusUpdates)
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={settings[ratesTab]?.bonusEnabled || false}
                                    readOnly
                                    style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
                                />
                                <FiGift style={{ color: settings[ratesTab]?.bonusEnabled ? '#22c55e' : 'var(--color-text-muted)' }} />
                                <span style={{ fontWeight: 500 }}>เปิดแถมเงินแทง</span>
                                {savingBonus && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>กำลังบันทึก...</span>}
                            </label>

                            {/* Dealer can submit toggle */}
                            {(() => {
                                const canSubmit = settings[ratesTab]?.dealerCanSubmit !== false // default true
                                return (
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.95rem',
                                            color: canSubmit ? '#22c55e' : 'var(--color-text)'
                                        }}
                                        onClick={async () => {
                                            await handleSaveDealerCanSubmit(ratesTab, !canSubmit)
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={canSubmit}
                                            readOnly
                                            style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
                                        />
                                        <FiCheck style={{ color: canSubmit ? '#22c55e' : 'var(--color-text-muted)' }} />
                                        <span style={{ fontWeight: 500 }}>เจ้ามือคีย์แทนได้</span>
                                        {savingDealerCanSubmit && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>กำลังบันทึก...</span>}
                                    </label>
                                )
                            })()}
                        </div>

                        {/* Regular Rates Table */}
                        <div className="rates-table-container">
                            <table className="rates-table">
                                <thead>
                                    <tr>
                                        <th>ประเภทเลข</th>
                                        <th>ค่าคอม</th>
                                        <th>อัตราจ่าย</th>
                                        {settings[ratesTab]?.bonusEnabled && <th>แถม</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(settings[ratesTab] || {})
                                        .filter(([key]) => key !== '4_set' && key !== 'bonusEnabled' && key !== 'dealerCanSubmit')
                                        .map(([key, value]) => (
                                            <tr key={key}>
                                                <td className="type-cell">{BET_LABELS[ratesTab]?.[key] || key}</td>
                                                <td className="rate-cell">
                                                    <span className="rate-value">{value.commission}</span>
                                                    <span className="rate-unit">%</span>
                                                </td>
                                                <td className="rate-cell">
                                                    <span className="rate-value">{value.payout?.toLocaleString()}</span>
                                                    <span className="rate-unit">เท่า</span>
                                                </td>
                                                {settings[ratesTab]?.bonusEnabled && (
                                                    <td className="rate-cell">
                                                        <input
                                                            type="number"
                                                            value={value.bonus || 0}
                                                            onChange={async (e) => {
                                                                const newBonus = parseFloat(e.target.value) || 0
                                                                const bonusUpdates = {}
                                                                Object.entries(settings[ratesTab] || {}).forEach(([k, v]) => {
                                                                    if (k !== '4_set' && k !== 'bonusEnabled' && k !== 'dealerCanSubmit' && typeof v === 'object') {
                                                                        bonusUpdates[k] = k === key ? newBonus : (v.bonus || 0)
                                                                    }
                                                                })
                                                                await handleSaveBonusSettings(ratesTab, true, bonusUpdates)
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                width: '50px',
                                                                padding: '0.25rem 0.35rem',
                                                                textAlign: 'center',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '4px',
                                                                background: 'var(--color-surface)',
                                                                color: 'var(--color-text)',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        />
                                                        <span className="rate-unit">%</span>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
