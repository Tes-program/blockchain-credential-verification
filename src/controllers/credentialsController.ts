// src/controllers/credentialController.ts
import { Request, Response } from "express";
import crypto from "crypto";
import { Credential } from "../models/Credential";
import { User } from "../models/User";
import { Student } from "../models/Student";
import { Institution } from "../models/Institution";
import { ShareableLink } from "../models/ShareableLink";
import { uploadToIPFS } from "../ipfs/ipfsService";
import {
  issueCredential,
  revokeCredential,
} from "../blockchain/contractService";
import config from "../config";

interface AuthRequest extends Request {
  headers: Request["headers"];
  userId?: string;
  userRole?: string;
  body: any;
  query: any;
  params: any;
}

// Issue a new credential
export const issueNewCredential = async (req: AuthRequest, res: Response) => {
  try {
    const issuerId = req.userId;
    const {
      recipientId,
      credentialType,
      credentialName,
      description,
      issueDate,
      expiryDate,
      category,
      metadata,
    } = req.body;

    const credentialId = `CRED-${crypto.randomBytes(4).toString("hex")}`;


    // Verify issuer is an institution
    const issuer = await User.findOne({ userId: issuerId });
    if (!issuer || issuer.role !== "institution") {
      return res.status(403).json({
        success: false,
        message: "Only institutions can issue credentials",
      });
    }

    // Verify recipient exists
    const recipient = await User.findOne({ userId: recipientId });
    if (!recipient || recipient.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Recipient not found or is not a student",
      });
    }

    // Get recipient details
    const student = await Student.findOne({ userId: recipientId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Get institution details
    const institution = await Institution.findOne({ userId: issuerId });
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution profile not found",
      });
    }

    // Create credential document to store on IPFS
    const credentialDocument = {
      credentialType,
      credentialName,
      description,
      category,
      issuer: {
        name: institution.name,
        country: institution.country,
        userId: issuerId,
      },
      recipient: {
        name: `${student.firstName} ${student.lastName}`,
        studentId: student.studentId,
        userId: recipientId,
      },
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      metadata,
      issuedOn: new Date(),
    };

    // Generate hash of the credential
    const credentialHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(credentialDocument))
      .digest("hex");

    // Upload to IPFS
    const ipfsHash = await uploadToIPFS(credentialDocument);

    // Issue on blockchain
    if (!issuer.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Institution wallet address not found",
      });
    }

    // In a real implementation, the institution's private key would be securely managed
    // For demo purposes, we're using a fixed key from config
    const blockchainResult = await issueCredential(
      config.blockchain.institutionPrivateKey,
      credentialId,
      recipientId,
      credentialHash,
      ipfsHash,
      expiryDate ? Math.floor(new Date(expiryDate).getTime() / 1000) : 0
    );

    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to issue credential on blockchain",
        error: blockchainResult.error,
      });
    }

    // Create credential in database
    const credential = new Credential({
      credentialId: credentialId,
      credentialType,
      credentialName,
      description,
      category,
      issuerId,
      recipientId,
      recipientName: `${student.firstName} ${student.lastName}`,
      recipientStudentId: student.studentId,
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      status: "active",
      metadata,
      blockchainTxHash: blockchainResult.txHash,
      ipfsHash,
      verifications: 0,
    });

    await credential.save();

    // Update student's credentials count
    student.credentialsCount += 1;
    await student.save();

    return res.status(201).json({
      success: true,
      credential: {
        credentialId: credential.credentialId,
        credentialType: credential.credentialType,
        recipientName: credential.recipientName,
        issueDate: credential.issueDate,
        blockchainTxHash: credential.blockchainTxHash,
        ipfsHash: credential.ipfsHash,
      },
    });
  } catch (error) {
    console.error("Issue credential error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to issue credential",
      error: error.message,
    });
  }
};

// Get credentials (filtered by role)
export const getCredentials = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      sortBy,
      sortOrder,
    } = req.query;

    // Build filter query
    const filter: any = {};

    // Role-based filtering
    if (userRole === "institution") {
      filter.issuerId = userId;
    } else if (userRole === "student") {
      filter.recipientId = userId;
    }

    // Additional filters
    if (search) {
      filter.$or = [
        { credentialName: { $regex: search, $options: "i" } },
        { credentialType: { $regex: search, $options: "i" } },
        { recipientName: { $regex: search, $options: "i" } },
      ];
    }

    if (category && category !== "All Categories") {
      filter.category = category;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    // Build sort options
    const sortOptions: any = {};
    if (sortBy) {
      sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;
    } else {
      sortOptions.issueDate = -1; // Default sort by issue date (newest first)
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const credentials = await Credential.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Credential.countDocuments(filter);

    // Format response based on role
    const formattedCredentials = credentials.map((cred) => {
      const base = {
        id: cred._id,
        credentialId: cred.credentialId,
        credentialType: cred.credentialType,
        credentialName: cred.credentialName,
        category: cred.category,
        issueDate: cred.issueDate,
        expiryDate: cred.expiryDate,
        status: cred.status,
        verifications: cred.verifications,
        lastVerified: cred.lastVerified,
      };

      // Add role-specific fields
      if (userRole === "institution") {
        return {
          ...base,
          recipientName: cred.recipientName,
          recipientId: cred.recipientId,
        };
      } else {
        return {
          ...base,
          institution: cred.issuerId, // This would typically be the institution name
          shared: 0, // This would be calculated from ShareableLink records
        };
      }
    });

    return res.status(200).json({
      credentials: formattedCredentials,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get credentials error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get credentials",
      error: error.message,
    });
  }
};

// Get specific credential details
export const getCredentialDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;
    const { id } = req.params;

    const credential = await Credential.findOne({ credentialId: id });

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: "Credential not found",
      });
    }

    // Check access rights
    if (userRole === "institution" && credential.issuerId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You did not issue this credential",
      });
    }

    if (userRole === "student" && credential.recipientId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: This credential does not belong to you",
      });
    }

    // Get issuer details
    const issuer = await Institution.findOne({ userId: credential.issuerId });

    // Get recipient details
    const recipient = await Student.findOne({ userId: credential.recipientId });

    // Format response
    const response = {
      id: credential._id,
      credentialId: credential.credentialId,
      credentialType: credential.credentialType,
      credentialName: credential.credentialName,
      description: credential.description,
      category: credential.category,
      issueDate: credential.issueDate,
      expiryDate: credential.expiryDate,
      status: credential.status,
      revokedDate: credential.revokedDate,
      revokedReason: credential.revokedReason,
      metadata: credential.metadata,
      recipient: {
        id: credential.recipientId,
        name: credential.recipientName,
        studentId: credential.recipientStudentId,
      },
      issuer: {
        id: credential.issuerId,
        name: issuer ? issuer.name : "Unknown Institution",
      },
      blockchain: {
        txHash: credential.blockchainTxHash,
        verificationUrl: `https://etherscan.io/tx/${credential.blockchainTxHash}`,
        ipfsHash: credential.ipfsHash,
      },
      verifications: {
        count: credential.verifications,
        lastVerified: credential.lastVerified,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Get credential details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get credential details",
      error: error.message,
    });
  }
};


export const issueBatchCredentials = async (req: AuthRequest, res: Response) => {
  try {
    const issuerId = req.userId;
    const { credentials } = req.body;

    // Validate input
    if (!credentials || !Array.isArray(credentials)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request: 'credentials' array is required",
      });
    }

    // Enforce batch size limit
    const MAX_BATCH_SIZE = 50;
    if (credentials.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE}`,
      });
    }

    // Verify issuer is an institution
    const issuer = await User.findOne({ userId: issuerId });
    if (!issuer || issuer.role !== "institution") {
      return res.status(403).json({
        success: false,
        message: "Only institutions can issue credentials",
      });
    }

    const institution = await Institution.findOne({ userId: issuerId });
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: "Institution profile not found",
      });
    }

    // Results tracking
    const results = {
      successful: [],
      failed: [],
      totalGasUsed: "0",
      totalTimeMs: 0,
    };

    const startTime = Date.now();

    // Validate all credentials before processing
    for (let i = 0; i < credentials.length; i++) {
      const cred = credentials[i];
      
      // Basic validation
      if (!cred.studentId || !cred.name || !cred.degree) {
        results.failed.push({
          index: i,
          studentId: cred.studentId,
          error: "Missing required fields",
        });
        continue;
      }

      // Check if recipient exists
      const recipient = await Student.findOne({ studentId: cred.studentId });
      if (!recipient) {
        results.failed.push({
          index: i,
          studentId: cred.studentId,
          error: "Student not found",
        });
        continue;
      }
    }

    // Process valid credentials in batches
    const validCredentials = credentials.filter((_, index) => 
      !results.failed.find(f => f.index === index)
    );

    // Process each credential
    for (const credData of validCredentials) {
      try {
        const credentialId = `CRED-${crypto.randomBytes(4).toString("hex")}`;
        const student = await Student.findOne({ studentId: credData.studentId });
        const recipientUser = await User.findOne({ userId: student.userId });

        // Create credential document for IPFS
        const credentialDocument = {
          credentialType: credData.degree,
          credentialName: credData.name,
          description: credData.description || "",
          category: credData.category || "Degree",
          issuer: {
            name: institution.name,
            country: institution.country,
            userId: issuerId,
          },
          recipient: {
            name: `${student.firstName} ${student.lastName}`,
            studentId: student.studentId,
            userId: student.userId,
          },
          issueDate: new Date(),
          expiryDate: credData.expiryDate ? new Date(credData.expiryDate) : null,
          metadata: credData.metadata || {},
          issuedOn: new Date(),
        };

        // Generate hash
        const credentialHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(credentialDocument))
          .digest("hex");

        // Upload to IPFS
        let ipfsHash = credData.ipfsHash;
        if (!ipfsHash) {
          ipfsHash = await uploadToIPFS(credentialDocument);
        }

        // Issue on blockchain with gas tracking
        const gasStartTime = Date.now();
        const blockchainResult = await issueCredential(
          config.blockchain.institutionPrivateKey,
          credentialId,
          student.userId,
          credentialHash,
          ipfsHash,
          credData.expiryDate ? Math.floor(new Date(credData.expiryDate).getTime() / 1000) : 0
        );

        if (!blockchainResult.success) {
          results.failed.push({
            index: credentials.indexOf(credData),
            studentId: credData.studentId,
            error: blockchainResult.error,
          });
          continue;
        }

        // Save to database
        const credential = new Credential({
          credentialId,
          credentialType: credData.degree,
          credentialName: credData.name,
          description: credData.description || "",
          category: credData.category || "Degree",
          issuerId,
          recipientId: student.userId,
          recipientName: `${student.firstName} ${student.lastName}`,
          recipientStudentId: student.studentId,
          issueDate: new Date(),
          expiryDate: credData.expiryDate ? new Date(credData.expiryDate) : undefined,
          status: "active",
          metadata: credData.metadata || {},
          blockchainTxHash: blockchainResult.txHash,
          ipfsHash,
          verifications: 0,
        });

        await credential.save();

        // Update student's credentials count
        student.credentialsCount += 1;
        await student.save();

        results.successful.push({
          credentialId,
          studentId: credData.studentId,
          txHash: blockchainResult.txHash,
          ipfsHash,
          gasUsed: blockchainResult.gasUsed || "0",
          timeMs: Date.now() - gasStartTime,
        });

      } catch (error) {
        results.failed.push({
          index: credentials.indexOf(credData),
          studentId: credData.studentId,
          error: error.message,
        });
      }

      // Add delay between transactions to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    results.totalTimeMs = Date.now() - startTime;

    // Calculate total gas
    results.totalGasUsed = results.successful
      .reduce((sum, item) => sum + BigInt(item.gasUsed || 0), BigInt(0))
      .toString();

    return res.status(200).json({
      success: true,
      summary: {
        total: credentials.length,
        successful: results.successful.length,
        failed: results.failed.length,
        totalGasUsed: results.totalGasUsed,
        totalTimeMs: results.totalTimeMs,
        avgTimePerCredential: results.totalTimeMs / credentials.length,
      },
      results,
    });

  } catch (error) {
    console.error("Batch credential issuance error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to issue batch credentials",
      error: error.message,
    });
  }
};


// Revoke a credential
export const revokeACredential = async (req: AuthRequest, res: Response) => {
  try {
    const issuerId = req.userId;
    const { id } = req.params;
    const { reason } = req.body;

    const credential = await Credential.findOne({ credentialId: id });

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: "Credential not found",
      });
    }

    // Check if user is the issuer
    if (credential.issuerId !== issuerId) {
      return res.status(403).json({
        success: false,
        message: "Only the issuing institution can revoke a credential",
      });
    }

    // Check if already revoked
    if (credential.status === "revoked") {
      return res.status(400).json({
        success: false,
        message: "Credential is already revoked",
      });
    }

    // Revoke on blockchain
    const issuer = await User.findOne({ userId: issuerId });
    if (!issuer || !issuer.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Institution wallet address not found",
      });
    }

    const blockchainResult = await revokeCredential(
      config.blockchain.institutionPrivateKey,
      credential.credentialId
    );

    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to revoke credential on blockchain",
        error: blockchainResult.error,
      });
    }

    // Update in database
    credential.status = "revoked";
    credential.revokedDate = new Date();
    credential.revokedReason = reason;

    await credential.save();

    return res.status(200).json({
      success: true,
      credential: {
        credentialId: credential.credentialId,
        status: credential.status,
        revokedDate: credential.revokedDate,
        revokedReason: credential.revokedReason,
        blockchainTxHash: blockchainResult.txHash,
      },
    });
  } catch (error) {
    console.error("Revoke credential error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke credential",
      error: error.message,
    });
  }
};

// Share a credential
export const shareCredential = async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;
    const { accessLevel, expiryDate, recipientEmail, message } = req.body;

    const credential = await Credential.findOne({ credentialId: id });

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: "Credential not found",
      });
    }

    // Check if user is the credential owner
    if (credential.recipientId !== ownerId) {
      return res.status(403).json({
        success: false,
        message: "Only the credential owner can share it",
      });
    }

    // Generate unique share ID
    const shareId = `SHARE-${crypto.randomBytes(6).toString("hex")}`;

    // Create shareable link
    const shareableLink = new ShareableLink({
      shareId,
      credentialId: credential.credentialId,
      ownerId,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      accessLevel,
      accessCount: 0,
      recipientEmail,
      status: "active",
    });

    await shareableLink.save();

    // Generate full share URL (in a real app, this would be a proper frontend URL)
    const shareUrl = `${config.frontend.baseUrl}/verify/${shareId}`;

    // In a real application, send email here if recipientEmail is provided
    let emailSent = false;
    if (recipientEmail) {
      // Code to send email with the share link
      emailSent = true;
    }

    return res.status(200).json({
      success: true,
      shareId,
      shareUrl,
      expiryDate: shareableLink.expiryDate,
      accessLevel,
      emailSent,
    });
  } catch (error) {
    console.error("Share credential error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to share credential",
      error: error.message,
    });
  }
};
