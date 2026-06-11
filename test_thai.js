const s = '/สรุป';
console.log('length:', s.length);
const text = '/สรุป 1234';
const param = text.substring(s.length).trim();
console.log('param:', JSON.stringify(param));

// Also test what lottery_type might be
const lotteryType = 'lao';
const clean = param.replace(/\s+/g, '');
console.log('clean:', JSON.stringify(clean));
console.log('is 4 digit:', /^\d{4}$/.test(clean));
