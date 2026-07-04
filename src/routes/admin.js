import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { signAdminToken, requireAdmin } from '../lib/auth.js'
import { loginLimiter } from '../lib/rateLimit.js'

const router = Router()

// POST /api/admin/login — verify the single admin credential from env. The
// password is checked against a bcrypt hash (ADMIN_PASSWORD_HASH), matching how
// reviewer accounts are stored — no cleartext password lives in the environment.
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const rawUsername = req.body?.username
    const rawPassword = req.body?.password
    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' })
    }
    const username = rawUsername.trim()
    const password = rawPassword

    const expectedUser = process.env.ADMIN_USERNAME
    const expectedHash = process.env.ADMIN_PASSWORD_HASH
    if (!expectedUser || !expectedHash) {
      return res.status(500).json({ error: 'Admin credentials are not configured on the server.' })
    }

    const passwordOk = await bcrypt.compare(password, expectedHash)
    if (username !== expectedUser || !passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const token = signAdminToken(username)
    res.json({ token, username })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/me — validate a stored admin token.
router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username })
})

export default router
