import { FiStar } from 'react-icons/fi'
import CopyButton from './CopyButton'

/**
 * Reusable Bank Account Card Component
 * Displays bank account info in a consistent card format with copy button.
 * 
 * Props:
 * - bank: { bank_name, bank_account (or account_number), account_name, is_default }
 * - title: Optional title above the card (e.g. "บัญชีธนาคารเจ้ามือ (สำหรับโอนเงิน)")
 * - showDefault: Whether to show the default badge (default: true)
 * - variant: 'primary' | 'gold' | 'outline' (default: 'primary')
 * - compact: boolean - smaller version (default: false)
 */
export default function BankAccountCard({ bank, title, showDefault = true, variant = 'primary', compact = false }) {
    if (!bank) return null

    const accountNumber = bank.bank_account || bank.account_number || ''

    const borderColor = variant === 'gold'
        ? 'var(--color-primary)'
        : variant === 'outline'
            ? 'var(--color-border)'
            : 'var(--color-primary)'

    const bgColor = variant === 'gold'
        ? 'rgba(212, 175, 55, 0.08)'
        : variant === 'outline'
            ? 'var(--color-surface-light, var(--color-surface))'
            : 'rgba(212, 175, 55, 0.08)'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.25rem' : '0.5rem' }}>
            {title && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--color-text-muted)',
                    fontSize: compact ? '0.8rem' : '0.85rem',
                    fontWeight: 500
                }}>
                    {title}
                </div>
            )}
            <div style={{
                background: bgColor,
                border: `2px solid ${borderColor}`,
                borderRadius: 'var(--radius-md, 8px)',
                padding: compact ? '0.75rem 1rem' : '1rem 1.25rem',
                transition: 'border-color 0.2s'
            }}>
                {/* Bank name row */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: compact ? '0.15rem' : '0.25rem'
                }}>
                    <FiStar style={{
                        color: 'var(--color-primary)',
                        flexShrink: 0,
                        fontSize: compact ? '0.9rem' : '1rem'
                    }} />
                    <span style={{
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        fontSize: compact ? '0.95rem' : '1.05rem'
                    }}>
                        {bank.bank_name}
                    </span>
                    {showDefault && bank.is_default && (
                        <span style={{
                            background: 'var(--color-primary)',
                            color: '#000',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            marginLeft: '0.25rem'
                        }}>
                            หลัก
                        </span>
                    )}
                </div>

                {/* Account holder name */}
                {bank.account_name && (
                    <div style={{
                        fontSize: compact ? '0.8rem' : '0.88rem',
                        color: 'var(--color-text-muted)',
                        marginLeft: '1.5rem',
                        marginBottom: compact ? '0.15rem' : '0.25rem'
                    }}>
                        {bank.account_name}
                    </div>
                )}

                {/* Account number + copy button */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginLeft: '1.5rem'
                }}>
                    <span style={{
                        fontSize: compact ? '1rem' : '1.15rem',
                        fontFamily: 'monospace',
                        letterSpacing: '0.05em',
                        color: 'var(--color-text)',
                        fontWeight: 500
                    }}>
                        {accountNumber}
                    </span>
                    {accountNumber && (
                        <CopyButton text={accountNumber} size={compact ? 12 : 14} />
                    )}
                </div>
            </div>
        </div>
    )
}
