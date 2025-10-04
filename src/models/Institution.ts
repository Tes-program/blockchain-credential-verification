// src/models/Institution.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IInstitution extends Document {
  userId: string;
  name: string;
  type: string;
  country: string;
  address: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  yearEstablished: string;
  verificationStatus: string;
  blockchainAddress: string;
  publicKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const InstitutionSchema = new Schema<IInstitution>(
  {
    userId: { type: String, required: true, ref: 'User' },
    name: { type: String, required: true },
    type: { type: String, required: true },
    country: { type: String, required: true },
    address: { type: String },
    website: { type: String },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String },
    description: { type: String },
    yearEstablished: { type: String },
    verificationStatus: { 
      type: String, 
      default: 'pending', 
      enum: ['verified', 'pending', 'unverified'] 
    },
    blockchainAddress: { type: String },
    publicKey: { type: String }
  },
  { timestamps: true }
);

export const Institution = mongoose.model<IInstitution>('Institution', InstitutionSchema);