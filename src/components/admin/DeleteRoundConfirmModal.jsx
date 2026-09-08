import React from 'react'
import { FiTrash2, FiAlertTriangle, FiCheckCircle, FiX, FiDatabase, FiArchive } from 'react-icons/fi'

export function getRoundStatusLabel(status, isAnnounced) {
    if (status === 'announced' || isAnnounced === true) {
        return 'ประกาศผลแล้ว'
    }
    if (status === 'closed') {
        return 'ปิดรับแทง (รอผล)'
    }
    return 'เปิดรับแทง'
}

export function formatSubmissionCount(count) {
    const num = Number(count) || 0
    return `${num.toLocaleString('th-TH')} รายการ`
}

export function getDeletionWarningType(round) {
    if (!round) return 'danger'
    if (round.status === 'announced' || round.is_result_announced === true) {
        return 'archive'
    }
    return 'danger'
}

export default function DeleteRoundConfirmModal({
    round,
    isOpen,
    onClose,
    onConfirm,
    isDeleting = false
}) {
    if (!isOpen || !round) return null

    const isAnnounced = round.status === 'announced' || round.is_result_announced === true
    const warningType = getDeletionWarningType(round)
    const subCount = Number(round.submission_count) || 0

    return (
        <div className="modal-overlay" onClick={() => !isDeleting && onClose()}>
            <div className="modal-content delete-round-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className={`modal-icon-badge ${warningType}`}>
                            <FiTrash2 />
                        </div>
                        <h3>ยืนยันการลบงวดหวย</h3>
                    </div>
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        disabled={isDeleting}
                        title="ปิด"
                    >
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Target Round Details Card */}
                    <div className="target-round-summary-card">
                        <div className="summary-row">
                            <span className="summary-label">ชื่องวดหวย:</span>
                            <span className="summary-value highlight-name">
                                {round.lottery_name || round.lottery_type}
                            </span>
                        </div>
                        <div className="summary-row">
                            <span className="summary-label">เจ้ามือ (Dealer):</span>
                            <span className="summary-value">
                                {round.dealer_name} {round.dealer_email ? `(${round.dealer_email})` : ''}
                            </span>
                        </div>
                        <div className="summary-row">
                            <span className="summary-label">วันที่งวด:</span>
                            <span className="summary-value">
                                {round.round_date ? new Date(round.round_date).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '-'}
                            </span>
                        </div>
                        <div className="summary-row">
                            <span className="summary-label">สถานะงวด:</span>
                            <span className={`status-badge-inline ${isAnnounced ? 'announced' : round.status === 'closed' ? 'closed' : 'open'}`}>
                                {getRoundStatusLabel(round.status, round.is_result_announced)}
                            </span>
                        </div>
                        <div className="summary-row highlight-sub">
                            <span className="summary-label">
                                <FiDatabase style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                รายการโพยที่จะถูกลบ:
                            </span>
                            <span className={`summary-value sub-count-badge ${subCount > 1000 ? 'high-load' : ''}`}>
                                {formatSubmissionCount(subCount)}
                            </span>
                        </div>
                    </div>

                    {/* Explanatory Advisory Box */}
                    {isAnnounced ? (
                        <div className="advisory-box archive-info">
                            <div className="advisory-header">
                                <FiArchive className="advisory-icon" />
                                <strong>ระบบจัดเก็บสรุปยอดลงประวัติอัตโนมัติ (Auto-Archive)</strong>
                            </div>
                            <p>
                                เนื่องจากงวดนี้ประกาศผลรางวัลแล้ว ระบบจะคำนวณและบันทึกสรุปยอดการเงิน
                                (ยอดรับ, ค่าคอมมิชชัน, ยอดจ่ายรางวัล, กำไร-ขาดทุน) ลงในประวัติย้อนหลังของเจ้ามือและสมาชิกให้โดยอัตโนมัติ
                            </p>
                            <p className="sub-note">
                                🗑️ รายการโพยแทงจำนวน <strong>{formatSubmissionCount(subCount)}</strong> จะถูกลบออกจากฐานข้อมูลอย่างถาวรทันที เพื่อเพิ่มพื้นที่และลดภาระของระบบ
                            </p>
                        </div>
                    ) : (
                        <div className="advisory-box warning-info">
                            <div className="advisory-header">
                                <FiAlertTriangle className="advisory-icon" />
                                <strong>คำเตือน: งวดนี้ยังไม่ประกาศผลรางวัล</strong>
                            </div>
                            <p>
                                งวดนี้มีสถานะ <strong>{getRoundStatusLabel(round.status, round.is_result_announced)}</strong> หากลบตอนนี้
                                ข้อมูลรายการแทงทั้งหมด <strong>{formatSubmissionCount(subCount)}</strong> จะถูกยกเลิก และสมาชิกจะไม่สามารถตรวจผลรางวัลได้
                            </p>
                            <p className="sub-note">
                                โปรดตรวจสอบความถูกต้องก่อนยืนยันการลบ
                            </p>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="button"
                        className={`btn-confirm-delete ${isDeleting ? 'loading' : ''}`}
                        onClick={onConfirm}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <>
                                <span className="spinner-small" /> กำลังลบข้อมูล...
                            </>
                        ) : (
                            <>
                                <FiTrash2 /> ยืนยันการลบงวด
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
