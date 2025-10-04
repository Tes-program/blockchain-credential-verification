import { Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { User } from "../models/User";
import { Institution } from "../models/Institution";
import { Student } from "../models/Student";
import config from "../config";

interface AuthRequest extends Request {
  headers: Request["headers"];
  userId?: string;
  userRole?: string;
  body: any;
}

export const register = async (req: Request, res: Response) => {
  try {
    const {
      email,
      name,
      role,
      web3AuthId,
      walletAddress,
      institutionDetails,
      studentDetails,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const prefix = role === "institution" ? "INS" : "STU";
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userId = `${prefix}${randomStr}`;

    // Create new user
    const user = new User({
      userId,
      email,
      name,
      role,
      web3AuthId,
      walletAddress,
      status: "active",
    });

    await user.save();

    // Create role-specific profile
    if (role === "institution" && institutionDetails) {
      const institution = new Institution({
        userId: user.userId,
        name: institutionDetails.institutionName || name,
        type: institutionDetails.institutionType,
        country: institutionDetails.country,
        address: institutionDetails.address,
        website: institutionDetails.website,
        contactEmail: institutionDetails.contactEmail || email,
        contactPhone: institutionDetails.contactPhone,
        description: institutionDetails.description,
        yearEstablished: institutionDetails.yearEstablished,
        verificationStatus: "pending",
      });

      await institution.save();
    } else if (role === "student" && studentDetails) {
      const student = new Student({
        userId: user.userId,
        firstName: studentDetails.firstName,
        lastName: studentDetails.lastName,
        studentId: studentDetails.studentId,
        dateOfBirth: studentDetails.dateOfBirth,
        gender: studentDetails.gender,
        email,
        institution: studentDetails.institution,
        program: studentDetails.program,
        enrollmentYear: studentDetails.enrollmentYear,
        expectedGraduation: studentDetails.expectedGraduation,
        status: "active",
        credentialsCount: 0,
      });

      await student.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.expiresIn } as SignOptions
    );

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return res.status(201).json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Login using Web3Auth
export const login = async (req: Request, res: Response) => {
  try {
    const { web3AuthId, walletAddress } = req.body;

    // Find user by Web3Auth ID
    const user = await User.findOne({ web3AuthId });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not registered",
      });
    }

    // Update wallet address if provided
    if (walletAddress && user.walletAddress !== walletAddress) {
      user.walletAddress = walletAddress;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.expiresIn } as SignOptions
    );

    return res.status(200).json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        walletAddress: user.walletAddress,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// Get user profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let profileData: any = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      profileImage: user.profileImage,
      walletAddress: user.walletAddress,
    };

    // Add role-specific details
    if (user.role === "institution") {
      const institution = await Institution.findOne({ userId: user.userId });
      if (institution) {
        profileData.institutionDetails = {
          institutionName: institution.name,
          institutionType: institution.type,
          country: institution.country,
          address: institution.address,
          website: institution.website,
          contactEmail: institution.contactEmail,
          contactPhone: institution.contactPhone,
          description: institution.description,
          yearEstablished: institution.yearEstablished,
          verificationStatus: institution.verificationStatus,
        };
      }
    } else if (user.role === "student") {
      const student = await Student.findOne({ userId: user.userId });
      if (student) {
        profileData.studentDetails = {
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          gender: student.gender,
          studentId: student.studentId,
          institution: student.institution,
          program: student.program,
          enrollmentYear: student.enrollmentYear,
          expectedGraduation: student.expectedGraduation,
          status: student.status,
          credentialsCount: student.credentialsCount,
        };
      }
    }

    return res.status(200).json(profileData);
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

// Update user profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const updateData = req.body;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user fields
    if (updateData.name) user.name = updateData.name;
    if (updateData.email) user.email = updateData.email;
    if (updateData.profileImage) user.profileImage = updateData.profileImage;

    await user.save();

    // Update role-specific details
    if (user.role === "institution" && updateData.institutionDetails) {
      const institution = await Institution.findOne({ userId: user.userId });

      if (institution) {
        const { institutionDetails } = updateData;

        if (institutionDetails.institutionName)
          institution.name = institutionDetails.institutionName;
        if (institutionDetails.institutionType)
          institution.type = institutionDetails.institutionType;
        if (institutionDetails.country)
          institution.country = institutionDetails.country;
        if (institutionDetails.address)
          institution.address = institutionDetails.address;
        if (institutionDetails.website)
          institution.website = institutionDetails.website;
        if (institutionDetails.contactEmail)
          institution.contactEmail = institutionDetails.contactEmail;
        if (institutionDetails.contactPhone)
          institution.contactPhone = institutionDetails.contactPhone;
        if (institutionDetails.description)
          institution.description = institutionDetails.description;
        if (institutionDetails.yearEstablished)
          institution.yearEstablished = institutionDetails.yearEstablished;

        await institution.save();
      }
    } else if (user.role === "student" && updateData.studentDetails) {
      const student = await Student.findOne({ userId: user.userId });

      if (student) {
        const { studentDetails } = updateData;

        if (studentDetails.firstName)
          student.firstName = studentDetails.firstName;
        if (studentDetails.lastName) student.lastName = studentDetails.lastName;
        if (studentDetails.dateOfBirth)
          student.dateOfBirth = new Date(studentDetails.dateOfBirth);
        if (studentDetails.gender) student.gender = studentDetails.gender;
        if (studentDetails.phone) student.phone = studentDetails.phone;
        if (studentDetails.address) student.address = studentDetails.address;

        await student.save();
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};
