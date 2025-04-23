import { Request, Response } from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

// Reuse LaTeX temp directory path (ensure it's correct relative to this file)
const latexTempDir = path.resolve(__dirname, "../../latex_test/temp_jobs");

// --- Gemini Configuration (Copied from laboratoryController) ---
const GEMINI_API_KEY = "AIzaSyDv8MJDxrOfVd4EtfThNeDRgiDGYMqnGcQ"; // Use the provided key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Use a text-only model as we are processing LaTeX string, not images
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Or a text-specific model if preferred

const generationConfig = {
  temperature: 0.2, // Lower temperature for more deterministic LaTeX modification
  topK: 32,
  topP: 1,
  maxOutputTokens: 8192, // Ensure enough tokens for potentially long LaTeX
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
// --- End Gemini Configuration ---

// Helper function to parse hex color string to LaTeX color definition {R,G,B} (0-1 range)
function hexToLatexRgb(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `{${(parseInt(result[1], 16) / 255).toFixed(3)}, ${(parseInt(result[2], 16) / 255).toFixed(3)}, ${(parseInt(result[3], 16) / 255).toFixed(3)}}` : null;
}


export const recolorLatex = async (req: Request, res: Response): Promise<void> => {
  console.log("Received request to recolor LaTeX");
  const { latexInput, targetColor } = req.body;

  if (!latexInput || typeof latexInput !== 'string' || !latexInput.trim()) {
    res.status(400).json({ message: "LaTeX input string is required." });
    return;
  }
  if (!targetColor || typeof targetColor !== 'string') {
     res.status(400).json({ message: "Target color hex string is required." });
    return;
  }

  // 1. Parse targetColor hex to LaTeX RGB format
  const latexColor = hexToLatexRgb(targetColor);
  if (!latexColor) {
      res.status(400).json({ message: "Invalid target color hex format." });
      return;
  }
  console.log(`Target LaTeX color: ${latexColor}`);

  // Define unique job folder path *before* try block
  const uniqueFolderName = `studio_job_${uuidv4()}`;
  const jobFolderPath = path.join(latexTempDir, uniqueFolderName);
  const texFilePath = path.join(jobFolderPath, "recolored_solution.tex");
  const pdfFilePath = path.join(jobFolderPath, "recolored_solution.pdf");
  const logFilePath = path.join(jobFolderPath, "recolored_solution.log");

  try {
    // 2. Construct prompt for Gemini
    // Ensure the input LaTeX uses \usepackage{xcolor}
    // We might need to add it if missing, or instruct Gemini to ensure it's there.
    const prompt = `Given the following LaTeX document:
\`\`\`latex
${latexInput}
\`\`\`
Modify this LaTeX code to change the color of the text corresponding to the SOLUTIONS of the math problems presented. Keep the text of the QUESTIONS themselves in the default black color. Use the LaTeX command \\textcolor[rgb]{${latexColor}}{<solution text>} to apply the target color. Ensure the \\usepackage{xcolor} package is included in the preamble. Output ONLY the complete, modified, raw LaTeX code suitable for direct compilation with pdflatex. Do not include any explanations or markdown fences.`;

    console.log("Sending request to Gemini API for LaTeX recoloring...");
    // 3. Call Gemini API (using generateContent, suitable for text-only)
    const result = await model.generateContent(prompt); // Send only the text prompt

    if (!result.response) {
        console.error("Gemini API returned no response for recoloring.");
        throw new Error("Gemini API did not return a response.");
    }

    // 4. Get modified LaTeX string
    const modifiedLatex = result.response.text().trim();
    // Basic check if it looks like LaTeX
     if (!modifiedLatex.includes('\\documentclass')) {
        console.warn("Gemini response doesn't look like a full LaTeX document:", modifiedLatex.substring(0, 100));
        // Decide how to handle - maybe return error or try compiling anyway?
        // For now, let's try compiling it.
     }
     console.log("Received modified LaTeX from Gemini (first 100 chars):", modifiedLatex.substring(0, 100));

    // 5. Compile modified LaTeX to PDF (Reusing latexmk logic)
    console.log(`Creating temporary directory: ${jobFolderPath}`);
    await fs.mkdir(jobFolderPath, { recursive: true });

    console.log(`Writing .tex file: ${texFilePath}`);
    // Ensure xcolor package is included - Add it if missing (simple check)
    let finalLatex = modifiedLatex;
    if (!finalLatex.includes('\\usepackage{xcolor}')) {
        finalLatex = finalLatex.replace(/(\\documentclass{.*?})/g, '$1\n\\usepackage{xcolor}');
        console.log("Added \\usepackage{xcolor} to LaTeX preamble.");
    }
    // Log the exact content being written to the .tex file
    console.log(`--- Writing following content to ${texFilePath} ---`);
    console.log(finalLatex);
    console.log("--------------------------------------------------");
    await fs.writeFile(texFilePath, finalLatex);

    console.log(`Attempting to compile ${texFilePath} using latexmk...`);
    const compileCommand = `latexmk -pdf -interaction=nonstopmode -output-directory="${jobFolderPath}" "${texFilePath}"`;

    try {
        const { stdout, stderr } = await execPromise(compileCommand);
        console.log('latexmk stdout:', stdout);
        if (stderr) console.warn('latexmk stderr:', stderr);
        console.log(`Compilation process finished for ${texFilePath}`);

        await fs.access(pdfFilePath);
        console.log(`PDF found: ${pdfFilePath}`);

        // Read the generated PDF file
        const pdfBuffer = await fs.readFile(pdfFilePath);
        // Encode PDF as Base64
        const pdfBase64 = pdfBuffer.toString('base64');

        // Send JSON response containing both the modified LaTeX and Base64 PDF
        res.json({
            message: "LaTeX recolored and PDF compiled successfully.",
            latex: finalLatex, // Send the final LaTeX used for compilation
            pdfBase64: pdfBase64 // Add Base64 encoded PDF
        });

        // Clean up the temporary folder after successful compilation and response sending
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

    } catch (compileError: any) {
        console.error("LaTeX compilation failed:", compileError);
        let logContent = "Could not read log file.";
        try { logContent = await fs.readFile(logFilePath, 'utf-8'); console.log("--- LaTeX Log File Content ---\n", logContent, "\n-----------------------------"); }
        catch (logReadError) { console.error("Failed to read log file:", logReadError); }

        if (!res.headersSent) {
             res.status(500).json({ message: "Failed to compile recolored LaTeX code.", error: compileError.message || compileError, latex_log: logContent });
        } else { console.error("Headers already sent, could not send LaTeX compilation error."); }
         try { await fs.rm(jobFolderPath, { recursive: true, force: true }); console.log(`Cleaned up failed job folder: ${jobFolderPath}`); }
         catch (cleanupError) { console.error(`Error cleaning up failed job folder ${jobFolderPath}:`, cleanupError); }
    }

  } catch (error) { // Catch errors from Gemini call or initial setup
    console.error("Error processing LaTeX recoloring (outer catch):", error);
    if (!res.headersSent) {
        if (error instanceof Error && error.message.includes('SAFETY')) {
             res.status(400).json({ message: "Request blocked due to safety settings.", details: error.message });
        } else {
             res.status(500).json({ message: "Error processing request.", error: (error instanceof Error) ? error.message : "Unknown error" });
        }
    } else { console.error("Headers already sent, could not send outer error response."); }
     // Attempt cleanup even if outer error occurred
     try { await fs.access(jobFolderPath); await fs.rm(jobFolderPath, { recursive: true, force: true }); console.log(`Cleaned up job folder after outer error: ${jobFolderPath}`); }
     catch (cleanupError: any) { if (cleanupError.code !== 'ENOENT') { console.error(`Error cleaning up job folder ${jobFolderPath} after outer error:`, cleanupError); } }
  }
};