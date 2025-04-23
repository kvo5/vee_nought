import { Request, Response } from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import fs from 'fs/promises'; // Use promises version of fs
import path from 'path';
import { v4 as uuidv4 } from "uuid"; // For unique folder names
import { exec } from "child_process"; // For running latexmk
import util from "util"; // For promisify

const execPromise = util.promisify(exec);

// Define the base directory for temporary LaTeX files
// Go up three levels from controllers/ to src/, then into latex_test/temp_jobs
const latexTempDir = path.resolve(__dirname, "../../latex_test/temp_jobs");

// --- Gemini Configuration ---
const GEMINI_API_KEY = "AIzaSyDv8MJDxrOfVd4EtfThNeDRgiDGYMqnGcQ"; // Use the provided key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Use Flash model

const generationConfig = {
  temperature: 0.4, // Adjust creativity/determinism
  topK: 32,
  topP: 1,
  maxOutputTokens: 8192,
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
// --- End Gemini Configuration ---


// Helper function to convert buffer to Base64 (required for Gemini API)
function bufferToGenerativePart(buffer: Buffer, mimeType: string) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

export const processMathProblem = async (req: Request, res: Response): Promise<void> => {
  console.log("Received file:", req.file?.originalname, "MIME Type:", req.file?.mimetype);

  if (!req.file) {
    res.status(400).json({ message: "No file uploaded." });
    return;
  }

  // Validate MIME type
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    console.error("Unsupported file type:", req.file.mimetype);
    res.status(400).json({ message: `Unsupported file type: ${req.file.mimetype}. Please upload an image (PNG, JPEG, WEBP, HEIC, HEIF) or PDF.` });
    return;
  }

  // Create a unique folder for this job *before* the try block
  const uniqueFolderName = `lab_job_${uuidv4()}`;
  const jobFolderPath = path.join(latexTempDir, uniqueFolderName);
  const texFilePath = path.join(jobFolderPath, "solution.tex");
  const pdfFilePath = path.join(jobFolderPath, "solution.pdf");
  const logFilePath = path.join(jobFolderPath, "solution.log"); // Path to log file

  try {
    // Extract template from request body
    const latexTemplate = req.body.latexTemplate as string | undefined;
    console.log("Received LaTeX template:", latexTemplate ? `${latexTemplate.substring(0, 50)}...` : "None");

    console.log("Preparing file for Gemini...");
    const imagePart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);

    // Base prompt
    const basePrompt = `Analyze the provided image or PDF containing one or more math problems. Identify ALL problems presented.
For EACH problem:
1.  Clearly state the original problem using appropriate LaTeX formatting (e.g., using a \\textbf{Question X:} prefix).
2.  Provide a detailed, step-by-step solution. Use LaTeX environments like {align*} or {enumerate} for clarity where appropriate.
3.  Include brief explanatory text *between* major steps or calculations within the solution to clarify the reasoning. This text should be part of the standard LaTeX flow.
4.  Ensure adequate vertical spacing between problems and between major steps within a solution (e.g., using \\medskip, \\bigskip, or paragraph breaks).
5.  Format the entire output (questions, steps, explanations, equations) using standard LaTeX suitable for direct compilation with pdflatex. Use the 'article' document class and common packages like 'amsmath'.`;

    // Construct the parts array for the Gemini request
    const parts = [
        { text: basePrompt }, // Initial instructions to analyze and solve
        imagePart,        // The image/PDF containing the problem
    ];

    // Add template instructions as a separate text part *after* the image, if provided
    if (latexTemplate && latexTemplate.trim()) {
      const templateInstruction = `\n\nIMPORTANT: Now, take the step-by-step solution you generated from the image and format it strictly within the following provided LaTeX template. Place the problem statements and solutions within the main body of the template where appropriate. Ensure the final output is ONLY the raw, complete LaTeX code based on the template, ready for compilation. Do not include any text before \\documentclass or after \\end{document}. Do not wrap the LaTeX code in markdown fences (\`\`\`).\n\nTEMPLATE:\n\`\`\`latex\n${latexTemplate}\n\`\`\``;
      parts.push({ text: templateInstruction });
    } else {
      // If no template, add the self-contained requirement instruction
      const selfContainedInstruction = `\n\n6. The final output must be ONLY the raw, complete, self-contained LaTeX code necessary to produce the document. Do not include any text before \\documentclass or after \\end{document}. Do not wrap the LaTeX code in markdown fences (\`\`\`).`;
      parts.push({ text: selfContainedInstruction });
    }

    console.log("Sending request to Gemini API...");
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });

    if (!result.response) {
        console.error("Gemini API returned no response.");
        throw new Error("Gemini API did not return a response.");
    }

    const latexSolution = result.response.text();
    console.log("Received raw solution from Gemini:\n", latexSolution);

    // Clean the LaTeX code: Use regex to extract content between fences
    let cleanedLatex = latexSolution.trim();
    const match = cleanedLatex.match(/```latex\s*([\s\S]*?)\s*```/); // Regex to find ```latex ... ```

    if (match && match[1]) {
        cleanedLatex = match[1].trim();
        console.log("Cleaned LaTeX solution (extracted from fences):\n", cleanedLatex);
    } else {
        console.warn("Markdown fences ```latex ... ``` not found or not in expected format. Using trimmed raw response.");
        console.log("Cleaned LaTeX solution (raw trimmed):\n", cleanedLatex);
    }

    // --- Compile using latexmk ---
    console.log(`Creating temporary directory: ${jobFolderPath}`);
    await fs.mkdir(jobFolderPath, { recursive: true });

    console.log(`Writing .tex file: ${texFilePath}`);
    await fs.writeFile(texFilePath, cleanedLatex); // Write the CLEANED code

    console.log(`Attempting to compile ${texFilePath} using latexmk in non-stop mode...`);
    const compileCommand = `latexmk -pdf -interaction=nonstopmode -output-directory="${jobFolderPath}" "${texFilePath}"`;

    try {
        const { stdout, stderr } = await execPromise(compileCommand);
        console.log('latexmk stdout:', stdout);
        if (stderr) {
            console.warn('latexmk stderr:', stderr);
        }
        console.log(`Compilation process finished for ${texFilePath}`);

        await fs.access(pdfFilePath); // Check existence
        console.log(`PDF found: ${pdfFilePath}`);

        // Read the generated PDF file
        const pdfBuffer = await fs.readFile(pdfFilePath);
        // Encode PDF as Base64
        const pdfBase64 = pdfBuffer.toString('base64');

        // Send JSON response containing both LaTeX and Base64 PDF
        res.json({
            message: "LaTeX solution generated and PDF compiled successfully.",
            latex: cleanedLatex,
            pdfBase64: pdfBase64 // Add Base64 encoded PDF
        });

        // Clean up the temporary folder after successful compilation and response sending
        // We run this asynchronously after sending the response
        const cleanup = async () => {
             console.log(`Cleaning up successful job folder: ${jobFolderPath}`);
             try {
                 await fs.rm(jobFolderPath, { recursive: true, force: true });
                 console.log(`Cleaned up temporary folder: ${jobFolderPath}`);
             } catch (cleanupError) {
                 console.error(`Error cleaning up folder ${jobFolderPath}:`, cleanupError);
             }
        };
        // Execute cleanup asynchronously after response is sent
        cleanup().catch(err => console.error("Async cleanup failed:", err));

        // Removed PDF streaming logic

    } catch (compileError: any) {
        console.error("LaTeX compilation failed:", compileError);
        let logContent = "Could not read log file.";
        try {
            logContent = await fs.readFile(logFilePath, 'utf-8');
            console.log("--- LaTeX Log File Content ---");
            console.log(logContent);
            console.log("-----------------------------");
        } catch (logReadError) {
            console.error("Failed to read log file:", logReadError);
        }

        if (!res.headersSent) {
             res.status(500).json({
                 message: "Failed to compile LaTeX code.",
                 error: compileError.message || compileError,
                 latex_log: logContent
             });
        } else {
             console.error("Headers already sent, could not send LaTeX compilation error response to client.");
        }
         // Clean up the temporary folder even on failure
         try {
             await fs.rm(jobFolderPath, { recursive: true, force: true });
             console.log(`Cleaned up failed job folder: ${jobFolderPath}`);
         } catch (cleanupError) {
             console.error(`Error cleaning up failed job folder ${jobFolderPath}:`, cleanupError);
         }
    }
    // --- End Compile using latexmk ---

  } catch (error) { // Catch errors from Gemini call or initial setup
    console.error("Error processing math problem (outer catch):", error);
    if (!res.headersSent) { // Ensure we don't try to send multiple responses
        if (error instanceof Error && error.message.includes('SAFETY')) {
             res.status(400).json({ message: "Request blocked due to safety settings.", details: error.message });
        } else {
             res.status(500).json({ message: "Error processing request.", error: (error instanceof Error) ? error.message : "Unknown error" });
        }
    } else {
        console.error("Headers already sent, could not send outer error response.");
    }
     // Attempt cleanup even if outer error occurred (folder might exist)
     try {
        await fs.access(jobFolderPath); // Check if folder exists before trying to remove
        await fs.rm(jobFolderPath, { recursive: true, force: true });
        console.log(`Cleaned up job folder after outer error: ${jobFolderPath}`);
     } catch (cleanupError: any) {
         // Ignore error if folder didn't exist, log others
         if (cleanupError.code !== 'ENOENT') {
            console.error(`Error cleaning up job folder ${jobFolderPath} after outer error:`, cleanupError);
         }
     }
  }
}; // End of processMathProblem