import { Router } from 'express'
import { Session } from '../models/Session.js'
import { requireReviewer, requireAdmin } from '../lib/auth.js'

const router = Router()

// Known non-rating fields submitted by the employee form.
const INFO_KEYS = ['teacherName', 'reviewerName', 'sessionDate', 'sessionTime', 'subject']

const round1 = (n) => Math.round(n * 10) / 10

// Average of a session's rating values (out of 10), or 0 if it has none.
function sessionOverall(ratings = {}) {
  const values = Object.values(ratings).filter((v) => Number.isFinite(v))
  if (values.length === 0) return 0
  return round1(values.reduce((a, b) => a + b, 0) / values.length)
}

// GET /api/sessions?from=&to=&teacher=&limit=&offset= — list sessions, newest
// first, with filters and pagination (for infinite scroll). Admin-only.
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { from, to, teacher } = req.query
    const query = {}
    if (from || to) {
      query.sessionDate = {}
      if (from) query.sessionDate.$gte = from
      if (to) query.sessionDate.$lte = to
    }
    if (teacher) query.teacherName = teacher

    // Clamp paging params to sane bounds.
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const [docs, total] = await Promise.all([
      Session.find(query)
        .sort({ sessionDate: -1, sessionTime: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Session.countDocuments(query),
    ])

    const result = docs.map((s) => ({
      id: String(s._id),
      teacherName: s.teacherName,
      reviewerName: s.reviewerName ?? '',
      subject: s.subject,
      sessionDate: s.sessionDate,
      sessionTime: s.sessionTime,
      overall: sessionOverall(s.ratings),
      fieldCount: Object.keys(s.ratings ?? {}).length,
      createdAt: s.createdAt,
    }))

    res.json({
      sessions: result,
      total,
      offset,
      limit,
      hasMore: offset + result.length < total,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/sessions/:id — full detail for one session, including every rating. Admin-only.
router.get('/:id', requireAdmin, async (req, res, next) => {
  try {
    const s = await Session.findById(req.params.id).lean()
    if (!s) return res.status(404).json({ error: 'Session not found' })

    res.json({
      id: String(s._id),
      teacherName: s.teacherName,
      reviewerName: s.reviewerName ?? '',
      subject: s.subject,
      sessionDate: s.sessionDate,
      sessionTime: s.sessionTime,
      ratings: s.ratings ?? {},
      overall: sessionOverall(s.ratings),
      createdAt: s.createdAt,
    })
  } catch (err) {
    // An invalid ObjectId throws a CastError — treat it as not found.
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Session not found' })
    }
    next(err)
  }
})

// POST /api/sessions — store one submitted review. Requires a signed-in reviewer;
// the reviewer's name is taken from their token, never from the request body.
router.post('/', requireReviewer, async (req, res, next) => {
  try {
    const payload = req.body ?? {}

    if (!payload.teacherName) {
      return res.status(400).json({ error: 'teacherName is required' })
    }

    // Everything that isn't an info field is treated as a rating score.
    const ratings = {}
    for (const [key, value] of Object.entries(payload)) {
      if (INFO_KEYS.includes(key)) continue
      const num = Number(value)
      if (Number.isFinite(num)) ratings[key] = num
    }

    const session = await Session.create({
      teacherName: payload.teacherName,
      reviewerName: req.reviewer.name, // from the authenticated token, not the client
      sessionDate: payload.sessionDate ?? '',
      sessionTime: payload.sessionTime ?? '',
      subject: payload.subject ?? '',
      ratings,
    })

    res.status(201).json(session.toJSON())
  } catch (err) {
    next(err)
  }
})

export default router
