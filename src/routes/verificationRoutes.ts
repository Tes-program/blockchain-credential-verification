// src/routes/verificationRoutes.ts
import { Router } from 'express';
import { verifyCredential, verifySharedCredential, getVerificationHistory } from '../controllers/verificationController';
import { authenticate } from '../middleware/auth';
import { RequestHandler } from 'express-serve-static-core';

const router = Router();

// Public verification with optional authentication
router.post('/', authenticate as RequestHandler, verifyCredential as unknown as RequestHandler);

// Verify using shareable link (public)
router.get('/:shareId', verifySharedCredential as unknown as RequestHandler);

// Get verification history
router.get('/history/:credentialId', authenticate as RequestHandler, getVerificationHistory as unknown as RequestHandler);

export default router;