import jwt from 'jsonwebtoken'
import { Reviewer } from '../models/Reviewer.js'

// Reviewer sessions last 12 hours, then they must log in again.
const TOKEN_TTL = '12h'

function secret() {
  const s = process.env.REVIEWER_JWT_SECRET
  if (!s) throw new Error('REVIEWER_JWT_SECRET is not set. Add it to backend/.env')
  return s
}

// Sign a token carrying the reviewer's id and display name.
export function signReviewerToken(reviewer) {
  return jwt.sign(
    { sub: String(reviewer._id), name: reviewer.name, username: reviewer.username },
    secret(),
    { expiresIn: TOKEN_TTL },
  )
}

// --- Admin auth (single credential from env, no DB) -----------------------

const ADMIN_TOKEN_TTL = '12h'

function adminSecret() {
  const s = process.env.ADMIN_JWT_SECRET
  if (!s) throw new Error('ADMIN_JWT_SECRET is not set. Add it to backend/.env')
  return s
}

export function signAdminToken(username) {
  return jwt.sign({ role: 'admin', username }, adminSecret(), { expiresIn: ADMIN_TOKEN_TTL })
}

// Express middleware: require a valid admin token.
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Admin sign in required.' })
  }
  try {
    const payload = jwt.verify(token, adminSecret())
    if (payload.role !== 'admin') throw new Error('not admin')
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Your admin session has expired. Please sign in again.' })
  }
}

// Express middleware: require a valid reviewer token, attach req.reviewer.
export async function requireReviewer(req, res, next) {
  try {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Sign in to submit a review.' })
    }

    let payload
    try {
      payload = jwt.verify(token, secret())
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
    }

    // Make sure the account still exists and is active (handles removal mid-session).
    const reviewer = await Reviewer.findById(payload.sub)
    if (!reviewer || reviewer.removed) {
      return res.status(401).json({ error: 'This account is no longer active.' })
    }

    req.reviewer = reviewer
    next()
  } catch (err) {
    next(err)
  }
}
