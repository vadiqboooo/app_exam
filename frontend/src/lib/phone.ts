/** Маска российского номера: +7 (900) 123-45-67. Принимает ввод с 8, 7 или без кода страны. */
export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits[0] === '8' || digits[0] === '7') digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return '';
  let out = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) out += ')';
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`;
  return out;
}
