import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiSettings,
    FiSave,
    FiClock,
    FiShield,
    FiList,
    FiRefreshCw,
    FiPlus,
    FiTrash2,
    FiEdit2,
    FiInfo,
    FiCheckCircle,
    FiAlertCircle,
    FiCalendar,
    FiToggleLeft,
    FiToggleRight
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

import { LOTTERY_TYPES, BET_TYPES, BET_TYPES_BY_LOTTERY } from '../../constants/lotteryTypes'

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
    const [jobs, setJobs] = useState([])
    const [lineGroups, setLineGroups] = useState([])
    const [loadingJobs, setLoadingJobs] = useState(true)
    const [savingJob, setSavingJob] = useState(false)
    const [submittingDefaults, setSubmittingDefaults] = useState(false)
    
    // Default template state (legacy/fallback configuration & defaults)
    const [lotteryType, setLotteryType] = useState(() => {
        const initialTypes = Object.keys(LOTTERY_TYPES)
            .filter(key => !allowedLotteryTypes || allowedLotteryTypes.includes(key));
        return initialTypes[0] || 'lao';
    })

    const [template, setTemplate] = useState({
        delete_before_minutes: 60,
        delete_after_submit_minutes: 5,
        currency_symbol: '฿',
        currency_name: 'บาท',
        set_prices: {},
        type_limits: {},
        type_close_times: {},
        type_close_time_behaviors: {}
    })

    // Active tab in settings: 'jobs' (automation list) or 'defaults' (type limits/prices)
    const [activeSubTab, setActiveSubTab] = useState('jobs')

    // Modal / Form state for creating/editing job
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingJobId, setEditingJobId] = useState(null)
    const [jobForm, setJobForm] = useState({
        name: '',
        lottery_type: 'lao',
        schedule_mode: 'weekly',
        schedule_days: [],
        open_time: '06:00',
        close_time: '20:15',
        close_day_offset: 0,
        layoff_enabled: false,
        layoff_method: 'limits',
        layoff_keep_amount: 0,
        layoff_notify_group_enabled: false,
        layoff_notify_group_id: '',
        notify_bets_enabled: false,
        notify_bets_types: [], // 'total', 'remaining', 'layoff'
        notify_bets_group_id: '',
        auto_import_result_enabled: false,
        result_notify_group_id: '',
        notify_result_enabled: false,
        is_active: true
    })

    // Load initial data
    useEffect(() => {
        if (user?.id) {
            fetchJobs()
            fetchLineGroups()
            fetchDefaultTemplate()
        }
    }, [user?.id, lotteryType])

    const fetchJobs = async () => {
        setLoadingJobs(true)
        try {
            const { data, error } = await supabase
                .from('dealer_automation_jobs')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setJobs(data || [])
        } catch (err) {
            console.error('Error fetching jobs:', err)
            toast.error('ไม่สามารถดึงข้อมูลรายการออโตเมชันได้')
        } finally {
            setLoadingJobs(false)
        }
    }

    const fetchLineGroups = async () => {
        try {
            const { data, error } = await supabase
                .from('line_groups')
                .select('id, group_name, line_group_id')
                .eq('dealer_id', user.id)
                .eq('is_active', true)
                .order('group_name', { ascending: true })

            if (error) throw error
            setLineGroups(data || [])
        } catch (err) {
            console.error('Error fetching line groups:', err)
        }
    }

    const fetchDefaultTemplate = async () => {
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
                    delete_before_minutes: data.delete_before_minutes || 60,
                    delete_after_submit_minutes: data.delete_after_submit_minutes || 5,
                    currency_symbol: data.currency_symbol || '฿',
                    currency_name: data.currency_name || 'บาท',
                    set_prices: data.set_prices || {},
                    type_limits: data.type_limits || {},
                    type_close_times: data.type_close_times || {},
                    type_close_time_behaviors: data.type_close_time_behaviors || {}
                })
            } else {
                setTemplate({
                    delete_before_minutes: 60,
                    delete_after_submit_minutes: 5,
                    currency_symbol: '฿',
                    currency_name: 'บาท',
                    set_prices: {},
                    type_limits: {},
                    type_close_times: {},
                    type_close_time_behaviors: {}
                })
            }
        } catch (err) {
            console.error('Error fetching default template:', err)
        }
    }

    const handleSaveDefaults = async () => {
        setSubmittingDefaults(true)
        try {
            const { error } = await supabase
                .from('dealer_lottery_templates')
                .upsert({
                    dealer_id: user.id,
                    lottery_type: lotteryType,
                    delete_before_minutes: template.delete_before_minutes,
                    delete_after_submit_minutes: template.delete_after_submit_minutes,
                    currency_symbol: template.currency_symbol,
                    currency_name: template.currency_name,
                    set_prices: template.set_prices,
                    type_limits: template.type_limits,
                    type_close_times: template.type_close_times,
                    type_close_time_behaviors: template.type_close_time_behaviors
                }, {
                    onConflict: 'dealer_id,lottery_type'
                })

            if (error) throw error
            toast.success('บันทึกตั้งค่าแม่แบบเริ่มต้นเรียบร้อยแล้วค่ะ! 🎉')
        } catch (err) {
            console.error('Error saving defaults:', err)
            toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูลแม่แบบ')
        } finally {
            setSubmittingDefaults(false)
        }
    }

    // Opens form for creating new job
    const handleOpenCreate = () => {
        setEditingJobId(null)
        setJobForm({
            name: '',
            lottery_type: allowedLotteryTypes?.[0] || 'lao',
            schedule_mode: 'weekly',
            schedule_days: [],
            open_time: '06:00',
            close_time: '20:15',
            close_day_offset: 0,
            layoff_enabled: false,
            layoff_method: 'limits',
            layoff_keep_amount: 0,
            layoff_notify_group_enabled: false,
            layoff_notify_group_id: '',
            notify_bets_enabled: false,
            notify_bets_types: [],
            notify_bets_group_id: '',
            auto_import_result_enabled: false,
            result_notify_group_id: '',
            notify_result_enabled: false,
            is_active: true
        })
        setIsFormOpen(true)
    }

    // Opens form for editing existing job
    const handleOpenEdit = (job) => {
        setEditingJobId(job.id)
        setJobForm({
            name: job.name || '',
            lottery_type: job.lottery_type || 'lao',
            schedule_mode: job.schedule_mode || 'weekly',
            schedule_days: Array.isArray(job.schedule_days) ? job.schedule_days : [],
            open_time: job.open_time ? job.open_time.slice(0, 5) : '06:00',
            close_time: job.close_time ? job.close_time.slice(0, 5) : '20:15',
            close_day_offset: job.close_day_offset || 0,
            layoff_enabled: job.layoff_enabled || false,
            layoff_method: job.layoff_method || 'limits',
            layoff_keep_amount: job.layoff_keep_amount || 0,
            layoff_notify_group_enabled: job.layoff_notify_group_enabled || false,
            layoff_notify_group_id: job.layoff_notify_group_id || '',
            notify_bets_enabled: job.notify_bets_enabled || false,
            notify_bets_types: Array.isArray(job.notify_bets_types) ? job.notify_bets_types : [],
            notify_bets_group_id: job.notify_bets_group_id || '',
            auto_import_result_enabled: job.auto_import_result_enabled || false,
            result_notify_group_id: job.result_notify_group_id || '',
            notify_result_enabled: job.notify_result_enabled || false,
            is_active: job.is_active ?? true
        })
        setIsFormOpen(true)
    }

    const handleDeleteJob = async (jobId) => {
        if (!window.confirm('คุณแน่ใจว่าต้องการลบรายการออโตเมชันนี้ใช่หรือไม่?')) return

        try {
            const { error } = await supabase
                .from('dealer_automation_jobs')
                .delete()
                .eq('id', jobId)
                .eq('dealer_id', user.id)

            if (error) throw error
            toast.success('ลบรายการออโตเมชันเรียบร้อยแล้วค่ะ!')
            fetchJobs()
        } catch (err) {
            console.error('Error deleting job:', err)
            toast.error('ไม่สามารถลบรายการได้')
        }
    }

    const handleToggleJobActive = async (job) => {
        const newStatus = !job.is_active;
        try {
            const { error } = await supabase
                .from('dealer_automation_jobs')
                .update({ is_active: newStatus })
                .eq('id', job.id)
                .eq('dealer_id', user.id);

            if (error) throw error
            toast.success(newStatus ? 'เปิดใช้งานออโตเมชันแล้วค่ะ' : 'ปิดใช้งานออโตเมชันแล้วค่ะ');
            // Optimistic UI update
            setJobs(jobs.map(j => j.id === job.id ? { ...j, is_active: newStatus } : j));
        } catch (err) {
            console.error('Error toggling job status:', err)
            toast.error('ไม่สามารถอัปเดตสถานะการใช้งานได้')
        }
    }

    const handleSaveJob = async (e) => {
        e.preventDefault()
        if (!jobForm.name.trim()) {
            toast.error('กรุณาระบุชื่อรายการออโตเมชัน')
            return
        }
        if (jobForm.schedule_days.length === 0) {
            toast.error('กรุณาเลือกวันที่ต้องการให้รันงานอย่างน้อย 1 วัน')
            return
        }

        setSavingJob(true)

        const payload = {
            dealer_id: user.id,
            name: jobForm.name,
            lottery_type: jobForm.lottery_type,
            schedule_mode: jobForm.schedule_mode,
            schedule_days: jobForm.schedule_days,
            open_time: jobForm.open_time,
            close_time: jobForm.close_time,
            close_day_offset: jobForm.close_day_offset,
            layoff_enabled: jobForm.layoff_enabled,
            layoff_method: jobForm.layoff_method,
            layoff_keep_amount: jobForm.layoff_keep_amount,
            layoff_notify_group_enabled: jobForm.layoff_notify_group_enabled,
            layoff_notify_group_id: jobForm.layoff_notify_group_id || null,
            notify_bets_enabled: jobForm.notify_bets_enabled,
            notify_bets_types: jobForm.notify_bets_types,
            notify_bets_group_id: jobForm.notify_bets_group_id || null,
            auto_import_result_enabled: jobForm.auto_import_result_enabled,
            result_notify_group_id: jobForm.result_notify_group_id || null,
            notify_result_enabled: jobForm.notify_result_enabled,
            is_active: jobForm.is_active
        }

        try {
            if (editingJobId) {
                const { error } = await supabase
                    .from('dealer_automation_jobs')
                    .update(payload)
                    .eq('id', editingJobId)
                    .eq('dealer_id', user.id)

                if (error) throw error
                toast.success('อัปเดตรายการออโตเมชันเรียบร้อยแล้วค่ะ! 💾')
            } else {
                const { error } = await supabase
                    .from('dealer_automation_jobs')
                    .insert(payload)

                if (error) throw error
                toast.success('สร้างรายการออโตเมชันใหม่เรียบร้อยแล้วค่ะ! 🚀')
            }
            setIsFormOpen(false)
            fetchJobs()
        } catch (err) {
            console.error('Error saving job:', err)
            toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูลรายการออโตเมชัน')
        } finally {
            setSavingJob(false)
        }
    }

    const toggleFormWeekDay = (day) => {
        let updated = [...jobForm.schedule_days]
        if (updated.includes(day)) {
            updated = updated.filter(d => d !== day)
        } else {
            updated.push(day)
        }
        setJobForm({ ...jobForm, schedule_days: updated })
    }

    const toggleFormMonthlyDate = (dateVal) => {
        let updated = [...jobForm.schedule_days]
        if (updated.includes(dateVal)) {
            updated = updated.filter(d => d !== dateVal)
        } else {
            updated.push(dateVal)
        }
        setJobForm({ ...jobForm, schedule_days: updated })
    }

    const toggleFormReportType = (typeVal) => {
        let updated = [...jobForm.notify_bets_types]
        if (updated.includes(typeVal)) {
            updated = updated.filter(t => t !== typeVal)
        } else {
            updated.push(typeVal)
        }
        setJobForm({ ...jobForm, notify_bets_types: updated })
    }

    const formatScheduleSummary = (job) => {
        const days = Array.isArray(job.schedule_days) ? job.schedule_days : [];
        if (job.schedule_mode === 'weekly') {
            const thaiDays = days
                .sort((a, b) => a - b)
                .map(d => WEEK_DAYS.find(wd => wd.value === d)?.label || d);
            return `ทุกวัน ${thaiDays.join(', ')}`;
        } else {
            const sortedDates = days.sort((a, b) => {
                if (a === 'last') return 1;
                if (b === 'last') return -1;
                return Number(a) - Number(b);
            });
            const labels = sortedDates.map(d => d === 'last' ? 'สิ้นเดือน' : `วันที่ ${d}`);
            return `ทุกเดือน ${labels.join(', ')}`;
        }
    }

    const betTypes = Object.entries(BET_TYPES_BY_LOTTERY[lotteryType] || {}).map(([key, cfg]) => ({
        key,
        label: cfg.label || BET_TYPES[key] || key
    }));

    return (
        <div className="profile-tab-container">
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
                <button
                    onClick={() => { setActiveSubTab('jobs'); setIsFormOpen(false); }}
                    className={`btn ${activeSubTab === 'jobs' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    <FiClock /> จัดการรายการออโตเมชัน (Cron Jobs)
                </button>
                <button
                    onClick={() => setActiveSubTab('defaults')}
                    className={`btn ${activeSubTab === 'defaults' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    <FiSettings /> ตั้งค่าประเภทเลขเริ่มต้น & อั้นเริ่มต้น
                </button>
            </div>

            {activeSubTab === 'jobs' && (
                <div>
                    {!isFormOpen ? (
                        <div className="profile-card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}><FiClock /> รายการงานออโตเมชันของร้านคุณ</h3>
                                <button
                                    onClick={handleOpenCreate}
                                    className="btn btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem' }}
                                >
                                    <FiPlus /> สร้างรายการใหม่
                                </button>
                            </div>

                            <div className="card-body">
                                {loadingJobs ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                                        <div className="spinner" />
                                    </div>
                                ) : jobs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                                        <FiAlertCircle size={40} style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }} />
                                        <p style={{ margin: 0 }}>ยังไม่มีการสร้างรายการงานออโตเมชัน</p>
                                        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>คลิกที่ปุ่ม "สร้างรายการใหม่" ด้านบนเพื่อเริ่มสร้างตารางหวยออโต้รายงวด!</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                        {jobs.map((job) => {
                                            const lotteryLabel = LOTTERY_TYPES[job.lottery_type] || job.lottery_type.toUpperCase();
                                            return (
                                                <div
                                                    key={job.id}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.02)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '12px',
                                                        padding: '1.2rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '1rem',
                                                        transition: 'border-color 0.2s',
                                                        opacity: job.is_active ? 1 : 0.65
                                                    }}
                                                >
                                                    {/* Row 1: Header info */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{job.name}</h4>
                                                                <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                                                                    {lotteryLabel}
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                <FiCalendar /> {formatScheduleSummary(job)}
                                                            </p>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                            <button
                                                                onClick={() => handleToggleJobActive(job)}
                                                                title={job.is_active ? 'กดเพื่อปิดใช้งานชั่วคราว' : 'กดเพื่อเปิดใช้งาน'}
                                                                className={`btn ${job.is_active ? 'btn-success' : 'btn-secondary'}`}
                                                                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                            >
                                                                {job.is_active ? <FiToggleRight size={16} /> : <FiToggleLeft size={16} />}
                                                                {job.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleOpenEdit(job)}
                                                                className="btn btn-secondary"
                                                                style={{ padding: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                title="แก้ไข"
                                                            >
                                                                <FiEdit2 size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteJob(job.id)}
                                                                className="btn btn-danger"
                                                                style={{ padding: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                title="ลบ"
                                                            >
                                                                <FiTrash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Automation details */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem', padding: '0.8rem', background: 'rgba(0,0,0,0.12)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                        <div>
                                                            <strong>⏰ กำหนดเวลา:</strong>
                                                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                                เปิดรับ: {job.open_time ? job.open_time.slice(0, 5) : '-'} น.<br />
                                                                ปิดรับ: {job.close_time ? job.close_time.slice(0, 5) : '-'} น.
                                                                {job.close_day_offset > 0 && ` (ปิดถัดไป ${job.close_day_offset} วัน)`}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <strong>🛡️ ส่งออกเลขเกินอั้น (Auto-Layoff):</strong>
                                                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                                สถานะ: {job.layoff_enabled ? '✅ เปิดทำงาน' : '❌ ปิดทำงาน'}<br />
                                                                {job.layoff_enabled && (
                                                                    <>
                                                                        วิธี: {job.layoff_method === 'ai' ? 'สมองกล AI' : (job.layoff_method === 'formula' ? 'สูตรกำไรสูงสุด' : 'ตารางอั้นยอด')}
                                                                        {job.layoff_method !== 'limits' && (
                                                                            <>
                                                                                <br />ยอดถือสู้: ฿{(job.layoff_keep_amount || 0).toLocaleString()}
                                                                            </>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <strong>📊 รายงานตัวเลข & รางวัล:</strong>
                                                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                                ส่งยอด: {job.notify_bets_enabled ? '✅ เปิดแจ้งกลุ่ม' : '❌ ปิด'}<br />
                                                                ดึงผลออโต้: {job.auto_import_result_enabled ? '✅ เปิด' : '❌ ปิด'}<br />
                                                                ส่งได้เสีย: {job.notify_result_enabled ? '✅ แจ้ง Carousel สมาชิก' : '❌ ปิด'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Timestamps */}
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                                                        <span>🆕 รันสร้างงวดล่าสุด: {job.last_created_at ? new Date(job.last_created_at).toLocaleString('th-TH') : 'ยังไม่เคยรัน'}</span>
                                                        <span>🛑 รันปิดงวดล่าสุด: {job.last_closed_at ? new Date(job.last_closed_at).toLocaleString('th-TH') : 'ยังไม่เคยรัน'}</span>
                                                        <span>🏆 รันประกาศผลล่าสุด: {job.last_announced_at ? new Date(job.last_announced_at).toLocaleString('th-TH') : 'ยังไม่เคยรัน'}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="profile-card">
                            <form onSubmit={handleSaveJob}>
                                <div className="card-header">
                                    <h3 style={{ margin: 0 }}>
                                        {editingJobId ? `✏️ แก้ไขรายการออโตเมชัน: ${jobForm.name}` : '🚀 สร้างรายการงานออโตเมชันตัวใหม่'}
                                    </h3>
                                </div>

                                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    
                                    {/* 1. Basic Info */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiInfo /> ข้อมูลทั่วไปและประเภทหวย
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', flexWrap: 'wrap' }}>
                                            <div>
                                                <label className="form-label">ชื่อรายการออโตเมชัน</label>
                                                <input
                                                    type="text"
                                                    value={jobForm.name}
                                                    onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                                                    placeholder="เช่น หวยลาว จ.-ศ. (20.15 น.)"
                                                    className="form-input"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">ประเภทหวย</label>
                                                <select
                                                    value={jobForm.lottery_type}
                                                    onChange={(e) => setJobForm({ ...jobForm, lottery_type: e.target.value })}
                                                    className="form-input"
                                                >
                                                    {Object.entries(LOTTERY_TYPES)
                                                        .filter(([key]) => !allowedLotteryTypes || allowedLotteryTypes.includes(key))
                                                        .map(([key, label]) => (
                                                            <option key={key} value={key}>{label}</option>
                                                        ))
                                                    }
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Frequency & Timing */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiClock /> กำหนดเวลาเปิด/ปิดรอบ (Schedule Settings)
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <label className="form-label">ความถี่ในการทำซ้ำ</label>
                                                    <select
                                                        value={jobForm.schedule_mode}
                                                        onChange={(e) => setJobForm({ ...jobForm, schedule_mode: e.target.value, schedule_days: [] })}
                                                        className="form-input"
                                                    >
                                                        <option value="weekly">ทุกสัปดาห์ (Weekly)</option>
                                                        <option value="monthly">ทุกเดือน (Monthly)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="form-label">วันปิดรับต่างจากวันเปิดรับ</label>
                                                    <select
                                                        value={jobForm.close_day_offset}
                                                        onChange={(e) => setJobForm({ ...jobForm, close_day_offset: Number(e.target.value) })}
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
                                                    เลือกวันที่ต้องการให้เปิดงวด ({jobForm.schedule_mode === 'weekly' ? 'วันในสัปดาห์' : 'วันที่ในปฏิทิน'})
                                                </label>
                                                {jobForm.schedule_mode === 'weekly' ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                        {WEEK_DAYS.map((day) => {
                                                            const isSelected = jobForm.schedule_days.includes(day.value);
                                                            return (
                                                                <button
                                                                    key={day.value}
                                                                    type="button"
                                                                    onClick={() => toggleFormWeekDay(day.value)}
                                                                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                                                >
                                                                    {day.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.4rem', marginTop: '0.5rem' }}>
                                                        {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                                                            const isSelected = jobForm.schedule_days.includes(date);
                                                            return (
                                                                <button
                                                                    key={date}
                                                                    type="button"
                                                                    onClick={() => toggleFormMonthlyDate(date)}
                                                                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                                    style={{ padding: '0.3rem', fontSize: '0.8rem' }}
                                                                >
                                                                    {date}
                                                                </button>
                                                            );
                                                        })}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleFormMonthlyDate('last')}
                                                            className={`btn ${jobForm.schedule_days.includes('last') ? 'btn-primary' : 'btn-secondary'}`}
                                                            style={{ padding: '0.3rem', fontSize: '0.8rem', gridColumn: 'span 2' }}
                                                        >
                                                            วันสุดท้าย
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <label className="form-label">เวลาเปิดรับแทง</label>
                                                    <input
                                                        type="time"
                                                        value={jobForm.open_time}
                                                        onChange={(e) => setJobForm({ ...jobForm, open_time: e.target.value })}
                                                        className="form-input"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="form-label">เวลาปิดรับแทง</label>
                                                    <input
                                                        type="time"
                                                        value={jobForm.close_time}
                                                        onChange={(e) => setJobForm({ ...jobForm, close_time: e.target.value })}
                                                        className="form-input"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Auto Layoff */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiShield /> ระบบคัดกรองส่งยอดเลขออก (Auto-Layoff When Closed)
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.layoff_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, layoff_enabled: e.target.checked })}
                                                />
                                                <strong>เปิดการส่งออกตัวเลขเกินอั้นโดยอัตโนมัติเมื่อรอบปิดรับ</strong>
                                            </label>

                                            {jobForm.layoff_enabled && (
                                                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: jobForm.layoff_method === 'limits' ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                                                        <div>
                                                            <label className="form-label">สูตรวิธีการประมวลผล</label>
                                                            <select
                                                                value={jobForm.layoff_method}
                                                                onChange={(e) => setJobForm({ ...jobForm, layoff_method: e.target.value })}
                                                                className="form-input"
                                                            >
                                                                <option value="limits">ยึดตามวงเงินอั้นรายตัวของประเภทเลข (Limits)</option>
                                                                <option value="formula">คำนวณสู้ร้านด้วยสูตรหาจุดกำไรสูงสุด (Formula)</option>
                                                                <option value="ai">ใช้ระบบ AI ประเมินจุดเสี่ยงจำกัดงบเงินสู้ (AI)</option>
                                                            </select>
                                                        </div>
                                                        {jobForm.layoff_method !== 'limits' && (
                                                            <div>
                                                                <label className="form-label">งบสู้ร้านสูงสุด / ยอดถือสู้</label>
                                                                <input
                                                                    type="number"
                                                                    value={jobForm.layoff_keep_amount}
                                                                    onChange={(e) => setJobForm({ ...jobForm, layoff_keep_amount: Number(e.target.value) })}
                                                                    placeholder="เช่น 5000"
                                                                    className="form-input"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.layoff_notify_group_enabled}
                                                                    onChange={(e) => setJobForm({ ...jobForm, layoff_notify_group_enabled: e.target.checked })}
                                                                />
                                                                <span>ส่งรายงานบิลที่ตีออกไปเข้าห้อง LINE กลุ่ม</span>
                                                            </label>
                                                        </div>
                                                        {jobForm.layoff_notify_group_enabled && (
                                                            <div>
                                                                <label className="form-label">เลือก LINE กลุ่มเป้าหมาย</label>
                                                                <select
                                                                    value={jobForm.layoff_notify_group_id}
                                                                    onChange={(e) => setJobForm({ ...jobForm, layoff_notify_group_id: e.target.value })}
                                                                    className="form-input"
                                                                    required
                                                                >
                                                                    <option value="">-- กรุณาเลือกกลุ่มไลน์ --</option>
                                                                    {lineGroups.map(lg => (
                                                                        <option key={lg.id} value={lg.id}>{lg.group_name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 4. Number Reports */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiList /> ระบบรายงานยอดตัวเลขเมื่อปิดงวด (Closing Number Reports)
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.notify_bets_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, notify_bets_enabled: e.target.checked })}
                                                />
                                                <strong>แจ้งรายงานยอดเลขรวม/เลขตีออก/เลขคงเหลือเข้าไลน์กลุ่ม</strong>
                                            </label>

                                            {jobForm.notify_bets_enabled && (
                                                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div>
                                                        <label className="form-label">เลือกประเภทข้อมูลที่จะรายงาน</label>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('total')}
                                                                    onChange={() => toggleFormReportType('total')}
                                                                />
                                                                <span>รายงานยอดเลขรวมทั้งหมด (Total)</span>
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('remaining')}
                                                                    onChange={() => toggleFormReportType('remaining')}
                                                                />
                                                                <span>รายงานยอดตัวเลขเหลือถือสู้เอง (Remaining)</span>
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('layoff')}
                                                                    onChange={() => toggleFormReportType('layoff')}
                                                                />
                                                                <span>รายงานยอดตัวเลขที่ส่งออก/ตีออก (Layoffs)</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="form-label">เลือก LINE กลุ่มสำหรับส่งรายงานตัวเลข</label>
                                                        <select
                                                            value={jobForm.notify_bets_group_id}
                                                            onChange={(e) => setJobForm({ ...jobForm, notify_bets_group_id: e.target.value })}
                                                            className="form-input"
                                                            required
                                                        >
                                                            <option value="">-- กรุณาเลือกกลุ่มไลน์ --</option>
                                                            {lineGroups.map(lg => (
                                                                <option key={lg.id} value={lg.id}>{lg.group_name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 5. Award Announcement */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiRefreshCw /> ระบบดึงและแจ้งผลรางวัลอัตโนมัติ (AI Award Announcement)
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.auto_import_result_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, auto_import_result_enabled: e.target.checked })}
                                                />
                                                <strong>ดึงข้อมูลผลรางวัลจากระบบ AI และตรวจสอบยอดได้เสียในงวดนี้อัตโนมัติ</strong>
                                            </label>

                                            {jobForm.auto_import_result_enabled && (
                                                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={jobForm.notify_result_enabled}
                                                                onChange={(e) => setJobForm({ ...jobForm, notify_result_enabled: e.target.checked })}
                                                            />
                                                            <span>ส่งสรุปยอดรายบุคคลเข้าไลน์กลุ่มสมาชิก (ระบบจะวิเคราะห์และส่งสรุปให้สมาชิกแต่ละกลุ่มโดยอัตโนมัติ เสมือนคำสั่ง /แจ้งผล)</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setIsFormOpen(false)}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.5rem 1.2rem' }}
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingJob}
                                            className="btn btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.5rem' }}
                                        >
                                            <FiSave /> {savingJob ? 'กำลังบันทึก...' : 'บันทึกรายการออโตเมชัน'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {activeSubTab === 'defaults' && (
                <div className="profile-card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}><FiSettings /> ตั้งค่าแม่แบบและอั้นยอดหวยเริ่มต้น</h3>
                        <div>
                            <select
                                value={lotteryType}
                                onChange={(e) => setLotteryType(e.target.value)}
                                className="form-input"
                                style={{ width: 'auto', padding: '0.4rem 2rem 0.4rem 1rem' }}
                            >
                                {Object.entries(LOTTERY_TYPES)
                                    .filter(([key]) => !allowedLotteryTypes || allowedLotteryTypes.includes(key))
                                    .map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        
                        {/* Templates Info */}
                        <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                            <FiInfo size={20} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '0.1rem' }} />
                            <div>
                                <strong>💡 ข้อมูลการทำงานของแม่แบบ:</strong>
                                <p style={{ margin: '0.3rem 0 0 0', lineHeight: '1.4' }}>
                                    ค่าอั้นยอดและกำหนดเวลาปิดเฉพาะประเภทตัวเลขเหล่านี้ จะถูกนำไปใช้เป็นค่าเริ่มต้นโดยอัตโนมัติ เมื่อรอบหวยนั้นๆ ถูกสร้างขึ้นผ่านตารางงานออโตเมชันที่คุณกำหนดไว้
                                </p>
                            </div>
                        </div>

                        {/* Basic Config */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label className="form-label">สัญลักษณ์เงินตรา (Currency Symbol)</label>
                                <input
                                    type="text"
                                    value={template.currency_symbol}
                                    onChange={(e) => setTemplate({ ...template, currency_symbol: e.target.value })}
                                    className="form-input"
                                />
                            </div>
                            <div>
                                <label className="form-label">ชื่อหน่วยเงิน (Currency Name)</label>
                                <input
                                    type="text"
                                    value={template.currency_name}
                                    onChange={(e) => setTemplate({ ...template, currency_name: e.target.value })}
                                    className="form-input"
                                />
                            </div>
                            <div>
                                <label className="form-label">ยกเลิกบิลก่อนปิดรับหวยกี่นาที</label>
                                <input
                                    type="number"
                                    value={template.delete_before_minutes}
                                    onChange={(e) => setTemplate({ ...template, delete_before_minutes: Number(e.target.value) })}
                                    className="form-input"
                                />
                            </div>
                            <div>
                                <label className="form-label">ยกเลิกบิลภายในกี่นาทีหลังส่ง</label>
                                <input
                                    type="number"
                                    value={template.delete_after_submit_minutes}
                                    onChange={(e) => setTemplate({ ...template, delete_after_submit_minutes: Number(e.target.value) })}
                                    className="form-input"
                                />
                            </div>
                        </div>

                        {/* Granular Table Limits */}
                        <div>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                                <FiList /> แม่แบบอั้นยอดและกำหนดปิดเฉพาะประเภทเลข
                            </h4>
                            
                            <table className="dealer-table" style={{ width: '100%', marginTop: '0.5rem' }}>
                                <thead>
                                    <tr>
                                        <th>ประเภทเลข</th>
                                        <th>วงเงินสู้สูงสุดต่อเลข (฿)</th>
                                        <th>เวลาปิดเฉพาะตัวเลข (เช่น 20:00 น.)</th>
                                        <th>พฤติกรรมการคืนโพยเมื่อปิด/ล้น</th>
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
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                type="button"
                                disabled={submittingDefaults}
                                onClick={handleSaveDefaults}
                                className="btn btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem', fontSize: '1rem' }}
                            >
                                <FiSave /> {submittingDefaults ? 'กำลังบันทึก...' : '💾 บันทึกแม่แบบตั้งค่าเริ่มต้น'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
