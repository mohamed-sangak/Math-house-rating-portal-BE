import { Router } from 'express'
import { Student } from '../models/Student.js'
import { requireReviewerOrAdmin, requireAdmin } from '../lib/auth.js'
import { stripPhoneSeparators, escapeRegex } from '../lib/phone.js'

const router = Router()

const MIN_QUERY_DIGITS = 3
const MAX_RESULTS = 25
const VALID_CATEGORIES = ['free_trial', 'subscribed']

// GET /api/students?phone=<digits>&limit= — typeahead search by phone prefix for
// the reviewer form. Requires at least 3 digits so we never scan the whole
// collection; returns an empty list below that threshold.
router.get('/', requireReviewerOrAdmin, async (req, res, next) => {
  try {
    const { phone } = req.query
    if (phone !== undefined && typeof phone !== 'string') {
      return res.status(400).json({ error: 'Invalid query parameters.' })
    }

    const query = stripPhoneSeparators(phone ?? '')
    if (query.length < MIN_QUERY_DIGITS) {
      return res.json({ students: [] })
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), MAX_RESULTS)
    const students = await Student.find({ phone: new RegExp(`^${escapeRegex(query)}`) })
      .sort({ phone: 1 })
      .limit(limit)
      .lean()

    res.json({
      students: students.map((s) => ({
        id: String(s._id),
        name: s.name,
        category: s.category,
        phone: s.phone,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/students/directory?q=&category=&limit=&offset= — admin listing of all
// students, newest first, with an optional name/phone search and category filter.
// `q` matches a name substring (case-insensitive) or a phone prefix.
router.get('/directory', requireAdmin, async (req, res, next) => {
  try {
    const { q, category } = req.query
    if ([q, category].some((v) => v !== undefined && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid query parameters.' })
    }

    const query = {}
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Invalid category filter.' })
      }
      query.category = category
    }

    const term = (q ?? '').trim()
    if (term) {
      const or = [{ name: new RegExp(escapeRegex(term), 'i') }]
      // Only add a phone-prefix clause when the term actually contains digits.
      const phoneTerm = stripPhoneSeparators(term)
      if (/\d/.test(phoneTerm)) or.push({ phone: new RegExp(`^${escapeRegex(phoneTerm)}`) })
      query.$or = or
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const [docs, total] = await Promise.all([
      Student.find(query).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean(),
      Student.countDocuments(query),
    ])

    res.json({
      students: docs.map((s) => ({
        id: String(s._id),
        name: s.name,
        phone: s.phone,
        category: s.category,
        createdAt: s.createdAt,
      })),
      total,
      offset,
      limit,
      hasMore: offset + docs.length < total,
    })
  } catch (err) {
    next(err)
  }
})

export default router
