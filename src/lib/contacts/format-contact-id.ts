/**
 * Format a sequential contact number into a human-friendly display ID.
 * e.g. 1 -> "0001", 42 -> "0042", 1054 -> "1054"
 * If prefixed: "#0001"
 */
export interface FormatContactIdOptions {
  prefix?: string;
  minDigits?: number;
}

export function formatContactId(
  num: number | null | undefined,
  options: FormatContactIdOptions = {}
): string {
  if (num === null || num === undefined || typeof num !== 'number' || Number.isNaN(num) || num <= 0) {
    return '';
  }
  const { prefix = '', minDigits = 4 } = options;
  const padded = String(Math.floor(num)).padStart(minDigits, '0');
  return `${prefix}${padded}`;
}
