// src/routes/institutionRoutes.ts
import { Router, RequestHandler } from 'express';
import { getStudents, addStudent, importStudents, getStudentDetails } from '../controllers/institutionController';
import { authenticate, requireRole } from '../middleware/auth';
import multer from 'multer';


const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All these routes require authentication and institution role
router.use(authenticate as RequestHandler);
router.use(requireRole(['institution']) as RequestHandler);

router.get('/students', getStudents as unknown as RequestHandler);
router.post('/students', addStudent as unknown as RequestHandler);
router.post('/students/import', upload.single('file'), importStudents as unknown as RequestHandler);
router.get('/students/:id', getStudentDetails as unknown as RequestHandler);

export default router;