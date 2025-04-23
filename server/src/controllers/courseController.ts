import { Request, Response } from "express";
import Course from "../models/courseModel";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { getAuth } from "@clerk/express";

const s3 = new AWS.S3();

export const listCourses = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { category } = req.query;
  try {
    const courses =
      category && category !== "all"
        ? await Course.scan("category").eq(category).exec()
        : await Course.scan().exec();
    res.json({ message: "Courses retrieved successfully", data: courses });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving courses", error });
  }
};

export const getCourse = async (req: Request, res: Response): Promise<void> => {
  const { courseId } = req.params;
  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    res.json({ message: "Course retrieved successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving course", error });
  }
};

export const createCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { teacherId, teacherName } = req.body;

    if (!teacherId || !teacherName) {
      res.status(400).json({ message: "Teacher Id and name are required" });
      return;
    }

    const newCourse = new Course({
      courseId: uuidv4(),
      teacherId,
      teacherName,
      title: "Untitled Course",
      description: "",
      category: "Uncategorized",
      image: "",
      price: 0,
      level: "Beginner",
      status: "Draft",
      sections: [],
      enrollments: [],
    });
    await newCourse.save();

    res.json({ message: "Course created successfully", data: newCourse });
  } catch (error) {
    res.status(500).json({ message: "Error creating course", error });
  }
};

export const updateCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { courseId } = req.params;
  const updateData = { ...req.body };
  const { userId } = getAuth(req);

  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    if (course.teacherId !== userId) {
      res
        .status(403)
        .json({ message: "Not authorized to update this course " });
      return;
    }

    if (updateData.price) {
      const price = parseInt(updateData.price);
      if (isNaN(price)) {
        res.status(400).json({
          message: "Invalid price format",
          error: "Price must be a valid number",
        });
        return;
      }
      updateData.price = price * 100;
    }

    if (updateData.sections) {
      const sectionsData =
        typeof updateData.sections === "string"
          ? JSON.parse(updateData.sections)
          : updateData.sections;

      updateData.sections = sectionsData.map((section: any) => ({
        ...section,
        sectionId: section.sectionId || uuidv4(),
        chapters: section.chapters.map((chapter: any) => ({
          ...chapter,
          chapterId: chapter.chapterId || uuidv4(),
        })),
      }));
    }

    Object.assign(course, updateData);
    await course.save();

    res.json({ message: "Course updated successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error updating course", error });
  }
};

export const deleteCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { courseId } = req.params;
  const { userId } = getAuth(req);

  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    if (course.teacherId !== userId) {
      res
        .status(403)
        .json({ message: "Not authorized to delete this course " });
      return;
    }

    await Course.delete(courseId);

    res.json({ message: "Course deleted successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error deleting course", error });
  }
};

export const getUploadVideoUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    res.status(400).json({ message: "File name and type are required" });
    return;
  }

  try {
    const uniqueId = uuidv4();
    const s3Key = `videos/${uniqueId}/${fileName}`;

    const s3Params = {
      Bucket: process.env.S3_BUCKET_NAME || "",
      Key: s3Key,
      Expires: 60,
      ContentType: fileType,
    };

    const uploadUrl = s3.getSignedUrl("putObject", s3Params);
    const videoUrl = `${process.env.CLOUDFRONT_DOMAIN}/videos/${uniqueId}/${fileName}`;

    res.json({
      message: "Upload URL generated successfully",
      data: { uploadUrl, videoUrl },
    });
  } catch (error) {
    res.status(500).json({ message: "Error generating upload URL", error });
  }
};

export const getUploadPdfUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  console.log("\n--- ENTERING getUploadPdfUrl ---\n"); // Add very visible entry log
  console.log("[getUploadPdfUrl] Received request with body:", req.body); // Log request body
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    console.error("[getUploadPdfUrl] Missing fileName or fileType in request body.");
    res.status(400).json({ message: "File name and type are required" });
    return;
  }

  if (fileType !== "application/pdf") {
    console.error(`[getUploadPdfUrl] Invalid fileType: ${fileType}. Only application/pdf allowed.`);
    res.status(400).json({ message: "Invalid file type. Only PDF is allowed." });
    return;
  }

  const bucketName = process.env.S3_BUCKET_NAME;
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;

  if (!bucketName) {
      console.error("[getUploadPdfUrl] S3_BUCKET_NAME environment variable is not set.");
      // Don't return yet, let the s3.getSignedUrl fail if it needs the bucket explicitly
      // return res.status(500).json({ message: "Server configuration error: Missing S3 bucket name." });
  }
   if (!cloudfrontDomain) {
      // Log a warning but proceed for local dev, pdfUrl might just be the S3 path
      console.warn("[getUploadPdfUrl] CLOUDFRONT_DOMAIN environment variable is not set. pdfUrl might be incomplete.");
  }

  try {
    const uniqueId = uuidv4();
    const s3Key = `pdfs/${uniqueId}/${fileName}`;
    console.log(`[getUploadPdfUrl] Attempting to generate signed URL for bucket: ${bucketName || 'Default/Not Set'}, key: ${s3Key}`);

    const s3Params = {
      Bucket: bucketName || "", // Pass bucket name, let SDK handle error if empty and required
      Key: s3Key,
      Expires: 60, // URL expires in 60 seconds
      ContentType: fileType,
      // ACL: 'public-read', // Remove ACL parameter for now
    };

    // Explicitly check AWS SDK configuration source for debugging
    console.log(`[getUploadPdfUrl] AWS SDK Region: ${AWS.config.region}, Credentials Source: ${AWS.config.credentials?.constructor.name}`);


    const uploadUrl = s3.getSignedUrl("putObject", s3Params);
    console.log("[getUploadPdfUrl] Successfully generated uploadUrl.");

    // Construct pdfUrl carefully, handling potentially missing domain
    const pdfUrl = cloudfrontDomain
        ? `${cloudfrontDomain}/${s3Key}` // Use CloudFront domain if set
        : `s3://${bucketName}/${s3Key}`; // Fallback to S3 URI structure (adjust if needed for local S3 access)

    const responseData = {
      message: "PDF Upload URL generated successfully",
      data: { uploadUrl, pdfUrl },
    };
    console.log("[getUploadPdfUrl] Sending success response:", responseData);
    res.json(responseData);

  } catch (error) {
    console.error("[getUploadPdfUrl] Error during signed URL generation:", error); // Log the detailed error
    res.status(500).json({
        message: "Error generating PDF upload URL",
        // Send a simplified error message to the client for security
        error: (error instanceof Error) ? error.message : "An unknown error occurred"
    });
  }
};
