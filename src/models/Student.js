import mongoose from 'mongoose'

const studentSchema = new mongoose.Schema(
  {
    // Normalized digits (see normalizePhone in routes/sessions.js). The unique
    // index is what makes a phone belong to exactly one student system-wide.
    phone: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Latest known category; a student's history lives in the sessions they appear in.
    category: { type: String, enum: ['free_trial', 'subscribed'], required: true },
  },
  { timestamps: true },
)

studentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    return ret
  },
})

export const Student = mongoose.model('Student', studentSchema)
