export const LOTTERY_DISPLAY_NAMES: Record<string, string> = {
  thai: 'หวยไทย',
  lao: 'หวยลาว',
  hanoi: 'หวยฮานอย',
  stock: 'หวยหุ้น',
  yeekee: 'หวยยี่กี่',
  lao_extra: 'หวยลาวพิเศษ',
  lao_vip: 'หวยลาว VIP',
  other: 'หวยอื่นๆ'
};

// Helper: Parse lottery type in Thai or English
export function parseLotteryType(input: string): string | null {
  const clean = input.trim().toLowerCase();
  if (clean === 'ไทย' || clean === 'หวยไทย' || clean === 'thai' || clean === 'th') return 'thai';
  if (clean === 'ลาว' || clean === 'หวยลาว' || clean === 'lao' || clean === 'la') return 'lao';
  if (clean === 'ฮานอย' || clean === 'หวยฮานอย' || clean === 'hanoi' || clean === 'vn') return 'hanoi';
  if (clean === 'หุ้น' || clean === 'หวยหุ้น' || clean === 'stock') return 'stock';
  if (clean === 'ยี่กี' || clean === 'ยี่กี่' || clean === 'หวยยี่กี' || clean === 'หวยยี่กี่' || clean === 'yeekee' || clean === 'yk') return 'yeekee';
  return null;
}

export function parseBindingCommand(text: string): {
  requestedLotteryType: string;
  baseCmd: string;
  dealerId: string | null;
  isValidFormat: boolean;
} {
  let requestedLotteryType = 'thai';
  let baseCmd = '/ขอรหัส';

  const parts = text.trim().split(/\s+/);
  const firstWord = parts[0].toLowerCase();

  if (firstWord.startsWith('/ขอรหัสไทย') || firstWord.startsWith('/ขอรหัสผูกกลุ่มไทย')) {
    requestedLotteryType = 'thai';
    baseCmd = '/ขอรหัสไทย';
  } else if (firstWord.startsWith('/ขอรหัสลาว') || firstWord.startsWith('/ขอรหัสผูกกลุ่มลาว')) {
    requestedLotteryType = 'lao';
    baseCmd = '/ขอรหัสลาว';
  } else if (firstWord.startsWith('/ขอรหัสฮานอย') || firstWord.startsWith('/ขอรหัสผูกกลุ่มฮานอย')) {
    requestedLotteryType = 'hanoi';
    baseCmd = '/ขอรหัสฮานอย';
  } else if (firstWord.startsWith('/ขอรหัสหุ้น') || firstWord.startsWith('/ขอรหัสผูกกลุ่มหุ้น')) {
    requestedLotteryType = 'stock';
    baseCmd = '/ขอรหัสหุ้น';
  } else if (firstWord.startsWith('/ขอรหัสยี่กี่') || firstWord.startsWith('/ขอรหัสยี่กี') || firstWord.startsWith('/ขอรหัสผูกกลุ่มยี่กี่') || firstWord.startsWith('/ขอรหัสผูกกลุ่มยี่กี')) {
    requestedLotteryType = 'yeekee';
    baseCmd = '/ขอรหัสยี่กี่';
  } else {
    // Check if lottery type was specified as a separate argument (e.g. /ขอรหัส ลาว, /bindcode lao)
    if (parts.length > 1) {
      const parsedType = parseLotteryType(parts[1]);
      if (parsedType) {
        requestedLotteryType = parsedType;
        if (parsedType === 'lao') baseCmd = '/ขอรหัสลาว';
        else if (parsedType === 'hanoi') baseCmd = '/ขอรหัสฮานอย';
        else if (parsedType === 'stock') baseCmd = '/ขอรหัสหุ้น';
        else if (parsedType === 'yeekee') baseCmd = '/ขอรหัสยี่กี่';
        else baseCmd = '/ขอรหัสไทย';
      }
    }
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const remainingArgs = parts.slice(1).filter(arg => !parseLotteryType(arg));
  let dealerId: string | null = null;
  let isValidFormat = true;

  if (remainingArgs.length > 0) {
    const potentialUuid = remainingArgs[0].trim();
    if (uuidRegex.test(potentialUuid)) {
      dealerId = potentialUuid;
    } else {
      isValidFormat = false;
    }
  }

  return { requestedLotteryType, baseCmd, dealerId, isValidFormat };
}

export function formatBindSuccessMessage(dealerName: string, lotteryType: string): string {
  const lotteryDisplay = LOTTERY_DISPLAY_NAMES[lotteryType] || (lotteryType ? lotteryType.toUpperCase() : 'หวยไทย');
  return `✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: ${dealerName}\nประเภทหวย: ${lotteryDisplay}\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉`;
}

export function formatCreateBindCodeMessages(code: string): string[] {
  return [
    `✅ สร้างรหัสผูกกลุ่มใหม่สำเร็จแล้วค่ะ!✅\n\nกรุณาคัดลอกรหัสและคำสั่งด้านล่าง ไปพิมพ์ในกลุ่ม LINE ที่ต้องการผูกกลุ่มแชทเข้ากับระบบค่ะ 🤖`,
    `/bind ${code}`
  ];
}

export function formatExistingBindCodeMessages(code: string): string[] {
  return [
    `คุณมีรหัสผูกกลุ่มที่ยังไม่ได้ใช้งานอยู่แล้วค่ะ\n\nกรุณาคัดลอกรหัสและคำสั่งด้านล่าง ไปพิมพ์ในกลุ่ม LINE ที่ต้องการผูกกลุ่มแชทเข้ากับระบบค่ะ 🤖\n\n*(หากต้องการรหัสใหม่ กรุณากดลบรหัสเดิมผ่านระบบหลังบ้านบนหน้าเว็บดีลเลอร์ก่อนนะคะ)*`,
    `/bind ${code}`
  ];
}
