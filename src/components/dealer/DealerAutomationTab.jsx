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
    FiMessageSquare,
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
    
    // Default template state (legacy/fallback configuration & defaults)
    const [lotteryType, setLotteryType] = useState(() => {
        const initialTypes = Object.keys(LOTTERY_TYPES)
            .filter(key => !allowedLotteryTypes || allowedLotteryTypes.includes(key));
        return initialTypes[0] || 'lao';
    })



    // Active tab in settings: 'jobs' (automation list) or 'defaults' (type limits/prices)

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
        creation_frequency: 'once_per_day',
        open_notify_message: '',
        open_notify_enabled: true,
        open_notify_group_id: '',
        layoff_enabled: false,
        layoff_method: 'limits',
        layoff_keep_amount: 0,
        layoff_notify_group_enabled: false,
        layoff_notify_group_id: '',
        layoff_schedules: [],
        layoff_schedule_enabled: false,
        layoff_auto_close: true,
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
            creation_frequency: 'once_per_day',
            open_notify_message: '',
            open_notify_enabled: true,
            open_notify_group_id: '',
            layoff_enabled: false,
            layoff_method: 'limits',
            layoff_keep_amount: 0,
            layoff_notify_group_enabled: false,
            layoff_notify_group_id: '',
            layoff_schedules: [],
            layoff_schedule_enabled: false,
            layoff_auto_close: true,
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
            creation_frequency: job.creation_frequency || 'once_per_day',
            open_notify_message: job.open_notify_message || '',
            open_notify_enabled: job.open_notify_enabled ?? true,
            open_notify_group_id: job.open_notify_group_id || '',
            layoff_enabled: job.layoff_enabled || false,
            layoff_method: job.layoff_method || 'limits',
            layoff_keep_amount: job.layoff_keep_amount || 0,
            layoff_notify_group_enabled: job.layoff_notify_group_enabled || false,
            layoff_notify_group_id: job.layoff_notify_group_id || '',
            layoff_schedules: Array.isArray(job.layoff_schedules) ? job.layoff_schedules : [],
            layoff_schedule_enabled: Array.isArray(job.layoff_schedules) && job.layoff_schedules.length > 0,
            layoff_auto_close: job.layoff_auto_close ?? true,
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
            creation_frequency: jobForm.creation_frequency,
            open_notify_message: jobForm.open_notify_message || null,
            open_notify_enabled: jobForm.open_notify_enabled,
            open_notify_group_id: jobForm.open_notify_group_id || null,
            layoff_enabled: jobForm.layoff_enabled,
            layoff_method: jobForm.layoff_method,
            layoff_keep_amount: jobForm.layoff_keep_amount,
            layoff_notify_group_enabled: jobForm.layoff_notify_group_enabled,
            layoff_notify_group_id: jobForm.layoff_notify_group_id || null,
            layoff_schedules: jobForm.layoff_schedules,
            layoff_auto_close: jobForm.layoff_auto_close,
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
        <div className="profile-tab-container automation-tab-container">
            <div className="automation-intro">
                <div>
                    <span className="automation-eyebrow">WORKFLOW CONTROL CENTER</span>
                    <h2><FiSettings /> ตั้งค่าออโตเมชัน</h2>
                    <p>จัดการตารางเปิด–ปิดงวด การส่งรายงาน และการประกาศผลจากพื้นที่เดียว</p>
                </div>
                <div className="automation-intro-mark"><FiClock /></div>
            </div>

            <div className="automation-metrics">
                <div className="automation-metric"><span>รายการทั้งหมด</span><strong>{jobs.length}</strong><small>workflow</small></div>
                <div className="automation-metric"><span>กำลังทำงาน</span><strong>{jobs.filter(job => job.is_active).length}</strong><small>active now</small></div>
                <div className="automation-metric"><span>กลุ่ม LINE</span><strong>{lineGroups.length}</strong><small>connected groups</small></div>
            </div>

                            <div className="automation-content">
                    {!isFormOpen ? (
                        <div className="profile-card automation-list-card">
                            <div className="card-header automation-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}><FiClock /> รายการงานออโตเมชันของร้านคุณ</h3>
                                <button
                                    onClick={handleOpenCreate}
                                    className="btn btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem' }}
                                >
                                    <FiPlus /> สร้างรายการใหม่
                                </button>
                            </div>

                            <div className="card-body automation-list-body">
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
                                                    className="automation-job-card"
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
                                                    <div className="automation-job-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
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
                                                    <div className="automation-job-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem', padding: '0.8rem', background: 'rgba(0,0,0,0.12)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                        <div>
                                                            <strong>⏰ กำหนดเวลา:</strong>
                                                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                                เปิดรับ: {job.open_time ? job.open_time.slice(0, 5) : '-'} น.<br />
                                                                ปิดรับ: {job.close_time ? job.close_time.slice(0, 5) : '-'} น.
                                                                {job.close_day_offset > 0 && ` (ปิดถัดไป ${job.close_day_offset} วัน)`}<br />
                                                                สร้างงวด: {job.creation_frequency === 'unlimited' ? 'ไม่จำกัด/วัน' : 'วันละครั้ง'}
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
                                                                        {Array.isArray(job.layoff_schedules) && job.layoff_schedules.length > 0 && (
                                                                            <>
                                                                                <br />⏰ ตีออกตามเวลา: {[...job.layoff_schedules].sort().join(', ')}
                                                                                {(job.layoff_auto_close !== false) && ` + ปิดรอบ`}
                                                                            </>
                                                                        )}
                                                                        {(!Array.isArray(job.layoff_schedules) || job.layoff_schedules.length === 0) && (
                                                                            <>
                                                                                <br />⏰ ตีออกเมื่อปิดรอบเท่านั้น
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
                                                                ส่งได้เสีย: {job.notify_result_enabled ? '✅ แจ้งสมาชิก' : '❌ ปิด'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Timestamps */}
                                                    <div className="automation-job-meta" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
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
                        <div className="profile-card automation-form-card">
                            <form onSubmit={handleSaveJob}>
                                <div className="card-header automation-form-header">
                                    <h3 style={{ margin: 0 }}>
                                        {editingJobId ? `✏️ แก้ไขรายการออโตเมชัน: ${jobForm.name}` : '🚀 สร้างรายการงานออโตเมชันตัวใหม่'}
                                    </h3>
                                </div>

                                <div className="card-body automation-form-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    
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
                                                <label className="form-label">จำนวนครั้งที่สร้างงวดต่อวัน</label>
                                                <select
                                                    value={jobForm.creation_frequency}
                                                    onChange={(e) => setJobForm({ ...jobForm, creation_frequency: e.target.value })}
                                                    className="form-input"
                                                >
                                                    <option value="once_per_day">สร้างได้วันละครั้ง (Once per day)</option>
                                                    <option value="unlimited">สร้างได้ไม่จำกัด (Unlimited)</option>
                                                </select>
                                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0 0' }}>
                                                    {jobForm.creation_frequency === 'unlimited'
                                                        ? 'ระบบจะสร้างงวดใหม่ได้หลายครั้งต่อวัน โดยจะสร้างเมื่อไม่คาบเกี่ยวเวลากับงวดหวยประเภทเดียวกันที่ยังไม่ปิดเท่านั้น'
                                                        : 'ระบบจะสร้างงวดใหม่ให้อัตโนมัติเพียงวันละ 1 ครั้งเท่านั้น'}
                                                </p>
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

                                    {/* 2.5 Open-round notification message */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h4 style={{ margin: '0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <FiMessageSquare /> ข้อความแจ้งเปิดงวด (Open Notification)
                                            </h4>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {jobForm.open_notify_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                                </span>
                                                <div
                                                    onClick={() => setJobForm({ ...jobForm, open_notify_enabled: !jobForm.open_notify_enabled })}
                                                    style={{
                                                        width: '44px',
                                                        height: '24px',
                                                        borderRadius: '12px',
                                                        background: jobForm.open_notify_enabled ? 'var(--accent-color, #4caf50)' : 'var(--border-color, #666)',
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: jobForm.open_notify_enabled ? '22px' : '2px',
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: '#fff',
                                                        transition: 'left 0.2s'
                                                    }} />
                                                </div>
                                            </label>
                                        </div>
                                        {jobForm.open_notify_enabled && (
                                        <>
                                        <div style={{ marginBottom: '0.8rem' }}>
                                            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                                                ส่งไปยังกลุ่มไลน์
                                            </label>
                                            <select
                                                value={jobForm.open_notify_group_id}
                                                onChange={(e) => setJobForm({ ...jobForm, open_notify_group_id: e.target.value })}
                                                className="form-input"
                                                style={{ width: '100%' }}
                                            >
                                                <option value="">ส่งทุกกลุ่ม (ค่าเริ่มต้น)</option>
                                                {lineGroups.map(g => (
                                                    <option key={g.id} value={g.id}>{g.group_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem 0' }}>
                                            ข้อความที่จะส่งไปยังกลุ่มไลน์ทุกกลุ่มเมื่อระบบสร้างงวดใหม่อัตโนมัติ หากไม่กรอกจะใช้ข้อความเริ่มต้นตามประเภทหวย
                                        </p>
                                        <textarea
                                            value={jobForm.open_notify_message}
                                            onChange={(e) => setJobForm({ ...jobForm, open_notify_message: e.target.value })}
                                            className="form-input"
                                            rows={12}
                                            placeholder={jobForm.lottery_type === 'thai'
                                                ? `📢 ประกาศจากเภา:\n📢 เปิดรับแทง: [ประเภทหวย]\n📅 งวดวันที่: [งวดวันที่]\n--------------------------\n⚠️ ถ้ามีตัวปิดและติดมาจะจ่ายครึ่ง ตัวไหนมามากเกินไป คืนได้ตลอดเวลา\n✍️ ให้ตรวจสอบโพยทุกครั้งที่บอทรับ ได้เสียกันตามที่บอทรับ ตรวจสอบและยกเลิกได้ตามเวลา\nรับเลขถึงเวลา [เวลาปิดงวด] \n⏰ เปิดรับแทงตั้งแต่บัดนี้ จนถึง [วันที่ปิดงวด] เวลา [เวลาปิดงวด]\n--------------------------\n🎉 ขอให้ทุกท่านโชคดีมีชัยกับการเสี่ยงดวงงวดนี้กันทุกคนนะครับ`
                                                : `📢 ประกาศจากเภา:\n📢 เปิดรับแทง: [ประเภทหวย]\n📅 งวดวันที่: [งวดวันที่]\n--------------------------\n⚠️ ถ้ามีตัวปิดและติดมาจะจ่ายครึ่ง ตัวไหนมามากเกินไป คืนได้ตลอดเวลา\n✍️ ให้ตรวจสอบโพยทุกครั้งที่บอทรับ ได้เสียกันตามที่บอทรับ ตรวจสอบและยกเลิกได้ตามเวลา\nเลข 4 ตัวชุด ที่ส่งหลัง [เวลาปิดงวด-30 นาที] บอทจะคืนเลขตัวที่เกิน ส่วนเลขอื่นๆรับถึง [เวลาปิดงวด] \n⏰ เปิดรับแทงตั้งแต่บัดนี้ จนถึง [วันที่ปิดงวด] เวลา [เวลาปิดงวด]\n--------------------------\n🎉 ขอให้ทุกท่านโชคดีมีชัยกับการเสี่ยงดวงงวดนี้กันทุกคนนะครับ`
                                            }
                                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical', lineHeight: '1.5' }}
                                        />
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                                            ตัวแปรที่ใช้ได้: [ประเภทหวย] [งวดวันที่] [วันที่ปิดงวด] [เวลาปิดงวด] [เวลาปิดงวด-30 นาที]
                                        </p>
                                        </>
                                        )}
                                    </div>

                                    {/* 3. Auto Layoff */}
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FiShield /> ระบบส่งออกยอดอั้น (Auto-Layoff)
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.layoff_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, layoff_enabled: e.target.checked })}
                                                />
                                                <strong>ส่งออกยอดตัวเลขเกินอั้นอัตโนมัติเมื่อปิดรอบ</strong>
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
                                                                <option value="limits">ยึดตามยอดอั้นรายตัว (Limits)</option>
                                                                <option value="formula">คำนวณแบบสู้หาจุดกำไรสูงสุด (Formula)</option>
                                                                <option value="ai">ประเมินความเสี่ยงและจำกัดงบสู้ (AI)</option>
                                                            </select>
                                                        </div>
                                                        {jobForm.layoff_method !== 'limits' && (
                                                            <div>
                                                                <label className="form-label">งบถือสู้สูงสุด</label>
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
                                                                <span>ส่งรายงานยอดตีออกเข้ากลุ่ม LINE</span>
                                                            </label>
                                                        </div>
                                                        {jobForm.layoff_notify_group_enabled && (
                                                            <div>
                                                                <label className="form-label">เลือกกลุ่มไลน์</label>
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

                                                    {/* Scheduled Layoff Times */}
                                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.8rem' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={jobForm.layoff_schedule_enabled}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        const initialSchedules = Array.isArray(jobForm.layoff_schedules) && jobForm.layoff_schedules.length > 0
                                                                            ? jobForm.layoff_schedules
                                                                            : [jobForm.open_time || '06:00']
                                                                        setJobForm({ ...jobForm, layoff_schedule_enabled: true, layoff_schedules: initialSchedules })
                                                                    } else {
                                                                        setJobForm({ ...jobForm, layoff_schedule_enabled: false, layoff_schedules: [] })
                                                                    }
                                                                }}
                                                            />
                                                            <span style={{ fontWeight: 600 }}>ตั้งเวลาตีออกเป็นรอบๆ ก่อนปิดรับ</span>
                                                        </label>

                                                        {jobForm.layoff_schedule_enabled && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.8rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                                                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                    ระบบจะตีออกอัตโนมัติตามเวลาที่ตั้งไว้ ส่งไปยังกลุ่มที่เลือกด้านบน
                                                                </p>

                                                                {jobForm.layoff_schedules.map((time, idx) => (
                                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '60px' }}>รอบที่ {idx + 1}:</span>
                                                                        <input
                                                                            type="time"
                                                                            value={time}
                                                                            onChange={(e) => {
                                                                                const updated = [...jobForm.layoff_schedules]
                                                                                updated[idx] = e.target.value
                                                                                setJobForm({ ...jobForm, layoff_schedules: updated })
                                                                            }}
                                                                            className="form-input"
                                                                            style={{ width: '140px', padding: '0.35rem 0.5rem', fontSize: '0.9rem' }}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const updated = jobForm.layoff_schedules.filter((_, i) => i !== idx)
                                                                                setJobForm({ ...jobForm, layoff_schedules: updated })
                                                                            }}
                                                                            className="btn btn-danger"
                                                                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                                                            title="ลบรอบนี้"
                                                                        >
                                                                            <FiTrash2 size={13} />
                                                                        </button>
                                                                        {/* Validation hint */}
                                                                        {time && (time < jobForm.open_time || time >= jobForm.close_time) && (
                                                                            <span style={{ fontSize: '0.75rem', color: '#ff6b6b' }}>⚠️ ควรอยู่ระหว่าง {jobForm.open_time}–{jobForm.close_time}</span>
                                                                        )}
                                                                    </div>
                                                                ))}

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const lastTime = jobForm.layoff_schedules[jobForm.layoff_schedules.length - 1] || '12:00'
                                                                        // Auto-suggest next time: +2 hours from last
                                                                        const [h, m] = lastTime.split(':').map(Number)
                                                                        const nextH = Math.min(h + 2, 23)
                                                                        const nextTime = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                                                                        setJobForm({ ...jobForm, layoff_schedules: [...jobForm.layoff_schedules, nextTime] })
                                                                    }}
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem', alignSelf: 'flex-start' }}
                                                                >
                                                                    <FiPlus size={14} /> เพิ่มรอบตีออก
                                                                </button>

                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.3rem' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={jobForm.layoff_auto_close}
                                                                        onChange={(e) => setJobForm({ ...jobForm, layoff_auto_close: e.target.checked })}
                                                                    />
                                                                    <span>ตีออกอีกครั้งเมื่อปิดรอบ (รอบสุดท้าย)</span>
                                                                </label>

                                                                {/* Timeline preview */}
                                                                <div style={{ background: 'rgba(79,172,254,0.08)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: '6px', padding: '0.6rem 0.8rem', marginTop: '0.2rem' }}>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-color, #4facfe)' }}>
                                                                        📋 สรุป: ระบบจะตีออกทั้งหมด{' '}
                                                                        <strong>
                                                                            {jobForm.layoff_schedules.length + (jobForm.layoff_auto_close ? 1 : 0)} รอบ
                                                                        </strong>
                                                                        {' '}({[...jobForm.layoff_schedules].sort().join(', ')}
                                                                        {jobForm.layoff_auto_close && `, ${jobForm.close_time} ปิดรอบ`})
                                                                    </span>
                                                                </div>
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
                                            <FiList /> ส่งรายงานยอดตัวเลขเมื่อปิดงวด
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.notify_bets_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, notify_bets_enabled: e.target.checked })}
                                                />
                                                <strong>ส่งรายงานสรุปตัวเลขไปยังกลุ่ม LINE</strong>
                                            </label>

                                            {jobForm.notify_bets_enabled && (
                                                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div>
                                                        <label className="form-label">เลือกรายงานที่ต้องการส่ง</label>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('total')}
                                                                    onChange={() => toggleFormReportType('total')}
                                                                />
                                                                <span>ยอดรวมทั้งหมด (Total)</span>
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('remaining')}
                                                                    onChange={() => toggleFormReportType('remaining')}
                                                                />
                                                                <span>ยอดถือสู้เอง (Remaining)</span>
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={jobForm.notify_bets_types.includes('layoff')}
                                                                    onChange={() => toggleFormReportType('layoff')}
                                                                />
                                                                <span>ยอดตีออก (Layoffs)</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="form-label">เลือกกลุ่มไลน์</label>
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
                                            <FiRefreshCw /> ระบบแจ้งผลและสรุปยอดอัตโนมัติ
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={jobForm.auto_import_result_enabled}
                                                    onChange={(e) => setJobForm({ ...jobForm, auto_import_result_enabled: e.target.checked })}
                                                />
                                                <strong>ดึงผลรางวัลและคำนวณได้เสียโดยอัตโนมัติ</strong>
                                            </label>

                                            {jobForm.auto_import_result_enabled && (
                                                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: !!jobForm.result_notify_group_id ? '1fr 1fr' : '1fr', gap: '1rem', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!jobForm.result_notify_group_id}
                                                                    onChange={(e) => {
                                                                        const isChecked = e.target.checked;
                                                                        setJobForm({
                                                                            ...jobForm,
                                                                            result_notify_group_id: isChecked ? (lineGroups[0]?.id || 'select') : ''
                                                                        });
                                                                    }}
                                                                />
                                                                <strong>ส่งสรุปผลหวยเข้ากลุ่ม</strong>
                                                            </label>
                                                        </div>
                                                        {!!jobForm.result_notify_group_id && (
                                                            <div>
                                                                <label className="form-label" style={{ margin: 0, marginBottom: '0.3rem' }}>เลือกกลุ่มไลน์</label>
                                                                <select
                                                                    value={jobForm.result_notify_group_id === 'select' ? '' : jobForm.result_notify_group_id}
                                                                    onChange={(e) => setJobForm({ ...jobForm, result_notify_group_id: e.target.value })}
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

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={jobForm.notify_result_enabled}
                                                                onChange={(e) => setJobForm({ ...jobForm, notify_result_enabled: e.target.checked })}
                                                            />
                                                            <span>แจ้งผลเข้ากลุ่มไลน์สมาชิก</span>
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

        </div>
    )
}
