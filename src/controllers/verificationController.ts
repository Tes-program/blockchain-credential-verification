// src/controllers/verificationController.ts
import { Request, Response } from 'express';
import { Credential } from '../models/Credential';
import { ShareableLink } from '../models/ShareableLink';
import { VerificationRecord } from '../models/VerificationRecord';
import { Institution } from '../models/Institution';
import { verifyCredential as verifyOnBlockchain } from '../blockchain/contractService';
import { getFromIPFS } from '../ipfs/ipfsService';

interface IVerificationRequest extends Request {
    userId?: string;
    body: any;
    params: any;
    query: any;
}

// Verify a credential directly
export const verifyCredential = async (req: IVerificationRequest, res: Response) => {
  try {
    const { credentialId, blockchainHash, verifierName, verifierType } = req.body;
    const verifierId = req.userId; // May be undefined for public verifications
    
    // Find the credential
    let credential;
    if (credentialId) {
      credential = await Credential.findOne({ credentialId });
    } else if (blockchainHash) {
      credential = await Credential.findOne({ blockchainTxHash: blockchainHash });
    }
    
    if (!credential) {
      return res.status(404).json({
        verified: false,
        message: 'Credential not found'
      });
    }
    
    // Verify on blockchain
    const blockchainResult = await verifyOnBlockchain(credential.credentialId);
    
    if (!blockchainResult.success) {
      // Record verification attempt
      await recordVerification({
        credentialId: credential.credentialId,
        verifierId,
        verifierName,
        verifierType: verifierType || 'public',
        status: 'failed',
        method: 'direct',
        req
      });
      
      return res.status(400).json({
        verified: false,
        message: 'Blockchain verification failed',
        error: blockchainResult.error
      });
    }
    
    // Get data from IPFS if available
    let ipfsData = null;
    try {
      if (credential.ipfsHash) {
        ipfsData = await getFromIPFS(credential.ipfsHash);
      }
    } catch (error) {
      console.error('IPFS retrieval error:', error);
    }
    
    // Get issuer details
    const issuer = await Institution.findOne({ userId: credential.issuerId });
    
    // Record successful verification
    await recordVerification({
      credentialId: credential.credentialId,
      verifierId,
      verifierName,
      verifierType: verifierType || 'public',
      status: 'success',
      method: 'direct',
      req
    });
    
    // Update credential verification stats
    credential.verifications += 1;
    credential.lastVerified = new Date();
    await credential.save();
    
    // Return verification result
    return res.status(200).json({
      verified: true,
      credential: {
        credentialType: credential.credentialType,
        credentialName: credential.credentialName,
        issueDate: credential.issueDate,
        status: credential.status,
        institution: issuer ? issuer.name : 'Unknown Institution',
        recipientName: credential.recipientName,
        metadata: credential.metadata
      },
      blockchain: {
        txHash: credential.blockchainTxHash,
        timestamp: credential.issueDate,
        verificationUrl: `https://etherscan.io/tx/${credential.blockchainTxHash}`
      },
      verificationId: credential.credentialId
    });
  } catch (error) {
    console.error('Verify credential error:', error);
    return res.status(500).json({
      verified: false,
      message: 'Verification failed',
      error: error.message
    });
  }
};

// Verify using a share link
export const verifySharedCredential = async (req: IVerificationRequest, res: Response) => {
  try {
    const { shareId } = req.params;
    const verifierId = req.userId; // May be undefined for public verifications
    
    // Find the share record
    const shareRecord = await ShareableLink.findOne({ shareId });
    
    if (!shareRecord) {
      return res.status(404).json({
        verified: false,
        message: 'Share link not found or expired'
      });
    }
    
    // Check if share is active
    if (shareRecord.status !== 'active') {
      return res.status(400).json({
        verified: false,
        message: `This share link is ${shareRecord.status}`
      });
    }
    
    // Check expiry
    if (shareRecord.expiryDate && new Date() > shareRecord.expiryDate) {
      // Mark as expired
      shareRecord.status = 'expired';
      await shareRecord.save();
      
      return res.status(400).json({
        verified: false,
        message: 'This share link has expired'
      });
    }
    
    // Find credential
    const credential = await Credential.findOne({ credentialId: shareRecord.credentialId });
    
    if (!credential) {
      return res.status(404).json({
        verified: false,
        message: 'Credential not found'
      });
    }
    
    // Verify on blockchain
    const blockchainResult = await verifyOnBlockchain(credential.credentialId);

    // src/controllers/verificationController.ts (continued)
    if (!blockchainResult.success) {
        // Record verification attempt
        await recordVerification({
          credentialId: credential.credentialId,
          verifierId,
          verifierName: verifierId ? undefined : 'Anonymous via shared link',
          verifierType: 'public',
          status: 'failed',
          method: 'shared-link',
          req
        });
        
        return res.status(400).json({
          verified: false,
          message: 'Blockchain verification failed',
          error: blockchainResult.error
        });
      }
      
      // Get issuer details
      const issuer = await Institution.findOne({ userId: credential.issuerId });
      
      // Record successful verification
      await recordVerification({
        credentialId: credential.credentialId,
        verifierId,
        verifierName: verifierId ? undefined : 'Anonymous via shared link',
        verifierType: 'public',
        status: 'success',
        method: 'shared-link',
        req
      });
      
      // Update credential verification stats
      credential.verifications += 1;
      credential.lastVerified = new Date();
      await credential.save();
      
      // Update share record
      shareRecord.accessCount += 1;
      shareRecord.lastAccessed = new Date();
      await shareRecord.save();
      
      // Filter data based on access level
      const responseData: any = {
        verified: true,
        credential: {
          credentialType: credential.credentialType,
          credentialName: credential.credentialName,
          issueDate: credential.issueDate,
          status: credential.status,
          institution: issuer ? issuer.name : 'Unknown Institution'
        },
        blockchain: {
          txHash: credential.blockchainTxHash,
          timestamp: credential.issueDate,
          verificationUrl: `https://sepolia.etherscan.io/tx/${credential.blockchainTxHash}`
        },
        verificationId: credential.credentialId
      };
      
      // Add fields based on access level
      if (shareRecord.accessLevel === 'full') {
        responseData.credential.recipientName = credential.recipientName;
        responseData.credential.metadata = credential.metadata;
      } else if (shareRecord.accessLevel === 'limited') {
        // In limited access, don't include personal info
        // but include educational achievements
        responseData.credential.metadata = filterPersonalInfo(credential.metadata);
      }
      
      return res.status(200).json(responseData);
    } catch (error) {
      console.error('Verify shared credential error:', error);
      return res.status(500).json({
        verified: false,
        message: 'Verification failed',
        error: error.message
      });
    }
  };
  
  // Record a verification attempt
  export const recordVerification = async ({
    credentialId,
    verifierId,
    verifierName,
    verifierType,
    status,
    method,
    req
  }: {
    credentialId: string;
    verifierId?: string;
    verifierName?: string;
    verifierType: string;
    status: 'success' | 'failed';
    method: 'direct' | 'shared-link' | 'QR';
    req: Request;
  }) => {
    try {
      // Extract IP and user agent
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Create verification record
      const record = new VerificationRecord({
        credentialId,
        verifierId,
        verifierName,
        verifierType,
        verificationDate: new Date(),
        verificationMethod: method,
        status,
        ipAddress,
        userAgent
        // Location would be determined by a geolocation service
      });
      
      await record.save();
      return record;
    } catch (error) {
      console.error('Error recording verification:', error);
      // Don't throw, as this is a non-critical operation
      return null;
    }
  };
  
  // Helper to filter out personal information
  const filterPersonalInfo = (metadata: Record<string, any>) => {
    // Filter out known personal fields
    const filtered = { ...metadata };
    const personalFields = ['dateOfBirth', 'address', 'phone', 'email', 'nationalId', 'passportNumber'];
    
    personalFields.forEach(field => {
      if (field in filtered) {
        delete filtered[field];
      }
    });
    
    return filtered;
  };


// Get verification history for a credential
export const getVerificationHistory = async (req: IVerificationRequest, res: Response) => {
  try {
    const { credentialId } = req.params;
    
    // Find the credential
    const credential = await Credential.findOne({ credentialId });
    
    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }
    
    // Get verification records
    const records = await VerificationRecord.find({ credentialId })
      .sort({ verificationDate: -1 })
      .limit(10);
    
    return res.status(200).json({
      success: true,
      records
    });
  } catch (error) {
    console.error('Get verification history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting verification history',
      error: error.message
    });
  }
};