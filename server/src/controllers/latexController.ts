import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

// Define the base directory for LaTeX files relative to the server's src directory
// Adjust this path if your server runs from a different location (e.g., dist) in production
const latexBaseDir = path.resolve(__dirname, "../../../latex_test"); // Points to project_root/latex_test

export const generatePdf = async (req: Request, res: Response): Promise<void> => {
  const { latexCode } = req.body;

  if (!latexCode) {
    res.status(400).json({ message: "Missing 'latexCode' in request body" });
    return;
  }

  const uniqueFolderName = `latex_job_${uuidv4()}`;
  const jobFolderPath = path.join(latexBaseDir, uniqueFolderName);
  const texFilePath = path.join(jobFolderPath, "document.tex");
  const pdfFilePath = path.join(jobFolderPath, "document.pdf");

  try {
    // 1. Create unique directory
    await fs.mkdir(jobFolderPath, { recursive: true });
    console.log(`Created directory: ${jobFolderPath}`);

    // 2. Write the .tex file
    await fs.writeFile(texFilePath, latexCode);
    console.log(`Created .tex file: ${texFilePath}`);

    // 3. Compile the .tex file using latexmk (recommended)
    // Ensure latexmk (from MiKTeX) is in the system PATH
    // We run it within the job folder for cleaner output
    console.log(`Attempting to compile ${texFilePath}...`);
    const compileCommand = `latexmk -pdf -output-directory="${jobFolderPath}" "${texFilePath}"`;
    // Alternative using cd: `cd "${jobFolderPath}" && latexmk -pdf document.tex`

    try {
        const { stdout, stderr } = await execPromise(compileCommand);
        console.log('latexmk stdout:', stdout);
        if (stderr) {
            console.error('latexmk stderr:', stderr);
            // Decide if stderr always means failure, latexmk can be verbose
        }
        console.log(`Compilation process finished for ${texFilePath}`);

        // 4. Check if PDF was created
        await fs.access(pdfFilePath); // Check existence, throws if not found
        console.log(`PDF found: ${pdfFilePath}`);

        // 5. Provide download link/mechanism (simple example: send file path)
        // In a real app, you'd likely send a download link pointing to another endpoint
        // that serves the file securely.
         res.json({
             message: "PDF generated successfully",
             pdfPath: pdfFilePath, // Send the server path (for now)
             downloadUrl: `/latex/download/${uniqueFolderName}/document.pdf` // Example download URL
         });

    } catch (compileError: any) {
        console.error("Compilation failed:", compileError);
        // Attempt to read log file for more details
        let logContent = "Could not read log file.";
        try {
            const logPath = path.join(jobFolderPath, "document.log");
            logContent = await fs.readFile(logPath, 'utf-8');
        } catch (logReadError) {
            console.error("Failed to read log file:", logReadError);
        }
        res.status(500).json({
            message: "Failed to compile LaTeX code.",
            error: compileError.message || compileError,
            stdout: compileError.stdout,
            stderr: compileError.stderr,
            log: logContent // Include log file content if available
        });
    }

  } catch (error: any) {
    console.error("Error processing LaTeX request:", error);
    res.status(500).json({ message: "Server error processing request", error: error.message });
  }
};

// Placeholder for download endpoint
export const downloadPdf = async (req: Request, res: Response): Promise<void> => {
    const { folder, filename } = req.params;

    // Basic security: prevent path traversal
    if (filename !== 'document.pdf' || folder.includes('..')) {
         res.status(400).send("Invalid path");
         return;
    }

    const filePath = path.join(latexBaseDir, folder, filename);

    try {
        await fs.access(filePath); // Check if file exists
        res.download(filePath, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                // Avoid sending detailed error if headers already sent
                if (!res.headersSent) {
                    res.status(500).send("Error downloading file.");
                }
            } else {
                console.log(`Sent file: ${filePath}`);
                // Optional: Clean up the file/folder after download?
            }
        });
    } catch (error) {
        console.error(`File not found: ${filePath}`, error);
        res.status(404).send("File not found.");
    }
};