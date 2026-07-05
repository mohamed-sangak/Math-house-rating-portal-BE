// Phone: 7–15 digits with an optional leading '+'. Common separators are
// stripped first by normalizePhone, so only digits/'+' remain to validate.
export const PHONE_RE = /^\+?\d{7,15}$/

// Strip spaces, dashes, parentheses and dots so loosely-typed numbers compare
// equal. Returns the normalized string, or null if it isn't a valid phone.
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\s\-().]/g, '')
  return PHONE_RE.test(cleaned) ? cleaned : null
}

// Strip separators without validating — for building a prefix search query.
export function stripPhoneSeparators(raw) {
  return typeof raw === 'string' ? raw.replace(/[\s\-().]/g, '') : ''
}

// Escape a digit string for safe use inside a RegExp (defensive; digits/'+'
// aren't regex metacharacters, but the input is user-supplied).
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
