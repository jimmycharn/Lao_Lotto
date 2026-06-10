---
description: How the credit topup slip upload and SlipOK verification flow works
---

# Skill: Credit Topup via SlipOK

## Overview

This skill documents the end-to-end flow for uploading a bank transfer slip, verifying it through the SlipOK API, and topping up dealer credit. The flow supports both **auto-approval** (SlipOK auto-verified) and **manual approval** (admin reviews).

## Files Involved

- `src/pages/Dealer.jsx` — Topup modal UI & submission handler
- `src/services/creditService.js` — Atomic topup workflow service
- `supabase/functions/verify-slip/index.ts` — Supabase Edge Function that forwards the image to SlipOK
- Database tables: `credit_topup_requests`, `used_slips`, `dealer_credits`, `credit_transactions`, `dealer_bank_assignments`, `system_settings`
- Supabase Storage bucket: `slips`

## Dealer Topup Modal (Dealer.jsx)

### State

```js
const [showTopupModal, setShowTopupModal] = useState(false)
const [assignedBankAccount, setAssignedBankAccount] = useState(null)
const [topupForm, setTopupForm] = useState({ amount: '', slip_file: null })
const [topupLoading, setTopupLoading] = useState(false)
const [slipPreview, setSlipPreview] = useState(null)
const [topupHistory, setTopupHistory] = useState([])
```

### Open Modal

The modal opens when the dealer clicks the credit balance card or a topup button.

Before opening, the dealer must have an **active assigned bank account** fetched from `dealer_bank_assignments`:

```js
async function fetchAssignedBankAccount() {
    const { data, error } = await supabase
        .from('dealer_bank_assignments')
        .select(`*, bank_account:bank_account_id (...)`)
        .eq('dealer_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
    if (!error && data?.bank_account) {
        setAssignedBankAccount(data.bank_account)
    }
}
```

### File Selection (`handleSlipFileChange`)

Triggered when the user selects a file via the hidden `<input type="file">`.

Validation rules:
- **Allowed types:** `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- **Max size:** 5 MB
- On valid selection, stores `file` in `topupForm.slip_file` and creates a base64 preview via `FileReader`.

```js
const handleSlipFileChange = (e) => {
    const file = e.target.files[0]
    if (!validTypes.includes(file.type)) { toast.error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('ไฟล์ต้องมีขนาดไม่เกิน 5MB'); return }
    setTopupForm({ ...topupForm, slip_file: file })
    // Create preview with FileReader
    const reader = new FileReader()
    reader.onloadend = () => setSlipPreview(reader.result)
    reader.readAsDataURL(file)
}
```

### Submission Handler (`handleTopupSubmit`)

#### Step 1 — Validate inputs

```js
if (!topupForm.amount || !topupForm.slip_file || !assignedBankAccount) {
    toast.error('กรุณากรอกจำนวนเงินและแนบสลิป')
    return
}
```

#### Step 2 — Check approval mode

Reads `system_settings` key `slip_approval_mode` (value is `"auto"` or `"manual"`). Defaults to manual.

```js
const { data: settingsData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'slip_approval_mode')
    .single()
const approvalMode = settingsData?.value ? JSON.parse(settingsData.value) : 'manual'
```

#### Step 3 — Upload slip image to Supabase Storage

```js
const fileExt = topupForm.slip_file.name.split('.').pop()
const fileName = `${user.id}/${Date.now()}.${fileExt}`

const { data: uploadData, error: uploadError } = await supabase.storage
    .from('slips')
    .upload(fileName, topupForm.slip_file)

let slipImageUrl = null
if (!uploadError && uploadData) {
    const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName)
    slipImageUrl = urlData?.publicUrl
}
```

#### Step 4-A — Auto mode: call SlipOK via Edge Function

```js
if (approvalMode === 'auto') {
    const formData = new FormData()
    formData.append('files', topupForm.slip_file)

    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-slip`
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData,
    })

    const slipData = await response.json()
```

If `slipData.success && slipData.data`:
- `verifiedAmount = parseFloat(slipData.data.amount)`
- `transRef = slipData.data.transRef`
- Check `used_slips` table for duplicate `trans_ref`
- If duplicate → reject with toast `"สลิปนี้ถูกใช้งานแล้ว"`
- If not duplicate → call `processTopup({ dealerId, bankAccountId, amount: verifiedAmount, slipUrl, slipData: slipData.data, transRef })`

If SlipOK verification **fails**:
- Create a `pending` topup request instead
- Toast: `"ไม่สามารถตรวจสอบสลิปอัตโนมัติได้ รอ Admin ตรวจสอบ"`

#### Step 4-B — Manual mode

Create a pending request directly:

```js
await supabase.from('credit_topup_requests').insert({
    dealer_id: user.id,
    bank_account_id: assignedBankAccount.id,
    amount: amount,
    slip_image_url: slipImageUrl,
    status: 'pending'
})
toast.success('ส่งคำขอเติมเครดิตสำเร็จ รอ Admin อนุมัติ')
```

#### Cleanup after submit

```js
setShowTopupModal(false)
setTopupForm({ amount: '', slip_file: null })
setSlipPreview(null)
fetchTopupHistory()
```

---

## Supabase Edge Function (`verify-slip`)

Path: `supabase/functions/verify-slip/index.ts`

### Purpose
Receive an image file from the frontend and forward it to the SlipOK API.

### Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SLIPOK_URL` | SlipOK API endpoint |
| `SLIPOK_API_KEY` | SlipOK API key (sent as `x-authorization` header) |

### Request / Response Flow

1. Accept `POST` with `FormData` containing:
   - `files` — the slip image (required)
   - `amount` — optional expected amount
   - `log` — always appended as `"true"`
2. Validate credentials exist
3. Forward to SlipOK:
   ```ts
   const slipResponse = await fetch(SLIPOK_URL, {
       method: 'POST',
       headers: { 'x-authorization': SLIPOK_API_KEY },
       body: slipFormData
   })
   ```
4. Return SlipOK JSON response directly to the client

### Example SlipOK Success Response Shape

```json
{
    "success": true,
    "data": {
        "amount": 1300.00,
        "transRef": "20250428123456789",
        "sender": { "displayName": "นาย ก" },
        "receiver": { "displayName": "นาย ข" }
    }
}
```

---

## Credit Service (`creditService.js`)

### `processTopup({ dealerId, bankAccountId, amount, slipUrl, slipData, transRef })`

Atomic workflow executed only when SlipOK auto-verification succeeds:

1. **Create approved topup request**
   ```js
   await createTopupRequest({
       dealer_id: dealerId,
       bank_account_id: bankAccountId,
       amount,
       slip_image_url: slipUrl,
       slip_data: slipData,
       trans_ref: transRef,
       sender_name: slipData.sender?.displayName,
       receiver_name: slipData.receiver?.displayName,
       status: 'approved',
       verified_at: new Date().toISOString()
   })
   ```

2. **Record used slip** (prevents reuse)
   ```js
   await recordUsedSlip({ trans_ref: transRef, topup_request_id, dealer_id, amount })
   ```

3. **Update dealer credit** (`updateDealerCredit`)
   - Adds `amount` to `dealer_credits.balance`
   - If `outstanding_debt > 0`, auto-deducts debt from the new balance
   - Records a `debt_recovery` transaction if any debt was recovered
   - Unblocks the dealer (`is_blocked: false`)

4. **Record credit transaction**
   ```js
   await createCreditTransaction({
       dealer_id: dealerId,
       transaction_type: 'topup',
       amount,
       balance_after: newBalance,
       description: 'เติมเครดิตจากสลิป (อัตโนมัติ)'
   })
   ```

Returns: `{ success: true, newBalance, debtRecovered }`

---

## Database Tables

### `credit_topup_requests`

| Column | Type | Note |
|--------|------|------|
| `dealer_id` | uuid | FK → profiles |
| `bank_account_id` | uuid | FK → admin_bank_accounts |
| `amount` | numeric | Verified or user-declared amount |
| `slip_image_url` | text | Public URL from Supabase Storage |
| `slip_data` | jsonb | SlipOK response payload |
| `trans_ref` | text | Unique transaction reference from SlipOK |
| `sender_name` | text | Sender display name from SlipOK |
| `receiver_name` | text | Receiver display name from SlipOK |
| `status` | enum | `pending`, `approved`, `rejected` |
| `verified_at` | timestamptz | Auto-filled on approval |

### `used_slips`

| Column | Type | Note |
|--------|------|------|
| `trans_ref` | text | UNIQUE — prevents duplicate slips |
| `topup_request_id` | uuid | FK → credit_topup_requests |
| `dealer_id` | uuid | |
| `amount` | numeric | |

### `dealer_credits`

| Column | Type | Note |
|--------|------|------|
| `dealer_id` | uuid | |
| `balance` | numeric | Current credit balance |
| `outstanding_debt` | numeric | Auto-deducted on topup |
| `is_blocked` | boolean | Unblocked on successful topup |

### `credit_transactions`

| Column | Type | Note |
|--------|------|------|
| `dealer_id` | uuid | |
| `transaction_type` | enum | `topup`, `debt_recovery` |
| `amount` | numeric | Positive for topup, negative for debt recovery |
| `balance_after` | numeric | |
| `description` | text | |

---

## Admin Approval Flow (SuperAdmin.jsx)

When mode is manual or auto-verification fails, a `pending` request is created.

SuperAdmin can:
- **Approve** (`handleApproveTopup`):
  - Updates status to `approved`
  - Adds `verified_at`
  - Increments `dealer_credits.balance`
  - Deducts outstanding debt if any
  - Records `credit_transactions` log
- **Reject** (`handleRejectTopup`):
  - Updates status to `rejected`
  - Adds `rejection_reason`

---

## Key Configuration

- **SlipOK credentials** must be set in Supabase Edge Function secrets (`SLIPOK_URL`, `SLIPOK_API_KEY`).
- **Approval mode** is controlled by `system_settings` row where `key = 'slip_approval_mode'`.
- **Supabase Storage** must have a public bucket named `slips` with RLS policies allowing authenticated uploads.
- **Dealers** must have an active record in `dealer_bank_assignments` pointing to a valid `admin_bank_accounts` row.
