export interface BindAssistantCommand {
  primaryCode: string;
  targetRef: string;
  assistantName: string | null;
}

export interface UnbindAssistantCommand {
  targetRef: string;
}

export interface ListAssistantsCommand {
  primaryCode: string | null;
}

export interface AutoRegisterCommand {
  disable: boolean;
}

export interface AssistantRecord {
  id?: string;
  dealer_id?: string;
  profile_id?: string;
  line_user_id?: string;
  assistant_name?: string | null;
  can_view_summary?: boolean;
  is_active?: boolean;
}

/**
 * Checks if a string looks like a LINE User ID (starts with 'U' and at least 20 chars).
 */
export function isLineUserIdFormat(value: string): boolean {
  const clean = (value || '').trim();
  return /^U[a-zA-Z0-9]{19,}$/.test(clean);
}

/**
 * Parses `/ผูกผู้ช่วย <primaryCode> <uidOrMemberCode> [optionalName]`
 * Also supports slash separator like `/ผูกผู้ช่วย 10050/U4c8f...`
 */
export function parseBindAssistantCommand(text: string): BindAssistantCommand | null {
  const trimmed = (text || '').trim();
  if (!/^\/ผูกผู้ช่วย(?:\s|$)/.test(trimmed)) {
    return null;
  }

  const rest = trimmed.replace(/^\/ผูกผู้ช่วย\s*/, '').trim();
  if (!rest) return null;

  // Support `10050/U4c8f...` or `10050 U4c8f...`
  const firstSpaceIdx = rest.search(/\s/);
  const firstToken = firstSpaceIdx === -1 ? rest : rest.slice(0, firstSpaceIdx);

  if (firstToken.includes('/')) {
    const [primaryPart, targetPart] = firstToken.split('/', 2);
    const primaryCode = (primaryPart || '').trim();
    const targetRef = (targetPart || '').trim();
    if (!primaryCode || !targetRef) return null;
    const nameRest = firstSpaceIdx === -1 ? '' : rest.slice(firstSpaceIdx).trim();
    return {
      primaryCode,
      targetRef,
      assistantName: nameRest || null,
    };
  }

  const parts = rest.split(/\s+/);
  if (parts.length < 2) return null;

  const primaryCode = parts[0].trim();
  const targetRef = parts[1].trim();
  if (!primaryCode || !targetRef) return null;

  const assistantName = parts.slice(2).join(' ').trim() || null;
  return {
    primaryCode,
    targetRef,
    assistantName,
  };
}

/**
 * Parses `/ยกเลิกผู้ช่วย <uidOrName>`
 */
export function parseUnbindAssistantCommand(text: string): UnbindAssistantCommand | null {
  const trimmed = (text || '').trim();
  if (!/^\/ยกเลิกผู้ช่วย(?:\s|$)/.test(trimmed)) {
    return null;
  }
  const targetRef = trimmed.replace(/^\/ยกเลิกผู้ช่วย\s*/, '').trim();
  if (!targetRef) return null;
  return { targetRef };
}

/**
 * Parses `/ผู้ช่วย` or `/ผู้ช่วย <primaryCode>`
 */
export function parseListAssistantsCommand(text: string): ListAssistantsCommand | null {
  const trimmed = (text || '').trim();
  if (trimmed === '/ผู้ช่วย') {
    return { primaryCode: null };
  }
  if (/^\/ผู้ช่วย\s+/.test(trimmed)) {
    const primaryCode = trimmed.replace(/^\/ผู้ช่วย\s+/, '').trim();
    return { primaryCode: primaryCode || null };
  }
  return null;
}

/**
 * Parses `/ปิดรับอัตโนมัติ` or `/เปิดรับอัตโนมัติ`
 */
export function parseAutoRegisterCommand(text: string): AutoRegisterCommand | null {
  const trimmed = (text || '').trim();
  if (trimmed === '/ปิดรับอัตโนมัติ') {
    return { disable: true };
  }
  if (trimmed === '/เปิดรับอัตโนมัติ') {
    return { disable: false };
  }
  return null;
}

/**
 * Formats bill_note for submissions keyed in by a LINE assistant.
 */
export function formatAssistantBillNote(assistantName: string, buyerNote?: string | null): string {
  const cleanAssistant = (assistantName || '').trim() || 'ผู้ช่วยคีย์';
  const cleanBuyer = (buyerNote || '').trim();
  if (cleanBuyer) {
    return `${cleanBuyer} (ผู้ช่วย: ${cleanAssistant})`;
  }
  return `ผู้ช่วย: ${cleanAssistant}`;
}

/**
 * Checks whether an assistant is permitted to execute a command category.
 * Default is key-in only (`can_view_summary = false`).
 */
export function canAssistantRunCommand(
  assistant: Pick<AssistantRecord, 'can_view_summary'> | null | undefined,
  category: 'bet' | 'cancel' | 'summary'
): boolean {
  if (!assistant) return false;
  if (category === 'bet' || category === 'cancel') {
    return true;
  }
  if (category === 'summary') {
    return assistant.can_view_summary === true;
  }
  return false;
}

/**
 * Checks whether the sender is authorized to cancel a bill.
 * - Main account owner can cancel any bill belonging to their account (including assistant-keyed bills).
 * - Dealer / Admin / Active Group Manager can cancel any bill in their dealer's round.
 * - Key-in assistant can ONLY cancel bills where `billSubmittedByLineUserId === senderLineUserId`.
 */
export function canAssistantCancelBill(params: {
  isMainOwner: boolean;
  isStaffOrManager: boolean;
  isAssistant: boolean;
  senderLineUserId: string;
  billSubmittedByLineUserId?: string | null;
}): boolean {
  if (params.isMainOwner || params.isStaffOrManager) {
    return true;
  }
  if (params.isAssistant) {
    return (
      Boolean(params.senderLineUserId) &&
      Boolean(params.billSubmittedByLineUserId) &&
      params.billSubmittedByLineUserId === params.senderLineUserId
    );
  }
  return false;
}

/**
 * Returns true ONLY if an account was auto-created by LINE bot and has zero bets, history, or payments.
 */
export function isSafeAutoCreatedEmptyAccount(params: {
  email?: string | null;
  submissionCount: number;
  historyCount: number;
  paymentCount: number;
}): boolean {
  const email = (params.email || '').trim();
  const isAutoEmail = /^line_.*@(biglotto\.app|gmail\.com)$/i.test(email);
  return (
    isAutoEmail &&
    params.submissionCount === 0 &&
    params.historyCount === 0 &&
    params.paymentCount === 0
  );
}
