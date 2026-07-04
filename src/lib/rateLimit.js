import rateLimit from 'express-rate-limit'

// Brute-force protection for the login endpoints: 10 attempts per IP per 15
// minutes. Successful logins don't count against the limit.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
})
