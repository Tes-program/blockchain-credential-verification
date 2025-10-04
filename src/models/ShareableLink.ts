// src/models/ShareableLink.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IShareableLink extends Document {
  shareId: string;
  credentialId: string;
  ownerId: string;
  createdAt: Date;
  expiryDate?: Date;
  accessLevel: string;
  accessCount: number;
  lastAccessed?: Date;
  recipientEmail?: string;
  status: string;
  updatedAt: Date;
}

const ShareableLinkSchema = new Schema<IShareableLink>(
  {
    shareId: { type: String, required: true, unique: true },
    credentialId: { type: String, required: true, ref: 'Credential' },
    ownerId: { type: String, required: true, ref: 'User' },
    expiryDate: { type: Date },
    accessLevel: { 
      type: String, 
      required: true, 
      enum: ['full', 'limited', 'verification'] 
    },
    accessCount: { type: Number, default: 0 },
    lastAccessed: { type: Date },
    recipientEmail: { type: String },
    status: { 
      type: String, 
      default: 'active', 
      enum: ['active', 'expired', 'revoked'] 
    }
  },
  { timestamps: true }
);

// Generate unique shareId
ShareableLinkSchema.pre('save', async function(next) {
  if (!this.shareId) {
    const prefix = 'SHARE';
    const randomStr = Math.random().toString(36).substring(2, 10);
    this.shareId = `${prefix}${randomStr}`;
  }
  next();
});

export const ShareableLink = mongoose.model<IShareableLink>('ShareableLink', ShareableLinkSchema);