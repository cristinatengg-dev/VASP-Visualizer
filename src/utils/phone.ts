export const normalizePhoneNumber = (value: string): string => {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!phone) return '';
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^1[3-9]\d{9}$/.test(phone)) phone = `+86${phone}`;
  if (/^861[3-9]\d{9}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return '';
  if (phone.startsWith('+86') && !/^\+861[3-9]\d{9}$/.test(phone)) return '';
  return phone;
};

export const maskPhoneNumber = (value: string): string => {
  const phone = normalizePhoneNumber(value);
  if (!phone) return 'Guest';
  if (phone.startsWith('+86')) return `${phone.slice(0, 6)}****${phone.slice(-4)}`;
  return `${phone.slice(0, Math.max(2, phone.length - 8))}****${phone.slice(-4)}`;
};
