import mongoose from 'mongoose'

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    // Soft delete: removed teachers stay in the dashboard but leave the form.
    removed: { type: Boolean, default: false },
  },
  { timestamps: true },
)

// Expose `id` (string) and hide Mongo internals so the API shape is stable.
teacherSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    return ret
  },
})

export const Teacher = mongoose.model('Teacher', teacherSchema)
