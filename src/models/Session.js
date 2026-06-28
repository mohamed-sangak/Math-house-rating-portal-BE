import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema(
  {
    teacherName: { type: String, required: true },
    reviewerName: { type: String, default: '' },
    subject: { type: String, default: '' },
    sessionDate: { type: String, default: '' },
    sessionTime: { type: String, default: '' },
    // Rating scores keyed by field key (e.g. { punctuality: 9 }).
    // A Map keeps the dynamic, admin-defined fields flexible under a strict schema.
    ratings: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
)

sessionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    return ret
  },
})

export const Session = mongoose.model('Session', sessionSchema)
