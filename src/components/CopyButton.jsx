import { useState } from 'react'
import { FiCopy, FiCheck } from 'react-icons/fi'

/**
 * Small inline copy button for account numbers.
 * Props:
 * - text: string to copy
 * - size: icon size (default 13)
 */
export default function CopyButton({ text, size = 13 }) {
    const [copied, setCopied] = useState(false)

    async function handleCopy(e) {
        e.stopPropagation()
        e.preventDefault()
        if (!text) return
        const cleanText = String(text).replace(/\s/g, '')
        let success = false
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(cleanText)
                success = true
            }
        } catch (_) {}
        if (!success) {
            const el = document.createElement('input')
            el.value = cleanText
            el.setAttribute('readonly', '')
            el.style.position = 'absolute'
            el.style.left = '-9999px'
            el.style.opacity = '0'
            document.body.appendChild(el)
            el.contentEditable = 'true'
            el.readOnly = false
            el.focus()
            el.select()
            el.setSelectionRange(0, cleanText.length)
            try { success = document.execCommand('copy') } catch (_) {}
            document.body.removeChild(el)
        }
        if (success) {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <button
            onClick={handleCopy}
            style={{
                background: copied ? 'var(--color-success, #22c55e)' : 'none',
                border: copied ? '1px solid var(--color-success, #22c55e)' : '1px solid var(--color-border)',
                borderRadius: '4px',
                padding: '0.15rem 0.25rem',
                cursor: 'pointer',
                color: copied ? '#fff' : 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                flexShrink: 0,
                marginLeft: '0.35rem',
                verticalAlign: 'middle'
            }}
            title={copied ? 'คัดลอกแล้ว!' : 'คัดลอกเลขบัญชี'}
        >
            {copied ? <FiCheck size={size} /> : <FiCopy size={size} />}
        </button>
    )
}
