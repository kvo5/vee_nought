"use client";

import React, { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Copy, Download } from 'lucide-react'; // Added Download

const StudioPage = () => {
  const [latexInput, setLatexInput] = useState<string>('');
  const [targetColor, setTargetColor] = useState<string>('#FF0000'); // Default red
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLatex, setGeneratedLatex] = useState<string>(''); // State for LaTeX
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // State for PDF preview URL
  const [pdfFilename, setPdfFilename] = useState<string>(''); // State for PDF download name

  const { getToken } = useAuth();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!latexInput.trim()) {
      toast.error("Please paste your LaTeX code first.");
      return;
    }

    setIsLoading(true);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl); // Clear previous result
    setPdfUrl(null);
    setPdfFilename('');
    setGeneratedLatex(''); // Clear previous LaTeX
    toast.info("Processing LaTeX and generating PDF...");

    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication error.");

      const apiUrlBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      // Assuming the backend /studio/recolor-latex now returns JSON with latex and pdfBase64
      const response = await axios.post(
        `${apiUrlBase}/studio/recolor-latex`,
        { latexInput, targetColor },
        {
          headers: { Authorization: `Bearer ${token}` },
          // Expect JSON response
        }
      );

      if (response.data && response.data.latex && response.data.pdfBase64) {
        setGeneratedLatex(response.data.latex);

        // Decode Base64 PDF and create object URL
        const pdfBytes = Uint8Array.from(atob(response.data.pdfBase64), c => c.charCodeAt(0));
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const newPdfUrl = URL.createObjectURL(pdfBlob);
        const downloadFilename = `recolored_solution.pdf`; // Generic filename

        setPdfUrl(newPdfUrl);
        setPdfFilename(downloadFilename);

        toast.success(response.data.message || "Recolored PDF generated!");

      } else {
        console.error("Invalid response data:", response.data);
        throw new Error("Invalid response format from server (missing latex or pdfBase64).");
      }

    } catch (error: any) {
      console.error("Error processing LaTeX:", error);
      let errorMessage = "An unexpected error occurred.";
       if (axios.isAxiosError(error) && error.response) {
         try {
            // Check if the error response is JSON before trying to parse
            if (error.response.data instanceof Blob && error.response.data.type === 'application/json') {
                const errorText = await error.response.data.text();
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || `Server error: ${error.response.status}`;
            } else if (typeof error.response.data === 'object' && error.response.data !== null) {
                 errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
            }
             else {
                 errorMessage = `Server error: ${error.response.status}. Response is not JSON.`;
            }
         } catch (parseError) {
            errorMessage = `Server error: ${error.response.status}. Could not parse error details.`;
         }
       } else if (error instanceof Error) {
         errorMessage = error.message;
       }
      toast.error(`Processing failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!generatedLatex) return;
    navigator.clipboard.writeText(generatedLatex)
      .then(() => toast.success("LaTeX copied to clipboard!"))
      .catch(err => {
          console.error("Failed to copy text: ", err);
          toast.error("Failed to copy LaTeX.");
      });
  };

  const handleDownloadLatex = () => {
    if (!generatedLatex) return;
    const blob = new Blob([generatedLatex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const texFilename = `recolored_solution.tex`; // Generic filename for Studio
    link.setAttribute('download', texFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("LaTeX file downloaded!");
  };

  // Cleanup object URL on component unmount or when pdfUrl changes
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);


  return (
    <div className="p-6 flex flex-col h-full">
      <h1 className="text-2xl font-bold mb-4">Studio</h1>
      <p className="mb-4 text-sm text-gray-400">Paste LaTeX code, choose a color for the solutions, and generate a recolored PDF.</p>

      <form onSubmit={handleSubmit} className="space-y-6 mb-6">
        {/* LaTeX Input */}
        <div>
          <label htmlFor="latex-input" className="block text-sm font-medium text-gray-300 mb-1">
            LaTeX Code (Must be a complete document)
          </label>
          <Textarea
            id="latex-input"
            placeholder="Paste your complete LaTeX document here (including \\documentclass, \\begin{document}, etc.)..."
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            className="border-gray-600 bg-gray-700 text-white min-h-[250px] font-mono text-sm" // Monospace font
            disabled={isLoading}
          />
        </div>

         {/* Color Picker Input */}
        <div>
           <label htmlFor="color-input" className="block text-sm font-medium text-gray-300 mb-1">
            Solution Color
          </label>
          <Input
            id="color-input"
            type="color"
            value={targetColor}
            onChange={(e) => setTargetColor(e.target.value)}
            className="border-gray-600 bg-gray-700 p-0 h-8 w-10 cursor-pointer"
            disabled={isLoading}
          />
           <p className="text-xs text-gray-400 mt-1">Select the color to apply to the solution parts.</p>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={isLoading || !latexInput.trim()}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isLoading ? 'Processing...' : 'Generate Recolored PDF'}
        </Button>
      </form>

      {/* Results Section */}
      {(generatedLatex || pdfUrl) && (
         <div className="mt-8 pt-4 border-t border-gray-700 space-y-6 flex-grow flex flex-col overflow-hidden">

            {/* Generated LaTeX Display Section */}
            {generatedLatex && (
              <div className="shrink-0">
                 <div className="flex justify-between items-center mb-2">
                   <h2 className="text-xl font-semibold">Generated LaTeX Solution</h2>
                   <Button onClick={handleCopyToClipboard} variant="outline" size="sm">
                     <Copy className="mr-2 h-4 w-4" /> Copy LaTeX
                   </Button>
                 </div>
                <Textarea
                  readOnly
                  value={generatedLatex}
                  className="border-gray-600 bg-gray-800 text-white min-h-[200px] max-h-[30vh] font-mono text-sm"
                />
              </div>
            )}

             {/* PDF Preview and Download Button Section */}
            {pdfUrl && (
              <div className="flex-grow flex flex-col overflow-hidden mt-4">
                <h2 className="text-xl font-semibold mb-2 shrink-0">Recolored PDF Preview & Download</h2>
                {/* Increased height */}
                <div className="mb-2 flex-grow overflow-hidden border border-gray-600" style={{ height: '70vh' }}>
                  <iframe
                    src={pdfUrl}
                    title="Recolored PDF"
                    width="100%"
                    height="100%"
                    style={{ border: 'none' }}
                  />
                </div>
                <div className="shrink-0 mt-2 flex space-x-2">
                    {/* Download PDF Button */}
                    <a
                      href={pdfUrl}
                      download={pdfFilename}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <Download className="mr-2 h-4 w-4" /> Download PDF ({pdfFilename})
                    </a>
                     {/* Download LaTeX Button */}
                    <Button onClick={handleDownloadLatex} variant="secondary" size="sm" className="text-xs">
                       <Download className="mr-2 h-4 w-4" /> Download .tex
                    </Button>
                </div>
              </div>
            )}
         </div>
      )}
    </div>
  );
};

export default StudioPage;