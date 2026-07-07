import { Router } from 'express'
import { Session } from '../models/Session.js'
import { Teacher } from '../models/Teacher.js'
import { Field } from '../models/Field.js'
import { Student } from '../models/Student.js'
import { requireReviewer, requireAdmin } from '../lib/auth.js'
import { combineDateTime, toDateOnly, toTimeOnly, dayStartUTC, dayEndExclusiveUTC } from '../lib/dates.js'
import { normalizePhone } from '../lib/phone.js'
import { freeTrialPhones } from '../lib/students.js'

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

// Validate + normalize the submitted students. Each entry must carry a valid,
// distinct phone; name/category are carried through untrimmed-of-meaning and
// only enforced later for phones that don't already exist (see resolveStudents).
// Returns { students: [{ phone, name, category }] } or { error }.
function parseStudents(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Add at least one student.' }
  }
  if (raw.length > MAX_STUDENTS) {
    return { error: `A session can list at most ${MAX_STUDENTS} students.` }
  }
  const students = []
  const seenPhones = new Set()
  for (const entry of raw) {
    const phone = normalizePhone(entry?.phone)
    if (!phone) {
      return { error: 'Each student needs a valid phone number (7–15 digits).' }
    }
    if (seenPhones.has(phone)) {
      return { error: 'Each student in a session needs a distinct phone number.' }
    }
    seenPhones.add(phone)
    students.push({
      phone,
      name: typeof entry?.name === 'string' ? entry.name.trim() : '',
      category: entry?.category,
    })
  }
  return { students }
}

// Given the parsed students, create any whose phone is new (validating their
// name/category) and leave existing records untouched. Returns { phones } — the
// session's student list, in submission order — or { error }.
async function resolveStudents(parsed) {
  const phones = parsed.map((s) => s.phone)
  const found = await Student.find({ phone: { $in: phones } }, { phone: 1 }).lean()
  const existing = new Set(found.map((s) => s.phone))

  const toCreate = []
  for (const s of parsed) {
    if (existing.has(s.phone)) continue // known student — source of truth stays as-is
    if (!s.name || s.name.length > MAX_NAME_LENGTH || !NAME_RE.test(s.name)) {
      return { error: 'New student names can contain letters and spaces only.' }
    }
    if (!VALID_CATEGORIES.includes(s.category)) {
      return { error: 'Each new student needs a valid category.' }
    }
    toCreate.push({ phone: s.phone, name: s.name, category: s.category })
  }

  if (toCreate.length > 0) {
    try {
      // ordered:false so every new student is inserted independently.
      await Student.insertMany(toCreate, { ordered: false })
    } catch (err) {
      // A concurrent submission can create the same new phone first; the unique
      // index then rejects our duplicate (code 11000). The record exists now and
      // the session will reference it, so that's fine — re-throw anything else.
      const writeErrors = err?.writeErrors ?? []
      const onlyDuplicates =
        err?.code === 11000 && writeErrors.every((e) => (e.code ?? e.err?.code) === 11000)
      if (!onlyDuplicates) throw err
    }
  }
  return { phones }
}

// Resolve a session's stored phone list into display details from the Student
// collection, preserving order. A phone with no record (e.g. deleted student)
// falls back to the phone itself so the session still renders.
async function resolveStudentDetails(phones) {
  if (phones.length === 0) return []
  const students = await Student.find({ phone: { $in: phones } }).lean()
  const byPhone = new Map(students.map((s) => [s.phone, s]))
  return phones.map((phone) => {
    const student = byPhone.get(phone)
    return {
      name: student?.name ?? 'Unknown student',
      category: student?.category ?? null,
      phone,
    }
  })
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

    // Restrict to sessions with at least one currently free-trial student.
    if (req.query.freeTrial === 'true') {
      query.students = { $in: await freeTrialPhones() }
    }

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
      students: await resolveStudentDetails(s.students ?? []),
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

    // Create any new students (validating their details); existing phones keep
    // their current record. The session then stores just the phone references.
    const { phones, error: resolveError } = await resolveStudents(students)
    if (resolveError) {
      return res.status(400).json({ error: resolveError })
    }

    const session = await Session.create({
      teacherName,
      reviewerName: req.reviewer.name, // from the authenticated token, not the client
      sessionAt,
      subject,
      students: phones,
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
