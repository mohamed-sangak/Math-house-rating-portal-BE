import { Router } from 'express'
import { Teacher } from '../models/Teacher.js'
import { Field } from '../models/Field.js'
import { Session } from '../models/Session.js'
import { requireAdmin } from '../lib/auth.js'
import { dayStartUTC, dayEndExclusiveUTC } from '../lib/dates.js'
import { round1, perTeacherFieldStages, foldTeacherRatings } from '../lib/ratings.js'

const router = Router()

// All dashboard stats are admin-only.
router.use(requireAdmin)

// Today's date as YYYY-MM-DD in UTC — sessionAt stores the typed date as UTC,
// so "today" must use the same calendar or the bucket shifts with server timezone.
function today() {
  return new Date().toISOString().slice(0, 10)
}

// GET /api/stats/overview — headline numbers for the dashboard KPI cards.
router.get('/overview', async (_req, res, next) => {
  try {
    const [teachers, fields] = await Promise.all([Teacher.find().lean(), Field.find().lean()])
    const fieldKeys = fields.map((f) => f.key)
    const activeTeachers = teachers.filter((t) => !t.removed).length

    const todayStr = today()
    const [{ totals, todayBucket, perTeacher }] = await Session.aggregate([
      {
        $facet: {
          totals: [{ $count: 'n' }],
          todayBucket: [
            { $match: { sessionAt: { $gte: dayStartUTC(todayStr), $lt: dayEndExclusiveUTC(todayStr) } } },
            { $group: { _id: null, sessions: { $sum: 1 }, reviewers: { $addToSet: '$reviewerName' } } },
          ],
          perTeacher: perTeacherFieldStages(fieldKeys),
        },
      },
    ])

    const totalSessions = totals[0]?.n ?? 0
    const sessionsToday = todayBucket[0]?.sessions ?? 0
    // Distinct reviewers who submitted at least one review today (drop blanks).
    const reviewersToday = (todayBucket[0]?.reviewers ?? []).filter(Boolean).length

    // Overall average = mean of each known teacher's all-time overall (>0 only).
    const overallByName = new Map(perTeacher.map((r) => [r._id, foldTeacherRatings(r.fields, fieldKeys).overall]))
    const overalls = teachers.map((t) => overallByName.get(t.name) ?? 0).filter((o) => o > 0)
    const overallAverage = overalls.length ? round1(overalls.reduce((a, b) => a + b, 0) / overalls.length) : 0

    res.json({ activeTeachers, totalSessions, sessionsToday, reviewersToday, overallAverage })
  } catch (err) {
    next(err)
  }
})

// GET /api/stats/range?from=YYYY-MM-DD&to=YYYY-MM-DD — per-teacher ratings
// averaged over an inclusive date range. A single day is just from === to.
// sessionAt is a UTC Date; we bound it by [start of `from`, start of day after `to`).
router.get('/range', async (req, res, next) => {
  try {
    if ([req.query.from, req.query.to].some((v) => v !== undefined && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid query parameters.' })
    }
    const to = req.query.to || today()
    const from = req.query.from || to

    const rangeStart = dayStartUTC(from)
    const rangeEnd = dayEndExclusiveUTC(to)
    if (!rangeStart || !rangeEnd) {
      return res.status(400).json({ error: 'Invalid date range. Use YYYY-MM-DD.' })
    }

    const [teachers, fields] = await Promise.all([Teacher.find().lean(), Field.find().lean()])
    const fieldKeys = fields.map((f) => f.key)

    const [{ perField, counts, total }] = await Session.aggregate([
      { $match: { sessionAt: { $gte: rangeStart, $lt: rangeEnd } } }, // uses the sessionAt index
      {
        $facet: {
          perField: perTeacherFieldStages(fieldKeys),
          counts: [{ $group: { _id: '$teacherName', sessions: { $sum: 1 } } }],
          total: [{ $count: 'n' }],
        },
      },
    ])

    const ratingsByName = new Map(perField.map((r) => [r._id, foldTeacherRatings(r.fields, fieldKeys)]))
    const sessionsByName = new Map(counts.map((c) => [c._id, c.sessions]))

    const result = teachers
      .map((teacher) => {
        const sessions = sessionsByName.get(teacher.name) ?? 0
        if (sessions === 0) return null // only teachers rated in this range
        const { ratings, overall } = ratingsByName.get(teacher.name) ?? { ratings: {}, overall: 0 }
        return { id: String(teacher._id), name: teacher.name, overall, ratings, sessions }
      })
      .filter(Boolean)
      .sort((a, b) => b.overall - a.overall)

    const average =
      result.length > 0 ? round1(result.reduce((sum, t) => sum + t.overall, 0) / result.length) : 0

    res.json({
      from,
      to,
      teachers: result,
      average,
      totalSessions: total[0]?.n ?? 0,
    })
  } catch (err) {
    next(err)
  }
})

export default router
