// One-off: seed sample students and reviews for local testing.
// Run with: node --env-file-if-exists=.env scripts/seed.js
import mongoose from 'mongoose'
import { connectDb } from '../src/lib/db.js'
import { Session } from '../src/models/Session.js'
import { Student } from '../src/models/Student.js'
import { Field } from '../src/models/Field.js'

await connectDb()

const students = [
  { phone: '01011112222', name: 'Sara Ali', category: 'subscribed' },
  { phone: '01022223333', name: 'Omar Nabil', category: 'free_trial' },
  { phone: '01033334444', name: 'Mona Hassan', category: 'subscribed' },
  { phone: '01044445555', name: 'Youssef Adel', category: 'subscribed' },
  { phone: '01055556666', name: 'Lina Fouad', category: 'free_trial' },
  { phone: '01066667777', name: 'Karim Sami', category: 'subscribed' },
  { phone: '01077778888', name: 'Nour Tarek', category: 'free_trial' },
  { phone: '01088889999', name: 'Hana Wael', category: 'subscribed' },
]

await Student.insertMany(students)

const fieldKeys = (await Field.find().lean()).map((f) => f.key)
const phones = students.map((s) => s.phone)
const teachers = ['MR. Amir', 'Mrs. Mai', 'Mr. Omar', 'Mr. Youssef', 'Mrs. Nancy']
const subjects = ['SAT', 'ACT 1', 'EST 1 Level 1', 'AP Calcules', 'IGCSE Edexcel']
const reviewers = ['hazzem emad', 'mohamed', 'ahmed', 'mahmoud']

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const score = () => 5 + Math.floor(Math.random() * 6) // 5–10

// Build 15 sessions across the last 15 days. Each pulls 1–3 of the shared
// students so several appear in more than one review (cross-session tracking).
const sessions = Array.from({ length: 15 }, (_, i) => {
  const count = 1 + Math.floor(Math.random() * 3)
  const chosen = [...phones].sort(() => Math.random() - 0.5).slice(0, count)
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - i)
  day.setUTCHours(9 + (i % 8), 0, 0, 0)
  return {
    teacherName: pick(teachers),
    reviewerName: pick(reviewers),
    subject: pick(subjects),
    sessionAt: day,
    students: chosen,
    ratings: Object.fromEntries(fieldKeys.map((k) => [k, score()])),
  }
})

await Session.insertMany(sessions)

console.log(`Seeded ${students.length} students and ${sessions.length} reviews.`)
await mongoose.disconnect()
