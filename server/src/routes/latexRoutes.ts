import express from "express";
import { generatePdf, downloadPdf } from "../controllers/latexController";
// import { requireAuth } from "@clerk/express"; // Optional: Add auth if needed

const router = express.Router();

// Route to generate the PDF from LaTeX code
// Consider adding authentication middleware (like requireAuth()) if this should be protected
router.post("/generate", generatePdf);

// Route to download the generated PDF
// This endpoint should also ideally have authentication/authorization
router.get("/download/:folder/:filename", downloadPdf);

export default router;