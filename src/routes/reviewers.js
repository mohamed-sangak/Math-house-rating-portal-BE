import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Reviewer } from '../models/Reviewer.js'
import { requireAdmin } from '../lib/auth.js'

const router = Router()

const SALT_ROUNDS = 10

// All reviewer-management endpoints are admin-only.
router.use(requireAdmin)

// GET /api/reviewers — list reviewer accounts (admin). Never returns hashes.
router.get('/', async (_req, res, next) => {
  try {
    const reviewers = await Reviewer.find().sort({ createdAt: -1 }).lean()
    res.json({
      reviewers: reviewers.map((r) => ({
        id: String(r._id),
        name: r.name,
        username: r.username,
        removed: !!r.removed,
        createdAt: r.createdAt,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/reviewers — admin creates a reviewer account.
router.post('/', async (req, res, next) => {
  try {
    const name = (req.body?.name ?? '').trim()
    const username = (req.body?.username ?? '').trim().toLowerCase()
    const password = req.body?.password ?? ''

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and password are all required.' })
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' })
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only use letters, numbers, dot, dash, underscore.' })
    }

    const exists = await Reviewer.findOne({ username })
    if (exists) {
      return res.status(409).json({ error: 'That username is already taken.' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const reviewer = await Reviewer.create({ name, username, passwordHash })
    res.status(201).json(reviewer.toJSON())
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'That username is already taken.' })
    }
    next(err)
  }
})

// PATCH /api/reviewers/:id/password — admin resets a reviewer's password.
router.patch('/:id/password', async (req, res, next) => {
  try {
    const password = req.body?.password ?? ''
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const reviewer = await Reviewer.findByIdAndUpdate(
      req.params.id,
      { passwordHash },
      { new: true },
    )
    if (!reviewer) {
      return res.status(404).json({ error: 'Reviewer not found.' })
    }
    res.json(reviewer.toJSON())
  } catch (err) {
    if (err?.name === 'CastError') {
      return res.status(404).json({ error: 'Reviewer not found.' })
    }
    next(err)
  }
})

// DELETE /api/reviewers/:id — soft-delete: blocks login, keeps their reviews.
router.delete('/:id', async (req, res, next) => {
  try {
    const reviewer = await Reviewer.findByIdAndUpdate(
      req.params.id,
      { removed: true },
      { new: true },
    )
    if (!reviewer) {
      return res.status(404).json({ error: 'Reviewer not found.' })
    }
    res.json(reviewer.toJSON())
  } catch (err) {
    if (err?.name === 'CastError') {
      return res.status(404).json({ error: 'Reviewer not found.' })
    }
    next(err)
  }
})

export default router
