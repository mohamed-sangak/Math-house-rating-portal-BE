import { Router } from 'express'
import { Subject } from '../models/Subject.js'
import { requireAdmin, requireReviewerOrAdmin } from '../lib/auth.js'

const router = Router()

// GET /api/subjects — list subjects for the employee form dropdown.
// Read by both signed-in reviewers (the form) and admins (form settings).
router.get('/', requireReviewerOrAdmin, async (_req, res, next) => {
  try {
    const subjects = await Subject.find().sort({ name: 1 }).lean({ virtuals: true })
    res.json({
      subjects: subjects.map((s) => ({ id: String(s._id), name: s.name })),
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/subjects — admin adds a subject.
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const name = (req.body?.name ?? '').trim()
    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' })
    }

    const exists = await Subject.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    })
    if (exists) {
      return res.status(409).json({ error: 'That subject already exists' })
    }

    const subject = await Subject.create({ name })
    res.status(201).json(subject)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'That subject already exists' })
    }
    next(err)
  }
})

// DELETE /api/subjects/:id — admin removes a subject (existing sessions keep their subject text).
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id)
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' })
    }
    res.json(subject)
  } catch (err) {
    if (err?.name === 'CastError') {
      return res.status(404).json({ error: 'Subject not found' })
    }
    next(err)
  }
})

// Escape user input used inside a RegExp.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default router
