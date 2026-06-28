// Round to one decimal place.
function round1(n) {
  return Math.round(n * 10) / 10
}

/**
 * Aggregate a teacher's sessions into per-category averages plus an overall score.
 * Sessions are matched to a teacher by name (the form submits `teacherName`).
 *
 * @param {{ name: string }} teacher
 * @param {Array<Record<string, any>>} sessions - all stored sessions
 * @param {string[]} fieldKeys - the rating field keys to aggregate over
 * @returns {{ sessions: number, ratings: Record<string, number>|null, overall: number }}
 */
export function aggregateTeacherRatings(teacher, sessions, fieldKeys) {
  const own = sessions.filter((s) => s.teacherName === teacher.name)

  if (own.length === 0) {
    return { sessions: 0, ratings: null, overall: 0 }
  }

  const ratings = {}
  for (const key of fieldKeys) {
    const values = own
      .map((s) => Number(s.ratings?.[key]))
      .filter((n) => Number.isFinite(n))
    if (values.length > 0) {
      ratings[key] = round1(values.reduce((a, b) => a + b, 0) / values.length)
    }
  }

  const categoryAverages = Object.values(ratings)
  const overall =
    categoryAverages.length > 0
      ? round1(categoryAverages.reduce((a, b) => a + b, 0) / categoryAverages.length)
      : 0

  return { sessions: own.length, ratings, overall }
}
