// src/routes/authRoutes.ts
import { Router, Request, Response, RequestHandler } from 'express';
import { register, login, getProfile, updateProfile } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();



// Public routes
router.post('/register', register as unknown as RequestHandler);
router.post('/login', login as unknown as RequestHandler);

// Protected routes
router.get('/profile', authenticate as RequestHandler, getProfile as unknown as RequestHandler);
router.put('/profile', authenticate as RequestHandler, updateProfile as unknown as RequestHandler);

export default router;