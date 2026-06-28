import mongoose from 'mongoose'

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

fieldSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    delete ret.id
    delete ret.createdAt
    delete ret.updatedAt
    return ret
  },
})

export const Field = mongoose.model('Field', fieldSchema)
