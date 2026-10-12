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
 * Verifies whether the receiver in the slip matches one of the dealer's active bank accounts.
 */
export function isReceiverMatchingDealer(receiverData: any, dealerBankAccounts: any[]): boolean {
    if (!dealerBankAccounts || dealerBankAccounts.length === 0) {
        return true // Permissive fallback if dealer hasn't configured bank accounts
    }

    if (!receiverData || !receiverData.account || !receiverData.account.value) {
        return false
    }

    // Clean account strings to digits only
    const rawSlipVal = String(receiverData.account.value).trim()
    const slipDigitsOnly = rawSlipVal.replace(/\D/g, '')

    for (const dAcc of dealerBankAccounts) {
        const dealerDigits = String(dAcc.bank_account || '').replace(/\D/g, '')
        if (!dealerDigits) continue

        // 1. Exact digit match
        if (dealerDigits === slipDigitsOnly) return true

        // 2. Partial match (e.g. xxx-x-x7890-x -> check if last 4 digits match)
        if (slipDigitsOnly.length >= 4 && dealerDigits.endsWith(slipDigitsOnly.slice(-4))) {
            return true
        }

        // 3. Name fuzzy match if receiver displayName exists
        if (receiverData.displayName && dAcc.account_name) {
            const cleanAccName = dAcc.account_name.replace(/^(นาย|นาง|นางสาว|บจก\.|หจก\.)\s*/, '').trim()
            if (cleanAccName && receiverData.displayName.includes(cleanAccName)) {
                return true
            }
        }
    }

    return false
}
