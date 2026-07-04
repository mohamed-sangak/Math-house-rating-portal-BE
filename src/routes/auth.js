import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Reviewer } from '../models/Reviewer.js'
import { signReviewerToken, requireReviewer } from '../lib/auth.js'
import { loginLimiter } from '../lib/rateLimit.js'

const router = Router()

// Compared against when the username doesn't exist, so response timing doesn't
// reveal which usernames are real. (Hash of a random unused password.)
const DUMMY_HASH = bcrypt.hashSync('dummy-timing-password', 10)

// POST /api/auth/login — reviewer signs in with username + password.
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const rawUsername = req.body?.username
    const password = req.body?.password
    if (typeof rawUsername !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' })
    }
    const username = rawUsername.trim().toLowerCase()
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' })
    }

    const reviewer = await Reviewer.findOne({ username })
    // Same message whether the user is missing, removed, or the password is wrong,
    // and a bcrypt compare always runs so timing is uniform too.
    const ok =
      (await bcrypt.compare(password, reviewer?.passwordHash ?? DUMMY_HASH)) &&
      reviewer &&
      !reviewer.removed
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
