// Shared rating aggregation. Scores live in each session's dynamic `ratings` Map,
// so these helpers push the averaging into MongoDB ($group) instead of pulling
// every session into Node. Used by the stats and teachers routes.

// Round to one decimal place.
export function round1(n) {
  return Math.round(n * 10) / 10
}

/**
 * Aggregation stages that reduce matched sessions to one row per teacher holding
 * each rating field's raw average: `{ _id: teacherName, fields: [{ key, avg }] }`.
 * The dynamic `ratings` Map is expanded with $objectToArray so scores are averaged
 * in the DB. Drop these in after a $match (or inside a $facet) that selects sessions.
 * @param {string[]} fieldKeys - rating field keys to aggregate over (excludes removed fields)
 */
export function perTeacherFieldStages(fieldKeys) {
  return [
    { $project: { teacherName: 1, entries: { $objectToArray: { $ifNull: ['$ratings', {}] } } } },
    { $unwind: '$entries' },
    { $match: { 'entries.k': { $in: fieldKeys } } },
    { $group: { _id: { name: '$teacherName', key: '$entries.k' }, avg: { $avg: '$entries.v' } } },
    { $group: { _id: '$_id.name', fields: { $push: { key: '$_id.key', avg: '$avg' } } } },
  ]
}

/**
 * Fold one aggregated teacher row into the API shape. Per-field averages are
 * rounded to 1dp in field-key order; `overall` is the mean of those rounded values
 * (rounding before averaging is intentional — it matches the prior in-Node result).
 * @param {Array<{ key: string, avg: number }>} fields - the row's `fields` array
 * @param {string[]} fieldKeys - field keys, in the order they should appear
 * @returns {{ ratings: Record<string, number>, overall: number }}
 */
export function foldTeacherRatings(fields, fieldKeys) {
  const avgByKey = new Map(fields.map((f) => [f.key, f.avg]))
  const ratings = {}
  for (const key of fieldKeys) {
    if (avgByKey.has(key)) ratings[key] = round1(avgByKey.get(key))
  }
  const values = Object.values(ratings)
  const overall = values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0
  return { ratings, overall }
}
