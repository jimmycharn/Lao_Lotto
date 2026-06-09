import { useState, useEffect, Fragment } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { confirmDialog } from '../../utils/confirmDialog'
import {
    FiPlus,
    FiTrash2,
    FiCheck,
    FiMessageSquare,
    FiInfo,
    FiCopy,
    FiAlertCircle,
    FiSettings,
    FiRefreshCw
} from 'react-icons/fi'
import CopyButton from '../CopyButton'
import { LOTTERY_TYPES } from '../../constants/lotteryTypes'

export default function DealerLineBotTab({ user, profile }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [lineGroups, setLineGroups] = useState([])
    const [generatingCode, setGeneratingCode] = useState(false)
    const [activeCode, setActiveCode] = useState(null)
    const [openRounds, setOpenRounds] = useState([])
    const [managers, setManagers] = useState([])
    const [managerLineId, setManagerLineId] = useState('')
    const [managerNickname, setManagerNickname] = useState('')
    const [managerPermissions, setManagerPermissions] = useState({
        can_view_stats: false,
        can_view_total: false,
        can_view_excess: false,
        can_transfer: false
    })
    const [groupMembers, setGroupMembers] = useState({})
    const [loadingGroupMembers, setLoadingGroupMembers] = useState({})
    const [selectedGroupId, setSelectedGroupId] = useState(null)

    // Call Edge Function to sync/refresh real LINE group names from the LINE API
    const refreshGroupNames = async () => {
        try {
            const { error } = await supabase.functions.invoke('line-bot', {
                body: { action: 'refresh_group_names' }
            })
            if (error) {
                console.error('Error triggering group name refresh:', error)
            }
        } catch (error) {
            console.error('Error invoking group name refresh:', error)
        }
    }

    const fetchManagers = async () => {
        if (!user?.id) return
        try {
            const { data, error } = await supabase
                .from('line_managers')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })
            if (error) throw error
            setManagers(data || [])
        } catch (error) {
            console.error('Error fetching managers:', error)
            toast.error('ไม่สามารถดึงข้อมูลผู้จัดการกลุ่มได้')
        }
    }

    const fetchGroupMembers = async (lineGroupId) => {
        if (!lineGroupId) return
        setLoadingGroupMembers(prev => ({ ...prev, [lineGroupId]: true }))
        try {
            const { data, error } = await supabase
                .from('line_group_members')
                .select(`
                    id,
                    line_user_id,
                    display_name,
                    user_id,
                    profiles:user_id (
                        full_name
                    )
                `)
                .eq('line_group_id', lineGroupId)
                .order('created_at', { ascending: true })

            if (error) throw error
            setGroupMembers(prev => ({ ...prev, [lineGroupId]: data || [] }))
        } catch (error) {
            console.error('Error fetching group members:', error)
            toast.error('ไม่สามารถดึงข้อมูลสมาชิกกลุ่มได้')
        } finally {
            setLoadingGroupMembers(prev => ({ ...prev, [lineGroupId]: false }))
        }
    }

    const handleAddManager = async (e) => {
        e.preventDefault()
        if (!managerLineId.trim() || !managerNickname.trim()) {
            toast.error('กรุณากรอกข้อมูลให้ครบถ้วน')
            return
        }
        try {
            const { error } = await supabase
                .from('line_managers')
                .insert({
                    dealer_id: user.id,
                    line_user_id: managerLineId.trim(),
                    nickname: managerNickname.trim(),
                    permissions: managerPermissions,
                    is_active: true
                })
            if (error) throw error
            toast.success('เพิ่มผู้จัดการเรียบร้อยแล้ว')
            setManagerLineId('')
            setManagerNickname('')
            setManagerPermissions({
                can_view_stats: false,
                can_view_total: false,
                can_view_excess: false,
                can_transfer: false
            })
            fetchManagers()
        } catch (error) {
            console.error('Error adding manager:', error)
            toast.error('ไม่สามารถเพิ่มผู้จัดการได้ (อาจมีรหัส LINE นี้อยู่แล้ว)')
        }
    }

    const handleToggleManagerStatus = async (managerId, currentStatus) => {
        try {
            const { error } = await supabase
                .from('line_managers')
                .update({ is_active: !currentStatus })
                .eq('id', managerId)
            if (error) throw error
            toast.success('อัปเดตสถานะผู้จัดการสำเร็จ')
            fetchManagers()
        } catch (error) {
            console.error('Error toggling manager status:', error)
            toast.error('ไม่สามารถเปลี่ยนสถานะผู้จัดการได้')
        }
    }

    const handleDeleteManager = async (managerId) => {
        if (!(await confirmDialog({
            title: 'ลบผู้จัดการ',
            message: 'คุณแน่ใจว่าต้องการลบผู้จัดการรายนี้หรือไม่?',
            confirmText: 'ยืนยัน',
            cancelText: 'ยกเลิก'
        }))) return
        try {
            const { error } = await supabase
                .from('line_managers')
                .delete()
                .eq('id', managerId)
            if (error) throw error
            toast.success('ลบผู้จัดการสำเร็จ')
            fetchManagers()
        } catch (error) {
            console.error('Error deleting manager:', error)
            toast.error('ไม่สามารถลบผู้จัดการได้')
        }
    }

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            await refreshGroupNames()
            await fetchLineGroups()
            await fetchManagers()
        }
        load()
    }, [user?.id])

    // Fetch bound LINE groups
    const fetchLineGroups = async () => {
        if (!user?.id) return
        setLoading(true)
        try {
            // Fetch groups
            const { data: groups, error: groupsError } = await supabase
                .from('line_groups')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            if (groupsError) throw groupsError
            setLineGroups(groups || [])

            // If there's an active binding code that hasn't been bound yet, set it as activeCode
            const pending = groups?.find(g => g.line_group_id === 'pending' || !g.line_group_id)
            if (pending) {
                setActiveCode(pending.binding_code)
            } else {
                setActiveCode(null)
            }

            // Fetch active rounds for dealer to check status
            const { data: rounds, error: roundsError } = await supabase
                .from('lottery_rounds')
                .select('id, lottery_type, status')
                .eq('dealer_id', user.id)
                .eq('status', 'open')

            if (roundsError) throw roundsError
            setOpenRounds(rounds || [])

        } catch (error) {
            console.error('Error fetching line groups or open rounds:', error)
            toast.error('ไม่สามารถดึงข้อมูลกลุ่ม LINE ได้')
        } finally {
            setLoading(false)
        }
    }

    const handleRefresh = async () => {
        setLoading(true)
        await refreshGroupNames()
        await fetchLineGroups()
        await fetchManagers()
    }

    // Generate binding code for new group
    const handleGenerateCode = async () => {
        if (activeCode) {
            toast.warning('คุณมีรหัสผูกกลุ่มที่ยังไม่ได้ใช้งานอยู่แล้ว')
            return
        }

        setGeneratingCode(true)
        try {
            // Generate a random 6-digit alphanumeric code: BG-XXXXXX
            const code = 'BG-' + Math.random().toString(36).substring(2, 8).toUpperCase()
            
            const { error } = await supabase
                .from('line_groups')
                .insert({
                    line_group_id: 'pending',
                    dealer_id: user.id,
                    lottery_type: 'lao', // default
                    binding_code: code,
                    is_active: false
                })

            if (error) throw error

            setActiveCode(code)
            toast.success('สร้างรหัสผูกกลุ่มสำเร็จ! คัดลอกไปวางในกลุ่ม LINE ได้เลยค่ะ')
            fetchLineGroups()
        } catch (error) {
            console.error('Error generating binding code:', error)
            toast.error('เกิดข้อผิดพลาดในการสร้างรหัสผูกกลุ่ม')
        } finally {
            setGeneratingCode(false)
        }
    }

    // Delete binding code or unbind group
    const handleDeleteGroup = async (groupId, bindingCode) => {
        const title = bindingCode ? 'ยกเลิกรหัสผูกกลุ่ม' : 'ยกเลิกผูกกลุ่ม LINE'
        const message = bindingCode 
            ? 'คุณต้องการลบรหัสผูกกลุ่มนี้หรือไม่?' 
            : 'คุณต้องการยกเลิกการเชื่อมโยงและลบกลุ่ม LINE นี้ออกจากการรับโพยหรือไม่?'

        if (!(await confirmDialog({ title, message, confirmText: 'ยืนยัน', cancelText: 'ยกเลิก' }))) {
            return
        }

        try {
            const { error } = await supabase
                .from('line_groups')
                .delete()
                .eq('id', groupId)

            if (error) throw error

            toast.success('ลบข้อมูลเรียบร้อยแล้ว')
            if (bindingCode && activeCode === bindingCode) {
                setActiveCode(null)
            }
            fetchLineGroups()
        } catch (error) {
            console.error('Error deleting line group:', error)
            toast.error('เกิดข้อผิดพลาดในการลบข้อมูล')
        }
    }

    // Update default lottery type of a group
    const handleUpdateLotteryType = async (groupId, type) => {
        // Optimistic update for instant UI feedback
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, lottery_type: type } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    lottery_type: type,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error

            toast.success('อัปเดตประเภทหวยหลักสำเร็จ!')
        } catch (error) {
            console.error('Error updating lottery type:', error)
            toast.error('ไม่สามารถแก้ไขประเภทหวยหลักได้')
            // Revert by re-fetching
            fetchLineGroups()
        }
    }

    // Filter list to active groups (those actually bound to a LINE chat)
    const activeGroups = lineGroups.filter(g => g.line_group_id !== 'pending' && g.line_group_id)
    const pendingCodeObj = lineGroups.find(g => g.line_group_id === 'pending' || !g.line_group_id)

    return (
        <div className="line-bot-section">
            {/* Guide Card */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                    <FiMessageSquare /> คู่มือการผูกกลุ่ม LINE Bot
                </h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                    <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        <li style={{ marginBottom: '0.5rem' }}>
                            เพิ่ม **LINE Official Account ของบอท** เข้าในกลุ่มแชทที่ต้องการรับโพย
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                            กดปุ่ม **"สร้างรหัสผูกกลุ่ม"** ด้านล่างนี้เพื่อรับโค้ดเฉพาะดีลเลอร์ของคุณ
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                            คัดลอกโค้ดไปพิมพ์ลงในแชทกลุ่ม LINE ในรูปแบบ: <code style={{ color: 'var(--color-primary)', background: 'var(--color-bg)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>/bind [รหัสโค้ด]</code>
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                            เมื่อบอทตอบกลับการผูกกลุ่มสำเร็จ กลุ่มนั้นจะเข้ามาปรากฏในรายการด้านล่าง และพร้อมประมวลผลยอดแทงจากสมาชิกกลุ่มทันทีค่ะ!
                        </li>
                    </ol>
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: 'rgba(212, 175, 55, 0.05)',
                        border: '1px solid rgba(212, 175, 55, 0.15)',
                        borderRadius: '6px',
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'flex-start'
                    }}>
                        <FiInfo size={16} style={{ color: 'var(--color-primary)', marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem' }}>
                            * สมาชิกกลุ่มจะต้องนำรหัส **LINE User ID** ไปกรอกในเมนู "โปรไฟล์" บนเว็บไซต์ก่อน จึงจะสามารถพิมพ์ส่งโพยในกลุ่มแล้วระบบประมวลผลบิลได้
                        </span>
                    </div>
                </div>
            </div>

            {/* Binding Code Generation Area */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>รหัสผูกกลุ่ม (Binding Code)</h3>
                
                {pendingCodeObj ? (
                    <div style={{
                        background: 'var(--color-bg)',
                        border: '1px dashed var(--color-primary)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem',
                        textAlign: 'center'
                    }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            รหัสผูกกลุ่มพร้อมใช้ของคุณ (พิมพ์ /bind [รหัสนี้] ในกลุ่มแชท LINE)
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
                            <code style={{
                                fontSize: '2rem',
                                fontWeight: 'bold',
                                color: 'var(--color-primary)',
                                letterSpacing: '0.05em',
                                background: 'rgba(212, 175, 55, 0.1)',
                                padding: '0.25rem 1rem',
                                borderRadius: '8px'
                            }}>
                                {pendingCodeObj.binding_code}
                            </code>
                            <CopyButton text={`/bind ${pendingCodeObj.binding_code}`} />
                        </div>
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleDeleteGroup(pendingCodeObj.id, pendingCodeObj.binding_code)}
                            style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                        >
                            ยกเลิกรหัสนี้
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleGenerateCode}
                            disabled={generatingCode}
                            style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                        >
                            {generatingCode ? 'กำลังสร้าง...' : <><FiPlus /> สร้างรหัสผูกกลุ่มใหม่</>}
                        </button>
                    </div>
                )}
            </div>

            {/* Bound Groups Table */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0 }}>กลุ่ม LINE ที่ผูกเชื่อมต่อแล้ว ({activeGroups.length})</h3>
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={handleRefresh}
                        title="รีเฟรชข้อมูล"
                    >
                        <FiRefreshCw /> รีเฟรช
                    </button>
                </div>

                {loading ? (
                    <div className="loading-state" style={{ padding: '2rem 0' }}>
                        <div className="spinner"></div>
                        <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>กำลังโหลดข้อมูล...</p>
                    </div>
                ) : activeGroups.length === 0 ? (
                    <div className="empty-state small" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                        <FiAlertCircle size={36} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>ยังไม่มีการผูกกลุ่ม LINE เพื่อรับบิลโพยหวย</p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table" style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>ชื่อกลุ่ม / กลุ่ม ID</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '180px' }}>ประเภทหวยหลัก</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '120px' }}>สถานะ</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '80px' }}>การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeGroups.map(group => {
                                    const isOpen = openRounds.some(r => r.lottery_type === group.lottery_type);
                                    const isExpanded = selectedGroupId === group.id;
                                    return (
                                        <Fragment key={group.id}>
                                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                                <td 
                                                    style={{ padding: '0.75rem', cursor: 'pointer' }}
                                                onClick={() => {
                                                    if (isExpanded) {
                                                        setSelectedGroupId(null)
                                                    } else {
                                                        setSelectedGroupId(group.id)
                                                        fetchGroupMembers(group.line_group_id)
                                                    }
                                                }}
                                                title="คลิกเพื่อดูรายชื่อสมาชิกกลุ่ม"
                                            >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{group.group_name || 'กลุ่มไลน์รับยอด'}</div>
                                                        <span style={{ 
                                                            fontSize: '0.7rem', 
                                                            color: 'var(--color-text-muted)', 
                                                            background: 'rgba(255,255,255,0.05)', 
                                                            padding: '0.1rem 0.35rem', 
                                                            borderRadius: '4px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.2rem'
                                                        }}>
                                                            {isExpanded ? '▲ ซ่อนสมาชิก' : '▼ ดูสมาชิก'}
                                                        </span>
                                                    </div>
                                                    <code style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                        {group.line_group_id}
                                                    </code>
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <select
                                                        className="form-input"
                                                        value={group.lottery_type}
                                                        onChange={e => handleUpdateLotteryType(group.id, e.target.value)}
                                                        style={{ padding: '0.25rem 0.5rem', width: '100%', fontSize: '0.85rem' }}
                                                    >
                                                        {Object.entries(LOTTERY_TYPES).map(([typeKey, label]) => (
                                                            <option key={typeKey} value={typeKey}>{label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    {isOpen ? (
                                                        <span style={{
                                                            background: 'rgba(34, 197, 94, 0.12)',
                                                            color: '#22c55e',
                                                            padding: '0.2rem 0.5rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 'bold',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem'
                                                        }}>
                                                            <FiCheck size={12} /> รับยอดอยู่
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            background: 'rgba(239, 68, 68, 0.12)',
                                                            color: '#ef4444',
                                                            padding: '0.2rem 0.5rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 'bold',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem'
                                                        }}>
                                                            <FiAlertCircle size={12} /> ปิดรับ
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <button
                                                        className="btn btn-outline btn-sm danger"
                                                        onClick={() => handleDeleteGroup(group.id, null)}
                                                        title="ยกเลิกการผูกกลุ่ม"
                                                        style={{ padding: '0.25rem 0.5rem' }}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                                                    <td colSpan={4} style={{ padding: '1rem' }}>
                                                        <div style={{
                                                            background: 'var(--color-background-dark)',
                                                            borderRadius: '8px',
                                                            padding: '1rem',
                                                            border: '1px solid var(--color-border)'
                                                        }}>
                                                            <div style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ color: 'var(--color-primary)' }}>👥 รายชื่อสมาชิกในกลุ่ม LINE นี้ ({(groupMembers[group.line_group_id] || []).length} คน)</span>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                                                                    (แสดงเฉพาะคนในกลุ่ม LINE นี้เท่านั้น ทั้งบัญชีที่ผูกแล้วและบัญชีทั่วไปที่ยังไม่ผูกในระบบเว็บ)
                                                                </span>
                                                            </div>
                                                            {loadingGroupMembers[group.line_group_id] ? (
                                                                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                                                    กำลังโหลดรายชื่อสมาชิกกลุ่ม...
                                                                </div>
                                                            ) : (groupMembers[group.line_group_id] || []).length === 0 ? (
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                                                                    ยังไม่มีสมาชิกที่ตรวจพบในกลุ่ม LINE นี้ (จะบันทึกรายชื่อเมื่อสมาชิกส่งข้อความในห้องแชท)
                                                                </div>
                                                            ) : (
                                                                <div style={{ maxHeight: '250px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                                                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                                                                                <th style={{ textAlign: 'left', padding: '0.5rem', width: '220px' }}>ชื่อใน LINE (Display Name)</th>
                                                                                <th style={{ textAlign: 'left', padding: '0.5rem', width: '280px' }}>LINE User ID</th>
                                                                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>สถานะการผูกบัญชีในระบบเว็บ</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {(groupMembers[group.line_group_id] || []).map(member => (
                                                                                <tr key={member.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>{member.display_name}</td>
                                                                                    <td style={{ padding: '0.5rem' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                            <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                                                {member.line_user_id}
                                                                                            </code>
                                                                                            <CopyButton text={member.line_user_id} />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td style={{ padding: '0.5rem' }}>
                                                                                        {member.user_id ? (
                                                                                            <span style={{ 
                                                                                                color: 'var(--color-success)', 
                                                                                                fontSize: '0.8rem',
                                                                                                background: 'rgba(34, 197, 94, 0.08)',
                                                                                                padding: '0.15rem 0.4rem',
                                                                                                borderRadius: '4px',
                                                                                                border: '1px solid rgba(34, 197, 94, 0.15)',
                                                                                                fontWeight: 600
                                                                                            }}>
                                                                                                ผูกแล้ว: {member.profiles?.full_name || 'ไม่ทราบชื่อ'}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span style={{ 
                                                                                                color: 'var(--color-text-muted)', 
                                                                                                fontSize: '0.8rem',
                                                                                                background: 'rgba(239, 68, 68, 0.08)',
                                                                                                padding: '0.15rem 0.4rem',
                                                                                                borderRadius: '4px',
                                                                                                border: '1px solid rgba(239, 68, 68, 0.15)'
                                                                                            }}>
                                                                                                ยังไม่ผูกบัญชี LINE
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Managers Card */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FiSettings /> ผู้จัดการกลุ่ม LINE (LINE Group Managers)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                    เพิ่มบัญชี LINE ของผู้ช่วยเพื่อให้สามารถใช้คำสั่งดูยอด สถิติ หรือสั่งตีออกข้อมูลผ่านแชทกลุ่ม LINE ได้โดยตรง
                </p>

                {/* Add Manager Form */}
                <form onSubmit={handleAddManager} style={{
                    background: 'var(--color-bg)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1.5rem',
                    border: '1px solid var(--color-border)'
                }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>เพิ่มผู้จัดการคนใหม่</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--color-text-muted)' }}>LINE User ID (ดูรหัสได้โดยพิมพ์ /link ใน LINE)</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="เช่น Ua1b2c3d4..."
                                value={managerLineId}
                                onChange={e => setManagerLineId(e.target.value)}
                                style={{ width: '100%', fontSize: '0.85rem' }}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--color-text-muted)' }}>ชื่อเรียก / นามแฝง</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="เช่น ผู้จัดการแอน"
                                value={managerNickname}
                                onChange={e => setManagerNickname(e.target.value)}
                                style={{ width: '100%', fontSize: '0.85rem' }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>กำหนดสิทธิ์การสั่งการ (Permissions):</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={managerPermissions.can_view_stats}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_stats: e.target.checked }))}
                                />
                                ดูเครดิต/ยอดเงินสมาชิกรายคน (/สมาชิก)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={managerPermissions.can_view_total}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_total: e.target.checked }))}
                                />
                                ดูยอดรวมทั้งหมดในงวด (/ยอดรวม)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={managerPermissions.can_view_excess}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_excess: e.target.checked }))}
                                />
                                ดูยอดเกินอั้น (/ยอดเกิน)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={managerPermissions.can_transfer}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_transfer: e.target.checked }))}
                                />
                                สั่งตีออกยอดเกิน (/ตีออก)
                            </label>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '0.4rem 1.5rem' }}>
                        <FiPlus /> เพิ่มผู้จัดการ
                    </button>
                </form>

                {/* Managers List */}
                {managers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', border: '1px dashed var(--color-border)', borderRadius: '6px' }}>
                        ยังไม่มีการตั้งค่าผู้จัดการกลุ่ม LINE
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table" style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>ชื่อเรียก / นามแฝง</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>LINE User ID</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>สิทธิ์การใช้งาน</th>
                                    <th style={{ textAlign: 'center', padding: '0.5rem', width: '100px' }}>สถานะ</th>
                                    <th style={{ textAlign: 'center', padding: '0.5rem', width: '80px' }}>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {managers.map(mgr => (
                                    <tr key={mgr.id} style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{mgr.nickname}</td>
                                        <td style={{ padding: '0.5rem' }}><code style={{ fontSize: '0.75rem' }}>{mgr.line_user_id}</code></td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                {mgr.permissions?.can_view_stats && <span style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--color-primary)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูสมาชิก</span>}
                                                {mgr.permissions?.can_view_total && <span style={{ background: 'rgba(54,162,235,0.1)', color: '#36a2eb', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูยอดรวม</span>}
                                                {mgr.permissions?.can_view_excess && <span style={{ background: 'rgba(255,159,64,0.1)', color: '#ff9f40', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูยอดเกิน</span>}
                                                {mgr.permissions?.can_transfer && <span style={{ background: 'rgba(153,102,255,0.1)', color: '#9966ff', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ตีออก</span>}
                                                {!mgr.permissions?.can_view_stats && !mgr.permissions?.can_view_total && !mgr.permissions?.can_view_excess && !mgr.permissions?.can_transfer && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>ไม่มีสิทธิ์</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                            <button
                                                className={`btn btn-sm ${mgr.is_active ? 'btn-success' : 'btn-outline'}`}
                                                onClick={() => handleToggleManagerStatus(mgr.id, mgr.is_active)}
                                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                                            >
                                                {mgr.is_active ? 'ใช้งานอยู่' : 'ระงับการใช้'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                            <button
                                                className="btn btn-outline btn-sm danger"
                                                onClick={() => handleDeleteManager(mgr.id)}
                                                style={{ padding: '0.15rem 0.3rem' }}
                                            >
                                                <FiTrash2 size={12} />
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
    )
}
