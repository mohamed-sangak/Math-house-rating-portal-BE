import { Router } from 'express'
import { signAdminToken, requireAdmin } from '../lib/auth.js'

const router = Router()

// POST /api/admin/login — verify the single admin credential from env.
router.post('/login', (req, res) => {
  const username = (req.body?.username ?? '').trim()
  const password = req.body?.password ?? ''

  const expectedUser = process.env.ADMIN_USERNAME
  const expectedPass = process.env.ADMIN_PASSWORD
  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'Admin credentials are not configured on the server.' })
  }

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const token = signAdminToken(username)
  res.json({ token, username })
})

// GET /api/admin/me — validate a stored admin token.
router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username })
})

export default router
