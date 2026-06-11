function formatTimestamptzToThaiBudDate(timeStr) {
  if (!timeStr) return '';
  const dateObj = new Date(timeStr);
  const day = dateObj.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'Asia/Bangkok' });
  const month = dateObj.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Bangkok' });
  const year = dateObj.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' });
  const thYear = parseInt(year) + 543;
  return `${day}/${month}/${thYear}`;
}
console.log(formatTimestamptzToThaiBudDate("2026-06-05T10:00:00Z"));
console.log(formatTimestamptzToThaiBudDate("2026-01-09T03:00:00+07:00"));
