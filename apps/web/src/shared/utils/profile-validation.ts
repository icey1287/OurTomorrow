export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export function validateRequiredText(
  value: string,
  label: string,
  maxLength: number,
) {
  const normalized = value.trim();
  if (!normalized) return `请填写${label}。`;
  if (normalized.length > maxLength) {
    return `${label}不能超过 ${maxLength} 个字符。`;
  }
  return null;
}

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
