import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema(
  {
    teacherName: { type: String, required: true },
    reviewerName: { type: String, default: '' },
    subject: { type: String, default: '' },
    // When the session took place, as a single UTC datetime. The API still
    // exposes it as separate YYYY-MM-DD / HH:MM strings (see lib/dates.js).
    sessionAt: { type: Date, default: null },
    // Students covered in the session. Each has a name and a category.
    students: {
      type: [
        {
          _id: false,
          name: { type: String, required: true, trim: true },
          category: { type: String, enum: ['free_trial', 'subscribed'], required: true },
        },
      ],
      default: [],
    },
    // Rating scores keyed by field key (e.g. { punctuality: 9 }).
    // A Map keeps the dynamic, admin-defined fields flexible under a strict schema.
    ratings: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
)

// Supports the list/stats queries: filter by teacher + sort/range by sessionAt.
sessionSchema.index({ teacherName: 1, sessionAt: -1 })
sessionSchema.index({ sessionAt: -1 })

sessionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    return ret
  },
})

export const Session = mongoose.model('Session', sessionSchema)
