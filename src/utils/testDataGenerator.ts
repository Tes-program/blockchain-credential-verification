// src/utils/testDataGenerator.js
import { faker } from "@faker-js/faker";
import PDFDocument from "pdfkit";
import { uploadToIPFS } from "../ipfs/ipfsService";
import { Credential } from "../models/Credential";
import { Student } from "../models/Student";
import { User } from "../models/User";
import mongoose from "mongoose";

/**
 * Generate realistic test credentials
 */
export const generateCredentials = (count) => {
  const credentials = [];
  const degrees = [
    "Bachelor of Science",
    "Bachelor of Arts",
    "Master of Science",
    "Master of Arts",
    "PhD",
  ];
  const majors = [
    "Computer Science",
    "Engineering",
    "Business",
    "Medicine",
    "Law",
    "Education",
  ];

  for (let i = 0; i < count; i++) {
    const degree = degrees[Math.floor(Math.random() * degrees.length)];
    const major = majors[Math.floor(Math.random() * majors.length)];

    credentials.push({
      studentId: `STU${faker.string.alphanumeric(8).toUpperCase()}`,
      name: `${degree} in ${major}`,
      degree: degree,
      description: faker.lorem.paragraph(),
      category: degree.includes("Bachelor")
        ? "Degree"
        : degree.includes("Master")
        ? "Degree"
        : "Certificate",
      metadata: {
        major: major,
        gpa: (Math.random() * 2 + 2).toFixed(2), // GPA between 2.0 and 4.0
        graduationDate: faker.date.recent().toISOString(),
        honors: Math.random() > 0.7 ? "Cum Laude" : null,
        creditsEarned: Math.floor(Math.random() * 60 + 120),
      },
      issueDate: new Date().toISOString(),
      expiryDate: null,
    });
  }

  return credentials;
};

/**
 * Generate test PDF of specified size
 */
export const generateTestPDF = async (sizeKB = 10) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(pdfBuffer);
    });
    doc.on("error", reject);

    // Add content to reach target size
    doc.fontSize(12).text("Academic Credential Verification System", 100, 100);
    doc.text("Test Certificate Document", 100, 120);
    doc.text(`Generated: ${new Date().toISOString()}`, 100, 140);

    // Add padding text to reach target size
    const targetBytes = sizeKB * 1024;
    const paddingText = faker.lorem.paragraphs(Math.ceil(targetBytes / 500));
    doc.text(paddingText, 100, 180);

    doc.end();
  });
};

/**
 * Upload file to IPFS
 */
export const uploadTestToIPFS = async (data) => {
  try {
    const ipfsHash = await uploadToIPFS(data);
    return ipfsHash;
  } catch (error) {
    console.error("IPFS upload error:", error);
    throw error;
  }
};

/**
 * Create test students in database
 */
export const createTestStudents = async (count, institutionName) => {
  const students = [];

//   // Check database connection
//   if (mongoose.connection.readyState !== 1) {
//     throw new Error(
//       "Database not connected. Please ensure MongoDB is running."
//     );
//   }

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName });

    try {
      // Create user account
      const user = new User({
        userId: `TEST_STU${faker.string.alphanumeric(6).toUpperCase()}`,
        email,
        name: `${firstName} ${lastName}`,
        role: "student",
        status: "active",
      });

      await user.save();

      // Create student profile
      const student = new Student({
        userId: user.userId,
        firstName,
        lastName,
        studentId: `STU${faker.string.alphanumeric(8).toUpperCase()}`,
        dateOfBirth: faker.date.birthdate(),
        gender: faker.person.sex(),
        email,
        institution: institutionName,
        program: faker.helpers.arrayElement([
          "Computer Science",
          "Engineering",
          "Business",
          "Medicine",
        ]),
        enrollmentYear: faker.date
          .between({ from: "2018-01-01", to: "2022-12-31" })
          .getFullYear()
          .toString(),
        expectedGraduation: faker.date
          .future({ years: 2 })
          .getFullYear()
          .toString(),
        status: "active",
        credentialsCount: 0,
      });

      await student.save();
      students.push(student);

      // Log progress for large batches
      if ((i + 1) % 10 === 0) {
        console.log(`  Created ${i + 1}/${count} students`);
      }
    } catch (error) {
      console.error(`Failed to create student ${i + 1}:`, error.message);
      throw error;
    }
  }

  return students;
};

/**
 * Clean up test data from MongoDB
 */
export const cleanupTestData = async (testPrefix = "TEST_") => {
  try {
    // Delete test credentials
    const deletedCredentials = await Credential.deleteMany({
      credentialId: { $regex: `^${testPrefix}` },
    });

    // Delete test students
    const testStudents = await Student.find({
      studentId: { $regex: `^${testPrefix}` },
    });

    const testUserIds = testStudents.map((s) => s.userId);

    // Delete test users
    const deletedUsers = await User.deleteMany({
      userId: { $in: testUserIds },
    });

    // Delete test student profiles
    const deletedStudents = await Student.deleteMany({
      studentId: { $regex: `^${testPrefix}` },
    });

    return {
      credentials: deletedCredentials.deletedCount,
      users: deletedUsers.deletedCount,
      students: deletedStudents.deletedCount,
    };
  } catch (error) {
    console.error("Cleanup error:", error);
    throw error;
  }
};

/**
 * Generate batch of credentials with IPFS uploads
 */
export const generateBatchWithIPFS = async (count, includeIPFS = true) => {
  const credentials = generateCredentials(count);

  if (includeIPFS) {
    for (const cred of credentials) {
      try {
        // Generate and upload PDF
        const pdf = await generateTestPDF(10);
        const ipfsHash = await uploadTestToIPFS(pdf);
        cred.ipfsHash = ipfsHash;
      } catch (error) {
        console.error(`Failed to upload IPFS for credential: ${error.message}`);
        cred.ipfsHash = null;
      }
    }
  }

  return credentials;
};
