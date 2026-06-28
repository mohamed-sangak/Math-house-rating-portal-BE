import { Router } from 'express'
import { Field } from '../models/Field.js'
import { requireAdmin } from '../lib/auth.js'

const router = Router()

// Turn a human label into a stable camelCase key, e.g. "Homework feedback" -> "homeworkFeedback".
function toKey(label) {
  const words = label
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
  if (words.length === 0) return ''
  return (
    words[0] +
    words
      .slice(1)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('')
  )
}

// GET /api/fields — the rating fields shown on the employee form.
router.get('/', async (_req, res, next) => {
  try {
    const fields = await Field.find().sort({ createdAt: 1 }).lean()
    res.json({ fields: fields.map((f) => ({ key: f.key, label: f.label })) })
  } catch (err) {
    next(err)
  }
})

// POST /api/fields — admin adds a new rating field by name.
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const label = (req.body?.label ?? '').trim()
    if (!label) {
      return res.status(400).json({ error: 'Field name is required' })
    }

    const key = toKey(label)
    if (!key) {
      return res.status(400).json({ error: 'Field name must contain letters or numbers' })
    }

    const exists = await Field.findOne({
      $or: [{ key }, { label: new RegExp(`^${escapeRegex(label)}$`, 'i') }],
    })
    if (exists) {
      return res.status(409).json({ error: 'A field with that name already exists' })
    }

    const field = await Field.create({ key, label })
    res.status(201).json({ key: field.key, label: field.label })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'A field with that name already exists' })
    }
    next(err)
  }
})

// DELETE /api/fields/:key — admin removes a rating field. Existing reviews keep
// their stored scores; the field just leaves the form and the aggregations.
router.delete('/:key', requireAdmin, async (req, res, next) => {
  try {
    const field = await Field.findOneAndDelete({ key: req.params.key })
    if (!field) {
      return res.status(404).json({ error: 'Field not found' })
    }
    res.json({ key: field.key, label: field.label })
  } catch (err) {
    next(err)
  }
})

// Escape user input used inside a RegExp.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default router
