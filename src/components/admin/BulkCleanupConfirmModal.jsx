import { useState, useEffect } from 'react'
import { FiTrash2, FiAlertTriangle, FiX, FiArchive, FiDatabase, FiCheckSquare } from 'react-icons/fi'

export default function BulkCleanupConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    isCleaning = false,
    dealerName = 'ทุก Dealer',
    roundCount = 0,
    totalSubmissions = 0
}) {
    const [isConfirmed, setIsConfirmed] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setIsConfirmed(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={() => !isCleaning && onClose()}>
            <div className="modal-content delete-round-modal bulk-cleanup-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="modal-icon-badge archive">
                            <FiTrash2 />
                        </div>
                        <h3>ยืนยันล้างงวดที่ประกาศผลแล้วทั้งหมด</h3>
                    </div>
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        disabled={isCleaning}
                        title="ปิด"
                    >
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Summary scope card */}
                    <div className="target-round-summary-card">
                        <div className="summary-row">
                            <span className="summary-label">ขอบเขตเจ้ามือ:</span>
                            <span className="summary-value highlight-name">{dealerName}</span>
                        </div>
                        <div className="summary-row">
                            <span className="summary-label">จำนวนงวดที่ประกาศผลแล้ว:</span>
                            <span className="summary-value" style={{ fontWeight: 'bold' }}>
                                {roundCount.toLocaleString('th-TH')} งวด
                            </span>
                        </div>
                        <div className="summary-row highlight-sub">
                            <span className="summary-label">
                                <FiDatabase style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                จำนวนรายการโพยรวมที่จะถูกล้าง:
                            </span>
                            <span className="summary-value sub-count-badge high-load">
                                {totalSubmissions.toLocaleString('th-TH')} รายการ
                            </span>
                        </div>
                    </div>

                    {/* Auto-archive explanation */}
                    <div className="advisory-box archive-info">
                        <div className="advisory-header">
                            <FiArchive className="advisory-icon" />
                            <strong>ระบบจัดเก็บสรุปยอดลงประวัติอัตโนมัติ (Auto-Archive)</strong>
                        </div>
                        <p>
                            ทุกงวดที่ประกาศผลรางวัลแล้ว ระบบจะสรุปยอดบัญชีกำไร-ขาดทุนลงในประวัติย้อนหลังของเจ้ามือและสมาชิกให้โดยอัตโนมัติ
                            ก่อนทำการลบรายการโพยแทงจำนวน <strong>{totalSubmissions.toLocaleString('th-TH')} รายการ</strong> ออกจากฐานข้อมูลเพื่อลดภาระของระบบ
                        </p>
                    </div>

                    {/* Confirmation Checkbox */}
                    <label className="bulk-confirm-checkbox-label">
                        <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={e => setIsConfirmed(e.target.checked)}
                            disabled={isCleaning}
                        />
                        <span>
                            ข้าพเจ้ายืนยันที่จะจัดเก็บสรุปประวัติและลบข้อมูลโพยของงวดที่ประกาศผลแล้วจำนวน <strong>{roundCount} งวด</strong> ออกจากระบบ
                        </span>
                    </label>
                </div>

                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={onClose}
                        disabled={isCleaning}
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="button"
                        className={`btn-confirm-delete ${isCleaning ? 'loading' : ''}`}
                        onClick={onConfirm}
                        disabled={!isConfirmed || isCleaning}
                    >
                        {isCleaning ? (
                            <>
                                <span className="spinner-small" /> กำลังล้างข้อมูล...
                            </>
                        ) : (
                            <>
                                <FiTrash2 /> ยืนยันล้างข้อมูล
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
