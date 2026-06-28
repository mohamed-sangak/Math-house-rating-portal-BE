import mongoose from 'mongoose'

/**
 * Connect to MongoDB using the MONGODB_URI env var.
 * Call once at startup before the server begins listening.
 */
export async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env')
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message)
  })

  await mongoose.connect(uri)
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`)
}
