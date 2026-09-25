import { describe, it, expect } from 'vitest';

/**
 * Pure helper recreating the member extension close time evaluation logic from line-bot/index.ts
 */
export function evaluateMemberBetCloseStatus({
  now,
  activeRound,
  profileId,
  betType,
  typeCloseTimesMap = {},
  typeCloseTimeBehaviorsMap = {}
}: {
  now: Date;
  activeRound: {
    status: string;
    close_time: string;
    temp_open_members?: Record<string, { expires_at?: string; granted_at?: string }>;
    temp_open_member_id?: string | null;
    temp_open_expires_at?: string | null;
  };
  profileId: string;
  betType: string;
  typeCloseTimesMap?: Record<string, string | null>;
  typeCloseTimeBehaviorsMap?: Record<string, string>;
}) {
  // Check member-specific deadline / extension
  const memberExt = activeRound.temp_open_members?.[profileId];
  const isMultiTempExpired = !!(memberExt?.expires_at && now >= new Date(memberExt.expires_at));

  // Check if this member has been granted temp open access (single or multi)
  const tempMemberId = activeRound.temp_open_member_id;
  const tempExpiry = activeRound.temp_open_expires_at;
  const isTempExpired = !!(tempExpiry && now >= new Date(tempExpiry));
  const hasSingleTempAccess = !!(tempMemberId && tempMemberId === profileId && !isTempExpired);
  const hasMultiTempAccess = !!(memberExt && !isMultiTempExpired);
  const hasTempAccess = hasSingleTempAccess || hasMultiTempAccess;

  const memberEffectiveCloseTime: Date | null = memberExt?.expires_at
    ? new Date(memberExt.expires_at)
    : (tempMemberId === profileId && tempExpiry ? new Date(tempExpiry) : null);

  // If member had an individual close time that has already expired
  if ((memberExt?.expires_at && isMultiTempExpired) || (tempMemberId === profileId && tempExpiry && isTempExpired)) {
    const expiredAt = memberExt?.expires_at || tempExpiry!;
    const formattedCloseTime = new Date(expiredAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return {
      allowed: false,
      reason: 'member_extension_expired',
      message: `❌ ขออภัยค่ะ สิ้นสุดเวลาส่งเลขของคุณแล้วค่ะ (ปิดรับ ${formattedCloseTime} น.)`
    };
  }

  // If round status is closed/announced or past its close time, check temp_open_member_id & temp_open_members
  const closeTime = new Date(activeRound.close_time);
  if (activeRound.status !== 'open' || now >= closeTime) {
    if (!hasTempAccess) {
      return {
        allowed: false,
        reason: 'round_closed',
        message: `❌ ขออภัยค่ะ งวดหวยปิดรับแทงแล้วค่ะ`
      };
    }
  }

  // Check per-bet type close time
  const specificCloseTimeStr = typeCloseTimesMap[betType];
  const defaultCloseTime = hasTempAccess
    ? memberEffectiveCloseTime
    : new Date(activeRound.close_time);
  const typeCloseTime = specificCloseTimeStr && !hasTempAccess
    ? new Date(specificCloseTimeStr)
    : defaultCloseTime;
  const closeBehavior = typeCloseTimeBehaviorsMap[betType] || 'close_immediately';
  const isPastTypeCloseTime = typeCloseTime ? now >= typeCloseTime : false;

  if (isPastTypeCloseTime) {
    if (specificCloseTimeStr && !hasTempAccess && closeBehavior === 'return_excess') {
      return { allowed: true, enforceLimits: true };
    } else {
      return {
        allowed: false,
        reason: 'bet_type_closed'
      };
    }
  }

  return { allowed: true, enforceLimits: false };
}

describe('Member Time Extension Logic in line-bot', () => {
  const roundCloseTime = '2026-09-24T20:00:00+07:00';
  const memberExtTime = '2026-09-24T20:15:00+07:00';

  it('allows extended member to submit bets after general round close time', () => {
    // Current time is 20:05 (past 20:00 round close, but before 20:15 extension)
    const now = new Date('2026-09-24T20:05:00+07:00');
    const activeRound = {
      status: 'closed',
      close_time: roundCloseTime,
      temp_open_members: {
        'member-123': {
          expires_at: memberExtTime,
          granted_at: '2026-09-24T19:55:00+07:00'
        }
      }
    };

    const result = evaluateMemberBetCloseStatus({
      now,
      activeRound,
      profileId: 'member-123',
      betType: '2_top'
    });

    expect(result.allowed).toBe(true);
  });

  it('allows extended member to submit bet types that had specific close times before round close', () => {
    // Current time is 20:05. Specific type "3_top" closed at 19:30.
    const now = new Date('2026-09-24T20:05:00+07:00');
    const activeRound = {
      status: 'closed',
      close_time: roundCloseTime,
      temp_open_members: {
        'member-123': {
          expires_at: memberExtTime,
          granted_at: '2026-09-24T19:55:00+07:00'
        }
      }
    };

    const result = evaluateMemberBetCloseStatus({
      now,
      activeRound,
      profileId: 'member-123',
      betType: '3_top',
      typeCloseTimesMap: { '3_top': '2026-09-24T19:30:00+07:00' }
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks member without extension when round close time has passed', () => {
    const now = new Date('2026-09-24T20:05:00+07:00');
    const activeRound = {
      status: 'closed',
      close_time: roundCloseTime,
      temp_open_members: {}
    };

    const result = evaluateMemberBetCloseStatus({
      now,
      activeRound,
      profileId: 'member-999',
      betType: '2_top'
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('round_closed');
  });

  it('blocks extended member once their personal extension expires', () => {
    // Current time is 20:16 (past 20:15 extension)
    const now = new Date('2026-09-24T20:16:00+07:00');
    const activeRound = {
      status: 'closed',
      close_time: roundCloseTime,
      temp_open_members: {
        'member-123': {
          expires_at: memberExtTime,
          granted_at: '2026-09-24T19:55:00+07:00'
        }
      }
    };

    const result = evaluateMemberBetCloseStatus({
      now,
      activeRound,
      profileId: 'member-123',
      betType: '2_top'
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('member_extension_expired');
    expect(result.message).toContain('สิ้นสุดเวลาส่งเลขของคุณแล้วค่ะ');
  });

  it('allows member with unlimited temp open (temp_open_member_id with null expires_at)', () => {
    const now = new Date('2026-09-24T20:25:00+07:00');
    const activeRound = {
      status: 'closed',
      close_time: roundCloseTime,
      temp_open_member_id: 'member-456',
      temp_open_expires_at: null
    };

    const result = evaluateMemberBetCloseStatus({
      now,
      activeRound,
      profileId: 'member-456',
      betType: '3_top'
    });

    expect(result.allowed).toBe(true);
  });
});
