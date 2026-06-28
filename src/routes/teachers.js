import { Router } from 'express'
import { Teacher } from '../models/Teacher.js'
import { Field } from '../models/Field.js'
import { Session } from '../models/Session.js'
import { aggregateTeacherRatings } from '../lib/ratings.js'
import { requireAdmin } from '../lib/auth.js'

const router = Router()

// Full list with aggregated ratings — admin dashboard/teachers view.
async function listWithRatings(_req, res, next) {
  try {
    const [teachers, fields, sessions] = await Promise.all([
      Teacher.find().sort({ name: 1 }).lean({ virtuals: true }),
      Field.find().lean(),
      Session.find().lean(),
    ])

    const fieldKeys = fields.map((f) => f.key)
    const result = teachers.map((teacher) => ({
      id: String(teacher._id),
      name: teacher.name,
      removed: Boolean(teacher.removed),
      ...aggregateTeacherRatings(teacher, sessions, fieldKeys),
    }))
    res.json({ teachers: result })
  } catch (err) {
    next(err)
  }
}

// GET /api/teachers
//  - ?activeOnly=true  -> public: just active teacher names (for the review form)
//  - otherwise         -> admin-only: full list with aggregated ratings
router.get('/', (req, res, next) => {
  if (req.query.activeOnly === 'true') {
    return Teacher.find({ removed: { $ne: true } })
      .sort({ name: 1 })
      .lean()
      .then((teachers) =>
        res.json({ teachers: teachers.map((t) => ({ id: String(t._id), name: t.name })) }),
      )
      .catch(next)
  }
  // Sensitive ratings — require an admin token.
  return requireAdmin(req, res, () => listWithRatings(req, res, next))
})

// POST /api/teachers — admin adds a teacher.
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const name = (req.body?.name ?? '').trim()
    if (!name) {
      return res.status(400).json({ error: 'Teacher name is required' })
    }

    // Block duplicates against all teachers (active or removed), since sessions
    // are matched to a teacher by name.
    const exists = await Teacher.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    })
    if (exists) {
      return res.status(409).json({ error: 'A teacher with that name already exists' })
    }

    const teacher = await Teacher.create({ name })
    res.status(201).json(teacher.toJSON())
  } catch (err) {
    // Unique index race -> duplicate
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'A teacher with that name already exists' })
    }
    next(err)
  }
})

// DELETE /api/teachers/:id — soft delete. The teacher (and their ratings) stay
// in the dashboard, but they're hidden from the employee form.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { removed: true },
      { new: true },
    )
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }
    res.json(teacher.toJSON())
  } catch (err) {
    // Invalid ObjectId -> treat as not found
    if (err?.name === 'CastError') {
      return res.status(404).json({ error: 'Teacher not found' })
    }
    next(err)
  }
})

// Escape user input used inside a RegExp.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default router
