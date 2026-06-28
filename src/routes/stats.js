import { Router } from 'express'
import { Teacher } from '../models/Teacher.js'
import { Field } from '../models/Field.js'
import { Session } from '../models/Session.js'
import { aggregateTeacherRatings } from '../lib/ratings.js'
import { requireAdmin } from '../lib/auth.js'

const router = Router()

// All dashboard stats are admin-only.
router.use(requireAdmin)

const round1 = (n) => Math.round(n * 10) / 10

// Today's date as YYYY-MM-DD (server local time).
function today() {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// GET /api/stats/overview — headline numbers for the dashboard KPI cards.
router.get('/overview', async (_req, res, next) => {
  try {
    const [teachers, fields, sessions] = await Promise.all([
      Teacher.find().lean(),
      Field.find().lean(),
      Session.find().lean(),
    ])
    const fieldKeys = fields.map((f) => f.key)

    const activeTeachers = teachers.filter((t) => !t.removed).length
    const totalSessions = sessions.length
    const todaysSessions = sessions.filter((s) => s.sessionDate === today())
    const sessionsToday = todaysSessions.length
    // Distinct reviewers who submitted at least one review today.
    const reviewersToday = new Set(
      todaysSessions.map((s) => s.reviewerName).filter(Boolean),
    ).size

    // Overall average = mean of each teacher's all-time overall (teachers with sessions).
    const overalls = teachers
      .map((t) => aggregateTeacherRatings(t, sessions, fieldKeys).overall)
      .filter((o) => o > 0)
    const overallAverage =
      overalls.length > 0
        ? round1(overalls.reduce((a, b) => a + b, 0) / overalls.length)
        : 0

    res.json({ activeTeachers, totalSessions, sessionsToday, reviewersToday, overallAverage })
  } catch (err) {
    next(err)
  }
})

// GET /api/stats/range?from=YYYY-MM-DD&to=YYYY-MM-DD — per-teacher ratings
// averaged over an inclusive date range. A single day is just from === to.
// sessionDate is a YYYY-MM-DD string, so lexical $gte/$lte gives a correct range.
router.get('/range', async (req, res, next) => {
  try {
    const to = req.query.to || today()
    const from = req.query.from || to

    const [teachers, fields, sessions] = await Promise.all([
      Teacher.find().lean(),
      Field.find().lean(),
      Session.find({ sessionDate: { $gte: from, $lte: to } }).lean(),
    ])
    const fieldKeys = fields.map((f) => f.key)

    const result = teachers
      .map((teacher) => {
        const agg = aggregateTeacherRatings(teacher, sessions, fieldKeys)
        return {
          id: String(teacher._id),
          name: teacher.name,
          overall: agg.overall,
          ratings: agg.ratings ?? {}, // per-field averages over the range
          sessions: agg.sessions,
        }
      })
      .filter((t) => t.sessions > 0)
      .sort((a, b) => b.overall - a.overall)

    const average =
      result.length > 0
        ? round1(result.reduce((sum, t) => sum + t.overall, 0) / result.length)
        : 0

    res.json({
      from,
      to,
      teachers: result,
      average,
      totalSessions: sessions.length,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/stats/daily?date=YYYY-MM-DD — per-teacher overall ratings for one day.
router.get('/daily', async (req, res, next) => {
  try {
    const date = req.query.date || today()

    const [teachers, fields, sessions] = await Promise.all([
      Teacher.find().lean(),
      Field.find().lean(),
      Session.find({ sessionDate: date }).lean(),
    ])
    const fieldKeys = fields.map((f) => f.key)

    const result = teachers
      .map((teacher) => {
        const agg = aggregateTeacherRatings(teacher, sessions, fieldKeys)
        return {
          id: String(teacher._id),
          name: teacher.name,
          overall: agg.overall,
          ratings: agg.ratings ?? {}, // per-field averages for that day
          sessions: agg.sessions,
        }
      })
      .filter((t) => t.sessions > 0) // only teachers rated that day
      .sort((a, b) => b.overall - a.overall)

    const dayAverage =
      result.length > 0
        ? round1(result.reduce((sum, t) => sum + t.overall, 0) / result.length)
        : 0

    res.json({
      date,
      teachers: result,
      dayAverage,
      totalSessions: sessions.length,
    })
  } catch (err) {
    next(err)
  }
})

export default router
