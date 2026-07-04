// Session date/time helpers.
//
// The reviewer's typed wall-clock date (YYYY-MM-DD) and time (HH:MM) are stored
// as a single UTC `Date` (`sessionAt`). We interpret the typed values AS UTC and
// always format them back with UTC getters, so what the reviewer typed round-trips
// exactly and calendar-day comparisons keep a stable, timezone-independent meaning.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/**
 * Combine a `YYYY-MM-DD` date and `HH:MM` time into a UTC Date.
 * Returns null if the date is missing/invalid. A missing/invalid time defaults to 00:00.
 * @param {string} dateStr
 * @param {string} [timeStr]
 * @returns {Date | null}
 */
export function combineDateTime(dateStr, timeStr) {
  const day = dayStartUTC(dateStr) // also rejects rolled-over dates like 2025-02-31
  if (!day) return null
  let hh = 0
  let mm = 0
  if (typeof timeStr === 'string' && TIME_RE.test(timeStr)) {
    ;[hh, mm] = timeStr.split(':').map(Number)
    if (hh > 23 || mm > 59) return null
  }
  return new Date(day.getTime() + (hh * 60 + mm) * 60 * 1000)
}

/**
 * Format a Date as its UTC calendar day, `YYYY-MM-DD`. Empty string if falsy.
 * @param {Date | null | undefined} date
 * @returns {string}
 */
export function toDateOnly(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Format a Date as its UTC time of day, `HH:MM`. Empty string if falsy.
 * @param {Date | null | undefined} date
 * @returns {string}
 */
export function toTimeOnly(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/**
 * Start of a UTC day (`T00:00:00Z`) for a `YYYY-MM-DD` string, or null if invalid.
 * @param {string} dateStr
 * @returns {Date | null}
 */
export function dayStartUTC(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return null
  const [y, mo, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(date.getTime())) return null
  // Reject values Date.UTC would silently roll over (e.g. 2025-02-31, month 13).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date
}

/**
 * Start of the day AFTER a `YYYY-MM-DD` string (exclusive upper bound for a range).
 * @param {string} dateStr
 * @returns {Date | null}
 */
export function dayEndExclusiveUTC(dateStr) {
  const start = dayStartUTC(dateStr)
  if (!start) return null
  return new Date(start.getTime() + 24 * 60 * 60 * 1000)
}
