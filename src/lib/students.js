import { Student } from '../models/Student.js'

// Phone numbers of every student currently in a free trial. Used to filter
// sessions down to those with at least one free-trial student — the check is at
// query time against the student's *current* category (categories only ever move
// free_trial -> subscribed, so a session leaves the free-trial set once its last
// trial student subscribes). An empty result makes `{ students: { $in: [] } }`
// correctly match no sessions.
export async function freeTrialPhones() {
  const docs = await Student.find({ category: 'free_trial' }, { phone: 1, _id: 0 }).lean()
  return docs.map((s) => s.phone)
}
