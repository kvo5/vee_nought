import express from 'express';
import multer from 'multer';
import { processMathProblem } from '../controllers/laboratoryController'; // Assuming controller exists
import { requireAuth } from '@clerk/express'; // Or ClerkExpressRequireAuth if needed

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory

// POST /laboratory/solve - Receives image/pdf, returns PDF solution
router.post(
  '/solve',
  requireAuth(), // Protect the endpoint
  upload.single('problemFile'), // Expect a file named 'problemFile'
  processMathProblem // Handle the logic in the controller
);

export default router;