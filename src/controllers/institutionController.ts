// src/controllers/institutionController.ts
import { Request, Response } from "express";
import { Student } from "../models/Student";
import { User } from "../models/User";
import { Institution } from "../models/Institution";
import { Credential } from "../models/Credential";
import { parse } from "csv-parse/sync";
import { AuthRequest } from "../middleware/auth";

// Get all students for an institution
export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    const institutionId = req.userId;
    const {
      page = 1,
      limit = 10,
      search,
      program,
      status,
      sortBy,
      sortOrder,
    } = req.query;

    // Get institution details
    const institution = await Institution.findOne({ userId: institutionId });

    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution not found",
      });
    }

    // Build filter query
    const filter: any = {
      institution: institution.name, // Match by institution name
    };

    // Additional filters
    if (search) {
      const searchRegex = new RegExp(search as string, "i");
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { studentId: searchRegex },
      ];
    }

    if (program && program !== "all") {
      filter.program = program;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    // Build sort options
    const sortOptions: any = {};
    if (sortBy) {
      sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;
    } else {
      // Default sort by name
      sortOptions.lastName = 1;
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const students = await Student.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Student.countDocuments(filter);

    // Get stats
    const stats = {
      total,
      active: await Student.countDocuments({ ...filter, status: "active" }),
      graduated: await Student.countDocuments({
        ...filter,
        status: "graduated",
      }),
      inactive: await Student.countDocuments({ ...filter, status: "inactive" }),
    };

    // Format student data
    const formattedStudents = students.map((student) => ({
      id: student.userId,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      email: student.email,
      program: student.program,
      enrollmentYear: student.enrollmentYear,
      expectedGraduation: student.expectedGraduation,
      credentialsCount: student.credentialsCount,
      status: student.status,
      lastActivity: student.lastActivity,
    }));

    return res.status(200).json({
      students: formattedStudents,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      stats,
    });
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get students",
      error: error.message,
    });
  }
};

// Add a new student
export const addStudent = async (req: AuthRequest, res: Response) => {
  try {
    const institutionId = req.userId;
    const {
      firstName,
      lastName,
      email,
      studentId,
      program,
      enrollmentYear,
      expectedGraduation,
      dateOfBirth,
      gender,
    } = req.body;

    // Get institution details
    const institution = await Institution.findOne({ userId: institutionId });

    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution not found",
      });
    }

    // Check if student with this email already exists
    const existingStudent = await Student.findOne({ email });

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: "A student with this email already exists",
      });
    }

    // Check if student ID is already in use at this institution
    const existingStudentId = await Student.findOne({
      institution: institution.name,
      studentId,
    });

    if (existingStudentId) {
      return res.status(400).json({
        success: false,
        message: "A student with this ID already exists at your institution",
      });
    }

    // const prefix = "STU";
    // const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    // const userId = `${prefix}${randomStr}`;

    // Create user account for student
    const user = new User({
      email,
      name: `${firstName} ${lastName}`,
      role: "student",
      status: "pending", // They need to complete registration
    });

    await user.save();

    // Create student profile
    const student = new Student({
      userId: user.userId,
      firstName,
      lastName,
      studentId,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      email,
      institution: institution.name,
      program,
      enrollmentYear,
      expectedGraduation,
      status: "active",
      credentialsCount: 0,
    });

    await student.save();

    // In a real app, send invitation email here

    return res.status(201).json({
      success: true,
      student: {
        id: student.userId,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        email: student.email,
        program: student.program,
        status: student.status,
      },
    });
  } catch (error) {
    console.error("Add student error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add student",
      error: error.message,
    });
  }
};

// Import students via CSV
export const importStudents = async (req: AuthRequest, res: Response) => {
  try {
    const institutionId = req.userId;

    // Get institution details
    const institution = await Institution.findOne({ userId: institutionId });

    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution not found",
      });
    }

    // Check if CSV file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No CSV file uploaded",
      });
    }

    // Parse CSV file
    const csvData = req.file.buffer.toString("utf8");
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (!records.length) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty or invalid",
      });
    }

    // Process records
    const results = {
      imported: 0,
      errors: [] as Array<{ row: number; error: string }>,
      duplicates: 0,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        // Validate required fields
        if (
          !record.firstName ||
          !record.lastName ||
          !record.email ||
          !record.studentId
        ) {
          results.errors.push({
            row: i + 2, // +2 because CSV has header and is 1-indexed
            error:
              "Missing required fields (firstName, lastName, email, or studentId)",
          });
          continue;
        }

        // Check if student with this email already exists
        const existingStudent = await Student.findOne({ email: record.email });

        if (existingStudent) {
          results.duplicates++;
          continue;
        }

        // Check if student ID is already in use at this institution
        const existingStudentId = await Student.findOne({
          institution: institution.name,
          studentId: record.studentId,
        });

        if (existingStudentId) {
          results.errors.push({
            row: i + 2,
            error: "Student ID already exists at this institution",
          });
          continue;
        }

        // Create user account for student
        const user = new User({
          email: record.email,
          name: `${record.firstName} ${record.lastName}`,
          role: "student",
          status: "pending", // They need to complete registration
        });

        await user.save();

        // Create student profile
        const student = new Student({
          userId: user.userId,
          firstName: record.firstName,
          lastName: record.lastName,
          studentId: record.studentId,
          dateOfBirth: record.dateOfBirth
            ? new Date(record.dateOfBirth)
            : undefined,
          gender: record.gender,
          email: record.email,
          institution: institution.name,
          program: record.program,
          enrollmentYear: record.enrollmentYear,
          expectedGraduation: record.expectedGraduation,
          status: "active",
          credentialsCount: 0,
        });

        await student.save();
        results.imported++;
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Import students error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to import students",
      error: error.message,
    });
  }
};

// Get specific student details
export const getStudentDetails = async (req: AuthRequest, res: Response) => {
  try {
    const institutionId = req.userId;
    const { id } = req.params;

    // Get institution details
    const institution = await Institution.findOne({ userId: institutionId });

    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution not found",
      });
    }

    // Find student
    const student = await Student.findOne({ userId: id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check if student belongs to this institution
    if (student.institution !== institution.name) {
      return res.status(403).json({
        success: false,
        message: "This student is not enrolled at your institution",
      });
    }

    // Get credentials for this student
    const credentials = await Credential.find({ recipientId: id }).sort({
      issueDate: -1,
    });

    // Format credential data
    const formattedCredentials = credentials.map((cred) => ({
      id: cred.credentialId,
      credentialType: cred.credentialType,
      credentialName: cred.credentialName,
      issueDate: cred.issueDate,
      status: cred.status,
    }));

    // Create activity log (in a real app, this would come from a separate activity model)
    const activity = [
      {
        type: "login",
        date: student.lastActivity || new Date(),
        details: "Logged into the platform",
      },
    ];

    if (credentials.length > 0) {
      activity.push({
        type: "credential",
        date: credentials[0].issueDate,
        details: `Received credential: ${credentials[0].credentialName}`,
      });
    }

    return res.status(200).json({
      id: student.userId,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      email: student.email,
      phone: student.phone,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      program: student.program,
      enrollmentYear: student.enrollmentYear,
      expectedGraduation: student.expectedGraduation,
      status: student.status,
      address: student.address,
      credentials: formattedCredentials,
      activity,
    });
  } catch (error) {
    console.error("Get student details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get student details",
      error: error.message,
    });
  }
};
