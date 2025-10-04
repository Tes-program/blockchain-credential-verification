// src/routes/index.ts
import { Router } from 'express';
import authRoutes from './authRoutes';
import institutionRoutes from './institutionRoutes';
import credentialRoutes from './credentialRoutes';
import verificationRoutes from './verificationRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/institutions', institutionRoutes);
router.use('/credentials', credentialRoutes);
router.use('/verify', verificationRoutes);

export default router;