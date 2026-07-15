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
    FiRefreshCw,
    FiTerminal,
    FiX
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
    const [managerRole, setManagerRole] = useState('manager')
    const [managerPermissions, setManagerPermissions] = useState({
        can_view_stats: false,
        can_view_total: false,
        can_view_excess: false,
        can_transfer: false
    })
    const [groupMembers, setGroupMembers] = useState({})
    const [loadingGroupMembers, setLoadingGroupMembers] = useState({})
    const [selectedGroupId, setSelectedGroupId] = useState(null)
    const [selectedConfigGroupId, setSelectedConfigGroupId] = useState(null)
    const [activeMembers, setActiveMembers] = useState([])
    const [searchGroupQuery, setSearchGroupQuery] = useState('')
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all')
    const [allowedLotteryTypes, setAllowedLotteryTypes] = useState([])

    const isOwnerOrSuper = profile?.role === 'dealer' || profile?.role === 'superadmin'

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

    const fetchActiveMembers = async () => {
        if (!user?.id) return
        try {
            const { data, error } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    user_id,
                    profiles:user_id (
                        id,
                        full_name,
                        member_code
                    )
                `)
                .eq('dealer_id', user.id)
                .eq('status', 'active')
            
            if (error) throw error

            const formatted = (data || [])
                .map(m => m.profiles)
                .filter(Boolean)
            
            setActiveMembers(formatted)
        } catch (error) {
            console.error('Error fetching active members:', error)
            toast.error('ไม่สามารถดึงข้อมูลสมาชิกได้')
        }
    }

    const fetchAllowedLotteryTypes = async () => {
        if (!user?.id) return
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('allowed_lottery_types')
                .eq('id', user.id)
                .maybeSingle()
            if (error) throw error
            setAllowedLotteryTypes(data?.allowed_lottery_types || Object.keys(LOTTERY_TYPES))
        } catch (error) {
            console.error('Error fetching allowed lottery types:', error)
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
                        full_name,
                        member_code
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
            const finalPermissions = managerRole === 'admin'
                ? { can_view_stats: true, can_view_total: true, can_view_excess: true, can_transfer: true }
                : managerPermissions;

            const { error } = await supabase
                .from('line_managers')
                .insert({
                    dealer_id: user.id,
                    line_user_id: managerLineId.trim(),
                    nickname: managerNickname.trim(),
                    role: managerRole,
                    permissions: finalPermissions,
                    is_active: true
                })
            if (error) throw error
            toast.success('เพิ่มผู้จัดการเรียบร้อยแล้ว')
            setManagerLineId('')
            setManagerNickname('')
            setManagerRole('manager')
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
            try {
                // Do not auto-refresh group names from LINE API on initial load to avoid high latency.
                // Users can manually refresh names using the "Refresh" button.
                await Promise.all([
                    fetchLineGroups(),
                    fetchActiveMembers(),
                    fetchManagers(),
                    fetchAllowedLotteryTypes()
                ])
            } catch (err) {
                console.error("Error in initial load:", err)
            } finally {
                setLoading(false)
            }
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

            const active = (groups || []).filter(g => g.line_group_id !== 'pending' && g.line_group_id)
            if (active.length > 0) {
                setSelectedConfigGroupId(prev => prev || active[0].id)
            }

            // If there's an active binding code that hasn't been bound yet, set it as activeCode
            const pending = groups?.find(g => (g.line_group_id && g.line_group_id.startsWith('pending')) || !g.line_group_id)
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
        await Promise.all([
            fetchLineGroups(),
            fetchActiveMembers(),
            fetchManagers(),
            fetchAllowedLotteryTypes()
        ])
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
                    line_group_id: 'pending-' + code,
                    dealer_id: user.id,
                    lottery_type: 'thai', // default
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

    const handleToggleAllowStaffBet = async (groupId, allowed) => {
        // Optimistic update for instant UI feedback
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, allow_staff_bet: allowed } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    allow_staff_bet: allowed,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error

            toast.success('อัปเดตสิทธิ์การส่งเลขของเจ้ามือ/แอดมินสำเร็จ!')
        } catch (error) {
            console.error('Error toggling staff bet permission:', error)
            toast.error('ไม่สามารถอัปเดตสิทธิ์ได้')
            fetchLineGroups()
        }
    }

    const handleToggleDisableReplies = async (groupId, disabled) => {
        // Optimistic update for instant UI feedback
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, disable_replies: disabled } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    disable_replies: disabled,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error

            toast.success(disabled ? 'ตั้งค่าบอทไม่ตอบกลับในกลุ่มนี้แล้ว!' : 'เปิดใช้งานบอทตอบกลับในกลุ่มนี้ตามปกติแล้ว!')
        } catch (error) {
            console.error('Error toggling disable replies:', error)
            toast.error('ไม่สามารถอัปเดตสิทธิ์การตอบกลับได้')
            fetchLineGroups()
        }
    }

    const handleUpdateStaffMember = async (groupId, staffMemberId) => {
        const value = staffMemberId === '' ? null : staffMemberId
        // Optimistic update
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, staff_member_id: value } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    staff_member_id: value,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error

            toast.success('ตั้งค่าบัญชีสมาชิกตัวแทนสำเร็จ!')
        } catch (error) {
            console.error('Error updating staff member representative:', error)
            toast.error('ไม่สามารถบันทึกบัญชีสมาชิกตัวแทนได้')
            fetchLineGroups()
        }
    }

    const handleUpdateMemberPermissions = async (groupId, permissionKey, allowed) => {
        const group = lineGroups.find(g => g.id === groupId)
        if (!group) return

        const currentPerms = group.member_permissions || {
            bet: true,
            summary: true,
            total: true,
            cancel: true,
            bill: true,
            link: true,
            help: true
        }

        const newPerms = {
            ...currentPerms,
            [permissionKey]: allowed
        }

        // Optimistic update
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_permissions: newPerms } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    member_permissions: newPerms,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error
            toast.success('อัปเดตสิทธิ์การใช้งานของสมาชิกสำเร็จ!')
        } catch (error) {
            console.error('Error updating member permissions:', error)
            toast.error('ไม่สามารถอัปเดตสิทธิ์การใช้งานได้')
            fetchLineGroups()
        }
    }

    const handleToggleGroupNotification = async (groupId, key, value) => {
        // Optimistic update
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, [key]: value } : g))

        try {
            const { error } = await supabase
                .from('line_groups')
                .update({
                    [key]: value,
                    updated_at: new Date().toISOString()
                })
                .eq('id', groupId)

            if (error) throw error

            toast.success('อัปเดตตั้งค่าการแจ้งเตือนของกลุ่มสำเร็จ!')
        } catch (error) {
            console.error('Error toggling group notification:', error)
            toast.error('ไม่สามารถแก้ไขตั้งค่าการแจ้งเตือนได้')
            fetchLineGroups()
        }
    }

    const configGroup = lineGroups.find(g => g.id === selectedConfigGroupId)
    const memberPerms = configGroup?.member_permissions || {
        bet: true,
        summary: true,
        total: true,
        cancel: true,
        bill: true,
        link: true,
        help: true
    }

    const renderMemberPermission = (key, badgeLabel) => {
        if (!configGroup) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</span>
                    {badgeLabel && (
                        <span style={{ color: '#36a2eb', fontSize: '0.75rem', background: 'rgba(54,162,235,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                            {badgeLabel}
                        </span>
                    )}
                </div>
            )
        }
        const isAllowed = memberPerms[key] !== false // default true
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                    <input
                        type="checkbox"
                        checked={isAllowed}
                        disabled={!isOwnerOrSuper}
                        onChange={e => handleUpdateMemberPermissions(configGroup.id, key, e.target.checked)}
                        style={{ cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed' }}
                    />
                    <span style={{ 
                        fontSize: '0.85rem', 
                        color: isAllowed ? '#22c55e' : '#ef4444',
                        fontWeight: 'bold'
                    }}>
                        {isAllowed ? '✓ ได้' : '✗ ไม่ได้'}
                    </span>
                </label>
                {isAllowed && badgeLabel && (
                    <span style={{ color: '#36a2eb', fontSize: '0.75rem', background: 'rgba(54,162,235,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                        {badgeLabel}
                    </span>
                )}
            </div>
        )
    }

    // Filter list to active groups (those actually bound to a LINE chat)
    const activeGroups = lineGroups.filter(g => g.line_group_id !== 'pending' && g.line_group_id)
    const filteredActiveGroups = activeGroups.filter(g => {
        // 1. Filter by lottery type
        if (selectedTypeFilter !== 'all' && g.lottery_type !== selectedTypeFilter) {
            return false;
        }

        // 2. Filter by search query
        const query = searchGroupQuery.toLowerCase().trim();
        if (!query) return true;
        const name = (g.group_name || '').toLowerCase();
        const id = (g.line_group_id || '').toLowerCase();
        return name.includes(query) || id.includes(query);
    });
    const pendingCodeObj = lineGroups.find(g => g.line_group_id === 'pending' || !g.line_group_id)

    return (
        <div className="line-bot-section">
            {/* Dealer Member Code & 1-on-1 Registration Guide Card */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #36a2eb', background: 'rgba(54, 162, 235, 0.02)' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#36a2eb' }}>
                    <FiTerminal /> ข้อมูลเจ้ามือสำหรับการส่งโพยส่วนตัว (1-on-1)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>รหัสเจ้ามือของคุณ (Member Code)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <code style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontFamily: 'monospace' }}>
                                {profile?.member_code || '-'}
                            </code>
                            <CopyButton text={profile?.member_code || ''} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                            ส่งรหัสหรือข้อความด้านขวาเพื่อให้ผู้ส่ง/สมาชิก นำไปใช้สมัครหรือตั้งค่าผู้ส่งข้อมูลส่วนตัวกับบอทในแชท 1-on-1
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>คำสั่งพิมพ์ส่งให้สมาชิก (Copy ไปส่งต่อได้เลย):</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>1. สำหรับสมัครคนใหม่:</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <code style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--color-success)' }}>
                                        /ส่งเภา {profile?.member_code || '[รหัส]'}/new
                                    </code>
                                    <CopyButton text={`/ส่งเภา ${profile?.member_code || ''}/new`} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>2. สำหรับเพิ่มผู้ส่งข้อมูล:</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <code style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#ffb300' }}>
                                        /ส่งเภา {profile?.member_code || '[รหัส]'}/[รหัสสมาชิก]
                                    </code>
                                    <CopyButton text={`/ส่งเภา ${profile?.member_code || ''}/`} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                            <CopyButton text={`/bind ${pendingCodeObj.binding_code}`} keepSpace={true} />
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
                    <h3 style={{ margin: 0 }}>
                        กลุ่ม LINE ที่ผูกเชื่อมต่อแล้ว {searchGroupQuery.trim() ? `(${filteredActiveGroups.length} จาก ${activeGroups.length})` : `(${activeGroups.length})`}
                    </h3>
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
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '150px' }}>ประเภทหวยหลัก</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '220px' }}>เจ้ามือ/แอดมินส่งเลขได้</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '120px' }}>สถานะ</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem', width: '80px' }}>การจัดการ</th>
                                </tr>
                                <tr>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%', maxWidth: '280px' }}>
                                            <input
                                                type="text"
                                                placeholder="🔍 ค้นหาชื่อกลุ่ม หรือ กลุ่ม ID..."
                                                value={searchGroupQuery}
                                                onChange={e => setSearchGroupQuery(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.35rem 2rem 0.35rem 0.75rem',
                                                    fontSize: '0.85rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)',
                                                    outline: 'none'
                                                }}
                                            />
                                            {searchGroupQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSearchGroupQuery('')}
                                                    style={{
                                                        position: 'absolute',
                                                        right: '8px',
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--color-text-muted)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        padding: '4px',
                                                        borderRadius: '50%',
                                                        transition: 'color 0.2s, background-color 0.2s'
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.color = 'var(--color-danger)';
                                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.color = 'var(--color-text-muted)';
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                    }}
                                                    title="ล้างข้อความค้นหา"
                                                >
                                                    <FiX size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                                                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                        <select
                                            className="form-input"
                                            value={selectedTypeFilter}
                                            onChange={e => setSelectedTypeFilter(e.target.value)}
                                            style={{
                                                padding: '0.35rem 0.5rem',
                                                fontSize: '0.85rem',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-surface)',
                                                color: 'var(--color-text)',
                                                outline: 'none',
                                                width: '100%',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="all">แสดงทั้งหมด</option>
                                            {allowedLotteryTypes.map(typeKey => {
                                                const label = LOTTERY_TYPES[typeKey] || typeKey.toUpperCase()
                                                return (
                                                    <option key={typeKey} value={typeKey}>{label}</option>
                                                )
                                            })}
                                        </select>
                                    </td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredActiveGroups.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                            <FiAlertCircle size={24} style={{ display: 'block', margin: '0 auto 0.5rem auto', opacity: 0.6 }} />
                                            ไม่พบกลุ่มแชทที่ตรงกับการค้นหาของคุณ
                                        </td>
                                    </tr>
                                ) : (
                                    filteredActiveGroups.map(group => {
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                                                        <code style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                            {group.line_group_id}
                                                        </code>
                                                        {group.line_group_id?.startsWith('pending-') && group.binding_code && (
                                                            <span 
                                                                onClick={e => e.stopPropagation()} 
                                                                title="คัดลอกคำสั่งผูกกลุ่ม"
                                                                style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                                                            >
                                                                <CopyButton text={`/bind ${group.binding_code}`} keepSpace={true} />
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <select
                                                        className="form-input"
                                                        value={group.lottery_type}
                                                        disabled={!isOwnerOrSuper}
                                                        onChange={e => handleUpdateLotteryType(group.id, e.target.value)}
                                                        style={{ padding: '0.25rem 0.5rem', width: '100%', fontSize: '0.85rem' }}
                                                    >
                                                        {Object.entries(LOTTERY_TYPES).map(([typeKey, label]) => (
                                                            <option key={typeKey} value={typeKey}>{label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={group.disable_replies || false}
                                                                disabled={!isOwnerOrSuper}
                                                                onChange={e => handleToggleDisableReplies(group.id, e.target.checked)}
                                                            />
                                                            <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 'bold' }}>บอทไม่ตอบกลับ</span>
                                                        </label>
                                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={group.allow_staff_bet || false}
                                                                disabled={!isOwnerOrSuper}
                                                                onChange={e => handleToggleAllowStaffBet(group.id, e.target.checked)}
                                                            />
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>อนุญาตส่งเลข</span>
                                                        </label>
                                                        {group.allow_staff_bet && (
                                                            <select
                                                                className="form-input"
                                                                value={group.staff_member_id || ''}
                                                                disabled={!isOwnerOrSuper}
                                                                onChange={e => handleUpdateStaffMember(group.id, e.target.value)}
                                                                style={{ padding: '0.25rem 0.5rem', width: '100%', maxWidth: '200px', fontSize: '0.85rem' }}
                                                            >
                                                                <option value="">-- เลือกบัญชีตัวแทน --</option>
                                                                {activeMembers.map(m => (
                                                                    <option key={m.id} value={m.id}>{m.full_name} {m.member_code ? `(รหัส: ${m.member_code})` : ''}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>
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
                                                        disabled={!isOwnerOrSuper}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                                                    <td colSpan={5} style={{ padding: '1rem' }}>
                                                        <div style={{
                                                            background: 'var(--color-background-dark)',
                                                            borderRadius: '8px',
                                                            padding: '1rem',
                                                            border: '1px solid var(--color-border)'
                                                        }}>
                                                            {/* Automation & Notification Settings */}
                                                            <div style={{
                                                                background: 'rgba(255, 255, 255, 0.02)',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '8px',
                                                                padding: '1rem',
                                                                marginBottom: '1rem'
                                                            }}>
                                                                <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <FiSettings /> ตั้งค่าแจ้งเตือนและการทำงานอัตโนมัติประจำกลุ่ม
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={group.notify_round_created || false}
                                                                            disabled={!isOwnerOrSuper}
                                                                            onChange={e => handleToggleGroupNotification(group.id, 'notify_round_created', e.target.checked)}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem' }}>📢 แจ้งเตือนเมื่อเปิดงวดใหม่</span>
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={group.notify_admin_alerts || false}
                                                                            disabled={!isOwnerOrSuper}
                                                                            onChange={e => handleToggleGroupNotification(group.id, 'notify_admin_alerts', e.target.checked)}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem' }}>⚠️ แจ้งเตือนแอดมิน/ข้อผิดพลาด</span>
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={group.notify_layoff_bets || false}
                                                                            disabled={!isOwnerOrSuper}
                                                                            onChange={e => handleToggleGroupNotification(group.id, 'notify_layoff_bets', e.target.checked)}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem' }}>📥 รับโพยส่งออก (เลขตีออก)</span>
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={group.notify_round_summary || false}
                                                                            disabled={!isOwnerOrSuper}
                                                                            onChange={e => handleToggleGroupNotification(group.id, 'notify_round_summary', e.target.checked)}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem' }}>📊 ส่งสรุปยอดโพยเมื่อปิดงวด</span>
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isOwnerOrSuper ? 'pointer' : 'not-allowed', margin: 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={group.notify_lottery_results || false}
                                                                            disabled={!isOwnerOrSuper}
                                                                            onChange={e => handleToggleGroupNotification(group.id, 'notify_lottery_results', e.target.checked)}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem' }}>🏆 ส่งผลรางวัลและรายงานผู้ชนะ</span>
                                                                    </label>
                                                                </div>
                                                            </div>

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
                                                                                                ผูกแล้ว: {member.profiles?.full_name || 'ไม่ทราบชื่อ'}{member.profiles?.member_code ? ` (รหัส: ${member.profiles.member_code})` : ''}
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
                                }))}
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

                    <div style={{ marginBottom: '1.25rem' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>บทบาท (Role):</span>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input
                                    type="radio"
                                    name="managerRole"
                                    value="manager"
                                    checked={managerRole === 'manager'}
                                    onChange={() => setManagerRole('manager')}
                                />
                                ผู้จัดการ (Manager)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input
                                    type="radio"
                                    name="managerRole"
                                    value="admin"
                                    checked={managerRole === 'admin'}
                                    onChange={() => setManagerRole('admin')}
                                />
                                แอดมิน (Admin) - มีสิทธิ์สั่งการทุกคำสั่ง (สร้าง/เปิด/ปิดงวด, แจ้งผลรางวัล)
                            </label>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>กำหนดสิทธิ์การสั่งการ (Permissions):</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: managerRole === 'admin' ? 'not-allowed' : 'pointer', opacity: managerRole === 'admin' ? 0.7 : 1 }}>
                                <input
                                    type="checkbox"
                                    checked={managerRole === 'admin' ? true : managerPermissions.can_view_stats}
                                    disabled={managerRole === 'admin'}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_stats: e.target.checked }))}
                                />
                                ดูเครดิต/ยอดเงินสมาชิกรายคน (/สมาชิก)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: managerRole === 'admin' ? 'not-allowed' : 'pointer', opacity: managerRole === 'admin' ? 0.7 : 1 }}>
                                <input
                                    type="checkbox"
                                    checked={managerRole === 'admin' ? true : managerPermissions.can_view_total}
                                    disabled={managerRole === 'admin'}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_total: e.target.checked }))}
                                />
                                ดูยอดรวมทั้งหมดในงวด (/ยอดรวม)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: managerRole === 'admin' ? 'not-allowed' : 'pointer', opacity: managerRole === 'admin' ? 0.7 : 1 }}>
                                <input
                                    type="checkbox"
                                    checked={managerRole === 'admin' ? true : managerPermissions.can_view_excess}
                                    disabled={managerRole === 'admin'}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_view_excess: e.target.checked }))}
                                />
                                ดูยอดเกินอั้น (/ยอดเกิน)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: managerRole === 'admin' ? 'not-allowed' : 'pointer', opacity: managerRole === 'admin' ? 0.7 : 1 }}>
                                <input
                                    type="checkbox"
                                    checked={managerRole === 'admin' ? true : managerPermissions.can_transfer}
                                    disabled={managerRole === 'admin'}
                                    onChange={e => setManagerPermissions(prev => ({ ...prev, can_transfer: e.target.checked }))}
                                />
                                สั่งตีออกยอดเกิน (/ตีออก)
                            </label>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '0.4rem 1.5rem' }}>
                        <FiPlus /> เพิ่มผู้จัดการ/แอดมิน
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
                                    <th style={{ textAlign: 'left', padding: '0.5rem', width: '120px' }}>บทบาท</th>
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
                                            <span style={{
                                                background: mgr.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(54, 162, 235, 0.15)',
                                                color: mgr.role === 'admin' ? '#ef4444' : '#36a2eb',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                display: 'inline-block'
                                            }}>
                                                {mgr.role === 'admin' ? 'แอดมิน' : 'ผู้จัดการ'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                {mgr.role === 'admin' ? (
                                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>มีสิทธิ์ทุกอย่าง (แอดมิน)</span>
                                                ) : (
                                                    <>
                                                        {mgr.permissions?.can_view_stats && <span style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--color-primary)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูสมาชิก</span>}
                                                        {mgr.permissions?.can_view_total && <span style={{ background: 'rgba(54,162,235,0.1)', color: '#36a2eb', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูยอดรวม</span>}
                                                        {mgr.permissions?.can_view_excess && <span style={{ background: 'rgba(255,159,64,0.1)', color: '#ff9f40', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ดูยอดเกิน</span>}
                                                        {mgr.permissions?.can_transfer && <span style={{ background: 'rgba(153,102,255,0.1)', color: '#9966ff', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>ตีออก</span>}
                                                        {!mgr.permissions?.can_view_stats && !mgr.permissions?.can_view_total && !mgr.permissions?.can_view_excess && !mgr.permissions?.can_transfer && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>ไม่มีสิทธิ์</span>}
                                                    </>
                                                )}
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

            {/* LINE Bot Commands & Permissions Guide */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FiTerminal /> รายการคำสั่งและสิทธิ์การใช้งาน LINE Bot
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>
                            ตารางสรุปคำสั่งงานทางห้องแชท LINE และสิทธิ์ประเภทผู้ใช้งานที่สามารถทำรายการได้
                        </p>
                    </div>
                    {activeGroups.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>ตั้งค่าสิทธิ์สำหรับกลุ่ม:</span>
                            <select
                                className="form-input"
                                value={selectedConfigGroupId || ''}
                                onChange={e => setSelectedConfigGroupId(e.target.value)}
                                style={{ padding: '0.35rem 0.75rem', width: 'auto', minWidth: '200px', fontSize: '0.85rem' }}
                            >
                                {activeGroups.map(g => (
                                    <option key={g.id} value={g.id}>{g.group_name || 'กลุ่มไลน์รับยอด'} ({g.lottery_type?.toUpperCase()})</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                <div className="table-responsive">
                    <table className="table" style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.75rem', width: '220px' }}>คำสั่ง (Command)</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem' }}>รายละเอียดการทำงาน</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem', width: '100px' }}>แอดมิน</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem', width: '160px' }}>ผู้จัดการ</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem', width: '140px' }}>สมาชิก</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Member Commands */}
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        ตัวเลข=ยอดแทง (เช่น 123=100)
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ส่งโพยเข้าระบบเพื่อวิเคราะห์และบันทึกบิลแทง</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('bet')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /สรุป หรือ /summary [เลขรางวัล/วันที่]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ดูสรุปยอดและประกาศผล (ร้านค้า) หรือสรุปส่วนตัว บิลที่ถูกรางวัล และยอดเคลียร์เงิน (สมาชิก)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ทั้งหมด</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#36a2eb', fontSize: '0.75rem', background: 'rgba(54,162,235,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('summary', '👤 เฉพาะของตนเอง')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ยอดรวม หรือ /total
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>รายงานยอดรับแยกตามประเภท (ร้านค้า) หรือสรุปยอดแทงสะสมของตนเอง (สมาชิก)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ทั้งหมด</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#36a2eb', fontSize: '0.75rem', background: 'rgba(54,162,235,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('total', '👤 เฉพาะของตนเอง')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ยกเลิก [เลขที่บิล] หรือ /cancel
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ยกเลิกใบโพยล่าสุด หรือตามเลขบิล (ยกเลิกของสมาชิกอื่นได้เฉพาะแอดมิน/ผู้จัดการ)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ของทุกคน)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ของทุกคน)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('cancel', '👤 เฉพาะบิลตนเอง')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /โพย [เลขที่บิล] หรือ /bill
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>เรียกดูบิลโพยตามรหัสบิล หรือประวัติบิลแทงทั้งหมดในงวดปัจจุบัน</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ของทุกคน)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ของทุกคน)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('bill', '👤 เฉพาะบิลตนเอง')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /link หรือ /id
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ขอลิงก์เข้าดูข้อมูลรหัส LINE User ID ส่วนตัว เพื่อนำไปผูกบัญชีใช้งานในระบบเว็บ</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('link')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /คำสั่ง หรือ /help
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>แสดงรายการคำสั่งบอทที่สมาชิกแต่ละประเภทสามารถใช้งานได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    {renderMemberPermission('help')}
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'monospace', color: '#36a2eb' }}>
                                        /ส่งเภา [รหัสเจ้ามือ]/new
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ใช้แชทส่วนตัวเพื่อลงทะเบียนแทงหวย 1-on-1 โดยตรงกับร้านค้าเจ้ามือ (คนส่งรายใหม่)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ส่วนตัว)</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'monospace', color: '#ffb300' }}>
                                        /ส่งเภา [รหัสเจ้ามือ]/[รหัสสมาชิก]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ใช้แชทส่วนตัวเพื่อขอเข้าป้อนโพยในนามผู้ส่ง (Sender) ให้กับบัญชีผู้ใช้ที่มีอยู่ในระบบ</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้ (ส่วนตัว)</td>
                            </tr>

                            {/* Store/Admin Commands */}
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เลขรวม [น-ม / ม-น]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>แสดงรายการตัวเลขที่ขายได้ทั้งหมด (น-ม = ยอดน้อยไปมาก, ม-น = ยอดมากไปน้อย)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม / สมาชิก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เลขเหลือ [น-ม / ม-น]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>แสดงยอดคงเหลือแต่ละตัวเลข หลังหักยอดตีออกไปแล้ว (น-ม = น้อยไปมาก, ม-น = มากไปน้อย)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม / สมาชิก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เลขตี [น-ม / ม-น]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>แสดงรายการตัวเลขและยอดเงินที่กดส่งตีออกไปแล้ว (น-ม = น้อยไปมาก, ม-น = มากไปน้อย)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม / สมาชิก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /คนส่ง หรือ /ใครส่ง
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>รายงานยอดรับแทงสะสมแยกตามสมาชิกแต่ละคนในกลุ่ม</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม / สมาชิก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /สมาชิก [ชื่อหรือ LINE ID]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ดูข้อมูลสรุป ยอดค้าง และสิทธิ์การใช้งาน ของสมาชิกในกลุ่มรายบุคคล</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูสมาชิก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ยอดเกิน หรือ /excess
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ตรวจสอบรายการโพยที่ยอดซื้อเกินขีดจำกัดลิมิต (ยอดที่เตรียมตีออก)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#ff9f40', fontSize: '0.75rem', background: 'rgba(255,159,64,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดเกิน
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ตีออก เกิน
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>สั่งส่งต่อยอดอั้นเกินลิมิตทั้งหมดไปยังเจ้ามือปลายทางเพื่อลดความเสี่ยง</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#9966ff', fontSize: '0.75rem', background: 'rgba(153,102,255,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ตีออก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ตีออก [เลข] [ประเภท] [ยอด]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>สั่งตีออกเลขแบบระบุเจาะจงรายตัวและยอดเงินด้วยตนเอง</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#9966ff', fontSize: '0.75rem', background: 'rgba(153,102,255,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ตีออก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        Y หรือ ยืนยัน
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ยืนยันทำรายการตีออกยอดอั้นเกินลิมิต หลังได้รับยอดคำนวณจากบอท</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#9966ff', fontSize: '0.75rem', background: 'rgba(153,102,255,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ตีออก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เอาคืน [ครั้งที่] หรือ /return
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>แสดงรายการส่งตีออก หรือดึงยอดที่ตีออกไปแล้วกลับคืนมา</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: '#9966ff', fontSize: '0.75rem', background: 'rgba(153,102,255,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ตีออก
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ดูอั้น
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ดูวงเงินอั้นแยกตามประเภทเลขของงวดปัจจุบัน</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ดูอั้นเฉพาะ หรือ /ดูอั้นเฉพาะเลข
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>เรียกดูรายการเลขอั้นเฉพาะตัวเลข (อั้นเปอร์เซ็นต์จ่าย/ปิดรับเฉพาะตัวเลข) ในงวดปัจจุบัน</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ตั้งอั้น [ตัวเลข] หรือส่งหลายบรรทัด
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ตั้งค่ายอดอั้นหลักแยกตามประเภทเลข (พิมพ์คำสั่งนำและใส่เลขวงเงิน เช่น /ตั้งอั้น 1000 หรือพิมพ์ประเภทเลขตามด้วยยอดอั้นบรรทัดละคู่)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ตั้งอั้นเฉพาะ [เลข] [วงเงิน] [จ่าย%] [ก]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ตั้งค่าอั้นเฉพาะตัวเลข (เช่น /ตั้งอั้นเฉพาะ 12 5000 50% ก หรือ /ตั้งอั้นเฉพาะ 99 บน ปิด หรือ /ตั้งอั้นเฉพาะ 12 ลบ) รองรับหลายบรรทัด</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /แจ้งผล [เลขรางวัล]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ประกาศผลรางวัลของงวด และคำนวณผลได้เสียของบิลสมาชิกกลุ่ม</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เปิด หรือ /ปิด
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>เปิด หรือปิดรับยอดแทงสำหรับงวดหวยปัจจุบันชั่วคราว</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /สร้าง [ประเภทหวย]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>สร้างงวดหวยใหม่สำหรับประเภทที่กำหนด (ไทย, ลาว, ฮานอย, หุ้น)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /เริ่มขาย
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ประกาศเปิดรับแทงงวดล่าสุดของกลุ่ม พร้อมส่งข้อความแจ้งสมาชิก</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /กำไร [m/y/ทั้งหมด]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>รายงานสรุปกำไร/ขาดทุน แยกตามช่วงเวลา (m=เดือนนี้, y=ปีนี้, ทั้งหมด)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', background: 'rgba(212,175,55,0.1)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                        🔑 สิทธิ์ดูยอดรวม
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>

                            {/* DM / Group Binding Commands */}
                            <tr style={{ borderTop: '2px solid rgba(128,128,128,0.2)' }}>
                                <td colSpan={5} style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.02)' }}>
                                    📩 คำสั่งผูกกลุ่ม (แชทส่วนตัว / ในกลุ่ม)
                                </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /ขอรหัส หรือ /bindcode
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ขอรหัสผูกกลุ่มใหม่ (ใช้ในแชทส่วนตัวกับบอทเท่านั้น) เพื่อนำไปผูกกลุ่ม LINE ด้วยคำสั่ง /bind</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(128,128,128,0.1)', background: 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                        /bind [รหัสผูกกลุ่ม]
                                    </code>
                                </td>
                                <td style={{ padding: '0.75rem' }}>ผูกกลุ่ม LINE เข้ากับระบบรับโพยด้วยรหัสที่ได้จาก /ขอรหัส หรือจากหน้าเว็บ (ใช้ในกลุ่มเท่านั้น)</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>✓ ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ได้</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
