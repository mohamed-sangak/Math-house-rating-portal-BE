import { Router } from 'express'
import { Session } from '../models/Session.js'
import { Teacher } from '../models/Teacher.js'
import { Field } from '../models/Field.js'
import { requireReviewer, requireAdmin } from '../lib/auth.js'
import { combineDateTime, toDateOnly, toTimeOnly, dayStartUTC, dayEndExclusiveUTC } from '../lib/dates.js'

const router = Router()

const VALID_CATEGORIES = ['free_trial', 'subscribed']
const NAME_RE = /^[A-Za-z ]+$/ // student names: letters and spaces only
const MAX_STUDENTS = 50
const MAX_NAME_LENGTH = 100
const MAX_SUBJECT_LENGTH = 200

// Sessions must fall in a sane window: not before 2020, not past tomorrow.
const EARLIEST_SESSION = Date.UTC(2020, 0, 1)
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000

const round1 = (n) => Math.round(n * 10) / 10

// Validate + normalize the submitted students array. Returns { students } on
// success or { error } describing the first problem found.
function parseStudents(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Add at least one student.' }
  }
  if (raw.length > MAX_STUDENTS) {
    return { error: `A session can list at most ${MAX_STUDENTS} students.` }
  }
  const students = []
  for (const entry of raw) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    const category = entry?.category
    if (!name || name.length > MAX_NAME_LENGTH || !NAME_RE.test(name)) {
      return { error: 'Student names can contain letters and spaces only.' }
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return { error: 'Each student needs a valid category.' }
    }
    students.push({ name, category })
  }
  return { students }
}

// Validate the submitted scores against the current rating fields. Every field
// must be present (the form requires all of them) with an integer score 1–10.
// Returns { ratings } on success or { error }.
function parseRatings(payload, fieldKeys) {
  const ratings = {}
  for (const key of fieldKeys) {
    const num = Number(payload[key])
    if (!Number.isInteger(num) || num < 1 || num > 10) {
      return { error: 'Every rating must be a whole number from 1 to 10.' }
    }
    ratings[key] = num
  }
  return { ratings }
}

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
    // Query params must be plain strings (?teacher[$ne]=x parses as an object).
    if ([from, to, teacher].some((v) => v !== undefined && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid query parameters.' })
    }
    const query = {}
    if (from || to) {
      query.sessionAt = {}
      if (from) {
        const start = dayStartUTC(from)
        if (!start) return res.status(400).json({ error: 'Invalid `from` date. Use YYYY-MM-DD.' })
        query.sessionAt.$gte = start
      }
      if (to) {
        const end = dayEndExclusiveUTC(to) // inclusive of the `to` day
        if (!end) return res.status(400).json({ error: 'Invalid `to` date. Use YYYY-MM-DD.' })
        query.sessionAt.$lt = end
      }
    }
    if (teacher) query.teacherName = teacher

    // Clamp paging params to sane bounds.
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const [docs, total] = await Promise.all([
      Session.find(query)
        .sort({ sessionAt: -1, createdAt: -1 })
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
      sessionDate: toDateOnly(s.sessionAt),
      sessionTime: toTimeOnly(s.sessionAt),
      overall: sessionOverall(s.ratings),
      fieldCount: Object.keys(s.ratings ?? {}).length,
      studentCount: (s.students ?? []).length,
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
      sessionDate: toDateOnly(s.sessionAt),
      sessionTime: toTimeOnly(s.sessionAt),
      students: s.students ?? [],
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

    if (typeof payload.teacherName !== 'string' || !payload.teacherName.trim()) {
      return res.status(400).json({ error: 'teacherName is required' })
    }
    const teacherName = payload.teacherName.trim()

    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return res.status(400).json({ error: 'Subject is too long.' })
    }

    const sessionAt = combineDateTime(payload.sessionDate, payload.sessionTime)
    if (!sessionAt) {
      return res.status(400).json({ error: 'A valid session date and time are required.' })
    }
    if (sessionAt.getTime() < EARLIEST_SESSION || sessionAt.getTime() > Date.now() + FUTURE_GRACE_MS) {
      return res.status(400).json({ error: 'The session date is out of range.' })
    }

    const { students, error: studentsError } = parseStudents(payload.students)
    if (studentsError) {
      return res.status(400).json({ error: studentsError })
    }

    // The teacher must exist and still be active (the form only offers active ones).
    const teacher = await Teacher.findOne({ name: teacherName, removed: { $ne: true } }).lean()
    if (!teacher) {
      return res.status(400).json({ error: 'That teacher is not available for review.' })
    }

    // Scores are only accepted for the currently defined rating fields.
    const fields = await Field.find().lean()
    const { ratings, error: ratingsError } = parseRatings(payload, fields.map((f) => f.key))
    if (ratingsError) {
      return res.status(400).json({ error: ratingsError })
    }

    const session = await Session.create({
      teacherName,
      reviewerName: req.reviewer.name, // from the authenticated token, not the client
      sessionAt,
      subject,
      students,
      ratings,
    })

    // Reshape to the same string-based contract the GET endpoints expose.
    res.status(201).json({
      id: String(session._id),
      teacherName: session.teacherName,
      reviewerName: session.reviewerName ?? '',
      subject: session.subject,
      sessionDate: toDateOnly(session.sessionAt),
      sessionTime: toTimeOnly(session.sessionAt),
      overall: sessionOverall(ratings), // local plain object (session.ratings is a Map)
      createdAt: session.createdAt,
    })
  } catch (err) {
    next(err)
  }
})

export default router
