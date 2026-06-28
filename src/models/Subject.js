import mongoose from 'mongoose'

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true },
)

subjectSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    delete ret.createdAt
    delete ret.updatedAt
    return ret
  },
})

export const Subject = mongoose.model('Subject', subjectSchema)
