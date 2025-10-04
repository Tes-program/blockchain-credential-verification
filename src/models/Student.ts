// src/models/Student.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IStudent extends Document {
  userId: string;
  firstName: string;
  lastName: string;
  studentId: string;
  dateOfBirth: Date;
  gender: string;
  email: string;
  phone: string;
  address: string;
  institution: string;
  program: string;
  enrollmentYear: string;
  expectedGraduation: string;
  status: string;
  credentialsCount: number;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    userId: { type: String, required: true, ref: 'User' },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    studentId: { type: String, required: true },
    dateOfBirth: { type: Date },
    gender: { type: String },
    email: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    institution: { type: String, required: true },
    program: { type: String },
    enrollmentYear: { type: String },
    expectedGraduation: { type: String },
    status: { 
      type: String, 
      default: 'active', 
      enum: ['active', 'graduated', 'inactive'] 
    },
    credentialsCount: { type: Number, default: 0 },
    lastActivity: { type: Date }
  },
  { timestamps: true }
);

export const Student = mongoose.model<IStudent>('Student', StudentSchema);