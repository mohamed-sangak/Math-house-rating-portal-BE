import express from 'express'
import cors from 'cors'

import teachersRouter from './routes/teachers.js'
import sessionsRouter from './routes/sessions.js'
import studentsRouter from './routes/students.js'
import fieldsRouter from './routes/fields.js'
import subjectsRouter from './routes/subjects.js'
import statsRouter from './routes/stats.js'
import authRouter from './routes/auth.js'
import reviewersRouter from './routes/reviewers.js'
import adminRouter from './routes/admin.js'

/**
 * Build and configure the Express app.
 * Kept separate from server startup so it can be imported in tests later.
 */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // Allow the Vite dev frontend (different origin) to call the API.
  app.use(cors({ origin: '*' }));
  app.use(express.json())

  // Health check.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Feature routers. Add more here as the API grows.
  app.use('/api/teachers', teachersRouter)
  app.use('/api/sessions', sessionsRouter)
  app.use('/api/students', studentsRouter)
  app.use('/api/fields', fieldsRouter)
  app.use('/api/subjects', subjectsRouter)
  app.use('/api/stats', statsRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/reviewers', reviewersRouter)

  // 404 fallback for unknown API routes.
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
  })

  // Error handler — keep internal details out of client responses.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    // Malformed JSON body from express.json() — the client's fault, not ours.
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request body.' })
    }
    console.error(err)
    res.status(err.status || 500).json({ error: 'Something went wrong on the server.' })
  })

  return app
}
