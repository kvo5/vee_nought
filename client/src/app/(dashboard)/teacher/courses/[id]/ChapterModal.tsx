import { CustomFormField } from "@/components/CustomFormField";
import CustomModal from "@/components/CustomModal";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ChapterFormData, chapterSchema } from "@/lib/schemas";
import { addChapter, closeChapterModal, editChapter } from "@/state";
import { useAppDispatch, useAppSelector } from "@/state/redux";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs"; // Import useAuth from Clerk
import axios from "axios"; // Import axios for API calls
import { X } from "lucide-react";
import { useParams } from "next/navigation"; // Import useParams to get courseId
import React, { useEffect, useState } from "react"; // Import useState for loading state
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

const ChapterModal = () => { // Add missing component definition
  const dispatch = useAppDispatch();
  const params = useParams(); // Get route params
  const { getToken } = useAuth(); // Get Clerk's getToken function
  const courseId = params.id as string; // Extract courseId
  const [isUploading, setIsUploading] = useState(false); // Add loading state for upload
  const {
    isChapterModalOpen,
    selectedSectionIndex,
    selectedChapterIndex,
    sections,
  } = useAppSelector((state) => state.global.courseEditor);

  const chapter: Chapter | undefined =
    selectedSectionIndex !== null && selectedChapterIndex !== null
      ? sections[selectedSectionIndex].chapters[selectedChapterIndex]
      : undefined;

  const methods = useForm<ChapterFormData>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      title: "",
      content: "",
      video: "",
      pdfResource: "", // Add pdfResource default value
    },
  });

  useEffect(() => {
    if (chapter) {
      methods.reset({
        title: chapter.title,
        content: chapter.content,
        video: chapter.video || "",
        pdfResource: chapter.pdfResource || "", // Reset pdfResource
      });
    } else {
      methods.reset({
        title: "",
        content: "",
        video: "",
        pdfResource: "", // Reset pdfResource
      });
    }
  }, [chapter, methods]);

  const onClose = () => {
    dispatch(closeChapterModal());
  };

  const onSubmit = async (data: ChapterFormData) => { // Make onSubmit async
    if (selectedSectionIndex === null) return;
    setIsUploading(true); // Start loading indicator

    let pdfUrl = typeof data.pdfResource === 'string' ? data.pdfResource : undefined; // Keep existing URL if it's a string
    let videoUrl = typeof data.video === 'string' ? data.video : undefined; // Keep existing video URL if it's a string

    try {
      const apiUrlBase = process.env.NEXT_PUBLIC_API_BASE_URL; // Define apiUrlBase here
      const token = await getToken(); // Get auth token here as well

      if (!token) {
        toast.error("Authentication error. Please try logging in again.");
        setIsUploading(false);
        return;
      }

      // --- Handle PDF Upload ---
      if (data.pdfResource instanceof File) {
        const pdfFile = data.pdfResource;
        const tempChapterId = chapter?.chapterId || uuidv4(); // Use existing or generate temp ID for URL
        const sectionId = sections[selectedSectionIndex].sectionId;

        // 1. Get PDF upload URL from backend
        // No need to define apiUrlBase or token again

        if (!token) { // This check is redundant now but harmless
          toast.error("Authentication error. Please try logging in again.");
          setIsUploading(false);
          return;
        }

        // Sanitize filename before sending to backend
        const sanitizedFileName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        console.log(`[ChapterModal] Original filename: ${pdfFile.name}, Sanitized: ${sanitizedFileName}`);
        console.log("[ChapterModal] Requesting upload URL with fileType:", pdfFile.type); // Add log

        const uploadUrlResponse = await axios.post(
          `${apiUrlBase}/courses/${courseId}/sections/${sectionId}/chapters/${tempChapterId}/get-upload-pdf-url`, // Use full URL
          { // Request body
            fileName: sanitizedFileName, // Use sanitized filename
            fileType: pdfFile.type,
          },
          { // Axios config with headers
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // Check if response structure is as expected before destructuring
        if (!uploadUrlResponse?.data?.data?.uploadUrl || !uploadUrlResponse?.data?.data?.pdfUrl) {
            console.error("Invalid response structure from get-upload-pdf-url:", uploadUrlResponse?.data);
            toast.error("Received invalid response from server for upload URL.");
            setIsUploading(false);
            return;
        }

        const { uploadUrl: pdfUploadUrl, pdfUrl: finalPdfUrl } = uploadUrlResponse.data.data;
        pdfUrl = finalPdfUrl; // Store the final URL

        // 2. Upload PDF file to S3
        console.log("[ChapterModal] Uploading file with Content-Type header:", pdfFile.type); // Revert log message
        // Re-add explicit Content-Type header
        await axios.put(pdfUploadUrl, pdfFile, {
          headers: {
            "Content-Type": pdfFile.type,
          },
        });
        toast.success("PDF uploaded successfully!");
      }

      // --- Handle Video Upload ---
      if (data.video instanceof File) {
        const videoFile = data.video;
        // Use the same tempChapterId and sectionId as PDF upload if applicable, or re-fetch/generate if needed
        const tempChapterId = chapter?.chapterId || uuidv4(); // Reusing ID for consistency
        const sectionId = sections[selectedSectionIndex].sectionId; // Reusing sectionId

        // 1. Get Video upload URL from backend
        // apiUrlBase and token are already defined
        console.log("[ChapterModal] Requesting video upload URL with fileType:", videoFile.type);
        const videoUploadUrlResponse = await axios.post(
          // Use the correct endpoint for video uploads
          `${apiUrlBase}/courses/${courseId}/sections/${sectionId}/chapters/${tempChapterId}/get-upload-url`,
          {
            // Sanitize video filename as well
            fileName: videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
            fileType: videoFile.type,
          },
          {
            headers: { Authorization: `Bearer ${token}` }, // Send auth token
          }
        );

        // Check video response structure
        if (!videoUploadUrlResponse?.data?.data?.uploadUrl || !videoUploadUrlResponse?.data?.data?.videoUrl) {
            console.error("Invalid response structure from get-upload-url:", videoUploadUrlResponse?.data);
            toast.error("Received invalid response from server for video upload URL.");
            setIsUploading(false);
            return;
        }

        const { uploadUrl: videoUploadUrl, videoUrl: finalVideoUrl } = videoUploadUrlResponse.data.data;
        videoUrl = finalVideoUrl; // Store the final video URL

        // 2. Upload Video file to S3
        console.log("[ChapterModal] Uploading video file with Content-Type header:", videoFile.type);
        await axios.put(videoUploadUrl, videoFile, {
          headers: { "Content-Type": videoFile.type },
        });
        toast.success("Video uploaded successfully!");
      }

      // --- Prepare Chapter Data ---
      const newChapter: Chapter = {
        chapterId: chapter?.chapterId || uuidv4(), // Use existing or generate new ID
        title: data.title,
        content: data.content,
        // TODO: Refine type based on content (Video, PDF, Text, etc.)
        type: videoUrl ? "Video" : "Text",
        video: videoUrl, // Use the final video URL
        pdfResource: pdfUrl, // Use the final PDF URL
      };

      // --- Dispatch Redux Action ---
      if (selectedChapterIndex === null) {
      dispatch(
        addChapter({
          sectionIndex: selectedSectionIndex,
          chapter: newChapter,
        })
      );
    } else {
      dispatch(
        editChapter({
          sectionIndex: selectedSectionIndex,
          chapterIndex: selectedChapterIndex,
          chapter: newChapter,
        })
      );
    }

    toast.success(
      `Chapter ${selectedChapterIndex === null ? 'added' : 'updated'} locally. Save the course to persist changes.`
    );
    onClose();

    } catch (error) {
      console.error("Error during chapter save/upload:", error);
      toast.error("Failed to save chapter or upload file. Please try again.");
    } finally {
       setIsUploading(false); // Stop loading indicator
    }
  };

  return (
    <CustomModal isOpen={isChapterModalOpen} onClose={onClose}>
      <div className="chapter-modal">
        <div className="chapter-modal__header">
          <h2 className="chapter-modal__title">Add/Edit Chapter</h2>
          <button onClick={onClose} className="chapter-modal__close">
            <X className="w-6 h-6" />
          </button>
        </div>

        <Form {...methods}>
          <form
            onSubmit={methods.handleSubmit(onSubmit)}
            className="chapter-modal__form"
          >
            <CustomFormField
              name="title"
              label="Chapter Title"
              placeholder="Write chapter title here"
            />

            <CustomFormField
              name="content"
              label="Chapter Content"
              type="textarea"
              placeholder="Write chapter content here"
            />

            <FormField
              control={methods.control}
              name="video"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel className="text-customgreys-dirtyGrey text-sm">
                    Chapter Video
                  </FormLabel>
                  <FormControl>
                    <div>
                      <Input
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onChange(file);
                          }
                        }}
                        className="border-none bg-customgreys-darkGrey py-2 cursor-pointer"
                      />
                      {typeof value === "string" && value && (
                        <div className="my-2 text-sm text-gray-600">
                          Current video: {value.split("/").pop()}
                        </div>
                      )}
                      {value instanceof File && (
                        <div className="my-2 text-sm text-gray-600">
                          Selected file: {value.name}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            {/* PDF Resource Upload Field */}
            <FormField
              control={methods.control}
              name="pdfResource"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel className="text-customgreys-dirtyGrey text-sm">
                    Chapter PDF Resource
                  </FormLabel>
                  <FormControl>
                    <div>
                      <Input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onChange(file);
                          }
                        }}
                        className="border-none bg-customgreys-darkGrey py-2 cursor-pointer"
                      />
                      {typeof value === "string" && value && (
                        <div className="my-2 text-sm text-gray-600">
                          Current PDF: {value.split("/").pop()}
                        </div>
                      )}
                      {value instanceof File && (
                        <div className="my-2 text-sm text-gray-600">
                          Selected file: {value.name}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <div className="chapter-modal__actions">
              <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary-700" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </CustomModal>
  );
};

export default ChapterModal;
