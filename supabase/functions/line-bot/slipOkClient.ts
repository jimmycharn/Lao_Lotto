export interface SlipOkResponse {
    success: boolean
    code?: number
    message?: string
    data?: {
        success?: boolean
        transRef?: string
        date?: string
        amount?: number
        sender?: {
            displayName?: string
            name?: string
            account?: { bank?: string; name?: string; value?: string }
        }
        receiver?: {
            displayName?: string
            name?: string
            account?: { bank?: string; name?: string; value?: string }
        }
    }
}

/**
 * Downloads image binary content from LINE Messaging API.
 */
export async function fetchLineMessageImage(
    channelAccessToken: string,
    messageId: string
): Promise<Uint8Array | null> {
    try {
        const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${channelAccessToken}`
            }
        })
        if (!response.ok) {
            console.error(`Failed to fetch image from LINE API: ${response.status} ${response.statusText}`)
            return null
        }
        const arrayBuffer = await response.arrayBuffer()
        return new Uint8Array(arrayBuffer)
    } catch (err) {
        console.error('Error fetching LINE message image:', err)
        return null
    }
}

/**
 * Forwards image binary to SlipOK API using dealer's specific API Key.
 */
export async function verifySlipWithSlipOk(
    imageBytes: Uint8Array,
    apiKey: string,
    branchId?: string
): Promise<SlipOkResponse> {
    try {
        const cleanBranch = branchId && /^\d+$/.test(branchId.trim()) ? branchId.trim() : '59644'
        const endpoint = `https://api.slipok.com/api/line/apikey/${cleanBranch}`

        const blob = new Blob([imageBytes], { type: 'image/jpeg' })
        const formData = new FormData()
        formData.append('files', blob, 'slip.jpg')
        formData.append('log', 'true')

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'x-authorization': apiKey
            },
            body: formData
        })

        const data = await response.json()
        return data as SlipOkResponse
    } catch (err: any) {
        console.error('Error verifying slip with SlipOK:', err)
        return {
            success: false,
            message: err.message || 'Error connecting to SlipOK'
        }
    }
}

/**
 * Normalizes Thai names for comparison:
 * - Removes honorifics/prefixes (นาย, นาง, นางสาว, ฯลฯ)
 * - Removes whitespaces, dots, asterisks, and hyphens
 * - Normalizes sara-a (ะ) so variations like ธีระเดช and ธีรเดช match
 */
function normalizeThaiName(str: string): string {
    return String(str || '')
        .replace(/^(นาย|นาง|นางสาว|บจก\.|หจก\.|ด\.ช\.|ด\.ญ\.|mr\.|mrs\.|miss)\s*/i, '')
        .replace(/[\s\.\*\-]+/g, '')
        .replace(/ะ/g, '')
}

/**
 * Verifies whether the receiver in the slip matches one of the dealer's active bank accounts.
 */
export function isReceiverMatchingDealer(receiverData: any, dealerBankAccounts: any[]): boolean {
    if (!dealerBankAccounts || dealerBankAccounts.length === 0) {
        return true // Permissive fallback if dealer hasn't configured bank accounts
    }

    if (!receiverData) {
        return false
    }

    // Clean account strings
    const rawSlipVal = String(receiverData.account?.value || receiverData.proxy?.value || '').trim()
    const slipDigitsOnly = rawSlipVal.replace(/\D/g, '')

    // Extract all possible receiver names from SlipOK payload
    const slipNames = [
        receiverData.displayName,
        receiverData.name,
        receiverData.account?.name
    ].filter(Boolean).map(n => String(n).trim())

    for (const dAcc of dealerBankAccounts) {
        const dealerDigits = String(dAcc.bank_account || '').replace(/\D/g, '')

        // 1. Exact digit match
        if (dealerDigits && slipDigitsOnly && dealerDigits === slipDigitsOnly) {
            return true
        }

        // 2. Continuous digit runs (e.g. '2578' from 'xxx-x-x2578-x92')
        // Checks if any continuous block of 4+ digits from the slip exists in dealer account
        const digitChunks = rawSlipVal.match(/\d+/g) || []
        for (const chunk of digitChunks) {
            if (chunk.length >= 4 && dealerDigits.includes(chunk)) {
                return true
            }
        }

        // 3. Positional mask match (e.g. 'xxx-x-x2578-x92' vs '020432578092')
        // Check character-by-character where 'x', 'X', '*' are wildcards
        const cleanSlipMask = rawSlipVal.replace(/[^0-9xX*]/g, '')
        if (dealerDigits && cleanSlipMask.length === dealerDigits.length) {
            let unmaskedMatchCount = 0
            let mismatch = false
            for (let i = 0; i < cleanSlipMask.length; i++) {
                const c = cleanSlipMask[i]
                if (c === 'x' || c === 'X' || c === '*') continue
                if (c === dealerDigits[i]) {
                    unmaskedMatchCount++
                } else {
                    mismatch = true
                    break
                }
            }
            if (!mismatch && unmaskedMatchCount >= 3) {
                return true
            }
        }

        // 4. Name match across displayName, name, account.name
        const normDealer = normalizeThaiName(dAcc.account_name)
        if (normDealer) {
            // Split tokens from dealer name (e.g. ['ธีรเดช', 'บรรจงแก้ว'])
            const rawDealerTokens = String(dAcc.account_name || '')
                .replace(/^(นาย|นาง|นางสาว|บจก\.|หจก\.|ด\.ช\.|ด\.ญ\.|mr\.|mrs\.|miss)\s*/i, '')
                .trim()
                .split(/\s+/)
                .map(t => normalizeThaiName(t))
                .filter(t => t.length >= 3)

            for (const slipName of slipNames) {
                const normSlip = normalizeThaiName(slipName)
                if (!normSlip) continue

                // Check two-way containment if normalized slip has meaningful length (e.g. "ธีรเดชบ" in "ธีรเดชบรรจงแก้ว")
                if (normSlip.length >= 3 && (normDealer.includes(normSlip) || normSlip.includes(normDealer))) {
                    return true
                }

                // Check if slip name matches dealer tokens
                for (const tok of rawDealerTokens) {
                    if (normSlip.includes(tok) || (tok.length >= 4 && normSlip.length >= 4 && (tok.startsWith(normSlip) || normSlip.startsWith(tok)))) {
                        return true
                    }
                }
            }
        }
    }

    return false
}
