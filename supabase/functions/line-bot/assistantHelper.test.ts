import { describe, it, expect } from 'vitest';
import {
  parseBindAssistantCommand,
  parseUnbindAssistantCommand,
  parseListAssistantsCommand,
  parseAutoRegisterCommand,
  formatAssistantBillNote,
  canAssistantRunCommand,
  canAssistantCancelBill,
  isSafeAutoCreatedEmptyAccount,
  isLineUserIdFormat,
} from './assistantHelper.ts';

describe('assistantHelper', () => {
  describe('isLineUserIdFormat', () => {
    it('recognizes valid LINE user IDs starting with U and length >= 20', () => {
      expect(isLineUserIdFormat('U4c8f56532d5253f6a2a7538bf5aee897')).toBe(true);
      expect(isLineUserIdFormat('10050')).toBe(false);
      expect(isLineUserIdFormat('U123')).toBe(false);
      expect(isLineUserIdFormat('')).toBe(false);
    });
  });

  describe('parseBindAssistantCommand', () => {
    it('parses /ผูกผู้ช่วย with primary code and LINE UID', () => {
      expect(parseBindAssistantCommand('/ผูกผู้ช่วย 10050 U4c8f56532d5253f6a2a7538bf5aee897')).toEqual({
        primaryCode: '10050',
        targetRef: 'U4c8f56532d5253f6a2a7538bf5aee897',
        assistantName: null,
      });
    });

    it('parses /ผูกผู้ช่วย with primary code, member code, and optional multi-word name', () => {
      expect(parseBindAssistantCommand('/ผูกผู้ช่วย 10050 10099 น้องมด คีย์1')).toEqual({
        primaryCode: '10050',
        targetRef: '10099',
        assistantName: 'น้องมด คีย์1',
      });
    });

    it('handles slash separator format like /ผูกผู้ช่วย 10050/U4c8f...', () => {
      expect(parseBindAssistantCommand('/ผูกผู้ช่วย 10050/U4c8f56532d5253f6a2a7538bf5aee897')).toEqual({
        primaryCode: '10050',
        targetRef: 'U4c8f56532d5253f6a2a7538bf5aee897',
        assistantName: null,
      });
    });

    it('returns null when missing required arguments or not a bind command', () => {
      expect(parseBindAssistantCommand('/ผูกผู้ช่วย')).toBeNull();
      expect(parseBindAssistantCommand('/ผูกผู้ช่วย 10050')).toBeNull();
      expect(parseBindAssistantCommand('/สรุป 10050')).toBeNull();
    });
  });

  describe('parseUnbindAssistantCommand', () => {
    it('parses /ยกเลิกผู้ช่วย with UID or name', () => {
      expect(parseUnbindAssistantCommand('/ยกเลิกผู้ช่วย U4c8f56532d5253f6a2a7538bf5aee897')).toEqual({
        targetRef: 'U4c8f56532d5253f6a2a7538bf5aee897',
      });
      expect(parseUnbindAssistantCommand('/ยกเลิกผู้ช่วย น้องมด')).toEqual({
        targetRef: 'น้องมด',
      });
    });

    it('returns null when missing argument', () => {
      expect(parseUnbindAssistantCommand('/ยกเลิกผู้ช่วย')).toBeNull();
      expect(parseUnbindAssistantCommand('/ยกเลิก 123456')).toBeNull();
    });
  });

  describe('parseListAssistantsCommand', () => {
    it('parses /ผู้ช่วย with optional primary code', () => {
      expect(parseListAssistantsCommand('/ผู้ช่วย 10050')).toEqual({ primaryCode: '10050' });
      expect(parseListAssistantsCommand('/ผู้ช่วย')).toEqual({ primaryCode: null });
    });

    it('does not match unrelated commands', () => {
      expect(parseListAssistantsCommand('/ผู้ช่วยอื่นๆ')).toBeNull();
      expect(parseListAssistantsCommand('/สรุป')).toBeNull();
    });
  });

  describe('parseAutoRegisterCommand', () => {
    it('parses disable and enable auto-register commands', () => {
      expect(parseAutoRegisterCommand('/ปิดรับอัตโนมัติ')).toEqual({ disable: true });
      expect(parseAutoRegisterCommand('/เปิดรับอัตโนมัติ')).toEqual({ disable: false });
      expect(parseAutoRegisterCommand(' /ปิดรับอัตโนมัติ ')).toEqual({ disable: true });
      expect(parseAutoRegisterCommand('/ปิด')).toBeNull();
      expect(parseAutoRegisterCommand('/เปิด')).toBeNull();
    });
  });

  describe('formatAssistantBillNote', () => {
    it('formats note with assistant name only when no buyer note', () => {
      expect(formatAssistantBillNote('น้องมด')).toBe('ผู้ช่วย: น้องมด');
      expect(formatAssistantBillNote('น้องมด', '')).toBe('ผู้ช่วย: น้องมด');
      expect(formatAssistantBillNote('น้องมด', '   ')).toBe('ผู้ช่วย: น้องมด');
    });

    it('combines buyer note and assistant name when buyer note exists', () => {
      expect(formatAssistantBillNote('น้องมด', 'พี่แดง')).toBe('พี่แดง (ผู้ช่วย: น้องมด)');
    });

    it('falls back to generic label if assistant name is blank', () => {
      expect(formatAssistantBillNote('')).toBe('ผู้ช่วย: ผู้ช่วยคีย์');
    });
  });

  describe('canAssistantRunCommand', () => {
    it('allows bet and cancel by default, denies summary when can_view_summary is false', () => {
      const defaultAssistant = { can_view_summary: false };
      expect(canAssistantRunCommand(defaultAssistant, 'bet')).toBe(true);
      expect(canAssistantRunCommand(defaultAssistant, 'cancel')).toBe(true);
      expect(canAssistantRunCommand(defaultAssistant, 'summary')).toBe(false);
    });

    it('allows summary when dealer enabled can_view_summary = true', () => {
      const enabledAssistant = { can_view_summary: true };
      expect(canAssistantRunCommand(enabledAssistant, 'summary')).toBe(true);
    });
  });

  describe('canAssistantCancelBill', () => {
    const assistantUid = 'U_ASSISTANT_1';
    const otherAssistantUid = 'U_ASSISTANT_2';
    const ownerUid = 'U_OWNER';

    it('allows assistant to cancel ONLY their own keyed bill', () => {
      expect(
        canAssistantCancelBill({
          isMainOwner: false,
          isStaffOrManager: false,
          isAssistant: true,
          senderLineUserId: assistantUid,
          billSubmittedByLineUserId: assistantUid,
        })
      ).toBe(true);
    });

    it('blocks assistant from cancelling another assistant or primary owner bill', () => {
      expect(
        canAssistantCancelBill({
          isMainOwner: false,
          isStaffOrManager: false,
          isAssistant: true,
          senderLineUserId: assistantUid,
          billSubmittedByLineUserId: otherAssistantUid,
        })
      ).toBe(false);

      expect(
        canAssistantCancelBill({
          isMainOwner: false,
          isStaffOrManager: false,
          isAssistant: true,
          senderLineUserId: assistantUid,
          billSubmittedByLineUserId: ownerUid,
        })
      ).toBe(false);

      expect(
        canAssistantCancelBill({
          isMainOwner: false,
          isStaffOrManager: false,
          isAssistant: true,
          senderLineUserId: assistantUid,
          billSubmittedByLineUserId: null,
        })
      ).toBe(false);
    });

    it('allows main account owner to cancel bills keyed by assistants for their account', () => {
      expect(
        canAssistantCancelBill({
          isMainOwner: true,
          isStaffOrManager: false,
          isAssistant: false,
          senderLineUserId: ownerUid,
          billSubmittedByLineUserId: assistantUid,
        })
      ).toBe(true);
    });

    it('allows dealer/admin/manager to cancel any bill', () => {
      expect(
        canAssistantCancelBill({
          isMainOwner: false,
          isStaffOrManager: true,
          isAssistant: false,
          senderLineUserId: 'U_MANAGER',
          billSubmittedByLineUserId: assistantUid,
        })
      ).toBe(true);
    });
  });

  describe('isSafeAutoCreatedEmptyAccount', () => {
    it('returns true only for auto-created LINE dummy email with zero records', () => {
      expect(
        isSafeAutoCreatedEmptyAccount({
          email: 'line_ab12cd34@biglotto.app',
          submissionCount: 0,
          historyCount: 0,
          paymentCount: 0,
        })
      ).toBe(true);

      expect(
        isSafeAutoCreatedEmptyAccount({
          email: 'line_U123456@gmail.com',
          submissionCount: 0,
          historyCount: 0,
          paymentCount: 0,
        })
      ).toBe(true);
    });

    it('returns false if account has any bets, history, payments, or non-auto email', () => {
      expect(
        isSafeAutoCreatedEmptyAccount({
          email: 'line_ab12cd34@biglotto.app',
          submissionCount: 1,
          historyCount: 0,
          paymentCount: 0,
        })
      ).toBe(false);

      expect(
        isSafeAutoCreatedEmptyAccount({
          email: 'meaw@gmail.com',
          submissionCount: 0,
          historyCount: 0,
          paymentCount: 0,
        })
      ).toBe(false);
    });
  });
});
