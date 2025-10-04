// src/models/User.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  email: string;
  role: 'institution' | 'student';
  walletAddress?: string;
  web3AuthId: string;
  profileImage?: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required:true, unique: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, required: true, enum: ['institution', 'student'] },
    walletAddress: { type: String },
    web3AuthId: { type: String },
    profileImage: { type: String },
    name: { type: String, required: true },
    status: { type: String, default: 'pending', enum: ['active', 'pending', 'suspended'] },
    lastLogin: { type: Date }
  },
  { timestamps: true }
);

// Generate a unique userId
UserSchema.pre('save', function(next) {
  if (!this.userId) {
    const prefix = this.role === 'institution' ? 'INS' : 'STU';
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.userId = `${prefix}${randomStr}`;
  }
  next();
});

export const User = mongoose.model<IUser>('User', UserSchema);