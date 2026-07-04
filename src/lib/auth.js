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

// Pull the token out of an `Authorization: Bearer <token>` header, or null.
function bearerToken(req) {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

// Express middleware: require a valid admin token.
export function requireAdmin(req, res, next) {
  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Admin sign in required.' })
  }
  try {
    const payload = jwt.verify(token, adminSecret(), { algorithms: ['HS256'] })
    if (payload.role !== 'admin') throw new Error('not admin')
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Your admin session has expired. Please sign in again.' })
  }
}

// Full reviewer-token validation: verify the JWT, confirm the account still
// exists and is active, and reject tokens issued before the last password reset.
// Returns { reviewer } on success or { error } (401 message). `badToken: true`
// means the JWT itself didn't verify, so a caller that accepts other roles can
// try another secret. DB errors propagate to the caller.
async function checkReviewerToken(token) {
  let payload
  try {
    payload = jwt.verify(token, secret(), { algorithms: ['HS256'] })
  } catch {
    return { error: 'Your session has expired. Please sign in again.', badToken: true }
  }

  const reviewer = await Reviewer.findById(payload.sub)
  if (!reviewer || reviewer.removed) {
    return { error: 'This account is no longer active.' }
  }
  if (reviewer.passwordChangedAt && payload.iat < Math.floor(reviewer.passwordChangedAt.getTime() / 1000)) {
    return { error: 'Your session has expired. Please sign in again.' }
  }
  return { reviewer }
}

// Express middleware: require a valid reviewer token, attach req.reviewer.
export async function requireReviewer(req, res, next) {
  try {
    const token = bearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Sign in to submit a review.' })
    }

    const { reviewer, error } = await checkReviewerToken(token)
    if (error) {
      return res.status(401).json({ error })
    }

    req.reviewer = reviewer
    next()
  } catch (err) {
    next(err)
  }
}

// Express middleware: accept either a signed-in reviewer or an admin. Used on
// the form-lookup endpoints (fields, subjects, active teachers) that both roles read.
export async function requireReviewerOrAdmin(req, res, next) {
  try {
    const token = bearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Sign in required.' })
    }

    // Try as a reviewer token first (the common case), then fall back to admin.
    const { reviewer, error, badToken } = await checkReviewerToken(token)
    if (reviewer) {
      req.reviewer = reviewer
      return next()
    }
    if (!badToken) {
      return res.status(401).json({ error })
    }

    try {
      const payload = jwt.verify(token, adminSecret(), { algorithms: ['HS256'] })
      if (payload.role !== 'admin') throw new Error('not admin')
      req.admin = payload
      return next()
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
    }
  } catch (err) {
    next(err)
  }
}
