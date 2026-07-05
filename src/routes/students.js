import { Router } from 'express'
import { Student } from '../models/Student.js'
import { requireReviewerOrAdmin } from '../lib/auth.js'
import { stripPhoneSeparators, escapeRegex } from '../lib/phone.js'

const router = Router()

const MIN_QUERY_DIGITS = 3
const MAX_RESULTS = 25

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

export default router
