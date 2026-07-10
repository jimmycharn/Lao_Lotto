import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiSettings,
    FiSave,
    FiClock,
    FiShield,
    FiList,
    FiRefreshCw
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

const LOTTERY_BET_TYPES = {
    lao: [
        { key: '4_set', label: 'หวยชุด 4 ตัว' },
        { key: '3_top', label: '3 ตัวบน' },
        { key: '3_tod', label: '3 ตัวโต๊ด' },
        { key: '2_top', label: '2 ตัวบน' },
        { key: '2_bottom', label: '2 ตัวล่าง' },
        { key: 'run_top', label: 'วิ่งบน' },
        { key: 'run_bottom', label: 'วิ่งล่าง' }
    ],
    thai: [
        { key: '3_top', label: '3 ตัวบน' },
        { key: '3_tod', label: '3 ตัวโต๊ด' },
        { key: '3_front', label: '3 ตัวหน้า' },
        { key: '3_bottom', label: '3 ตัวล่าง' },
        { key: '2_top', label: '2 ตัวบน' },
        { key: '2_bottom', label: '2 ตัวล่าง' },
        { key: 'run_top', label: 'วิ่งบน' },
        { key: 'run_bottom', label: 'วิ่งล่าง' }
    ],
    lao_extra: [
        { key: '4_set', label: 'หวยชุด 4 ตัว' },
        { key: '3_top', label: '3 ตัวบน' },
        { key: '3_tod', label: '3 ตัวโต๊ด' },
        { key: '2_top', label: '2 ตัวบน' },
        { key: '2_bottom', label: '2 ตัวล่าง' },
        { key: 'run_top', label: 'วิ่งบน' },
        { key: 'run_bottom', label: 'วิ่งล่าง' }
    ],
    lao_vip: [
        { key: '4_set', label: 'หวยชุด 4 ตัว' },
        { key: '3_top', label: '3 ตัวบน' },
        { key: '3_tod', label: '3 ตัวโต๊ด' },
        { key: '2_top', label: '2 ตัวบน' },
        { key: '2_bottom', label: '2 ตัวล่าง' },
        { key: 'run_top', label: 'วิ่งบน' },
        { key: 'run_bottom', label: 'วิ่งล่าง' }
    ],
    yeekee: [
        { key: '3_top', label: '3 ตัวบน' },
        { key: '3_tod', label: '3 ตัวโต๊ด' },
        { key: '2_top', label: '2 ตัวบน' },
        { key: '2_bottom', label: '2 ตัวล่าง' },
        { key: 'run_top', label: 'วิ่งบน' },
        { key: 'run_bottom', label: 'วิ่งล่าง' }
    ]
};

const WEEK_DAYS = [
    { value: 0, label: 'อาทิตย์' },
    { value: 1, label: 'จันทร์' },
    { value: 2, label: 'อังคาร' },
    { value: 3, label: 'พุธ' },
    { value: 4, label: 'พฤหัสบดี' },
    { value: 5, label: 'ศุกร์' },
    { value: 6, label: 'เสาร์' }
];

export default function DealerAutomationTab({ user, profile, allowedLotteryTypes }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lotteryType, setLotteryType] = useState(() => {
        const initialTypes = ['lao', 'thai', 'lao_extra', 'lao_vip', 'yeekee']
            .filter(key => !allowedLotteryTypes || allowedLotteryTypes.includes(key));
        return initialTypes[0] || 'lao';
    })

    // Initialize lottery type when allowedLotteryTypes loads
    useEffect(() => {
        if (allowedLotteryTypes && allowedLotteryTypes.length > 0) {
            if (!allowedLotteryTypes.includes(lotteryType)) {
                setLotteryType(allowedLotteryTypes[0]);
            }
        }
    }, [allowedLotteryTypes]);
    const [template, setTemplate] = useState({
        is_auto_round_enabled: false,
        schedule_mode: 'weekly',
        schedule_days: [],
        open_time: '06:00',
        close_time: '20:15',
        close_day_offset: 0,
        delete_before_minutes: 60,
        delete_after_submit_minutes: 5,
        currency_symbol: '฿',
        currency_name: 'บาท',
        auto_layoff_enabled: false,
        auto_layoff_method: 'limits',
        auto_layoff_keep_amount: 0,
        auto_import_result_enabled: false,
        type_limits: {},
        type_close_times: {},
        type_close_time_behaviors: {}
    })

    // Load templates for selected lottery type
    useEffect(() => {
        fetchTemplate()
    }, [lotteryType, user?.id])

    const fetchTemplate = async () => {
        if (!user?.id) return
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('dealer_lottery_templates')
                .select('*')
                .eq('dealer_id', user.id)
                .eq('lottery_type', lotteryType)
                .maybeSingle()

            if (error) throw error

            if (data) {
                setTemplate({
                    is_auto_round_enabled: data.is_auto_round_enabled || false,
                    schedule_mode: data.schedule_mode || 'weekly',
                    schedule_days: Array.isArray(data.schedule_days) ? data.schedule_days : [],
                    open_time: data.open_time || '06:00',
                    close_time: data.close_time || '20:15',
                    close_day_offset: data.close_day_offset || 0,
                    delete_before_minutes: data.delete_before_minutes || 60,
                    delete_after_submit_minutes: data.delete_after_submit_minutes || 5,
                    currency_symbol: data.currency_symbol || '฿',
                    currency_name: data.currency_name || 'บาท',
                    auto_layoff_enabled: data.auto_layoff_enabled || false,
                    auto_layoff_method: data.auto_layoff_method || 'limits',
                    auto_layoff_keep_amount: data.auto_layoff_keep_amount || 0,
                    auto_import_result_enabled: data.auto_import_result_enabled || false,
                    type_limits: data.type_limits || {},
                    type_close_times: data.type_close_times || {},
                    type_close_time_behaviors: data.type_close_time_behaviors || {}
                })
            } else {
                // System fallback defaults
                setTemplate({
                    is_auto_round_enabled: false,
                    schedule_mode: 'weekly',
                    schedule_days: [],
                    open_time: '06:00',
                    close_time: '20:15',
                    close_day_offset: 0,
                    delete_before_minutes: 60,
                    delete_after_submit_minutes: 5,
                    currency_symbol: '฿',
                    currency_name: 'บาท',
                    auto_layoff_enabled: false,
                    auto_layoff_method: 'limits',
                    auto_layoff_keep_amount: 0,
                    auto_import_result_enabled: false,
                    type_limits: {},
                    type_close_times: {},
                    type_close_time_behaviors: {}
                })
            }
        } catch (err) {
            console.error('Error fetching template:', err)
            toast.error('ไม่สามารถดึงข้อมูลตั้งค่าออโตเมชันได้')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveSettings = async () => {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('dealer_lottery_templates')
                .upsert({
                    dealer_id: user.id,
                    lottery_type: lotteryType,
                    is_auto_round_enabled: template.is_auto_round_enabled,
                    schedule_mode: template.schedule_mode,
                    schedule_days: template.schedule_days,
                    open_time: template.open_time,
                    close_time: template.close_time,
                    close_day_offset: template.close_day_offset,
                    delete_before_minutes: template.delete_before_minutes,
                    delete_after_submit_minutes: template.delete_after_submit_minutes,
                    currency_symbol: template.currency_symbol,
                    currency_name: template.currency_name,
                    auto_layoff_enabled: template.auto_layoff_enabled,
                    auto_layoff_method: template.auto_layoff_method,
                    auto_layoff_keep_amount: template.auto_layoff_keep_amount,
                    auto_import_result_enabled: template.auto_import_result_enabled,
                    type_limits: template.type_limits,
                    type_close_times: template.type_close_times,
                    type_close_time_behaviors: template.type_close_time_behaviors
                }, {
                    onConflict: 'dealer_id,lottery_type'
                })

            if (error) throw error
            toast.success('บันทึกตั้งค่าระบบออโตเมชันเรียบร้อยแล้วค่ะ! 🎉')
        } catch (err) {
            console.error('Error saving template:', err)
            toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูลตั้งค่า')
        } finally {
            setSaving(false)
        }
    }

    const toggleWeekDay = (day) => {
        let updated = [...template.schedule_days]
        if (updated.includes(day)) {
            updated = updated.filter(d => d !== day)
        } else {
            updated.push(day)
        }
        setTemplate({ ...template, schedule_days: updated })
    }

    const toggleMonthlyDate = (dateVal) => {
        let updated = [...template.schedule_days]
        if (updated.includes(dateVal)) {
            updated = updated.filter(d => d !== dateVal)
        } else {
            updated.push(dateVal)
        }
        setTemplate({ ...template, schedule_days: updated })
    }

    const handleLimitChange = (betType, value) => {
        const val = value === '' ? 0 : Number(value)
        setTemplate({
            ...template,
            type_limits: {
                ...template.type_limits,
                [betType]: val
            }
        })
    }

    const handleCloseTimeChange = (betType, value) => {
        setTemplate({
            ...template,
            type_close_times: {
                ...template.type_close_times,
                [betType]: value || null
            }
        })
    }

    const handleCloseBehaviorChange = (betType, value) => {
        setTemplate({
            ...template,
            type_close_time_behaviors: {
                ...template.type_close_time_behaviors,
                [betType]: value
            }
        })
    }

    const betTypes = LOTTERY_BET_TYPES[lotteryType] || []

    return (
        <div className="profile-tab-container">
            <div className="profile-card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}><FiSettings /> จัดการระบบออโตเมชัน & เทมเพลต</h3>
                    <div>
                        <select
                            value={lotteryType}
                            onChange={(e) => setLotteryType(e.target.value)}
                            className="form-input"
                            style={{ width: 'auto', padding: '0.4rem 2rem 0.4rem 1rem' }}
                        >
                            {Object.entries({
                                lao: 'หวยพัฒนาลาว (Lao)',
                                thai: 'หวยรัฐบาลไทย (Thai)',
                                lao_extra: 'หวยลาวพิเศษ',
                                lao_vip: 'หวยลาว VIP',
                                yeekee: 'หวยจับยี่กี (Yeekee)'
                            })
                            .filter(([key]) => !allowedLotteryTypes || allowedLotteryTypes.includes(key))
                            .map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                        <div className="spinner" />
                    </div>
                ) : (
                    <div className="card-body">
                        {/* 1. Auto Round Creation Settings */}
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                                <FiClock /> 1. ตั้งค่าการสร้างงวดหวยอัตโนมัติ (Auto Round Creator)
                            </h4>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={template.is_auto_round_enabled}
                                        onChange={(e) => setTemplate({ ...template, is_auto_round_enabled: e.target.checked })}
                                    />
                                    <strong>เปิดใช้งานระบบสร้างงวดหวยอัตโนมัติ</strong>
                                </label>

                                {template.is_auto_round_enabled && (
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label className="form-label">ความถี่การทำซ้ำ</label>
                                                <select
                                                    value={template.schedule_mode}
                                                    onChange={(e) => setTemplate({ ...template, schedule_mode: e.target.value, schedule_days: [] })}
                                                    className="form-input"
                                                >
                                                    <option value="weekly">ทุกสัปดาห์ (Weekly)</option>
                                                    <option value="monthly">ทุกเดือน (Monthly)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">วันเปิด/ปิดงวดห่างกัน</label>
                                                <select
                                                    value={template.close_day_offset}
                                                    onChange={(e) => setTemplate({ ...template, close_day_offset: Number(e.target.value) })}
                                                    className="form-input"
                                                >
                                                    <option value="0">วันเดียวกัน (0 วัน)</option>
                                                    <option value="1">วันถัดไป (1 วัน)</option>
                                                    <option value="2">2 วัน</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="form-label">
                                                {template.schedule_mode === 'weekly' ? 'วันที่ต้องการให้รันงาน (สัปดาห์)' : 'วันที่ต้องการให้รันงาน (รายเดือน)'}
                                            </label>
                                            {template.schedule_mode === 'weekly' ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                    {WEEK_DAYS.map((day) => {
                                                        const isSelected = template.schedule_days.includes(day.value);
                                                        return (
                                                            <button
                                                                key={day.value}
                                                                type="button"
                                                                onClick={() => toggleWeekDay(day.value)}
                                                                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                                            >
                                                                {day.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.4rem', marginTop: '0.5rem' }}>
                                                        {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                                                            const isSelected = template.schedule_days.includes(date);
                                                            return (
                                                                <button
                                                                    key={date}
                                                                    type="button"
                                                                    onClick={() => toggleMonthlyDate(date)}
                                                                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                                    style={{ padding: '0.3rem', fontSize: '0.8rem' }}
                                                                >
                                                                    {date}
                                                                </button>
                                                            );
                                                        })}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleMonthlyDate('last')}
                                                            className={`btn ${template.schedule_days.includes('last') ? 'btn-primary' : 'btn-secondary'}`}
                                                            style={{ padding: '0.3rem', fontSize: '0.8rem', gridColumn: 'span 2' }}
                                                        >
                                                            วันสุดท้าย
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label className="form-label">เวลาเปิดงวดหลัก</label>
                                                <input
                                                    type="time"
                                                    value={template.open_time}
                                                    onChange={(e) => setTemplate({ ...template, open_time: e.target.value })}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">เวลาปิดงวดหลัก</label>
                                                <input
                                                    type="time"
                                                    value={template.close_time}
                                                    onChange={(e) => setTemplate({ ...template, close_time: e.target.value })}
                                                    className="form-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Auto Layoff Settings */}
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                                <FiShield /> 2. ตั้งค่าระบบส่งออกเลขเกินอั้นอัตโนมัติ (Auto-Layoff)
                            </h4>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={template.auto_layoff_enabled}
                                        onChange={(e) => setTemplate({ ...template, auto_layoff_enabled: e.target.checked })}
                                    />
                                    <strong>เปิดใช้งานระบบส่งออกเลขเกินอั้นออโต้เมื่อปิดงวด</strong>
                                </label>

                                {template.auto_layoff_enabled && (
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="form-label">วิธีการประมวลผล</label>
                                            <select
                                                value={template.auto_layoff_method}
                                                onChange={(e) => setTemplate({ ...template, auto_layoff_method: e.target.value })}
                                                className="form-input"
                                            >
                                                <option value="limits">คัดกรองตามตารางยอดอั้นสูงสุดต่อเลข (Limits)</option>
                                                <option value="formula">วิเคราะห์จากกำไรสู้สุดด้วยสูตรคำนวณ (Formula)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="form-label">งบถือสู้สุทธิสูงสุด (ยอดสู้ร้าน)</label>
                                            <input
                                                type="number"
                                                value={template.auto_layoff_keep_amount}
                                                onChange={(e) => setTemplate({ ...template, auto_layoff_keep_amount: Number(e.target.value) })}
                                                placeholder="ระบุยอดเงิน หรือ 0 หากไม่จำกัด"
                                                className="form-input"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Auto Result Import */}
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                                <FiRefreshCw /> 3. นำเข้าผลรางวัลอัตโนมัติ (AI Result Announcement)
                            </h4>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={template.auto_import_result_enabled}
                                    onChange={(e) => setTemplate({ ...template, auto_import_result_enabled: e.target.checked })}
                                />
                                <strong>โอนยอดบันทึกประกาศผลอัตโนมัติเมื่อระบบสืบค้นผลรางวัลเสร็จสิ้น</strong>
                            </label>
                        </div>

                        {/* 4. Granular Type Settings */}
                        <div>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                                <FiList /> 4. แม่แบบอั้นยอดและปิดเฉพาะประเภทเลข
                            </h4>
                            
                            <table className="dealer-table" style={{ width: '100%', marginTop: '0.5rem' }}>
                                <thead>
                                    <tr>
                                        <th>ประเภทเลข</th>
                                        <th>วงเงินสู้สูงสุดต่อเลข (฿)</th>
                                        <th>เวลาปิดเฉพาะตัวเลข</th>
                                        <th>พฤติกรรมการคืนโพย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {betTypes.map((type) => (
                                        <tr key={type.key}>
                                            <td><strong>{type.label}</strong></td>
                                            <td>
                                                <input
                                                    type="number"
                                                    value={template.type_limits[type.key] ?? ''}
                                                    onChange={(e) => handleLimitChange(type.key, e.target.value)}
                                                    placeholder="ไม่มีอั้น"
                                                    className="form-input"
                                                    style={{ width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.9rem' }}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="time"
                                                    value={template.type_close_times[type.key] || ''}
                                                    onChange={(e) => handleCloseTimeChange(type.key, e.target.value)}
                                                    className="form-input"
                                                    style={{ width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.9rem' }}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    value={template.type_close_time_behaviors[type.key] || 'close_immediately'}
                                                    onChange={(e) => handleCloseBehaviorChange(type.key, e.target.value)}
                                                    className="form-input"
                                                    style={{ width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.9rem' }}
                                                >
                                                    <option value="close_immediately">ปิดรับทันที</option>
                                                    <option value="refund_portion">คืนสัดส่วนส่วนเกิน</option>
                                                    <option value="refund_all">คืนทั้งบิลหากมีตัวติด</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={handleSaveSettings}
                                className="btn btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem', fontSize: '1rem' }}
                            >
                                <FiSave /> {saving ? 'กำลังบันทึก...' : '💾 บันทึกตั้งค่าออโตเมชัน'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
