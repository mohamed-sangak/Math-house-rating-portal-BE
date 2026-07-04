import mongoose from 'mongoose'

const reviewerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // display name on reviews
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Set on admin password resets; tokens issued before this moment are rejected.
    passwordChangedAt: { type: Date, default: null },
    removed: { type: Boolean, default: false }, // soft-delete: blocks login, keeps reviews
  },
  { timestamps: true },
)

reviewerSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    delete ret.passwordHash // never expose the hash
    delete ret.passwordChangedAt
    return ret
  },
})

export const Reviewer = mongoose.model('Reviewer', reviewerSchema)
