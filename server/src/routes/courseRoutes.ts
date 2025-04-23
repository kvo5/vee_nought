import express from "express";
import multer from "multer";
import {
  createCourse,
  deleteCourse,
  getCourse,
  listCourses,
  updateCourse,
  getUploadVideoUrl,
  getUploadPdfUrl, // Import the new controller function
} from "../controllers/courseController";
import { requireAuth } from "@clerk/express"; // Revert back to requireAuth

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", listCourses);
router.post("/", requireAuth(), createCourse); // Use requireAuth

router.get("/:courseId", getCourse);
router.put("/:courseId", requireAuth(), upload.single("image"), updateCourse); // Use requireAuth
router.delete("/:courseId", requireAuth(), deleteCourse); // Use requireAuth

router.post(
  "/:courseId/sections/:sectionId/chapters/:chapterId/get-upload-url",
  requireAuth(), // Use requireAuth
  getUploadVideoUrl
);

// Add route for getting PDF upload URL
router.post(
  "/:courseId/sections/:sectionId/chapters/:chapterId/get-upload-pdf-url",
  requireAuth(), // Use requireAuth
  getUploadPdfUrl
);

export default router;
