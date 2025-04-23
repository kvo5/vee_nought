import express from 'express';
import { recolorLatex } from '../controllers/studioController'; // Use new function name
import { requireAuth } from '@clerk/express';

const router = express.Router();

// POST /studio/recolor-latex - Receives LaTeX and color, returns recolored PDF
// No file upload needed, so remove multer
router.post(
  '/recolor-latex', // Changed endpoint name
  requireAuth(),
  recolorLatex
);

export default router;