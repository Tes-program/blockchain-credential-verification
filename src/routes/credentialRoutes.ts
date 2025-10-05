// src/routes/credentialRoutes.ts
import { Router, RequestHandler } from 'express';
import { 
  issueNewCredential, 
  getCredentials, 
  getCredentialDetails, 
  revokeACredential, 
  shareCredential,
  issueBatchCredentials
} from '../controllers/credentialsController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Protected routes requiring any authenticated user
router.use(authenticate as RequestHandler);
router.get('/', getCredentials as unknown as RequestHandler);
router.get('/:id', getCredentialDetails as unknown as RequestHandler);

// Institution-only routes
router.post('/issue', requireRole(['institution']) as RequestHandler, issueNewCredential as unknown as RequestHandler);
router.put('/:id/revoke', requireRole(['institution']) as RequestHandler, revokeACredential as unknown as RequestHandler);

// Student-only routes
router.post('/:id/share', requireRole(['student']) as RequestHandler, shareCredential as unknown as RequestHandler);

export default router;