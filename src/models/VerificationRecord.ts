// src/models/VerificationRecord.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IVerificationRecord extends Document {
  credentialId: string;
  verifierId?: string;
  verifierType: string;
  verifierName?: string;
  verificationDate: Date;
  verificationMethod: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    city?: string;
    coordinates?: [number, number];
  };
  createdAt: Date;
}

const VerificationRecordSchema = new Schema<IVerificationRecord>(
  {
    credentialId: { type: String, required: true, ref: 'Credential' },
    verifierId: { type: String, ref: 'User' },
    verifierType: { 
      type: String, 
      required: true, 
      enum: ['public', 'employer', 'institution'] 
    },
    verifierName: { type: String },
    verificationDate: { type: Date, default: Date.now },
    verificationMethod: { 
      type: String, 
      required: true, 
      enum: ['direct', 'shared-link', 'QR'] 
    },
    status: { 
      type: String, 
      required: true, 
      enum: ['success', 'failed'] 
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    location: {
      country: { type: String },
      city: { type: String },
      coordinates: { type: [Number], index: '2dsphere' },
    }
  },
  { timestamps: true }
);

export const VerificationRecord = mongoose.model<IVerificationRecord>('VerificationRecord', VerificationRecordSchema);