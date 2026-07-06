import 'dotenv/config'
import { createApp } from './src/app.js'
import { connectDb } from './src/lib/db.js'

const PORT = process.env.PORT ?? 8080

async function start() {
  await connectDb()

  const app = createApp()
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
