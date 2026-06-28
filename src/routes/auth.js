import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Reviewer } from '../models/Reviewer.js'
import { signReviewerToken, requireReviewer } from '../lib/auth.js'

const router = Router()

// POST /api/auth/login — reviewer signs in with username + password.
router.post('/login', async (req, res, next) => {
  try {
    const username = (req.body?.username ?? '').trim().toLowerCase()
    const password = req.body?.password ?? ''
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' })
    }

    const reviewer = await Reviewer.findOne({ username })
    // Same message whether the user is missing, removed, or the password is wrong.
    const ok = reviewer && !reviewer.removed && (await bcrypt.compare(password, reviewer.passwordHash))
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const token = signReviewerToken(reviewer)
    res.json({ token, reviewer: { name: reviewer.name, username: reviewer.username } })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/me — validate a stored token and return the reviewer's identity.
router.get('/me', requireReviewer, (req, res) => {
  res.json({ name: req.reviewer.name, username: req.reviewer.username })
})

export default router
