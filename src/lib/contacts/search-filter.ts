const PHONE_LIKE_SEARCH = /^[\d\s+\-().]+$/;
const MIN_PHONE_SEARCH_DIGITS = 3;

export function sanitizeContactSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_']/gu, '').trim();
}

export function phoneSearchDigits(raw: string): string | null {
  const term = raw.trim();
  if (!PHONE_LIKE_SEARCH.test(term)) return null;
  const digits = term.replace(/\D/g, '');
  return digits.length >= MIN_PHONE_SEARCH_DIGITS ? digits : null;
}

function escapeLikeUnderscore(term: string): string {
  return term.replace(/_/g, '\\_');
}

export function contactSearchNumber(raw: string): number | null {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  if (/^\d{1,7}$/.test(withoutPrefix)) {
    const n = parseInt(withoutPrefix, 10);
    return n > 0 ? n : null;
  }
  return null;
}

export function contactSearchPattern(rawSearch: string): string | null {
  const trimmed = rawSearch.trim();
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  const digits = phoneSearchDigits(withoutHash);
  if (digits) return digits;
  const search = sanitizeContactSearch(withoutHash);
  return search ? escapeLikeUnderscore(search) : null;
}

export interface ContactSearchOptions {
  includeEmail?: boolean;
}

export function contactSearchFilter(
  rawSearch: string,
  { includeEmail = false }: ContactSearchOptions = {}
): string | null {
  const trimmed = rawSearch.trim();
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  const search = sanitizeContactSearch(withoutHash);
  if (!search) return null;
  const textPattern = escapeLikeUnderscore(search);
  const conditions = [`name.ilike.*${textPattern}*`];
  const digits = phoneSearchDigits(withoutHash);
  if (digits) conditions.push(`phone.ilike.*${digits}*`);
  else if (/\d/.test(search)) conditions.push(`phone.ilike.*${textPattern}*`);
  if (includeEmail) conditions.push(`email.ilike.*${textPattern}*`);

  const contactNum = contactSearchNumber(rawSearch);
  if (contactNum !== null) {
    conditions.push(`contact_number.eq.${contactNum}`);
  }

  return conditions.join(',');
}
