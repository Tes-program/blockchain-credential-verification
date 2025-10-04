// src/models/Credential.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface ICredential extends Document {
  credentialId: string;
  credentialType: string;
  credentialName: string;
  description: string;
  category: string;
  issuerId: string;
  recipientId: string;
  recipientName: string;
  recipientStudentId: string;
  issueDate: Date;
  expiryDate?: Date;
  status: string;
  revokedDate?: Date;
  revokedReason?: string;
  metadata: Record<string, any>;
  blockchainTxHash: string;
  ipfsHash: string;
  verifications: number;
  lastVerified?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CredentialSchema = new Schema<ICredential>(
  {
    credentialId: { type: String, required: true, unique: true },
    credentialType: { type: String, required: true },
    credentialName: { type: String, required: true },
    description: { type: String },
    category: { 
      type: String, 
      required: true, 
      enum: ['Degree', 'Certificate', 'Award'] 
    },
    issuerId: { type: String, required: true, ref: 'User' },
    recipientId: { type: String, required: true, ref: 'User' },
    recipientName: { type: String, required: true },
    recipientStudentId: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date },
    status: { 
      type: String, 
      default: 'active', 
      enum: ['active', 'revoked', 'expired'] 
    },
    revokedDate: { type: Date },
    revokedReason: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    blockchainTxHash: { type: String, required: true },
    ipfsHash: { type: String, required: true },
    verifications: { type: Number, default: 0 },
    lastVerified: { type: Date }
  },
  { timestamps: true }
);

// Generate unique credentialId
CredentialSchema.pre('save', async function(next) {
  if (!this.credentialId) {
    const prefix = 'CRED';
    const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
    this.credentialId = `${prefix}${randomStr}`;
  }
  next();
});

export const Credential = mongoose.model<ICredential>('Credential', CredentialSchema);